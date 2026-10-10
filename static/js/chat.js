const socket = io();

let currentRoom = null;
let currentUserId = null;
let unreadCounts = {};
let editingMessageId = null;
let typingTimeout = null;
let pendingDelete = null;

// ==========================================
// COLOR HARMONY & AVATAR GENERATOR
// ==========================================
const AVATAR_PALETTES = [
    { bg: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)", text: "#ffffff" },
    { bg: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)", text: "#ffffff" }
];

function getAvatarStyle(name) {
    if (!name) return AVATAR_PALETTES[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_PALETTES.length;
    return AVATAR_PALETTES[index];
}

function applyAvatarGradients() {
    document.querySelectorAll(".contact-avatar").forEach(function(el) {
        const name = el.getAttribute("data-name") || el.textContent.trim();
        const palette = getAvatarStyle(name);
        el.style.background = palette.bg;
        el.style.color = palette.text;
    });

    const myAvatar = document.getElementById("myAvatar");
    if (myAvatar) {
        const myPalette = getAvatarStyle(CURRENT_USERNAME);
        myAvatar.style.background = myPalette.bg;
        myAvatar.style.color = myPalette.text;
    }
}

// ==========================================
// THEME MANAGEMENT (Dark / Light Theme)
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem("chat_theme") || "dark";
    setTheme(savedTheme);

    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", function() {
            const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
            const newTheme = currentTheme === "dark" ? "light" : "dark";
            setTheme(newTheme);
        });
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("chat_theme", theme);
}

// ==========================================
// SEARCH & SHORTCUT
// ==========================================
function initSearch() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", function() {
            const query = this.value.trim().toLowerCase();
            const userElements = document.querySelectorAll("#usersList .user");
            userElements.forEach(function(el) {
                const name = el.getAttribute("data-username") || el.querySelector("h4")?.textContent.toLowerCase() || "";
                if (name.includes(query)) {
                    el.style.display = "flex";
                } else {
                    el.style.display = "none";
                }
            });
        });
    }

    // Global keyboard shortcut '/' to focus search
    document.addEventListener("keydown", function(e) {
        if (e.key === "/" && document.activeElement !== document.getElementById("messageInput") && document.activeElement !== searchInput) {
            e.preventDefault();
            if (searchInput) searchInput.focus();
        }
    });
}

// ==========================================
// EMOJI DRAWER
// ==========================================
function toggleEmojiShelf() {
    const shelf = document.getElementById("emojiShelf");
    if (shelf) {
        shelf.style.display = shelf.style.display === "flex" ? "none" : "flex";
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById("messageInput");
    if (input) {
        input.value += emoji;
        input.focus();
        handleTyping();
    }
}

// ==========================================
// JOINING A CHAT ROOM
// ==========================================
function joinChat(userId, username) {
    openMobileChat();
    cancelEditing();

    // Close emoji shelf if open
    const shelf = document.getElementById("emojiShelf");
    if (shelf) shelf.style.display = "none";

    document.querySelectorAll(".user").forEach(function(user) {
        user.classList.remove("active");
    });

    const selectedUser = document.getElementById("user-item-" + userId);
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

    currentRoom = "chat_" + Math.min(USER_ID, userId) + "_" + Math.max(USER_ID, userId);

    // Update Header Avatar and Details
    const headerUsername = document.getElementById("chatUsername");
    const headerAvatar = document.getElementById("chatAvatar");
    const headerDot = document.getElementById("chatHeaderDot");
    const headerBeacon = document.getElementById("chatStatusBeacon");
    const headerStatus = document.getElementById("chatStatus");

    if (headerUsername) headerUsername.textContent = username;
    if (headerAvatar) {
        headerAvatar.textContent = username[0].toUpperCase();
        const palette = getAvatarStyle(username);
        headerAvatar.style.background = palette.bg;
        headerAvatar.style.color = palette.text;
    }

    // Check online status in sidebar
    const statusEl = document.getElementById("status-" + userId);
    const isOnline = statusEl && statusEl.classList.contains("online");

    if (headerBeacon) {
        headerBeacon.className = isOnline ? "status-beacon-sm online" : "status-beacon-sm offline";
    }
    if (headerDot) {
        headerDot.className = isOnline ? "status-indicator-dot online" : "status-indicator-dot";
    }
    if (headerStatus) {
        headerStatus.textContent = isOnline ? "Active now" : "Offline";
    }

    socket.emit("join", { room: currentRoom });
    socket.emit("load_messages", { user_id: userId });

    const input = document.getElementById("messageInput");
    if (input) input.focus();

    console.log("Joined room:", currentRoom);
}

// ==========================================
// MESSAGE DOM BUILDER (Ultra-Modern)
// ==========================================
function createMessageElement(data) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");
    messageDiv.dataset.messageId = data.id;

    const isMine = data.sender_id === USER_ID;
    if (isMine) {
        messageDiv.classList.add("sent");
    } else {
        messageDiv.classList.add("received");
    }

    // Floating Quick-Action Pill (Edit / Delete)
    const actionPill = document.createElement("div");
    actionPill.classList.add("floating-action-pill");

    if (isMine) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.classList.add("action-icon-btn", "edit-btn");
        editBtn.title = "Edit message";
        editBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
        `;
        editBtn.onclick = function() {
            const currentMessageText = messageDiv.querySelector(".message-text")?.textContent || data.message;
            startEditing(data.id, currentMessageText);
        };
        actionPill.appendChild(editBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.classList.add("action-icon-btn", "delete-btn");
    deleteBtn.title = "Delete message";
    deleteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    `;
    deleteBtn.onclick = function() {
        showDeleteOptions(data.id, data.sender_id);
    };
    actionPill.appendChild(deleteBtn);

    messageDiv.appendChild(actionPill);

    // Message Content Bubble
    const contentWrap = document.createElement("div");
    contentWrap.classList.add("message-content");

    const text = document.createElement("p");
    text.classList.add("message-text");
    text.textContent = data.message;
    contentWrap.appendChild(text);

    // Metadata Row (Time, Edited tag, Read checkmarks)
    const metaWrap = document.createElement("div");
    metaWrap.classList.add("message-meta");

    const time = document.createElement("span");
    time.classList.add("message-time");
    time.textContent = data.timestamp || "Just now";
    metaWrap.appendChild(time);

    const editedTag = document.createElement("span");
    editedTag.classList.add("edited-tag");
    editedTag.textContent = "• Edited";
    if (!data.is_edited) {
        editedTag.style.display = "none";
    }
    metaWrap.appendChild(editedTag);

    // Double checkmarks for sent messages
    if (isMine) {
        const ticks = document.createElement("span");
        ticks.classList.add("read-ticks");
        ticks.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        metaWrap.appendChild(ticks);
    }

    contentWrap.appendChild(metaWrap);
    messageDiv.appendChild(contentWrap);

    return messageDiv;
}

// ==========================================
// SEND / EDIT MESSAGE LOGIC
// ==========================================
function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value.trim();

    if (!message) {
        return;
    }

    if (!currentRoom) {
        alert("Please select a conversation from the left first.");
        return;
    }

    // Save edited message
    if (editingMessageId) {
        socket.emit("edit_message", {
            message_id: editingMessageId,
            message: message
        });
        cancelEditing();
        stopTypingNow();
        return;
    }

    // Send new message
    socket.emit("send_message", {
        room: currentRoom,
        message: message,
        receiver_id: currentUserId
    });

    input.value = "";
    stopTypingNow();
}

function startEditing(messageId, currentText) {
    editingMessageId = messageId;

    const banner = document.getElementById("editingBanner");
    const preview = document.getElementById("editingPreviewText");
    const input = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendButton");

    if (banner && preview) {
        preview.textContent = currentText.length > 70 ? currentText.substring(0, 67) + "..." : currentText;
        banner.style.display = "flex";
    }

    if (input) {
        input.value = currentText;
        input.focus();
        input.setSelectionRange(currentText.length, currentText.length);
        input.placeholder = "Edit your message (Enter to save, Esc to cancel)...";
    }

    if (sendBtn) {
        const sendIcon = sendBtn.querySelector(".send-icon");
        const saveIcon = sendBtn.querySelector(".save-icon");
        if (sendIcon) sendIcon.style.display = "none";
        if (saveIcon) saveIcon.style.display = "inline-block";
        sendBtn.classList.add("editing-active");
        sendBtn.title = "Save changes";
    }
}

function cancelEditing() {
    editingMessageId = null;

    const banner = document.getElementById("editingBanner");
    const input = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendButton");

    if (banner) {
        banner.style.display = "none";
    }

    if (input) {
        input.value = "";
        input.placeholder = "Type a message... (Press Enter to send)";
    }

    if (sendBtn) {
        const sendIcon = sendBtn.querySelector(".send-icon");
        const saveIcon = sendBtn.querySelector(".save-icon");
        if (sendIcon) sendIcon.style.display = "inline-block";
        if (saveIcon) saveIcon.style.display = "none";
        sendBtn.classList.remove("editing-active");
        sendBtn.title = "Send message";
    }
}

// ==========================================
// TYPING INDICATOR LOGIC
// ==========================================
function handleTyping() {
    if (!currentRoom || editingMessageId) {
        return;
    }

    socket.emit("typing", { room: currentRoom });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() {
        stopTypingNow();
    }, 1200);
}

function stopTypingNow() {
    if (!currentRoom) return;
    clearTimeout(typingTimeout);
    socket.emit("stop_typing", { room: currentRoom });
}

// ==========================================
// DELETE CONFIRMATION MODAL
// ==========================================
function showDeleteOptions(messageId, senderId) {
    pendingDelete = {
        messageId: messageId,
        senderId: senderId
    };

    const modal = document.getElementById("deleteModal");
    const deleteForEveryoneBtn = document.getElementById("deleteForEveryoneBtn");
    const deleteForMeBtn = document.getElementById("deleteForMeBtn");

    if (!modal) return;

    if (senderId === USER_ID) {
        deleteForEveryoneBtn.style.display = "inline-flex";
    } else {
        deleteForEveryoneBtn.style.display = "none";
    }

    deleteForMeBtn.onclick = function() {
        if (pendingDelete) {
            socket.emit("delete_message_for_me", {
                message_id: pendingDelete.messageId
            });
        }
        closeDeleteModal();
    };

    deleteForEveryoneBtn.onclick = function() {
        if (pendingDelete) {
            socket.emit("delete_message", {
                message_id: pendingDelete.messageId
            });
        }
        closeDeleteModal();
    };

    modal.style.display = "flex";
}

function closeDeleteModal() {
    const modal = document.getElementById("deleteModal");
    if (modal) {
        modal.style.display = "none";
    }
    pendingDelete = null;
}

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================
socket.on("connect", function() {
    console.log("Connected to PulseChat Socket.IO");
    socket.emit("load_unread_counts");
});

socket.on("receive_message", function(data) {
    const messages = document.getElementById("messagesContainer");
    if (!messages) return;

    const emptyState = document.getElementById("chatEmptyState");
    if (emptyState) {
        emptyState.remove();
    }

    const messageDiv = createMessageElement(data);
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
});

socket.on("chat_history", function(data) {
    const messages = document.getElementById("messagesContainer");
    if (!messages) return;

    messages.innerHTML = "";

    if (!data.messages || data.messages.length === 0) {
        const emptyNotice = document.createElement("div");
        emptyNotice.classList.add("chat-empty-state");
        emptyNotice.innerHTML = `
            <div class="empty-state-badge">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
            </div>
            <h3>No messages yet</h3>
            <p>Send a message below to start this live conversation!</p>
        `;
        messages.appendChild(emptyNotice);
        return;
    }

    data.messages.forEach(function(msg) {
        const messageDiv = createMessageElement(msg);
        messages.appendChild(messageDiv);
    });

    messages.scrollTop = messages.scrollHeight;
});

socket.on("message_edited", function(data) {
    const messageDiv = document.querySelector(
        '[data-message-id="' + data.message_id + '"]'
    );

    if (messageDiv) {
        const text = messageDiv.querySelector(".message-text") || messageDiv.querySelector("p");
        if (text) {
            text.textContent = data.message;
        }

        const editedTag = messageDiv.querySelector(".edited-tag");
        if (editedTag) {
            editedTag.style.display = "inline";
        }

        // Glow highlight animation on edit
        messageDiv.classList.add("message-edited-highlight");
        setTimeout(function() {
            messageDiv.classList.remove("message-edited-highlight");
        }, 1200);
    }
});

socket.on("message_deleted", function(data) {
    const message = document.querySelector(
        '[data-message-id="' + data.message_id + '"]'
    );

    if (message) {
        message.classList.add("message-deleted-animate");
        setTimeout(function() {
            message.remove();
        }, 220);
    }
});

socket.on("message_deleted_for_me", function(data) {
    const message = document.querySelector(
        '[data-message-id="' + data.message_id + '"]'
    );

    if (message) {
        message.classList.add("message-deleted-animate");
        setTimeout(function() {
            message.remove();
        }, 220);
    }
});

socket.on("user_typing", function(data) {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) {
        indicator.innerHTML = `
            <div class="typing-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
            <span class="typing-label">${data.username} is typing...</span>
        `;
        indicator.style.display = "flex";
    }
});

socket.on("user_stop_typing", function() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) {
        indicator.innerHTML = "";
        indicator.style.display = "none";
    }
});

socket.on("online_users", function(data) {
    const allStatuses = document.querySelectorAll("[id^='status-']");
    const allDots = document.querySelectorAll("[id^='dot-']");

    allStatuses.forEach(function(status) {
        status.textContent = "Offline";
        status.classList.remove("online");
    });

    allDots.forEach(function(dot) {
        dot.classList.remove("online");
    });

    data.users.forEach(function(userId) {
        const status = document.getElementById("status-" + userId);
        const dot = document.getElementById("dot-" + userId);
        if (status) {
            status.textContent = "Online";
            status.classList.add("online");
        }
        if (dot) {
            dot.classList.add("online");
        }
    });

    // Update active chat header
    if (currentUserId) {
        const isOnline = data.users.includes(currentUserId);
        const headerStatus = document.getElementById("chatStatus");
        const headerBeacon = document.getElementById("chatStatusBeacon");
        const headerDot = document.getElementById("chatHeaderDot");

        if (headerStatus) {
            headerStatus.textContent = isOnline ? "Active now" : "Offline";
        }
        if (headerBeacon) {
            headerBeacon.className = isOnline ? "status-beacon-sm online" : "status-beacon-sm offline";
        }
        if (headerDot) {
            headerDot.className = isOnline ? "status-indicator-dot online" : "status-indicator-dot";
        }
    }
});

socket.on("unread_counts", function(data) {
    unreadCounts = data.counts || {};

    Object.keys(unreadCounts).forEach(function(userId) {
        const badge = document.getElementById("unread-" + userId);
        if (badge && unreadCounts[userId] > 0) {
            badge.textContent = unreadCounts[userId];
            badge.style.display = "inline-flex";
        }
    });
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

    const badge = document.getElementById("unread-" + data.sender_id);
    if (badge) {
        badge.textContent = unreadCounts[data.sender_id];
        badge.style.display = "inline-flex";
    }
});

// ==========================================
// MOBILE RESPONSIVENESS
// ==========================================
function backToContacts() {
    const container = document.querySelector(".chat-container");
    if (container) {
        container.classList.remove("mobile-chat-open");
    }
}

function openMobileChat() {
    if (window.matchMedia("(max-width: 768px)").matches) {
        const container = document.querySelector(".chat-container");
        if (container) {
            container.classList.add("mobile-chat-open");
        }
    }
}

// ==========================================
// DOM INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    initTheme();
    initSearch();
    applyAvatarGradients();

    const input = document.getElementById("messageInput");
    if (input) {
        input.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
            } else if (e.key === "Escape") {
                if (editingMessageId) {
                    cancelEditing();
                }
            }
        });

        input.addEventListener("input", function() {
            handleTyping();
        });
    }

    const deleteModal = document.getElementById("deleteModal");
    if (deleteModal) {
        deleteModal.addEventListener("click", function(e) {
            if (e.target === deleteModal) {
                closeDeleteModal();
            }
        });
    }
});
