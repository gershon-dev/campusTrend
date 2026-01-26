// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
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

    // Toast notification
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        const icon = toast.querySelector('i');
        
        toast.className = `toast ${type}`;
        toastMessage.textContent = message;
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    // Format email to match sign-up format
    function formatEmail(input) {
        input = input.trim();
        
        // If it's just a 10-digit index number, add the domain
        if (/^\d{10}$/.test(input)) {
            return `${input}@st.uew.edu.gh`;
        }
        
        // If it already has @st.uew.edu.gh, return as is
        if (input.endsWith('@st.uew.edu.gh')) {
            return input;
        }
        
        // If it has @ but not the full domain, replace domain
        if (input.includes('@')) {
            const indexPart = input.split('@')[0];
            return `${indexPart}@st.uew.edu.gh`;
        }
        
        // Otherwise return as typed (for full email addresses)
        return input;
    }

    // Form submission
    const signinForm = document.getElementById('signinForm');
    signinForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const emailInput = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        // Format the email to match signup format
        const email = formatEmail(emailInput);
        
        // Clear previous errors
        document.getElementById('email').classList.remove('error');
        document.getElementById('password').classList.remove('error');
        document.getElementById('emailError').classList.remove('show');
        document.getElementById('passwordError').classList.remove('show');
        
        // Basic validation
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
        
        if (!isValid) {
            return;
        }
        
        // Show loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        
        try {
            // Call Supabase signIn function
            const result = await window.signIn(email, password);
            
            if (result.success) {
                showToast('Login successful! Redirecting...', 'success');
                
                // Redirect to main app after 1.5 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                // Handle error
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                
                // Check if it's an email not found error
                if (result.error.includes('Invalid login credentials') || 
                    result.error.includes('Email not confirmed')) {
                    document.getElementById('email').classList.add('error');
                    document.getElementById('emailError').textContent = result.error;
                    document.getElementById('emailError').classList.add('show');
                } else if (result.error.includes('password')) {
                    document.getElementById('password').classList.add('error');
                    document.getElementById('passwordError').textContent = result.error;
                    document.getElementById('passwordError').classList.add('show');
                } else {
                    // Generic error
                    document.getElementById('email').classList.add('error');
                    document.getElementById('emailError').textContent = result.error;
                    document.getElementById('emailError').classList.add('show');
                }
                
                showToast(result.error, 'error');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            showToast('An unexpected error occurred. Please try again.', 'error');
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
                if (loggedIn) {
                    window.location.href = 'index.html';
                }
            }
        } catch (error) {
            console.error('Error checking login status:', error);
        }
    }

    // Check login status on page load
    checkLoginStatus();
});