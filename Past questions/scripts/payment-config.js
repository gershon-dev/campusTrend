// ============================================
// PAYMENT CONFIG (frontend)
// No Paystack keys belong here. Paystack's hosted checkout is opened
// from a URL the backend creates, so the browser needs nothing secret.
// ============================================
window.paymentConfig = {
    // Same Vercel project, same domain. (For local testing use `vercel dev`.)
    apiBaseUrl: '/api',

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
};
