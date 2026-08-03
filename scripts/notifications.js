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

            // Send push notification
            console.log('[Push] Checking subscription for recipient:', recipientId);
            const { data: subData, error: subError } = await window.supabaseClient
                .from('push_subscriptions')
                .select('subscription')
                .eq('user_id', recipientId)
                .maybeSingle();

            console.log('[Push] subData:', subData, 'subError:', subError);

            if (subData?.subscription) {
                console.log('[Push] Subscription found, fetching sender profile...');
                const { data: senderProfile } = await window.supabaseClient
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .maybeSingle();

                const senderName = senderProfile?.full_name || 'Someone';
                console.log('[Push] Sending push from:', senderName);

                const pushResult = await fetch('/api/push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: subData.subscription,
                        title: 'CampusTrend UEW',
                        body: `${senderName} ${messages[type] || type}`,
                        icon: '/icons/icon-192.png',
                        url: '/'
                    })
                });
                console.log('[Push] Result status:', pushResult.status);
            } else {
                console.log('[Push] No subscription found for recipient');
            }

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
                badge.style.display = unreadCount > 0 ? 'block' : 'none';
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

    // ── Push subscription ─────────────────────────────────────────────────
    // NOTE on iOS: Web Push only works on iOS 16.4+ AND only once the site has
    // been added to the Home Screen (launched in standalone mode). Inside a
    // normal Safari tab, 'PushManager' won't exist in window at all — that's
    // not a bug, it's an OS-level restriction Apple imposes, so we just bail
    // quietly in that case instead of erroring.
    //
    // NOTE on "always show the prompt": once a user taps "Block" on the native
    // permission dialog, no browser (iOS or otherwise) lets a site re-trigger
    // that native dialog via JS — Notification.requestPermission() will just
    // resolve to 'denied' silently, forever, until the user manually changes
    // it in their browser/site settings. That's a browser security rule, not
    // something we can override from code. What we CAN do is keep our own
    // custom banner reappearing (asking them to enable it in Settings), since
    // that's our UI, not the browser's native one.
    async function subscribeToPush() {
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.log('[Push] Push not supported here (likely iOS Safari tab, not installed as Home Screen app)');
                return;
            }

            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) { await _savePushSubscription(existing); return; }

            if (Notification.permission === 'granted') {
                await _doSubscribe(reg);
                return;
            }

            if (Notification.permission === 'denied') {
                _showEnableNotificationsBanner('blocked');
                return;
            }

            // 'default' — permission not yet decided. Browsers require a real
            // user gesture (tap) to show the native prompt reliably, especially
            // on iOS/Safari, so we show our own banner first and only call
            // requestPermission() from its button's click handler.
            _showEnableNotificationsBanner('ask');
        } catch (err) {
            console.warn('subscribeToPush failed:', err.message);
        }
    }

    async function _doSubscribe(reg) {
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array('BIAYAE-oql1_lKrAqC543jZX4B2YuiWVs4MsEkR0AbxiKufrANKDobvZYtlSEi6oWTGSfx1yoZrZKnw_YftUXeY')
        });
        await _savePushSubscription(sub);
    }

    // ── Custom "enable notifications" banner ────────────────────────────────
    // Own UI, not the browser's native dialog — this is the piece we're
    // allowed to keep re-showing. Dismissing it just hides it for the
    // session; it reappears on next visit until permission is granted.
    function _showEnableNotificationsBanner(mode) {
        if (document.getElementById('ctNotifBanner')) return; // already showing

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        // On iOS, push only works once installed to Home Screen — nudge that first.
        if (mode === 'ask' && isIOS && !isStandalone) {
            _renderBanner('Add CampusTrend to your Home Screen to enable notifications on iPhone/iPad.', null, mode);
            return;
        }

        if (mode === 'blocked') {
            _renderBanner('Notifications are blocked. Enable them in your browser/site settings to get updates.', null, mode);
            return;
        }

        _renderBanner('Turn on notifications so you never miss likes, comments, and follows.', async () => {
            const permission = await Notification.requestPermission();
            const banner = document.getElementById('ctNotifBanner');
            if (banner) banner.remove();
            clearTimeout(_renagTimer);
            if (permission === 'granted') {
                const reg = await navigator.serviceWorker.ready;
                await _doSubscribe(reg);
            } else {
                // Still not granted (dismissed the native dialog, or now denied) —
                // keep the nag cycle going instead of going silent for the rest of the visit.
                _renagTimer = setTimeout(() => {
                    if (Notification.permission !== 'granted') {
                        subscribeToPush();
                    }
                }, CT_RENAG_MS);
            }
        }, mode);
    }

    // How long to wait before re-nagging a user who closed the banner without
    // granting permission or installing. Keeps "browser tab" users — the ones
    // who never trigger a fresh page load with subscribeToPush() again for a
    // while — from going completely unprompted for the rest of their visit.
    const CT_RENAG_MS = 2 * 60 * 1000; // 2 minutes
    let _renagTimer = null;

    function _renderBanner(message, onEnable, mode) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="ctNotifBanner" style="position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;
                background:#1a1a1a;color:#fff;border-radius:12px;padding:14px 16px;
                display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;">
                <i class="fas fa-bell" style="font-size:16px;flex-shrink:0;"></i>
                <span style="flex:1;line-height:1.4;">${message}</span>
                ${onEnable ? '<button id="ctNotifEnableBtn" style="flex-shrink:0;background:#1877f2;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px;cursor:pointer;">Enable</button>' : ''}
                <button id="ctNotifCloseBtn" style="flex-shrink:0;background:transparent;color:#aaa;border:none;font-size:18px;cursor:pointer;line-height:1;">&times;</button>
            </div>
        `);
        if (onEnable) {
            document.getElementById('ctNotifEnableBtn').addEventListener('click', onEnable);
        }
        document.getElementById('ctNotifCloseBtn').addEventListener('click', () => {
            const banner = document.getElementById('ctNotifBanner');
            if (banner) banner.remove();
            // User is sticking with the browser tab rather than granting/installing —
            // bring the banner back after a bit instead of letting it vanish for good.
            clearTimeout(_renagTimer);
            _renagTimer = setTimeout(() => {
                if (Notification.permission !== 'granted') {
                    _showEnableNotificationsBanner(mode);
                }
            }, CT_RENAG_MS);
        });
    }

    async function _savePushSubscription(sub) {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) return;
            await window.supabaseClient.from('push_subscriptions')
                .upsert({ user_id: user.id, subscription: sub.toJSON() }, { onConflict: 'user_id' });
        } catch (err) {
            console.warn('_savePushSubscription failed:', err.message);
        }
    }

    function _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
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
    return { createNotification, loadNotifications, markAllRead, setupRealtimeNotifications, setupNotificationUI, subscribeToPush };

})();
