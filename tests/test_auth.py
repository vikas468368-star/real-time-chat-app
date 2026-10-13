import unittest
import time
from app import app, db, User, reset_login_attempts

class AuthSecurityTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.client = app.test_client()
        with app.app_context():
            # Clean up test users if existing
            User.query.filter(User.username.like("autotest_%")).delete()
            db.session.commit()
        reset_login_attempts("127.0.0.1")

    def tearDown(self):
        with app.app_context():
            User.query.filter(User.username.like("autotest_%")).delete()
            db.session.commit()
        reset_login_attempts("127.0.0.1")

    def test_registration_validation(self):
        """Test username & password server-side validation rules"""
        # Invalid username pattern (spaces or special characters)
        res = self.client.post("/register", data={"username": "bad user!", "password": "password123"})
        self.assertEqual(res.status_code, 400)

        # Short password
        res = self.client.post("/register", data={"username": "autotest_user", "password": "123"})
        self.assertEqual(res.status_code, 400)

        # Valid registration
        res = self.client.post("/register", data={"username": "autotest_user", "password": "strongpassword123"}, follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("/login", res.headers["Location"])

        # Duplicate username attempt
        res2 = self.client.post("/register", data={"username": "autotest_user", "password": "strongpassword123"})
        self.assertEqual(res2.status_code, 409)

    def test_login_flow_and_lockout(self):
        """Test authentication flow, bad password handling, and brute-force lockout"""
        # Create user
        self.client.post("/register", data={"username": "autotest_login", "password": "mypassword123"})

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

        # Logout
        logout_res = self.client.get("/logout", follow_redirects=False)
        self.assertEqual(logout_res.status_code, 302)
        self.assertIn("/login", logout_res.headers["Location"])

        # Dashboard must now redirect to login
        res_after = self.client.get("/", follow_redirects=False)
        self.assertEqual(res_after.status_code, 302)
        self.assertIn("/login", res_after.headers["Location"])

if __name__ == "__main__":
    unittest.main()
