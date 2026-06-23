// ============================================================
// APP UPDATE + INSTALL BANNER
// Forces users on old GitHub Pages link to switch to Vercel,
// and prompts Vercel users to install the PWA.
// ============================================================

(function() {
    const VERCEL_URL = 'https://campustrend-uew.vercel.app/';
    const isVercel   = window.location.hostname === 'campustrend-uew.vercel.app';
    const isGitHub   = window.location.hostname.includes('github.io');

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
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if dismissed in last 3 days
    const lastDismissed = localStorage.getItem('ct_install_dismissed');
    if (lastDismissed && Date.now() - parseInt(lastDismissed) < 3 * 24 * 60 * 60 * 1000) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="ct-overlay" id="installOverlay">
            <div class="ct-popup">
                <img src="icons/icon-192.png"
                    onerror="this.style.display='none'"
                    style="width:72px;height:72px;border-radius:16px;margin:0 auto 16px;display:block;box-shadow:0 4px 16px rgba(24,119,242,.25);">
                <h2>Install CampusTrend 📱</h2>
                <p>
                    Add CampusTrend to your home screen for the <strong>full app experience</strong> — 
                    faster loading, offline access, and no browser bar!
                </p>
                <button class="ct-btn-primary" id="installBtn" style="border:none;">
                    📲 Install App
                </button>
                <button class="ct-btn-secondary" id="installDismissBtn">
                    Maybe later
                </button>
            </div>
        </div>
    `);

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Show after a short delay so the page loads first
        setTimeout(() => {
            document.getElementById('installOverlay').classList.add('show');
        }, 3000);
    });

    document.getElementById('installBtn').addEventListener('click', async () => {
        document.getElementById('installOverlay').classList.remove('show');
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
        }
    });

    document.getElementById('installDismissBtn').addEventListener('click', () => {
        document.getElementById('installOverlay').classList.remove('show');
        localStorage.setItem('ct_install_dismissed', Date.now().toString());
    });

    // Also close on backdrop click
    document.getElementById('installOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('show');
            localStorage.setItem('ct_install_dismissed', Date.now().toString());
        }
    });

    window.addEventListener('appinstalled', () => {
        const overlay = document.getElementById('installOverlay');
        if (overlay) overlay.classList.remove('show');
        deferredPrompt = null;
    });

})();
