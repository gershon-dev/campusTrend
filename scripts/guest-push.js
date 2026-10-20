/* ============================================================
   guest-push.js
   Lets visitors WITHOUT an account turn on broadcast notifications
   (new tutorials, past questions, campus news).
   Personal notifications (likes, comments, follows) still need an account.
   Logged-in users are handled by notifications.js, so this exits for them.
   ============================================================ */
(function () {
    'use strict';

    var VAPID_PUBLIC_KEY = 'BIAYAE-oql1_lKrAqC543jZX4B2YuiWVs4MsEkR0AbxiKufrANKDobvZYtlSEi6oWTGSfx1yoZrZKnw_YftUXeY';
    var KEY_SNOOZE = 'ct_guest_push_snooze_until';
    var SNOOZE_MS  = 3 * 24 * 60 * 60 * 1000;   // ask again after 3 days
    var SHOW_DELAY = 8000;                      // after the install modal has had its turn

    function get(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    function supported() {
        // iPhone Safari tab has no PushManager until the app is installed to the Home Screen.
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function urlBase64ToUint8Array(b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
    }

    async function subscribeAndSave() {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        var res = await window.supabaseClient.rpc('save_guest_push', { sub: sub.toJSON() });
        if (res.error) throw res.error;
    }

    // ── Large modal ─────────────────────────────────────────────────────────
    function injectStyle() {
        if (document.getElementById('ctGuestPushStyle')) return;
        var st = document.createElement('style');
        st.id = 'ctGuestPushStyle';
        st.textContent =
            '.ct-gp-overlay{position:fixed;inset:0;z-index:10060;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);animation:ctGpFade .2s ease}' +
            '.ct-gp-card{width:100%;max-width:420px;background:#fff;color:#1c1e21;border-radius:20px 20px 0 0;padding:28px 22px calc(22px + env(safe-area-inset-bottom,0px));text-align:center;box-shadow:0 -8px 30px rgba(0,0,0,.25);animation:ctGpUp .28s ease}' +
            '.ct-gp-bell{width:76px;height:76px;margin:0 auto 14px;border-radius:50%;background:#e7f0ff;color:#1877f2;display:flex;align-items:center;justify-content:center;font-size:32px}' +
            '.ct-gp-card h2{margin:0 0 6px;font-size:1.3rem}' +
            '.ct-gp-card p{margin:0 0 14px;font-size:.92rem;line-height:1.45;color:#65676b}' +
            '.ct-gp-perks{list-style:none;margin:0 0 18px;padding:0;display:inline-block;text-align:left;font-size:.88rem}' +
            '.ct-gp-perks li{padding:4px 0}.ct-gp-perks i{color:#1877f2;width:22px}' +
            '.ct-gp-on{display:block;width:100%;border:0;border-radius:12px;padding:14px;font-size:1rem;font-weight:600;cursor:pointer;background:#1877f2;color:#fff}' +
            '.ct-gp-on:hover{background:#166fe0}' +
            '.ct-gp-off{display:block;width:100%;margin-top:8px;border:0;background:none;padding:10px;font-size:.9rem;color:#65676b;cursor:pointer}' +
            '.ct-gp-note{margin-top:6px;font-size:.78rem;color:#8a8d91}' +
            '@keyframes ctGpFade{from{opacity:0}to{opacity:1}}' +
            '@keyframes ctGpUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}' +
            '@media (min-width:600px){.ct-gp-overlay{align-items:center}.ct-gp-card{border-radius:20px}}' +
            '@media (prefers-color-scheme:dark){.ct-gp-card{background:#242526;color:#e4e6eb}.ct-gp-card p,.ct-gp-off{color:#b0b3b8}.ct-gp-bell{background:#3a3b3c}}';
        document.head.appendChild(st);
    }

    var lastFocus = null;

    function removeModal() {
        var m = document.getElementById('ctGuestPush');
        if (m) m.remove();
        document.removeEventListener('keydown', onKey);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function later() {
        set(KEY_SNOOZE, String(Date.now() + SNOOZE_MS));
        removeModal();
    }
    function onKey(e) { if (e.key === 'Escape') later(); }

    function showBanner() {
        if (document.getElementById('ctGuestPush')) return;
        injectStyle();
        lastFocus = document.activeElement;

        var m = document.createElement('div');
        m.id = 'ctGuestPush';
        m.className = 'ct-gp-overlay';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'ctGpTitle');
        m.innerHTML =
            '<div class="ct-gp-card">' +
              '<div class="ct-gp-bell"><i class="fas fa-bell" aria-hidden="true"></i></div>' +
              '<h2 id="ctGpTitle">Never miss campus updates</h2>' +
              '<p class="ct-gp-msg">Turn on notifications and we\'ll tell you when something new is posted.</p>' +
              '<ul class="ct-gp-perks">' +
                '<li><i class="fas fa-play-circle" aria-hidden="true"></i>New tutorial videos</li>' +
                '<li><i class="fas fa-book" aria-hidden="true"></i>Past questions and exam news</li>' +
                '<li><i class="fas fa-bullhorn" aria-hidden="true"></i>Important campus announcements</li>' +
              '</ul>' +
              '<button type="button" class="ct-gp-on">Turn on notifications</button>' +
              '<button type="button" class="ct-gp-off">Maybe later</button>' +
              '<div class="ct-gp-note">No account needed. You can turn this off anytime in your browser settings.</div>' +
            '</div>';
        document.body.appendChild(m);

        var on  = m.querySelector('.ct-gp-on');
        var off = m.querySelector('.ct-gp-off');
        var msg = m.querySelector('.ct-gp-msg');
        var bell = m.querySelector('.ct-gp-bell');
        on.focus();

        off.addEventListener('click', later);
        m.addEventListener('click', function (e) { if (e.target === m) later(); });
        document.addEventListener('keydown', onKey);

        function finish(icon, text, delay) {
            bell.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i>';
            msg.textContent = text;
            m.querySelector('h2').textContent = icon === 'fa-check' ? "You're all set!" : 'Something went wrong';
            m.querySelector('.ct-gp-perks').remove();
            on.remove(); off.remove(); m.querySelector('.ct-gp-note').remove();
            setTimeout(removeModal, delay);
        }

        on.addEventListener('click', async function () {
            on.disabled = true;
            on.textContent = 'Waiting for your permission…';
            try {
                var perm = await Notification.requestPermission();
                if (perm !== 'granted') { later(); return; }   // blocked or dismissed
                await subscribeAndSave();
                finish('fa-check', "We'll let you know when something new drops.", 2200);
            } catch (err) {
                console.warn('[GuestPush] failed:', err);
                finish('fa-triangle-exclamation', 'Please try again in a little while.', 2800);
            }
        });
    }

    // Wait until no other modal (install prompt, account prompt) is on screen.
    function whenClear(cb) {
        var tries = 0;
        (function check() {
            var busy = document.querySelector('#installOverlay.show, .ct-guest-overlay.show, .modal-overlay.show');
            if (!busy) return cb();
            if (++tries < 90) setTimeout(check, 2000);   // wait up to ~3 minutes for other modals to close
        })();
    }

    async function init() {
        if (!supported() || !window.supabaseClient || typeof window.isLoggedIn !== 'function') return;
        if (await window.isLoggedIn()) return;            // accounts use notifications.js

        if (Notification.permission === 'denied') return;

        if (Notification.permission === 'granted') {
            // Already allowed: quietly keep the saved subscription fresh.
            try { await subscribeAndSave(); } catch (e) { console.warn('[GuestPush] refresh failed:', e); }
            return;
        }

        if (Number(get(KEY_SNOOZE) || 0) > Date.now()) return;
        setTimeout(function () { whenClear(showBanner); }, SHOW_DELAY);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
