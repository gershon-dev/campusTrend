// ============================================================
// CAMPUSTREND CHAT — scripts/chat.js
// ============================================================
// Requires: supabase-config.js loaded first
// URL params: ?userId=<other_user_id>
// ============================================================

let currentUser    = null;
let currentProfile = null;
let otherUserId    = null;
let otherProfile   = null;
let realtimeChannel = null;
let toastTimer     = null;

// ── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Auth check
    const isLoggedIn = await window.isLoggedIn();
    if (!isLoggedIn) { window.location.href = 'sign-in.html'; return; }

    currentUser    = await window.getCurrentUser();
    currentProfile = await window.getCurrentProfile();
    if (!currentUser) { window.location.href = 'sign-in.html'; return; }

    // Get target user from URL
    const params = new URLSearchParams(window.location.search);
    otherUserId = params.get('userId');

    if (!otherUserId || otherUserId === currentUser.id) {
        showToast('Invalid chat target', 'error');
        setTimeout(goBack, 1500);
        return;
    }

    // Load the other user's profile
    const result = await window.getProfile(otherUserId);
    if (!result.success) {
        showToast('User not found', 'error');
        setTimeout(goBack, 1500);
        return;
    }
    otherProfile = result.profile;
    renderHeader();

    // Check follow relationship (mutual: either follows the other)
    const canChat = await checkCanChat();
    if (!canChat) {
        document.getElementById('accessDenied').style.display = 'flex';
        return;
    }

    // Show chat UI and load messages
    document.getElementById('chatBody').style.display = 'flex';
    await loadMessages();
    subscribeToMessages();
    setupInput();
});

// ── RENDER HEADER ────────────────────────────────────────────
function renderHeader() {
    const initials = getInitials(otherProfile.full_name);
    document.getElementById('headerName').textContent = otherProfile.full_name || 'Student';

    const avatarEl = document.getElementById('headerAvatar');
    if (otherProfile.avatar_url) {
        avatarEl.innerHTML = `<img src="${otherProfile.avatar_url}" alt="${escapeHtml(otherProfile.full_name)}">`;
    } else {
        document.getElementById('headerInitials').textContent = initials;
    }

    document.title = `Chat with ${otherProfile.full_name} — CampusTrend`;
}

// ── FOLLOWER CHECK ───────────────────────────────────────────
// Allow chat if: I follow them OR they follow me (mutual relationship)
async function checkCanChat() {
    try {
        // Check if I follow them
        const { data: iFollow } = await window.supabaseClient
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', otherUserId)
            .maybeSingle();

        if (iFollow) return true;

        // Check if they follow me
        const { data: theyFollow } = await window.supabaseClient
            .from('follows')
            .select('id')
            .eq('follower_id', otherUserId)
            .eq('following_id', currentUser.id)
            .maybeSingle();

        return !!theyFollow;
    } catch (err) {
        console.error('Follow check error:', err);
        return false;
    }
}

// ── LOAD MESSAGES ────────────────────────────────────────────
async function loadMessages() {
    const loading = document.getElementById('messagesLoading');
    const list    = document.getElementById('messagesList');

    // Build a stable conversation ID (smaller UUID first)
    const convId = buildConvId(currentUser.id, otherUserId);

    const { data: messages, error } = await window.supabaseClient
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

    loading.style.display = 'none';

    if (error) {
        showToast('Could not load messages', 'error');
        return;
    }

    if (!messages || messages.length === 0) {
        document.getElementById('messagesEmpty').style.display = 'flex';
        return;
    }

    renderMessages(messages);
    scrollToBottom(false);

    // Mark received messages as read
    markAsRead(convId);
}

// ── RENDER MESSAGES ──────────────────────────────────────────
function renderMessages(messages) {
    const list = document.getElementById('messagesList');
    list.innerHTML = '';
    document.getElementById('messagesEmpty').style.display = 'none';

    let lastDate = null;
    let lastSenderId = null;

    messages.forEach((msg, i) => {
        const msgDate = formatDateLabel(msg.created_at);

        // Date divider
        if (msgDate !== lastDate) {
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.innerHTML = `<span>${msgDate}</span>`;
            list.appendChild(div);
            lastDate = msgDate;
            lastSenderId = null; // reset grouping after divider
        }

        const isSent = msg.sender_id === currentUser.id;
        const isConsecutive = lastSenderId === msg.sender_id;

        const row = document.createElement('div');
        row.className = `message-row ${isSent ? 'sent' : 'received'}${isConsecutive ? ' consecutive' : ''}`;
        row.dataset.msgId = msg.id;

        const initials = isSent
            ? getInitials(currentProfile?.full_name || 'Me')
            : getInitials(otherProfile?.full_name || '?');

        const avatarHtml = isSent ? '' : `
            <div class="msg-avatar">
                ${otherProfile?.avatar_url
                    ? `<img src="${otherProfile.avatar_url}" alt="">`
                    : initials}
            </div>`;

        const timeStr = formatTime(msg.created_at);
        const statusHtml = isSent
            ? `<span class="msg-status ${msg.is_read ? 'read' : ''}">
                <i class="fas fa-${msg.is_read ? 'check-double' : 'check'}"></i>
               </span>`
            : '';

        row.innerHTML = `
            ${avatarHtml}
            <div>
                <div class="message-bubble">
                    ${escapeHtml(msg.content)}
                    <span class="msg-time">${timeStr}${statusHtml}</span>
                </div>
            </div>`;

        list.appendChild(row);
        lastSenderId = msg.sender_id;
    });
}

// ── SEND MESSAGE ─────────────────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    input.value = '';
    adjustTextarea(input);

    const convId = buildConvId(currentUser.id, otherUserId);

    const { data, error } = await window.supabaseClient
        .from('messages')
        .insert({
            conversation_id: convId,
            sender_id:       currentUser.id,
            receiver_id:     otherUserId,
            content:         content,
            is_read:         false
        })
        .select()
        .single();

    sendBtn.disabled = false;

    if (error) {
        showToast('Failed to send message', 'error');
        input.value = content; // restore
        return;
    }

    // Optimistically append (realtime will also fire, deduplicate by id)
    appendMessage(data);
    scrollToBottom(true);
    document.getElementById('messagesEmpty').style.display = 'none';
}

// ── APPEND A SINGLE MESSAGE ──────────────────────────────────
function appendMessage(msg) {
    const list = document.getElementById('messagesList');

    // Avoid duplicate if realtime fires for own message
    if (list.querySelector(`[data-msg-id="${msg.id}"]`)) return;

    const isSent = msg.sender_id === currentUser.id;

    // Date divider check
    const lastDivider = list.querySelector('.date-divider:last-of-type');
    const msgDate = formatDateLabel(msg.created_at);
    if (!lastDivider || lastDivider.querySelector('span').textContent !== msgDate) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        div.innerHTML = `<span>${msgDate}</span>`;
        list.appendChild(div);
    }

    // Consecutive check
    const lastRow = list.querySelector('.message-row:last-of-type');
    const isConsecutive = lastRow && lastRow.classList.contains(isSent ? 'sent' : 'received');

    const row = document.createElement('div');
    row.className = `message-row ${isSent ? 'sent' : 'received'}${isConsecutive ? ' consecutive' : ''}`;
    row.dataset.msgId = msg.id;
    row.style.animation = 'msgIn 0.18s ease';

    const initials = isSent
        ? getInitials(currentProfile?.full_name || 'Me')
        : getInitials(otherProfile?.full_name || '?');

    const avatarHtml = isSent ? '' : `
        <div class="msg-avatar">
            ${otherProfile?.avatar_url
                ? `<img src="${otherProfile.avatar_url}" alt="">`
                : initials}
        </div>`;

    const timeStr  = formatTime(msg.created_at);
    const statusHtml = isSent
        ? `<span class="msg-status"><i class="fas fa-check"></i></span>`
        : '';

    row.innerHTML = `
        ${avatarHtml}
        <div>
            <div class="message-bubble">
                ${escapeHtml(msg.content)}
                <span class="msg-time">${timeStr}${statusHtml}</span>
            </div>
        </div>`;

    list.appendChild(row);
}

// ── REALTIME SUBSCRIPTION ────────────────────────────────────
function subscribeToMessages() {
    const convId = buildConvId(currentUser.id, otherUserId);

    realtimeChannel = window.supabaseClient
        .channel(`chat:${convId}`)
        .on('postgres_changes', {
            event:  'INSERT',
            schema: 'public',
            table:  'messages',
            filter: `conversation_id=eq.${convId}`
        }, (payload) => {
            const msg = payload.new;
            appendMessage(msg);
            scrollToBottom(true);

            // Mark as read if it's from the other person
            if (msg.sender_id !== currentUser.id) {
                markAsRead(convId);
            }
        })
        .on('postgres_changes', {
            event:  'UPDATE',
            schema: 'public',
            table:  'messages',
            filter: `conversation_id=eq.${convId}`
        }, (payload) => {
            // Update read receipt tick
            const row = document.querySelector(`[data-msg-id="${payload.new.id}"]`);
            if (row && payload.new.is_read) {
                const status = row.querySelector('.msg-status');
                if (status) {
                    status.classList.add('read');
                    status.innerHTML = '<i class="fas fa-check-double"></i>';
                }
            }
        })
        .subscribe();
}

// ── MARK AS READ ─────────────────────────────────────────────
async function markAsRead(convId) {
    await window.supabaseClient
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', convId)
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
}

// ── INPUT SETUP ──────────────────────────────────────────────
function setupInput() {
    const input   = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    input.addEventListener('input', () => {
        sendBtn.disabled = input.value.trim().length === 0;
        adjustTextarea(input);
    });

    input.addEventListener('keydown', (e) => {
        // Enter sends (Shift+Enter = new line)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);
}

// Auto-grow textarea
function adjustTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── SCROLL ───────────────────────────────────────────────────
function scrollToBottom(smooth = true) {
    const area = document.getElementById('messagesArea');
    area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// ── NAVIGATION ───────────────────────────────────────────────
function goBack() {
    if (realtimeChannel) window.supabaseClient.removeChannel(realtimeChannel);
    if (document.referrer) {
        history.back();
    } else {
        window.location.href = `user-profile.html?userId=${otherUserId}`;
    }
}

function viewProfile() {
    window.location.href = `user-profile.html?userId=${otherUserId}`;
}

// ── HELPERS ──────────────────────────────────────────────────

// Stable conversation ID: alphabetically smaller UUID comes first
function buildConvId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso) {
    const d   = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    const m = document.getElementById('toastMessage');
    m.textContent = msg;
    t.className = `toast ${type}`;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
