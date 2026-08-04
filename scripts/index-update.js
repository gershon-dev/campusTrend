// ── Redirect GitHub Pages users to Vercel instantly ──────────────────────────
// This fixes the PWA 404 error when app is installed from the GitHub link.
(function () {
    if (window.location.hostname.includes('github.io')) {
        // Build the equivalent Vercel URL preserving the current path
        const path = window.location.pathname.replace('/campusTrend', '') || '/';
        window.location.replace('https://campustrend-uew.vercel.app' + path);
    }
})();

// APP UPDATE + INSTALL BANNER
// Forces users on old GitHub Pages link to switch to Vercel,
// and prompts Vercel users to install the PWA.
// ============================================================

(function() {
    const VERCEL_URL = 'https://campustrend-uew.vercel.app/';
    const isVercel   = window.location.hostname === 'campustrend-uew.vercel.app';
    const isGitHub   = window.location.hostname.includes('github.io');

    // iOS/iPadOS never fires `beforeinstallprompt` — Safari (and any browser
    // on iOS, since they're all WebKit under the hood) has no such API.
    // We have to detect iOS and show manual "Add to Home Screen" instructions instead.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ reports as Mac
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true; // navigator.standalone is the legacy iOS Safari flag

    // ── Inject shared styles ─────────────────────────────────────────────────
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            .ct-overlay {
                display: none;
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.65);
                z-index: 99999;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .ct-overlay.show { display: flex; }
            .ct-popup {
                background: #fff;
                border-radius: 20px;
                padding: 28px 24px;
                max-width: 340px;
                width: 100%;
                text-align: center;
                box-shadow: 0 24px 60px rgba(0,0,0,0.3);
                animation: ctPopIn .3s cubic-bezier(.34,1.56,.64,1);
            }
            @keyframes ctPopIn {
                from { transform: scale(0.8) translateY(20px); opacity: 0; }
                to   { transform: scale(1)   translateY(0);    opacity: 1; }
            }
            .ct-popup-icon {
                width: 72px; height: 72px;
                border-radius: 16px;
                margin: 0 auto 16px;
                display: flex; align-items: center; justify-content: center;
                font-size: 32px;
            }
            .ct-popup h2 {
                font-size: 19px; font-weight: 800;
                color: #1a1a1a; margin-bottom: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .ct-popup p {
                font-size: 13px; color: #65676b;
                line-height: 1.65; margin-bottom: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .ct-popup p strong { color: #1a1a1a; }
            .ct-btn-primary {
                display: flex; align-items: center; justify-content: center; gap: 8px;
                width: 100%; padding: 14px;
                background: linear-gradient(135deg, #1877f2, #0d5dbf);
                color: #fff; border: none; border-radius: 12px;
                font-size: 15px; font-weight: 700; cursor: pointer;
                text-decoration: none; margin-bottom: 10px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: opacity .2s;
            }
            .ct-btn-primary:hover { opacity: .92; }
            .ct-btn-secondary {
                width: 100%; padding: 12px;
                background: #f0f2f5; color: #555;
                border: none; border-radius: 12px;
                font-size: 14px; font-weight: 600; cursor: pointer;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: background .2s;
            }
            .ct-btn-secondary:hover { background: #e4e6eb; }
            .ct-badge {
                display: inline-block;
                background: #ff3b30; color: #fff;
                font-size: 10px; font-weight: 700;
                padding: 2px 7px; border-radius: 20px;
                margin-left: 6px; vertical-align: middle;
            }
            .ct-ios-steps {
                text-align: left;
                background: #f0f2f5;
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 20px;
                font-size: 13px;
                color: #1a1a1a;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .ct-ios-steps div { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
            .ct-ios-steps div + div { border-top: 1px solid #e4e6eb; }
            .ct-ios-steps .ct-step-num {
                flex-shrink: 0;
                width: 20px; height: 20px;
                background: #1877f2; color: #fff;
                border-radius: 50%;
                font-size: 11px; font-weight: 700;
                display: flex; align-items: center; justify-content: center;
            }
            .ct-ios-icon { font-size: 15px; }

            /* ── Persistent top install banner ────────────────────────────── */
            .ct-install-banner {
                position: sticky; top: 0; left: 0; right: 0;
                z-index: 9998;
                display: flex; align-items: center; gap: 10px;
                background: linear-gradient(135deg, #1877f2, #0d5dbf);
                color: #fff;
                padding: 10px 12px;
                padding-top: max(10px, env(safe-area-inset-top));
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                box-shadow: 0 2px 10px rgba(0,0,0,.15);
            }
            .ct-install-banner-icon {
                width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
                box-shadow: 0 2px 6px rgba(0,0,0,.2);
            }
            .ct-install-banner-text { flex: 1; min-width: 0; line-height: 1.25; }
            .ct-install-banner-text strong { display: block; font-size: 13px; }
            .ct-install-banner-text span {
                display: block; font-size: 11px; opacity: .85;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .ct-install-banner-btn {
                flex-shrink: 0;
                background: #fff; color: #1877f2;
                border: none; border-radius: 8px;
                padding: 8px 14px;
                font-size: 13px; font-weight: 700; cursor: pointer;
            }
            .ct-install-banner-close {
                flex-shrink: 0;
                background: transparent; border: none;
                color: rgba(255,255,255,.8);
                font-size: 20px; line-height: 1; cursor: pointer;
                padding: 0 2px;
            }

            /* Mobile sizing so popups never get clipped on small phone screens */
            @media (max-width: 480px) {
                .ct-overlay { padding: 12px; }
                .ct-popup { padding: 22px 18px; max-width: 100%; }
                .ct-popup h2 { font-size: 17px; }
                .ct-popup p { font-size: 12.5px; }
                .ct-install-banner-text span { max-width: 46vw; }
            }
        </style>
    `);

    // ════════════════════════════════════════════════════════════════════════
    // CASE 1 — User is on GitHub Pages → force them to Vercel
    // ════════════════════════════════════════════════════════════════════════
    if (isGitHub) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="ct-overlay show" id="updateOverlay">
                <div class="ct-popup">
                    <div class="ct-popup-icon" style="background:#fff3cd;">🚀</div>
                    <h2>App Updated! <span class="ct-badge">NEW</span></h2>
                    <p>
                        CampusTrend has moved to a <strong>faster, better home</strong>.<br><br>
                        Please switch to our new official link to get the latest features, 
                        faster loading, and bug fixes. The old link will no longer be updated.
                    </p>
                    <a href="${VERCEL_URL}" class="ct-btn-primary" id="switchBtn">
                        🌐 Switch to New App
                    </a>
                    <button class="ct-btn-secondary" onclick="document.getElementById('updateOverlay').classList.remove('show')">
                        Continue on old link
                    </button>
                </div>
            </div>
        `);

        // Auto-redirect after 10 seconds if user doesn't dismiss
        let countdown = 10;
        const switchBtn = document.getElementById('switchBtn');
        const timer = setInterval(() => {
            countdown--;
            if (switchBtn) switchBtn.textContent = `🌐 Switch to New App (${countdown}s)`;
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = VERCEL_URL;
            }
        }, 1000);

        // Stop timer if user manually dismisses
        document.querySelector('#updateOverlay .ct-btn-secondary').addEventListener('click', () => {
            clearInterval(timer);
        });

        return; // Don't run install logic on GitHub
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 2 — User is on Vercel → show PWA install prompt
    // ════════════════════════════════════════════════════════════════════════
    if (!isVercel) return; // Don't run on localhost or unknown hosts

    // Don't show if already installed as PWA
    if (isStandalone) return;
    // Don't show if dismissed in last 3 days
    const lastDismissed = localStorage.getItem('ct_install_dismissed');
    if (lastDismissed && Date.now() - parseInt(lastDismissed) < 3 * 24 * 60 * 60 * 1000) return;

    // Reusable iOS "Add to Home Screen" instructions — no beforeinstallprompt
    // exists on iOS, so this is the only way to walk a user through installing.
    function openIOSInstructionsModal() {
        if (document.getElementById('installOverlay')) {
            document.getElementById('installOverlay').classList.add('show');
            return;
        }
        document.body.insertAdjacentHTML('beforeend', `
            <div class="ct-overlay" id="installOverlay">
                <div class="ct-popup">
                    <img src="icons/icon-192.png"
                        onerror="this.style.display='none'"
                        style="width:72px;height:72px;border-radius:16px;margin:0 auto 16px;display:block;box-shadow:0 4px 16px rgba(24,119,242,.25);">
                    <h2>Install CampusTrend 📱</h2>
                    <p>Add CampusTrend to your Home Screen for the <strong>full app experience</strong> — faster loading and no browser bar.</p>
                    <div class="ct-ios-steps">
                        <div><span class="ct-step-num">1</span> Tap the <span class="ct-ios-icon">⬆️ Share</span> button in Safari's toolbar</div>
                        <div><span class="ct-step-num">2</span> Scroll down and tap <strong>"Add to Home Screen"</strong></div>
                        <div><span class="ct-step-num">3</span> Tap <strong>"Add"</strong> in the top right</div>
                    </div>
                    <button class="ct-btn-secondary" id="installDismissBtn">Got it</button>
                </div>
            </div>
        `);
        document.getElementById('installOverlay').classList.add('show');
        document.getElementById('installDismissBtn').addEventListener('click', () => {
            document.getElementById('installOverlay').classList.remove('show');
        });
        document.getElementById('installOverlay').addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('show');
        });
    }

    // ── Persistent top banner, injected right at the top of the homepage ────
    // This sits in normal page flow (not a delayed popup that can be missed
    // or blocked), so it's visible immediately on every mobile device —
    // iPhone included — the moment the page loads.
    function showInstallBanner(onInstallTap) {
        if (document.getElementById('ctInstallBanner')) return;
        document.body.insertAdjacentHTML('afterbegin', `
            <div class="ct-install-banner" id="ctInstallBanner">
                <img src="icons/icon-192.png" class="ct-install-banner-icon"
                    onerror="this.style.display='none'">
                <div class="ct-install-banner-text">
                    <strong>Install CampusTrend</strong>
                    <span>Faster, offline-ready, no browser bar</span>
                </div>
                <button class="ct-install-banner-btn" id="ctInstallBannerBtn">Install</button>
                <button class="ct-install-banner-close" id="ctInstallBannerClose">&times;</button>
            </div>
        `);
        document.getElementById('ctInstallBannerBtn').addEventListener('click', onInstallTap);
        document.getElementById('ctInstallBannerClose').addEventListener('click', () => {
            const banner = document.getElementById('ctInstallBanner');
            if (banner) banner.remove();
            localStorage.setItem('ct_install_dismissed', Date.now().toString());
        });
    }

    // ── iOS: show the banner immediately, tapping it opens the manual steps ──
    if (isIOS) {
        showInstallBanner(openIOSInstructionsModal);
        return; // Don't wire up beforeinstallprompt logic — it will never fire on iOS
    }

    // ── Android / desktop Chrome & Edge: use the real install prompt ─────────
    // The banner can only DO anything once the browser hands us the
    // `beforeinstallprompt` event, so we wait for that before showing it —
    // Chrome fires it once its own install-eligibility heuristics are met
    // (HTTPS, manifest, service worker, some engagement with the site).
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner(async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            const banner = document.getElementById('ctInstallBanner');
            if (banner) banner.remove();
        });
    });

    window.addEventListener('appinstalled', () => {
        const banner = document.getElementById('ctInstallBanner');
        if (banner) banner.remove();
        deferredPrompt = null;
    });

})();
