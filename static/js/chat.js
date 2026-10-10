const socket = io();

let currentRoom = null;
let currentUserId = null;
let unreadCounts = {};

function joinChat(userId, username) {
    openMobileChat();
    document.querySelectorAll(".user").forEach(function(user) {
    user.classList.remove("active");
});

const selectedUser = document.querySelector(
    '.user[onclick*="joinChat(' + userId + ',"]'
);

if (selectedUser) {
    selectedUser.classList.add("active");
}
    currentUserId = userId;

unreadCounts[userId] = 0;

const badge = document.getElementById("unread-" + userId);

if (badge) {
    badge.textContent = "";
    badge.style.display = "none";
}
socket.emit("mark_messages_read", {
    user_id: userId
});
    currentRoom =
        "chat_" +
        Math.min(USER_ID, userId) +
        "_" +
        Math.max(USER_ID, userId);

    document.getElementById("chatUsername").textContent = username;
    document.getElementById("chatAvatar").textContent = username[0].toUpperCase();
    document.getElementById("chatStatus").textContent = "Online";

    socket.emit("join", {
        room: currentRoom
    });

    socket.emit("load_messages", {
    user_id: userId
    });
    console.log("Joined room:", currentRoom);
}

function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value.trim();

    if (!message) {
        return;
    }

    if (!currentRoom) {
        alert("Please select a user first.");
        return;
    }

    socket.emit("send_message", {
    room: currentRoom,
    message: message,
    receiver_id: currentUserId
});

    input.value = "";
}

socket.on("receive_message", function(data) {
    const messages = document.querySelector(".messages");

    const messageDiv = document.createElement("div");

    messageDiv.classList.add("message");
    messageDiv.dataset.messageId = data.id;

    if (data.username === CURRENT_USERNAME) {
        messageDiv.classList.add("sent");
    } else {
        messageDiv.classList.add("received");
    }

    const text = document.createElement("p");
    text.textContent = data.message;

    const time = document.createElement("span");
    time.textContent = data.timestamp || "Just now";

    messageDiv.appendChild(text);
    messageDiv.appendChild(time);
    const deleteButton = document.createElement("button");

deleteButton.textContent = "Delete";
deleteButton.classList.add("delete-message");

deleteButton.onclick = function() {
    showDeleteOptions(data.id, data.sender_id);
};

messageDiv.appendChild(deleteButton);

if (data.sender_id === USER_ID) {
    const editButton = document.createElement("button");

    editButton.textContent = "Edit";
    editButton.classList.add("edit-message");

    editButton.onclick = function() {
        editMessage(data.id, data.message);
    };

    messageDiv.appendChild(editButton);
}

    messages.appendChild(messageDiv);

    messages.scrollTop = messages.scrollHeight;
});

socket.on("connect", function() {
    console.log("Connected to Socket.IO");

    socket.emit("load_unread_counts");
});

socket.on("online_users", function(data) {
    const allStatuses = document.querySelectorAll("[id^='status-']");

    allStatuses.forEach(function(status) {
        status.textContent = "Offline";
        status.classList.remove("online");
    });

    data.users.forEach(function(userId) {
        const status = document.getElementById("status-" + userId);

        if (status) {
            status.textContent = "Online";
            status.classList.add("online");
        }
    });
});

socket.on("chat_history", function(data) {
    const messages = document.querySelector(".messages");

    messages.innerHTML = "";

    data.messages.forEach(function(data) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message");

        messageDiv.dataset.messageId = data.id;

        if (data.sender_id === USER_ID) {
            messageDiv.classList.add("sent");
        } else {
            messageDiv.classList.add("received");
        }

        const text = document.createElement("p");
        text.textContent = data.message;

        const time = document.createElement("span");
        time.textContent = data.timestamp;

        messageDiv.appendChild(text);
        messageDiv.appendChild(time);

        const deleteButton = document.createElement("button");

        deleteButton.textContent = "Delete";
        deleteButton.classList.add("delete-message");

        deleteButton.onclick = function() {
            showDeleteOptions(data.id, data.sender_id);
        };

        messageDiv.appendChild(deleteButton);


        if (data.sender_id === USER_ID) {
        const editButton = document.createElement("button");

        editButton.textContent = "Edit";
        editButton.classList.add("edit-message");

        editButton.onclick = function() {
        editMessage(data.id, data.message);
    };

    messageDiv.appendChild(editButton);
}

        messages.appendChild(messageDiv);
    });

    messages.scrollTop = messages.scrollHeight;
});

socket.on("user_typing", function(data) {
    console.log("Typing event received:", data.username);
    const indicator = document.getElementById("typingIndicator");

    indicator.textContent = data.username + " is typing...";
});

socket.on("user_stop_typing", function() {
    const indicator = document.getElementById("typingIndicator");

    indicator.textContent = "";
});

socket.on("new_message_notification", function(data) {
    if (data.sender_id === USER_ID) {
        return;
    }

    if (currentUserId === data.sender_id) {
        return;
    }

    if (!unreadCounts[data.sender_id]) {
        unreadCounts[data.sender_id] = 0;
    }

    unreadCounts[data.sender_id]++;

    const badge = document.getElementById(
        "unread-" + data.sender_id
    );

    if (badge) {
        badge.textContent = unreadCounts[data.sender_id];
        badge.style.display = "flex";
    }
});

socket.on("unread_counts", function(data) {
    unreadCounts = data.counts;

    Object.keys(unreadCounts).forEach(function(userId) {
        const badge = document.getElementById("unread-" + userId);

        if (badge && unreadCounts[userId] > 0) {
            badge.textContent = unreadCounts[userId];
            badge.style.display = "flex";
        }
    });
});

function deleteMessage(messageId) {
    socket.emit("delete_message", {
        message_id: messageId
    });
}

socket.on("message_deleted", function(data) {
    const message = document.querySelector(
        '[data-message-id="' + data.message_id + '"]'
    );

    if (message) {
        message.remove();
    }
});

function showDeleteOptions(messageId, senderId) {
    const choice = prompt(
        senderId === USER_ID
            ? "1. Delete for me\n2. Delete for everyone"
            : "1. Delete for me"
    );

    if (choice === "1") {
        socket.emit("delete_message_for_me", {
            message_id: messageId
        });
    }

    if (choice === "2" && senderId === USER_ID) {
        socket.emit("delete_message", {
            message_id: messageId
        });
    }
}

function editMessage(messageId, oldMessage) {
    const newMessage = prompt("Edit your message:", oldMessage);

    if (newMessage === null) {
        return;
    }

    const trimmedMessage = newMessage.trim();

    if (!trimmedMessage) {
        alert("Message cannot be empty.");
        return;
    }

    if (trimmedMessage === oldMessage) {
        return;
    }

    socket.emit("edit_message", {
        message_id: messageId,
        message: trimmedMessage
    });
}

function editMessage(messageId, oldMessage) {
    const newMessage = prompt("Edit your message:", oldMessage);

    if (newMessage === null) {
        return;
    }

    const trimmedMessage = newMessage.trim();

    if (!trimmedMessage) {
        alert("Message cannot be empty.");
        return;
    }

    if (trimmedMessage === oldMessage) {
        return;
    }

    socket.emit("edit_message", {
        message_id: messageId,
        message: trimmedMessage
    });
}

socket.on("message_edited", function(data) {
    const messageDiv = document.querySelector(
        '[data-message-id="' + data.message_id + '"]'
    );

    if (messageDiv) {
        const text = messageDiv.querySelector("p");

        if (text) {
            text.textContent = data.message;
        }
    }
});

function backToContacts() {
    const container = document.querySelector(".chat-container");

    if (container) {
        container.classList.remove("mobile-chat-open");
    }
}

function openMobileChat() {
    if (window.matchMedia("(max-width: 600px)").matches) {
        const container = document.querySelector(".chat-container");

        if (container) {
            container.classList.add("mobile-chat-open");
        }
    }
}
