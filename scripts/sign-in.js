// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // ── Inject signup popup HTML into the page ────────────────────────────────
    document.body.insertAdjacentHTML('beforeend', `
        <div id="signupPopup" style="
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,0.55); z-index:9999;
            align-items:center; justify-content:center; padding:20px;">
            <div style="
                background:#fff; border-radius:16px; padding:28px 24px;
                max-width:340px; width:100%; text-align:center;
                box-shadow:0 20px 60px rgba(0,0,0,0.3); animation:popIn .25s ease;">
                <div style="
                    width:60px; height:60px; background:#fff0f0;
                    border-radius:50%; display:flex; align-items:center;
                    justify-content:center; margin:0 auto 14px;">
                    <i class="fas fa-user-slash" style="font-size:24px;color:#e74c3c;"></i>
                </div>
                <h3 style="font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">
                    Account Not Found
                </h3>
                <p style="font-size:13px;color:#65676b;line-height:1.6;margin-bottom:20px;">
                    We couldn't find an account with those details. Are you new to CampusTrend? Create a free account to join your campus community!
                </p>
                <a href="sign-up.html" style="
                    display:block; width:100%; padding:13px;
                    background:linear-gradient(135deg,#1877f2,#0d5dbf);
                    color:#fff; border-radius:10px; font-size:15px;
                    font-weight:700; text-decoration:none; margin-bottom:10px;">
                    <i class="fas fa-user-plus"></i> Create Account
                </a>
                <button onclick="closeSignupPopup()" style="
                    width:100%; padding:11px; background:#f0f2f5;
                    color:#444; border:none; border-radius:10px;
                    font-size:14px; font-weight:600; cursor:pointer;">
                    Try Again
                </button>
            </div>
        </div>
        <style>
            @keyframes popIn {
                from { transform:scale(0.85); opacity:0; }
                to   { transform:scale(1);    opacity:1; }
            }
        </style>
    `);

    window.closeSignupPopup = function() {
        document.getElementById('signupPopup').style.display = 'none';
    };

    // Close popup when clicking the dark backdrop
    document.getElementById('signupPopup').addEventListener('click', function(e) {
        if (e.target === this) closeSignupPopup();
    });

    // Password visibility toggle
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            const passwordInput = document.getElementById('password');
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }

    // ── Wire up "Forgot Password?" link ──────────────────────────────────────
    const forgotLink = document.querySelector('.forgot-password');
    if (forgotLink) {
        forgotLink.removeAttribute('onclick');
        forgotLink.href = 'forgot-password.html';
    }

    // Toast notification
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        const icon = toast.querySelector('i');
        toast.className = `toast ${type}`;
        toastMessage.textContent = message;
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    // Format email to match sign-up format
    function formatEmail(input) {
        input = input.trim();
        if (/^\d{10}$/.test(input)) return `${input}@st.uew.edu.gh`;
        if (input.endsWith('@st.uew.edu.gh')) return input;
        if (input.includes('@')) return `${input.split('@')[0]}@st.uew.edu.gh`;
        return input;
    }

    // Form submission
    const signinForm = document.getElementById('signinForm');
    signinForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn  = document.getElementById('submitBtn');
        const emailInput = document.getElementById('email').value.trim();
        const password   = document.getElementById('password').value;

        const email = formatEmail(emailInput);

        // Clear previous errors
        document.getElementById('email').classList.remove('error');
        document.getElementById('password').classList.remove('error');
        document.getElementById('emailError').classList.remove('show');
        document.getElementById('passwordError').classList.remove('show');

        let isValid = true;

        if (!emailInput) {
            document.getElementById('email').classList.add('error');
            document.getElementById('emailError').textContent = 'Please enter your email or index number';
            document.getElementById('emailError').classList.add('show');
            isValid = false;
        }

        if (!password) {
            document.getElementById('password').classList.add('error');
            document.getElementById('passwordError').textContent = 'Please enter your password';
            document.getElementById('passwordError').classList.add('show');
            isValid = false;
        }

        if (!isValid) return;

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            if (!navigator.onLine) {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                showToast('No internet connection. Please check your network and try again.', 'error');
                return;
            }

            const result = await window.signIn(email, password);

            if (result.success) {
                showToast('Login successful! Redirecting...', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1500);

            } else {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;

                if (result.error.includes('Invalid login credentials')) {
                    // ── Show the "Account Not Found" popup ────────────────────
                    document.getElementById('signupPopup').style.display = 'flex';

                } else if (result.error.includes('Email not confirmed')) {
                    document.getElementById('email').classList.add('error');
                    document.getElementById('emailError').textContent = result.error;
                    document.getElementById('emailError').classList.add('show');
                    showToast(result.error, 'error');

                } else if (result.error.includes('password')) {
                    document.getElementById('password').classList.add('error');
                    document.getElementById('passwordError').textContent = result.error;
                    document.getElementById('passwordError').classList.add('show');
                    showToast(result.error, 'error');

                } else {
                    document.getElementById('email').classList.add('error');
                    document.getElementById('emailError').textContent = result.error;
                    document.getElementById('emailError').classList.add('show');
                    showToast(result.error, 'error');
                }
            }

        } catch (error) {
            console.error('Sign in error:', error);
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            if (!navigator.onLine || error.message === 'Failed to fetch' || error.name === 'TypeError') {
                showToast('No internet connection. Please check your network and try again.', 'error');
            } else {
                showToast('An unexpected error occurred. Please try again.', 'error');
            }
        }
    });

    // Clear error on input
    document.getElementById('email').addEventListener('input', function() {
        this.classList.remove('error');
        document.getElementById('emailError').classList.remove('show');
    });

    document.getElementById('password').addEventListener('input', function() {
        this.classList.remove('error');
        document.getElementById('passwordError').classList.remove('show');
    });

    // Check if already logged in
    async function checkLoginStatus() {
        try {
            if (typeof window.isLoggedIn === 'function') {
                const loggedIn = await window.isLoggedIn();
                if (loggedIn) window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Error checking login status:', error);
        }
    }

    checkLoginStatus();

    window.addEventListener('offline', () => {
        showToast('You are offline. Please check your internet connection.', 'error');
    });
    window.addEventListener('online', () => {
        showToast('Connection restored.', 'success');
    });
});
