import unittest
import time
from werkzeug.security import generate_password_hash
from app import app, db, User, reset_login_attempts

class AuthSecurityTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.client = app.test_client()
        with app.app_context():
            # Clean up test users if existing
            User.query.filter((User.username.like("autotest_%")) | (User.email.like("autotest_%"))).delete()
            db.session.commit()
        reset_login_attempts("127.0.0.1")

    def tearDown(self):
        with app.app_context():
            User.query.filter((User.username.like("autotest_%")) | (User.email.like("autotest_%"))).delete()
            db.session.commit()
        reset_login_attempts("127.0.0.1")

    def test_registration_disabled(self):
        """Test that public registration is disabled by default and redirects to login"""
        # GET request to /register must redirect to /login
        res = self.client.get("/register", follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("/login", res.headers["Location"])

        # POST request to /register must also redirect to /login
        post_res = self.client.post("/register", data={"username": "autotest_user", "password": "password123"}, follow_redirects=False)
        self.assertEqual(post_res.status_code, 302)
        self.assertIn("/login", post_res.headers["Location"])

    def test_login_flow_and_lockout(self):
        """Test authentication flow, bad password handling, and brute-force lockout"""
        # Seed user directly into database
        with app.app_context():
            user = User(
                username="autotest_login",
                password=generate_password_hash("mypassword123")
            )
            db.session.add(user)
            db.session.commit()

        # Bad password attempt
        res = self.client.post("/login", data={"username": "autotest_login", "password": "wrongpassword"})
        self.assertEqual(res.status_code, 401)

        # Brute force attempts to trigger rate limit (5 attempts)
        for _ in range(4):
            self.client.post("/login", data={"username": "autotest_login", "password": "wrongpassword"})

        # 6th attempt must return 429 Too Many Requests
        lockout_res = self.client.post("/login", data={"username": "autotest_login", "password": "wrongpassword"})
        self.assertEqual(lockout_res.status_code, 429)

        # Reset rate limiter and verify valid login
        reset_login_attempts("127.0.0.1")
        success_res = self.client.post("/login", data={"username": "autotest_login", "password": "mypassword123"}, follow_redirects=False)
        self.assertEqual(success_res.status_code, 302)
        self.assertEqual(success_res.headers["Location"], "/")


    def test_logout_and_session_clearing(self):
        """Test that logout terminates session and protects dashboard"""
        with self.client.session_transaction() as sess:
            sess["user_id"] = 99999
            sess["username"] = "autotest_sess"

        # Verify dashboard is accessible while logged in
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)

        # Logout using POST
        logout_res = self.client.post("/logout", follow_redirects=False)
        self.assertEqual(logout_res.status_code, 302)
        self.assertIn("/login", logout_res.headers["Location"])

        # Dashboard must now redirect to login
        res_after = self.client.get("/", follow_redirects=False)
        self.assertEqual(res_after.status_code, 302)
        self.assertIn("/login", res_after.headers["Location"])


    def test_google_login_missing_token(self):
        """Test that /login/google returns 400 when credential token is missing"""
        res = self.client.post("/login/google", json={})
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertFalse(data["success"])
        self.assertIn("Missing", data["error"])

    def test_google_login_new_user(self):
        """Test Google login creates a new user profile and initiates session"""
        res = self.client.post("/login/google", json={
            "credential": "mock_token_abc123",
            "sub": "mock_google_id_9999",
            "email": "autotest_google_new@example.com",
            "name": "autotest_guser",
            "picture": "https://example.com/photo.jpg"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["redirect_url"], "/")

        with app.app_context():
            created = User.query.filter_by(google_id="mock_google_id_9999").first()
            self.assertIsNotNone(created)
            self.assertEqual(created.email, "autotest_google_new@example.com")
            self.assertEqual(created.avatar_url, "https://example.com/photo.jpg")

    def test_google_login_existing_user(self):
        """Test Google login connects to existing user record with matching email or google_id"""
        with app.app_context():
            existing = User(
                username="autotest_exist",
                password="hashed_pwd",
                email="autotest_exist@example.com"
            )
            db.session.add(existing)
            db.session.commit()

        # Link and sign in with Google presenting the same verified email
        res = self.client.post("/login/google", json={
            "credential": "mock_token_existing",
            "sub": "mock_google_id_8888",
            "email": "autotest_exist@example.com",
            "name": "autotest_exist"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["username"], "autotest_exist")

        with app.app_context():
            user = User.query.filter_by(username="autotest_exist").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.google_id, "mock_google_id_8888")

        # Recurring login with existing google_id returns existing user
        res2 = self.client.post("/login/google", json={
            "credential": "mock_token_repeat",
            "sub": "mock_google_id_8888",
            "email": "autotest_exist@example.com",
            "name": "autotest_exist"
        })
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data2["username"], "autotest_exist")

if __name__ == "__main__":
    unittest.main()
