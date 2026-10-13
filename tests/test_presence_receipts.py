import unittest
from app import app, db, User, Message, socketio, user_sessions, sid_to_user

class PresenceReceiptsTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.app = app
        user_sessions.clear()
        sid_to_user.clear()

        with app.app_context():
            u1 = User.query.filter_by(username="presence_user_1").first()
            if not u1:
                u1 = User(username="presence_user_1", password="hash_presence_1")
                db.session.add(u1)
            u2 = User.query.filter_by(username="presence_user_2").first()
            if not u2:
                u2 = User(username="presence_user_2", password="hash_presence_2")
                db.session.add(u2)
            db.session.commit()
            self.u1_id = u1.id
            self.u2_id = u2.id
            self.room = f"chat_{min(self.u1_id, self.u2_id)}_{max(self.u1_id, self.u2_id)}"

        self.c1 = app.test_client()
        with self.c1.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "presence_user_1"

        self.c2 = app.test_client()
        with self.c2.session_transaction() as sess:
            sess["user_id"] = self.u2_id
            sess["username"] = "presence_user_2"

    def tearDown(self):
        user_sessions.clear()
        sid_to_user.clear()

    def test_multi_tab_presence_tracking(self):
        """Test multi-tab sessions keep user online until all tabs close"""
        # User 1 opens Tab A and Tab B on separate client contexts
        c1_tab_a = self.app.test_client()
        with c1_tab_a.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "presence_user_1"

        c1_tab_b = self.app.test_client()
        with c1_tab_b.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "presence_user_1"

        tab_a = socketio.test_client(self.app, flask_test_client=c1_tab_a)
        tab_b = socketio.test_client(self.app, flask_test_client=c1_tab_b)

        self.assertIn(self.u1_id, user_sessions)
        self.assertEqual(len(user_sessions[self.u1_id]), 2)

        # Tab A closes
        tab_a.disconnect()
        # User 1 should STILL be tracked as online because Tab B is active
        self.assertIn(self.u1_id, user_sessions)
        self.assertEqual(len(user_sessions[self.u1_id]), 1)

        # Tab B closes
        tab_b.disconnect()
        # User 1 should now be offline
        self.assertEqual(len(user_sessions.get(self.u1_id, set())), 0)

    def test_typing_indicators(self):
        """Test typing and stop_typing events broadcast within the room"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio2 = socketio.test_client(self.app, flask_test_client=self.c2)

        sio1.emit("join", {"room": self.room})
        sio2.emit("join", {"room": self.room})

        sio1.emit("typing", {"room": self.room})
        recv2 = sio2.get_received()
        typing_ev = next(e for e in recv2 if e["name"] == "user_typing")
        self.assertEqual(typing_ev["args"][0]["username"], "presence_user_1")

        sio1.emit("stop_typing", {"room": self.room})
        recv2_stop = sio2.get_received()
        self.assertTrue(any(e["name"] == "user_stop_typing" for e in recv2_stop))

    def test_live_read_receipts(self):
        """Test marking messages read emits messages_read to sender socket"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio2 = socketio.test_client(self.app, flask_test_client=self.c2)

        sio1.emit("join", {"room": self.room})
        sio2.emit("join", {"room": self.room})

        # User 1 sends message to User 2
        sio1.emit("send_message", {"room": self.room, "message": "Read receipt test", "receiver_id": self.u2_id})

        # User 2 marks messages as read
        sio2.emit("mark_messages_read", {"user_id": self.u1_id})

        # User 1 receives live messages_read event
        recv1 = sio1.get_received()
        read_ev = next(e for e in recv1 if e["name"] == "messages_read")
        self.assertEqual(read_ev["args"][0]["reader_id"], self.u2_id)
        self.assertEqual(read_ev["args"][0]["sender_id"], self.u1_id)

if __name__ == "__main__":
    unittest.main()
