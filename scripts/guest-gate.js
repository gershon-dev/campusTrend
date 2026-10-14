// ============================================
// guest-gate.js
// Lets guests browse CampusTrend freely. When a guest tries an
// account-only action, shows a friendly "create an account" prompt.
//
// Usage inside an async handler:
//   if (!(await requireAccount('like posts'))) return;
// ============================================
(function () {
    const STYLE_ID = 'ctGuestGateStyle';
    let overlay = null;

    function ensureUI() {
        if (overlay) return overlay;

        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                @keyframes ctGuestPop {
                    from { transform: scale(.85); opacity: 0; }
                    to   { transform: scale(1);   opacity: 1; }
                }
                .ct-guest-overlay {
                    display: none; position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,.55); align-items: center;
                    justify-content: center; padding: 20px;
                }
                .ct-guest-overlay.show { display: flex; }
                .ct-guest-box {
                    background: #fff; border-radius: 16px; padding: 28px 24px;
                    max-width: 340px; width: 100%; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,.3);
                    animation: ctGuestPop .25s ease;
                }
                .ct-guest-icon {
                    width: 60px; height: 60px; background: #eef4ff; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 14px; font-size: 26px;
                }
                .ct-guest-box h3 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
                .ct-guest-box p  { font-size: 13px; color: #65676b; line-height: 1.6; margin-bottom: 20px; }
                .ct-guest-btn {
                    display: block; width: 100%; padding: 13px; border: none; border-radius: 10px;
                    font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer;
                    margin-bottom: 10px; box-sizing: border-box;
                }
                .ct-guest-primary   { background: linear-gradient(135deg,#1877f2,#0d5dbf); color: #fff; }
                .ct-guest-secondary { background: #e7f0ff; color: #1877f2; }
                .ct-guest-later     { background: #f0f2f5; color: #444; font-size: 14px; padding: 11px; margin-bottom: 0; }
            `;
            document.head.appendChild(style);
        }

        overlay = document.createElement('div');
        overlay.className = 'ct-guest-overlay';
        overlay.innerHTML = `
            <div class="ct-guest-box" role="dialog" aria-modal="true" aria-labelledby="ctGuestTitle">
                <div class="ct-guest-icon">🎓</div>
                <h3 id="ctGuestTitle">Create a free account</h3>
                <p id="ctGuestText"></p>
                <a class="ct-guest-btn ct-guest-primary" href="sign-up.html">Create Account</a>
                <a class="ct-guest-btn ct-guest-secondary" href="sign-in.html">I already have an account</a>
                <button type="button" class="ct-guest-btn ct-guest-later" data-ct-later>Not now</button>
            </div>`;

        overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
        overlay.querySelector('[data-ct-later]').addEventListener('click', hide);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
        document.body.appendChild(overlay);
        return overlay;
    }

    function show(actionText) {
        const ov = ensureUI();
        ov.querySelector('#ctGuestText').textContent =
            `Sign up in seconds to ${actionText}. Browsing the feed stays free without an account.`;
        ov.classList.add('show');
    }

    function hide() {
        if (overlay) overlay.classList.remove('show');
    }

    // Resolves true if the visitor is signed in; otherwise shows the prompt and resolves false.
    window.requireAccount = async function (actionText = 'do this') {
        if (await window.isLoggedIn()) return true;
        show(actionText);
        return false;
    };
})();
