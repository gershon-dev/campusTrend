/**
 * notifications.js
 * Handles all notification logic for CampusTrend UEW.
 *
 * Functions:
 *   createNotification(type, recipientId, postId)
 *   loadNotifications()
 *   markAllRead()
 *   setupRealtimeNotifications(onNewNotification)
 */

// ─── Create a notification ────────────────────────────────────────────────────

/**
 * Insert a notification into Supabase.
 * Skips if the recipient is the same as the sender (no self-notifications).
 *
 * @param {string} type        - 'like' | 'comment' | 'follow' | 'reply'
 * @param {string} recipientId - user_id of the person receiving the notification
 * @param {string|null} postId - post_id (null for follow notifications)
 */
export async function createNotification(type, recipientId, postId = null) {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return;

        // Don't notify yourself
        if (user.id === recipientId) return;

        const messages = {
            like:    'liked your post',
            comment: 'commented on your post',
            reply:   'replied to your comment',
            follow:  'started following you',
        };

        const { error } = await window.supabaseClient
            .from('notifications')
            .insert({
                user_id:      recipientId,
                from_user_id: user.id,
                type,
                post_id:      postId,
                message:      messages[type] || type,
                is_read:      false,
            });

        if (error) console.warn('createNotification error:', error.message);
    } catch (err) {
        console.warn('createNotification failed:', err.message);
    }
}

// ─── Load notifications and render them ──────────────────────────────────────

/**
 * Fetch notifications for the current user and update the bell badge + dropdown.
 */
export async function loadNotifications() {
    try {
        const result = await window.getNotifications();
        if (!result.success) return;

        const notifications = result.notifications || [];

        // Update badge
        const unreadCount = notifications.filter(n => !n.is_read).length;
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        // Render list
        renderNotifications(notifications);
    } catch (err) {
        console.warn('loadNotifications failed:', err.message);
    }
}

// ─── Render notifications dropdown ───────────────────────────────────────────

function renderNotifications(notifications) {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = `
            <div style="padding:24px;text-align:center;color:#65676b;">
                <i class="fas fa-bell-slash" style="font-size:2rem;margin-bottom:8px;display:block;opacity:0.4;"></i>
                No notifications yet
            </div>`;
        return;
    }

    list.innerHTML = notifications.map(n => {
        const profile   = n.profiles || {};
        const name      = profile.full_name || 'Someone';
        const initials  = getInitials(name);
        const avatar    = profile.avatar_url
            ? `<img src="${escHtml(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
            : initials;
        const timeAgo   = window.timeAgo ? window.timeAgo(n.created_at) : '';
        const icon      = iconFor(n.type);
        const unreadCls = n.is_read ? '' : 'unread';

        return `
        <div class="notification-item ${unreadCls}" data-id="${n.id}">
            <div class="notif-avatar" style="background:${stringToColor(name)}">${avatar}</div>
            <div class="notification-content">
                <p><strong>${escHtml(name)}</strong> ${escHtml(n.message || n.type)}</p>
                <span class="notification-time"><i class="${icon}"></i> ${timeAgo}</span>
            </div>
            ${!n.is_read ? '<span class="notif-dot"></span>' : ''}
        </div>`;
    }).join('');
}

// ─── Mark all as read ─────────────────────────────────────────────────────────

export async function markAllRead() {
    try {
        await window.markAllNotificationsRead();
        await loadNotifications();
    } catch (err) {
        console.warn('markAllRead failed:', err.message);
    }
}

// ─── Realtime listener ────────────────────────────────────────────────────────

/**
 * Subscribe to new notifications in real time.
 * Calls onNewNotification(notification) when a new one arrives.
 */
export function setupRealtimeNotifications(onNewNotification) {
    try {
        window.supabaseClient
            .channel('notifications-realtime')
            .on('postgres_changes', {
                event:  'INSERT',
                schema: 'public',
                table:  'notifications',
            }, async (payload) => {
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) return;

                // Only process notifications meant for the current user
                if (payload.new.user_id !== user.id) return;

                // Refresh badge and list
                await loadNotifications();

                // Call optional callback (e.g. show a toast)
                if (typeof onNewNotification === 'function') {
                    onNewNotification(payload.new);
                }
            })
            .subscribe();
    } catch (err) {
        console.warn('setupRealtimeNotifications failed:', err.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
}

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue+40)%360},70%,40%))`;
}

function iconFor(type) {
    const icons = {
        like:    'fas fa-heart',
        comment: 'fas fa-comment',
        reply:   'fas fa-reply',
        follow:  'fas fa-user-plus',
    };
    return icons[type] || 'fas fa-bell';
}

// ─── Bell UI setup ────────────────────────────────────────────────────────────

/**
 * Wire up the notification bell, dropdown toggle, mark-all-read button,
 * and outside-click dismissal. Call once after DOMContentLoaded.
 */
export function setupNotificationUI() {
    const bell     = document.getElementById('notificationBell');
    const dropdown = document.getElementById('notificationDropdown');
    const markBtn  = document.getElementById('markAllRead');

    if (bell && dropdown) {
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
            // Mark all read when opening
            if (dropdown.classList.contains('show')) {
                markAllRead();
            }
        });

        document.addEventListener('click', (e) => {
            if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    if (markBtn) {
        markBtn.addEventListener('click', async () => {
            await markAllRead();
        });
    }
}