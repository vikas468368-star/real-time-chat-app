const socket = io();

let currentRoom = null;
let currentUserId = null;
let unreadCounts = {};
let editingMessageId = null;
let typingTimeout = null;
let pendingDelete = null;

// Phase 8 State
let replyingTo = null;
let pendingAttachment = null;
let searchMatches = [];
let currentSearchIndex = -1;
let soundEnabled = true;
let desktopNotifyEnabled = false;

// ==========================================
// UTILITY HELPERS
// ==========================================
function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

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
// NOTIFICATIONS & AUDIO SYNTHESIS
// ==========================================
function playNotificationSound() {
    if (!soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc2.type = "sine";
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.08); // A5

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc1.stop(ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime + 0.08);
        osc2.stop(ctx.currentTime + 0.32);
    } catch (e) {
        // AudioContext may be suspended before first user interaction
    }
}

function toggleNotificationPermission() {
    const btn = document.getElementById("notifyToggle");
    if (!("Notification" in window)) {
        alert("Desktop notifications are not supported by this browser.");
        return;
    }

    if (Notification.permission === "granted") {
        desktopNotifyEnabled = !desktopNotifyEnabled;
        if (btn) btn.classList.toggle("notify-active", desktopNotifyEnabled);
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function(permission) {
            if (permission === "granted") {
                desktopNotifyEnabled = true;
                if (btn) btn.classList.add("notify-active");
            }
        });
    } else {
        alert("Notifications are blocked in your browser settings. Please enable them to receive chat alerts.");
    }
}

function showInAppToast(senderId, senderName, messageText) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast-card";
    const palette = getAvatarStyle(senderName);

    toast.innerHTML = `
        <div class="toast-avatar" style="background:${palette.bg}; color:${palette.text}">
            ${senderName[0].toUpperCase()}
        </div>
        <div class="toast-body">
            <span class="toast-title">${escapeHtml(senderName)}</span>
            <span class="toast-text">${escapeHtml(messageText)}</span>
        </div>
        <button type="button" class="toast-close" title="Dismiss">✕</button>
    `;

    toast.onclick = function(e) {
        if (e.target.classList.contains("toast-close")) {
            toast.remove();
            return;
        }
        joinChat(senderId, senderName);
        toast.remove();
    };

    container.appendChild(toast);

    setTimeout(function() {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(40px)";
        setTimeout(function() { toast.remove(); }, 220);
    }, 4500);
}

// ==========================================
// SEARCH: SIDEBAR & IN-CONVERSATION
// ==========================================
function initSearch() {
    const searchInput = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearchBtn");
    const noContacts = document.getElementById("noContactsMatch");

    if (searchInput) {
        searchInput.addEventListener("input", function() {
            const query = this.value.trim().toLowerCase();
            const userElements = document.querySelectorAll("#usersList .user");
            let visibleCount = 0;

            if (clearBtn) {
                clearBtn.style.display = query ? "inline-block" : "none";
            }

            userElements.forEach(function(el) {
                const name = el.getAttribute("data-username") || el.querySelector("h4")?.textContent.toLowerCase() || "";
                if (name.includes(query)) {
                    el.style.display = "flex";
                    visibleCount++;
                } else {
                    el.style.display = "none";
                }
            });

            if (noContacts) {
                noContacts.style.display = (visibleCount === 0 && userElements.length > 0) ? "block" : "none";
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", function() {
            if (searchInput) {
                searchInput.value = "";
                searchInput.dispatchEvent(new Event("input"));
                searchInput.focus();
            }
        });
    }

    // Global keyboard shortcut '/' to focus sidebar search
    document.addEventListener("keydown", function(e) {
        if (e.key === "/" && document.activeElement !== document.getElementById("messageInput") && document.activeElement !== searchInput) {
            e.preventDefault();
            if (searchInput) searchInput.focus();
        }
    });
}

function toggleMessageSearch() {
    const bar = document.getElementById("messageSearchBar");
    const input = document.getElementById("msgSearchInput");
    if (!bar) return;

    if (bar.style.display === "none" || !bar.style.display) {
        bar.style.display = "flex";
        if (input) {
            input.focus();
            input.select();
            performMessageSearch(input.value.trim());
        }
    } else {
        closeMessageSearch();
    }
}

function closeMessageSearch() {
    const bar = document.getElementById("messageSearchBar");
    if (bar) bar.style.display = "none";
    clearMessageSearchHighlights();
    searchMatches = [];
    currentSearchIndex = -1;
    const count = document.getElementById("msgSearchCount");
    if (count) count.textContent = "0 of 0";
}

function clearMessageSearchHighlights() {
    const marks = document.querySelectorAll("#messagesContainer mark.search-highlight");
    marks.forEach(function(mark) {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
}

function performMessageSearch(query) {
    clearMessageSearchHighlights();
    searchMatches = [];
    currentSearchIndex = -1;
    const countEl = document.getElementById("msgSearchCount");

    if (!query) {
        if (countEl) countEl.textContent = "0 of 0";
        return;
    }

    const messages = document.querySelectorAll("#messagesContainer .message");
    const lowerQuery = query.toLowerCase();

    messages.forEach(function(msgEl) {
        const textEl = msgEl.querySelector(".message-text");
        if (!textEl) return;

        const textContent = textEl.textContent;
        const lowerText = textContent.toLowerCase();
        let idx = lowerText.indexOf(lowerQuery);

        if (idx !== -1) {
            const frag = document.createDocumentFragment();
            let lastIdx = 0;

            while (idx !== -1) {
                if (idx > lastIdx) {
                    frag.appendChild(document.createTextNode(textContent.substring(lastIdx, idx)));
                }
                const mark = document.createElement("mark");
                mark.className = "search-highlight";
                mark.textContent = textContent.substring(idx, idx + query.length);
                mark.dataset.msgId = msgEl.dataset.messageId;
                frag.appendChild(mark);
                searchMatches.push(mark);

                lastIdx = idx + query.length;
                idx = lowerText.indexOf(lowerQuery, lastIdx);
            }

            if (lastIdx < textContent.length) {
                frag.appendChild(document.createTextNode(textContent.substring(lastIdx)));
            }

            textEl.innerHTML = "";
            textEl.appendChild(frag);
        }
    });

    if (searchMatches.length > 0) {
        currentSearchIndex = 0;
        activateSearchMatch(currentSearchIndex);
        if (countEl) countEl.textContent = `1 of ${searchMatches.length}`;
    } else {
        if (countEl) countEl.textContent = "0 of 0";
    }
}

function navigateMessageSearch(direction) {
    if (searchMatches.length === 0) return;
    currentSearchIndex += direction;
    if (currentSearchIndex >= searchMatches.length) currentSearchIndex = 0;
    if (currentSearchIndex < 0) currentSearchIndex = searchMatches.length - 1;
    activateSearchMatch(currentSearchIndex);

    const countEl = document.getElementById("msgSearchCount");
    if (countEl) countEl.textContent = `${currentSearchIndex + 1} of ${searchMatches.length}`;
}

function activateSearchMatch(index) {
    searchMatches.forEach(function(m, i) {
        m.classList.toggle("active", i === index);
    });

    const activeMark = searchMatches[index];
    if (activeMark) {
        activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
        const parentMsg = activeMark.closest(".message");
        if (parentMsg) {
            parentMsg.classList.remove("message-target-pulse");
            void parentMsg.offsetWidth; // retrigger reflow
            parentMsg.classList.add("message-target-pulse");
        }
    }
}

// ==========================================
// REPLIES & QUOTE SYSTEM
// ==========================================
function startReplying(messageId, author, text) {
    cancelEditing();
    replyingTo = {
        id: messageId,
        author: author,
        text: text
    };

    const banner = document.getElementById("replyBanner");
    const authorEl = document.getElementById("replyAuthor");
    const previewEl = document.getElementById("replyPreviewText");
    const input = document.getElementById("messageInput");

    if (banner && authorEl && previewEl) {
        authorEl.textContent = author;
        previewEl.textContent = text ? (text.length > 70 ? text.substring(0, 67) + "..." : text) : "[Attachment]";
        banner.style.display = "flex";
    }

    if (input) input.focus();
}

function cancelReply() {
    replyingTo = null;
    const banner = document.getElementById("replyBanner");
    if (banner) banner.style.display = "none";
}

function jumpToMessage(messageId) {
    const target = document.querySelector(`[data-message-id="${messageId}"]`);
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.remove("message-target-pulse");
        void target.offsetWidth;
        target.classList.add("message-target-pulse");
    }
}

// ==========================================
// REACTIONS SYSTEM
// ==========================================
const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "✨", "💯"];
let activeReactionPicker = null;

function showReactionPicker(messageId, anchorEl) {
    hideReactionPicker();

    const picker = document.createElement("div");
    picker.className = "reaction-picker-popover";
    picker.id = "activeReactionPicker";

    ALLOWED_REACTIONS.forEach(function(emoji) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reaction-picker-btn";
        btn.textContent = emoji;
        btn.onclick = function(e) {
            e.stopPropagation();
            socket.emit("toggle_reaction", {
                message_id: messageId,
                emoji: emoji
            });
            hideReactionPicker();
        };
        picker.appendChild(btn);
    });

    anchorEl.appendChild(picker);
    activeReactionPicker = picker;
}

function hideReactionPicker() {
    if (activeReactionPicker) {
        activeReactionPicker.remove();
        activeReactionPicker = null;
    }
}

function renderMessageReactions(container, reactions, messageId) {
    container.innerHTML = "";
    if (!reactions || reactions.length === 0) return;

    reactions.forEach(function(rxn) {
        const badge = document.createElement("div");
        badge.className = "reaction-badge" + (rxn.user_reacted ? " user-reacted" : "");
        badge.title = rxn.users ? rxn.users.join(", ") : "";
        badge.innerHTML = `
            <span>${rxn.emoji}</span>
            <span class="reaction-count">${rxn.count}</span>
        `;
        badge.onclick = function() {
            socket.emit("toggle_reaction", {
                message_id: messageId,
                emoji: rxn.emoji
            });
        };
        container.appendChild(badge);
    });
}

// ==========================================
// FILE & IMAGE ATTACHMENTS
// ==========================================
function triggerFileInput() {
    const fileInput = document.getElementById("fileAttachmentInput");
    if (fileInput) fileInput.click();
}

function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        alert("File exceeds maximum allowed size of 15MB.");
        event.target.value = "";
        return;
    }

    pendingAttachment = {
        file: file,
        name: file.name,
        size: file.size,
        isImage: file.type.startsWith("image/")
    };

    const banner = document.getElementById("attachmentPreviewBanner");
    const thumb = document.getElementById("attPreviewThumb");
    const nameEl = document.getElementById("attPreviewName");
    const bytesEl = document.getElementById("attPreviewBytes");

    if (banner && thumb && nameEl && bytesEl) {
        nameEl.textContent = file.name;
        bytesEl.textContent = formatBytes(file.size);

        if (pendingAttachment.isImage) {
            const reader = new FileReader();
            reader.onload = function(e) {
                thumb.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        } else {
            thumb.innerHTML = "📄";
        }

        banner.style.display = "flex";
    }

    const input = document.getElementById("messageInput");
    if (input) input.focus();
}

function clearAttachment() {
    pendingAttachment = null;
    const fileInput = document.getElementById("fileAttachmentInput");
    if (fileInput) fileInput.value = "";
    const banner = document.getElementById("attachmentPreviewBanner");
    if (banner) banner.style.display = "none";
}

function openImageLightbox(url, name) {
    const modal = document.getElementById("imageLightboxModal");
    const img = document.getElementById("lightboxImage");
    const title = document.getElementById("lightboxFilename");
    const dl = document.getElementById("lightboxDownloadBtn");

    if (modal && img) {
        img.src = url;
        if (title) title.textContent = name || "Image Attachment";
        if (dl) dl.href = url;
        modal.style.display = "flex";
    }
}

function closeImageLightbox() {
    const modal = document.getElementById("imageLightboxModal");
    if (modal) modal.style.display = "none";
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
    cancelReply();
    clearAttachment();
    closeMessageSearch();

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

    socket.emit("mark_messages_read", { user_id: userId });

    currentRoom = "chat_" + Math.min(USER_ID, userId) + "_" + Math.max(USER_ID, userId);

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

    // Floating Quick-Action Pill (Reply / Reaction / Edit / Delete)
    const actionPill = document.createElement("div");
    actionPill.classList.add("floating-action-pill");

    // Reply Button
    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.classList.add("action-icon-btn", "reply-btn");
    replyBtn.title = "Reply to message";
    replyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 17 4 12 9 7"></polyline>
            <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
        </svg>
    `;
    replyBtn.onclick = function() {
        startReplying(data.id, data.username, data.message);
    };
    actionPill.appendChild(replyBtn);

    // Reaction Button
    const rxnBtn = document.createElement("button");
    rxnBtn.type = "button";
    rxnBtn.classList.add("action-icon-btn", "reaction-btn");
    rxnBtn.title = "React with emoji";
    rxnBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
    `;
    rxnBtn.onclick = function(e) {
        e.stopPropagation();
        showReactionPicker(data.id, actionPill);
    };
    actionPill.appendChild(rxnBtn);

    // Edit Button (author only)
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

    // Delete Button
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

    // Content Bubble
    const contentWrap = document.createElement("div");
    contentWrap.classList.add("message-content");

    // Quoted Reply Preview
    if (data.reply_to) {
        const quoteDiv = document.createElement("div");
        quoteDiv.classList.add("message-quote-preview");
        quoteDiv.innerHTML = `
            <span class="quote-author">${escapeHtml(data.reply_to.username)}</span>
            <span class="quote-text">${escapeHtml(data.reply_to.message || "[Attachment]")}</span>
        `;
        quoteDiv.onclick = function() {
            jumpToMessage(data.reply_to.id);
        };
        contentWrap.appendChild(quoteDiv);
    }

    // Message Text
    if (data.message) {
        const text = document.createElement("p");
        text.classList.add("message-text");
        text.textContent = data.message;
        contentWrap.appendChild(text);
    }

    // Attachment
    if (data.attachment && data.attachment.url) {
        if (data.attachment.type === "image") {
            const img = document.createElement("img");
            img.className = "chat-image-attachment";
            img.src = data.attachment.url;
            img.alt = data.attachment.name || "Image";
            img.loading = "lazy";
            img.onclick = function() {
                openImageLightbox(data.attachment.url, data.attachment.name);
            };
            contentWrap.appendChild(img);
        } else {
            const fileCard = document.createElement("a");
            fileCard.className = "chat-file-card";
            fileCard.href = data.attachment.url;
            fileCard.download = data.attachment.name || "file";
            fileCard.target = "_blank";
            fileCard.rel = "noopener noreferrer";
            fileCard.innerHTML = `
                <div class="file-card-icon">📄</div>
                <div class="file-card-info">
                    <span class="file-card-name">${escapeHtml(data.attachment.name)}</span>
                    <span class="file-card-size">${formatBytes(data.attachment.size)}</span>
                </div>
                <div class="file-card-download">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
            `;
            contentWrap.appendChild(fileCard);
        }
    }

    // Metadata Row
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

    if (isMine) {
        const ticks = document.createElement("span");
        ticks.classList.add("read-ticks");
        if (data.is_read) {
            ticks.classList.add("read");
            ticks.title = "Read";
            ticks.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="18 6 9 17 4 12"></polyline>
                    <polyline points="22 10 13 21 11 19"></polyline>
                </svg>
            `;
        } else {
            ticks.title = "Sent";
            ticks.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        }
        metaWrap.appendChild(ticks);
    }

    contentWrap.appendChild(metaWrap);

    // Reactions Container
    const reactionsRow = document.createElement("div");
    reactionsRow.className = "message-reactions-row";
    renderMessageReactions(reactionsRow, data.reactions, data.id);
    contentWrap.appendChild(reactionsRow);

    messageDiv.appendChild(contentWrap);

    return messageDiv;
}

// ==========================================
// SEND / EDIT MESSAGE LOGIC
// ==========================================
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const rawMessage = input.value.trim();

    if (!rawMessage && !pendingAttachment) {
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
            message: rawMessage
        });
        cancelEditing();
        stopTypingNow();
        return;
    }

    let attachmentData = null;

    // Handle File Attachment Upload if pending
    if (pendingAttachment && pendingAttachment.file) {
        const sendBtn = document.getElementById("sendButton");
        if (sendBtn) sendBtn.disabled = true;

        const formData = new FormData();
        formData.append("file", pendingAttachment.file);

        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

        try {
            const res = await fetch("/upload", {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken
                },
                body: formData
            });

            const json = await res.json();
            if (!res.ok || json.error) {
                alert(json.error || "File upload failed.");
                if (sendBtn) sendBtn.disabled = false;
                return;
            }

            attachmentData = {
                url: json.url,
                name: json.name,
                type: json.type,
                size: json.size
            };
        } catch (err) {
            alert("Network error uploading attachment.");
            if (sendBtn) sendBtn.disabled = false;
            return;
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    // Send via socket
    socket.emit("send_message", {
        room: currentRoom,
        message: rawMessage,
        receiver_id: currentUserId,
        reply_to_id: replyingTo ? replyingTo.id : null,
        attachment: attachmentData
    });

    input.value = "";
    cancelReply();
    clearAttachment();
    stopTypingNow();
}

function startEditing(messageId, currentText) {
    cancelReply();
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
    if (currentRoom && currentUserId) {
        socket.emit("join", { room: currentRoom });
        socket.emit("load_messages", { user_id: currentUserId });
    }
});

socket.on("message_error", function(data) {
    const err = (data && data.error) ? data.error : "Message delivery failed. Please check your connection.";
    console.error("PulseChat message error:", err);
    alert(err);
});

socket.on("receive_message", function(data) {
    const messages = document.getElementById("messagesContainer");
    if (!messages) return;

    if (data.id && document.querySelector('[data-message-id="' + data.id + '"]')) {
        return;
    }

    const emptyState = document.getElementById("chatEmptyState");
    if (emptyState) {
        emptyState.remove();
    }

    const isMine = data.sender_id === USER_ID;
    const isNearBottom = (messages.scrollHeight - messages.scrollTop - messages.clientHeight) < 140;

    const messageDiv = createMessageElement(data);
    messages.appendChild(messageDiv);

    if (isMine || isNearBottom) {
        messages.scrollTop = messages.scrollHeight;
    }

    // Play subtle audio if received
    if (!isMine) {
        playNotificationSound();
    }
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
    const messageDiv = document.querySelector('[data-message-id="' + data.message_id + '"]');

    if (messageDiv) {
        const text = messageDiv.querySelector(".message-text") || messageDiv.querySelector("p");
        if (text) {
            text.textContent = data.message;
        }

        const editedTag = messageDiv.querySelector(".edited-tag");
        if (editedTag) {
            editedTag.style.display = "inline";
        }

        messageDiv.classList.add("message-edited-highlight");
        setTimeout(function() {
            messageDiv.classList.remove("message-edited-highlight");
        }, 1200);
    }
});

socket.on("message_deleted", function(data) {
    if (editingMessageId && editingMessageId === data.message_id) {
        cancelEditing();
    }
    if (replyingTo && replyingTo.id === data.message_id) {
        cancelReply();
    }

    const message = document.querySelector('[data-message-id="' + data.message_id + '"]');
    if (message) {
        message.classList.add("message-deleted-animate");
        setTimeout(function() {
            message.remove();
        }, 220);
    }
});

socket.on("message_deleted_for_me", function(data) {
    if (editingMessageId && editingMessageId === data.message_id) {
        cancelEditing();
    }
    if (replyingTo && replyingTo.id === data.message_id) {
        cancelReply();
    }

    const message = document.querySelector('[data-message-id="' + data.message_id + '"]');
    if (message) {
        message.classList.add("message-deleted-animate");
        setTimeout(function() {
            message.remove();
        }, 220);
    }
});

socket.on("reaction_updated", function(data) {
    const message = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (!message) return;

    const row = message.querySelector(".message-reactions-row");
    if (row) {
        renderMessageReactions(row, data.reactions, data.message_id);
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

socket.on("messages_read", function(data) {
    if (currentUserId && currentUserId === data.reader_id) {
        document.querySelectorAll(".message.sent .read-ticks").forEach(function(ticks) {
            ticks.classList.add("read");
            ticks.title = "Read";
            ticks.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="18 6 9 17 4 12"></polyline>
                    <polyline points="22 10 13 21 11 19"></polyline>
                </svg>
            `;
        });
    }
});

socket.on("new_message_notification", function(data) {
    if (data.sender_id === USER_ID) return;
    if (currentUserId === data.sender_id) return;

    if (!unreadCounts[data.sender_id]) {
        unreadCounts[data.sender_id] = 0;
    }
    unreadCounts[data.sender_id]++;

    const badge = document.getElementById("unread-" + data.sender_id);
    if (badge) {
        badge.textContent = unreadCounts[data.sender_id];
        badge.style.display = "inline-flex";
    }

    // Play sound alert
    playNotificationSound();

    // In-app floating toast
    showInAppToast(data.sender_id, data.username, data.message || "Sent an attachment");

    // Native Web Notification API
    if (desktopNotifyEnabled && document.hidden && ("Notification" in window) && Notification.permission === "granted") {
        try {
            const notif = new Notification(`PulseChat • ${data.username}`, {
                body: data.message || "Sent an attachment",
                icon: "/static/favicon.ico"
            });
            notif.onclick = function() {
                window.focus();
                joinChat(data.sender_id, data.username);
                notif.close();
            };
        } catch (e) {}
    }
});

// ==========================================
// MOBILE RESPONSIVENESS & HISTORY
// ==========================================
function backToContacts(fromPopstate) {
    const container = document.querySelector(".chat-container");
    if (container) {
        container.classList.remove("mobile-chat-open");
    }
    if (!fromPopstate && window.history.state && window.history.state.chatOpen) {
        window.history.back();
    }
}

function openMobileChat() {
    if (window.matchMedia("(max-width: 768px)").matches) {
        const container = document.querySelector(".chat-container");
        if (container && !container.classList.contains("mobile-chat-open")) {
            container.classList.add("mobile-chat-open");
            try {
                history.pushState({ chatOpen: true }, "");
            } catch (e) {}
        }
    }
}

window.addEventListener("popstate", function(e) {
    const container = document.querySelector(".chat-container");
    if (container && container.classList.contains("mobile-chat-open")) {
        backToContacts(true);
    }
});

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
                if (editingMessageId) cancelEditing();
                if (replyingTo) cancelReply();
            }
        });

        input.addEventListener("input", function() {
            handleTyping();
        });
    }

    const msgSearchInput = document.getElementById("msgSearchInput");
    if (msgSearchInput) {
        msgSearchInput.addEventListener("input", function() {
            performMessageSearch(this.value.trim());
        });
        msgSearchInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                navigateMessageSearch(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
                closeMessageSearch();
            }
        });
    }

    // Ctrl+F / Cmd+F shortcut to open in-chat search
    document.addEventListener("keydown", function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
            if (currentRoom) {
                e.preventDefault();
                toggleMessageSearch();
            }
        }
    });

    // Close popovers on click outside
    document.addEventListener("click", function(e) {
        if (!e.target.closest(".floating-action-pill") && !e.target.closest(".reaction-picker-popover")) {
            hideReactionPicker();
        }
    });

    const deleteModal = document.getElementById("deleteModal");
    if (deleteModal) {
        deleteModal.addEventListener("click", function(e) {
            if (e.target === deleteModal) closeDeleteModal();
        });
    }

    const imageModal = document.getElementById("imageLightboxModal");
    if (imageModal) {
        imageModal.addEventListener("click", function(e) {
            if (e.target === imageModal) closeImageLightbox();
        });
    }
});
