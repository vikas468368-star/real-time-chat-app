import unittest
from app import app, db, User, Message, DeletedMessage, socketio

class EditDeleteTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.app = app

        with app.app_context():
            u1 = User.query.filter_by(username="ed_user_1").first()
            if not u1:
                u1 = User(username="ed_user_1", password="hash_ed_1")
                db.session.add(u1)
            u2 = User.query.filter_by(username="ed_user_2").first()
            if not u2:
                u2 = User(username="ed_user_2", password="hash_ed_2")
                db.session.add(u2)
            db.session.commit()
            self.u1_id = u1.id
            self.u2_id = u2.id
            self.room = f"chat_{min(self.u1_id, self.u2_id)}_{max(self.u1_id, self.u2_id)}"

        self.c1 = app.test_client()
        with self.c1.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "ed_user_1"

        self.c2 = app.test_client()
        with self.c2.session_transaction() as sess:
            sess["user_id"] = self.u2_id
            sess["username"] = "ed_user_2"

    def test_author_edit_permission(self):
        """Test only author can edit message"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio2 = socketio.test_client(self.app, flask_test_client=self.c2)

        sio1.emit("join", {"room": self.room})
        sio2.emit("join", {"room": self.room})

        sio1.emit("send_message", {"room": self.room, "message": "Original draft", "receiver_id": self.u2_id})
        recv = sio1.get_received()
        msg_id = next(e for e in recv if e["name"] == "receive_message")["args"][0]["id"]

        # Recipient attempts to illegally edit sender's message
        sio2.emit("edit_message", {"message_id": msg_id, "message": "Tampered text!"})
        recv2 = sio2.get_received()
        err_ev = next(e for e in recv2 if e["name"] == "message_error")
        self.assertIn("not authorized", err_ev["args"][0]["error"])

        # Author legally edits message
        sio1.emit("edit_message", {"message_id": msg_id, "message": "Polished text"})
        recv1 = sio1.get_received()
        edit_ev = next(e for e in recv1 if e["name"] == "message_edited")
        self.assertEqual(edit_ev["args"][0]["message"], "Polished text")

    def test_delete_for_me_vs_delete_for_everyone(self):
        """Test Delete for Me hides from requester while Delete for Everyone purges message"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio2 = socketio.test_client(self.app, flask_test_client=self.c2)

        sio1.emit("join", {"room": self.room})
        sio2.emit("join", {"room": self.room})

        sio1.emit("send_message", {"room": self.room, "message": "Private note", "receiver_id": self.u2_id})
        recv = sio1.get_received()
        msg_id = next(e for e in recv if e["name"] == "receive_message")["args"][0]["id"]

        # User 2 performs Delete for Me
        sio2.emit("delete_message_for_me", {"message_id": msg_id})

        # User 2 should NOT see it in load_messages
        sio2.emit("load_messages", {"user_id": self.u1_id})
        recv2 = sio2.get_received()
        hist2 = next(e for e in recv2 if e["name"] == "chat_history")["args"][0]["messages"]
        self.assertFalse(any(m["id"] == msg_id for m in hist2))

        # User 1 MUST STILL see it in load_messages
        sio1.emit("load_messages", {"user_id": self.u2_id})
        recv1 = sio1.get_received()
        hist1 = next(e for e in recv1 if e["name"] == "chat_history")["args"][0]["messages"]
        self.assertTrue(any(m["id"] == msg_id for m in hist1))

        # User 1 deletes for everyone
        sio1.emit("delete_message", {"message_id": msg_id})
        with app.app_context():
            self.assertIsNone(db.session.get(Message, msg_id))

if __name__ == "__main__":
    unittest.main()
