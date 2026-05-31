/**
 * notifications.js
 * Plain script — no ES modules. Exposes functions via window.CT_Notifications.
 * Load this BEFORE index.js in index.html.
 */

window.CT_Notifications = (function() {

    // ── Create a notification ─────────────────────────────────────────────
    async function createNotification(type, recipientId, postId = null) {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user || user.id === recipientId) return;

            const messages = {
                like:    'liked your post',
                comment: 'commented on your post',
                reply:   'replied to your comment',
                follow:  'started following you',
            };

            await window.supabaseClient.from('notifications').insert({
                user_id:      recipientId,
                from_user_id: user.id,
                type,
                post_id:      postId,
                message:      messages[type] || type,
                is_read:      false,
            });
        } catch (err) {
            console.warn('createNotification failed:', err.message);
        }
    }

    // ── Load & render notifications ───────────────────────────────────────
    async function loadNotifications() {
        try {
            const result = await window.getNotifications();
            if (!result.success) return;
            const notifications = result.notifications || [];

            const unreadCount = notifications.filter(n => !n.is_read).length;
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }

            _renderNotifications(notifications);
        } catch (err) {
            console.warn('loadNotifications failed:', err.message);
        }
    }

    function _renderNotifications(notifications) {
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
            const profile  = n.profiles || {};
            const name     = profile.full_name || 'Someone';
            const initials = _getInitials(name);
            const avatar   = profile.avatar_url
                ? `<img src="${_esc(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
                : initials;
            const timeAgo  = window.timeAgo ? window.timeAgo(n.created_at) : '';
            const icons    = { like:'fas fa-heart', comment:'fas fa-comment', reply:'fas fa-reply', follow:'fas fa-user-plus' };
            const icon     = icons[n.type] || 'fas fa-bell';

            return `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notif-avatar" style="background:${_color(name)}">${avatar}</div>
                <div class="notification-content">
                    <p><strong>${_esc(name)}</strong> ${_esc(n.message || n.type)}</p>
                    <span class="notification-time"><i class="${icon}"></i> ${timeAgo}</span>
                </div>
                ${!n.is_read ? '<span class="notif-dot"></span>' : ''}
            </div>`;
        }).join('');
    }

    // ── Mark all read ─────────────────────────────────────────────────────
    async function markAllRead() {
        try {
            await window.markAllNotificationsRead();
            await loadNotifications();
        } catch (err) {
            console.warn('markAllRead failed:', err.message);
        }
    }

    // ── Realtime listener ─────────────────────────────────────────────────
    function setupRealtimeNotifications(onNew) {
        try {
            window.supabaseClient
                .channel('notifications-realtime')
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'notifications'
                }, async (payload) => {
                    const { data: { user } } = await window.supabaseClient.auth.getUser();
                    if (!user || payload.new.user_id !== user.id) return;
                    await loadNotifications();
                    if (typeof onNew === 'function') onNew(payload.new);
                })
                .subscribe();
        } catch (err) {
            console.warn('setupRealtimeNotifications failed:', err.message);
        }
    }

    // ── Bell UI setup ─────────────────────────────────────────────────────
    function setupNotificationUI() {
        const bell     = document.getElementById('notificationBell');
        const dropdown = document.getElementById('notificationDropdown');
        const markBtn  = document.getElementById('markAllRead');

        if (bell && dropdown) {
            bell.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
                if (dropdown.classList.contains('show')) markAllRead();
            });
            document.addEventListener('click', (e) => {
                if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.remove('show');
                }
            });
        }

        if (markBtn) {
            markBtn.addEventListener('click', async () => { await markAllRead(); });
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────
    function _getInitials(name) {
        if (!name) return 'U';
        const p = name.trim().split(' ');
        return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.substring(0,2).toUpperCase();
    }
    function _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str; return d.innerHTML;
    }
    function _color(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
        const hue = h % 360;
        return `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue+40)%360},70%,40%))`;
    }

    // ── Public API ────────────────────────────────────────────────────────
    return { createNotification, loadNotifications, markAllRead, setupRealtimeNotifications, setupNotificationUI };

})();