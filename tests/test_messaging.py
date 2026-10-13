import unittest
from app import app, db, User, Message, socketio

class MessagingTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.app = app

        with app.app_context():
            u1 = User.query.filter_by(username="msg_test_user1").first()
            if not u1:
                u1 = User(username="msg_test_user1", password="password_hash_1")
                db.session.add(u1)
            u2 = User.query.filter_by(username="msg_test_user2").first()
            if not u2:
                u2 = User(username="msg_test_user2", password="password_hash_2")
                db.session.add(u2)
            u3 = User.query.filter_by(username="msg_test_user3").first()
            if not u3:
                u3 = User(username="msg_test_user3", password="password_hash_3")
                db.session.add(u3)
            db.session.commit()
            self.u1_id = u1.id
            self.u2_id = u2.id
            self.u3_id = u3.id
            self.room = f"chat_{min(self.u1_id, self.u2_id)}_{max(self.u1_id, self.u2_id)}"

        self.c1 = app.test_client()
        with self.c1.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "msg_test_user1"

        self.c2 = app.test_client()
        with self.c2.session_transaction() as sess:
            sess["user_id"] = self.u2_id
            sess["username"] = "msg_test_user2"

        self.c3 = app.test_client()
        with self.c3.session_transaction() as sess:
            sess["user_id"] = self.u3_id
            sess["username"] = "msg_test_user3"

    def test_room_authorization_and_isolation(self):
        """Test private rooms only allow conversation participants"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio3 = socketio.test_client(self.app, flask_test_client=self.c3)

        sio1.emit("join", {"room": self.room})
        # Third party tries to eavesdrop on private room
        sio3.emit("join", {"room": self.room})

        sio1.emit("send_message", {
            "room": self.room,
            "message": "Top secret private conversation",
            "receiver_id": self.u2_id
        })

        # Sender gets receive_message
        recv1 = sio1.get_received()
        self.assertTrue(any(e["name"] == "receive_message" for e in recv1))

        # Third party must NOT receive the message
        recv3 = sio3.get_received()
        self.assertFalse(any(e["name"] == "receive_message" for e in recv3))

    def test_message_persistence_and_ordering(self):
        """Test messages are saved to database and retrieved in ascending chronological order"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio1.emit("join", {"room": self.room})

        sio1.emit("send_message", {"room": self.room, "message": "First message", "receiver_id": self.u2_id})
        sio1.emit("send_message", {"room": self.room, "message": "Second message", "receiver_id": self.u2_id})

        sio1.emit("load_messages", {"user_id": self.u2_id})
        recv = sio1.get_received()
        hist_ev = next(e for e in recv if e["name"] == "chat_history")
        messages = hist_ev["args"][0]["messages"]
        self.assertGreaterEqual(len(messages), 2)
        text_list = [m["message"] for m in messages]
        first_idx = text_list.index("First message")
        second_idx = text_list.index("Second message")
        self.assertLess(first_idx, second_idx)

    def test_message_length_capping(self):
        """Test messages exceeding 4,000 characters are capped to prevent DOS"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio1.emit("join", {"room": self.room})

        long_msg = "A" * 6000
        sio1.emit("send_message", {"room": self.room, "message": long_msg, "receiver_id": self.u2_id})
        recv = sio1.get_received()
        ev = next(e for e in recv if e["name"] == "receive_message")
        saved_text = ev["args"][0]["message"]
        self.assertEqual(len(saved_text), 4000)

if __name__ == "__main__":
    unittest.main()
