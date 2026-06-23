// ── Redirect GitHub Pages users to Vercel instantly ──────────────────────────
// This fixes the PWA 404 error when app is installed from the GitHub link.
(function () {
    if (window.location.hostname.includes('github.io')) {
        // Build the equivalent Vercel URL preserving the current path
        const path = window.location.pathname.replace('/campusTrend', '') || '/';
        window.location.replace('https://campustrend-uew.vercel.app' + path);
    }
})();
