import io
import unittest
from app import app, db, User, Message, MessageReaction, DeletedMessage, socketio

class FeaturesIntegrityTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.app = app

        with app.app_context():
            u1 = User.query.filter_by(username="feat_user_1").first()
            if not u1:
                u1 = User(username="feat_user_1", password="hash_feat_1")
                db.session.add(u1)
            u2 = User.query.filter_by(username="feat_user_2").first()
            if not u2:
                u2 = User(username="feat_user_2", password="hash_feat_2")
                db.session.add(u2)
            db.session.commit()
            self.u1_id = u1.id
            self.u2_id = u2.id
            self.room = f"chat_{min(self.u1_id, self.u2_id)}_{max(self.u1_id, self.u2_id)}"

        self.c1 = app.test_client()
        with self.c1.session_transaction() as sess:
            sess["user_id"] = self.u1_id
            sess["username"] = "feat_user_1"

    def test_file_upload_and_attachment_storage(self):
        """Test secure file upload and attachment linking"""
        # Upload valid image
        png_data = (io.BytesIO(b"\x89PNG\r\n\x1a\nimage-data"), "attachment_test.png")
        res = self.c1.post("/upload", data={"file": png_data}, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 200)
        json_data = res.get_json()
        self.assertTrue(json_data["success"])
        self.assertEqual(json_data["type"], "image")

        # Send message with attachment
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio1.emit("join", {"room": self.room})
        sio1.emit("send_message", {
            "room": self.room,
            "message": "Attached screenshot",
            "receiver_id": self.u2_id,
            "attachment": {
                "url": json_data["url"],
                "name": json_data["name"],
                "type": json_data["type"],
                "size": json_data["size"]
            }
        })
        recv = sio1.get_received()
        msg_ev = next(e for e in recv if e["name"] == "receive_message")
        self.assertIsNotNone(msg_ev["args"][0]["attachment"])
        self.assertEqual(msg_ev["args"][0]["attachment"]["type"], "image")

    def test_replies_and_reactions_lifecycle(self):
        """Test quote replies and emoji reactions sync and cascade cleanup"""
        sio1 = socketio.test_client(self.app, flask_test_client=self.c1)
        sio1.emit("join", {"room": self.room})

        # Post message A
        sio1.emit("send_message", {"room": self.room, "message": "Original post", "receiver_id": self.u2_id})
        recv = sio1.get_received()
        msg_a_id = next(e for e in recv if e["name"] == "receive_message")["args"][0]["id"]

        # React with fire emoji
        sio1.emit("toggle_reaction", {"message_id": msg_a_id, "emoji": "🔥"})
        recv_rxn = sio1.get_received()
        rxn_ev = next(e for e in recv_rxn if e["name"] == "reaction_updated")
        self.assertEqual(rxn_ev["args"][0]["message_id"], msg_a_id)

        # Post reply referencing message A
        sio1.emit("send_message", {
            "room": self.room,
            "message": "Quoted reply",
            "receiver_id": self.u2_id,
            "reply_to_id": msg_a_id
        })
        recv_reply = sio1.get_received()
        reply_msg = next(e for e in recv_reply if e["name"] == "receive_message")["args"][0]
        self.assertEqual(reply_msg["reply_to"]["id"], msg_a_id)

        # Delete message A -> verify reply safely unlinks and reactions are deleted
        sio1.emit("delete_message", {"message_id": msg_a_id})
        with app.app_context():
            self.assertIsNone(db.session.get(Message, msg_a_id))
            self.assertEqual(MessageReaction.query.filter_by(message_id=msg_a_id).count(), 0)
            reply_db = db.session.get(Message, reply_msg["id"])
            self.assertIsNotNone(reply_db)
            self.assertIsNone(reply_db.reply_to_id)

if __name__ == "__main__":
    unittest.main()
