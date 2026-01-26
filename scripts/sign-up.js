// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('signupForm');
    const submitBtn = document.getElementById('submitBtn');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const successModal = document.getElementById('successModal');

    // Input Fields
    const fullNameInput = document.getElementById('fullName');
    const indexNumberInput = document.getElementById('indexNumber');
    const departmentSelect = document.getElementById('department');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const termsCheckbox = document.getElementById('terms');

    // Error Messages
    const fullNameError = document.getElementById('fullNameError');
    const indexNumberError = document.getElementById('indexNumberError');
    const departmentError = document.getElementById('departmentError');
    const passwordError = document.getElementById('passwordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');

    // Password Strength Bar
    const passwordStrengthBar = document.getElementById('passwordStrengthBar');

    // Password Toggle Buttons
    const passwordToggle = document.getElementById('passwordToggle');
    const confirmPasswordToggle = document.getElementById('confirmPasswordToggle');

    // Toggle Password Visibility
    function togglePassword(inputId, button) {
        const input = document.getElementById(inputId);
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        
        // Update icon
        button.innerHTML = isPassword 
            ? `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
               </svg>`
            : `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
               </svg>`;
    }

    // Add event listeners for password toggles
    if (passwordToggle) {
        passwordToggle.addEventListener('click', () => {
            togglePassword('password', passwordToggle);
        });
    }

    if (confirmPasswordToggle) {
        confirmPasswordToggle.addEventListener('click', () => {
            togglePassword('confirmPassword', confirmPasswordToggle);
        });
    }

    // Check Password Strength
    function checkPasswordStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;

        passwordStrengthBar.className = 'password-strength-bar';
        
        if (password.length === 0) {
            passwordStrengthBar.style.width = '0%';
        } else if (strength <= 1) {
            passwordStrengthBar.classList.add('weak');
        } else if (strength <= 2) {
            passwordStrengthBar.classList.add('medium');
        } else {
            passwordStrengthBar.classList.add('strong');
        }

        return strength >= 2;
    }

    // Validate Full Name
    function validateFullName() {
        const value = fullNameInput.value.trim();
        const isValid = value.length >= 2;
        
        fullNameInput.classList.toggle('error', !isValid && value.length > 0);
        fullNameInput.classList.toggle('success', isValid);
        fullNameError.classList.toggle('show', !isValid && value.length > 0);
        
        return isValid;
    }

    // Validate Index Number (10 digits)
    function validateIndexNumber() {
        const value = indexNumberInput.value.trim();
        const isValid = /^\d{10}$/.test(value);
        
        indexNumberInput.classList.toggle('error', !isValid && value.length > 0);
        indexNumberInput.classList.toggle('success', isValid);
        indexNumberError.classList.toggle('show', !isValid && value.length > 0);
        
        return isValid;
    }

    // Validate Department
    function validateDepartment() {
        const value = departmentSelect.value;
        const isValid = value !== '';
        
        departmentSelect.classList.toggle('error', !isValid);
        departmentSelect.classList.toggle('success', isValid);
        departmentError.classList.toggle('show', !isValid);
        
        return isValid;
    }

    // Validate Password
    function validatePassword() {
        const value = passwordInput.value;
        const isValid = value.length >= 8;
        
        checkPasswordStrength(value);
        
        passwordInput.classList.toggle('error', !isValid && value.length > 0);
        passwordInput.classList.toggle('success', isValid);
        passwordError.classList.toggle('show', !isValid && value.length > 0);
        
        // Also validate confirm password if it has a value
        if (confirmPasswordInput.value.length > 0) {
            validateConfirmPassword();
        }
        
        return isValid;
    }

    // Validate Confirm Password
    function validateConfirmPassword() {
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const isValid = password === confirmPassword && confirmPassword.length > 0;
        
        confirmPasswordInput.classList.toggle('error', !isValid && confirmPassword.length > 0);
        confirmPasswordInput.classList.toggle('success', isValid);
        confirmPasswordError.classList.toggle('show', !isValid && confirmPassword.length > 0);
        
        return isValid;
    }

    // Event Listeners for real-time validation
    fullNameInput.addEventListener('input', validateFullName);
    indexNumberInput.addEventListener('input', () => {
        // Only allow digits
        indexNumberInput.value = indexNumberInput.value.replace(/\D/g, '');
        validateIndexNumber();
    });
    departmentSelect.addEventListener('change', validateDepartment);
    passwordInput.addEventListener('input', validatePassword);
    confirmPasswordInput.addEventListener('input', validateConfirmPassword);

    // Show Error Alert
    function showError(message, allowRedirect = false) {
        errorMessage.innerHTML = message;
        errorAlert.classList.add('show');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            errorAlert.classList.remove('show');
        }, 10000);
    }

    // Set Button Loading State
    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.innerHTML = loading 
            ? '<span class="btn-loading"><span class="spinner"></span>Creating Account...</span>'
            : 'Create Account';
    }

    // Form Submit Handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide any existing errors
        errorAlert.classList.remove('show');

        // Validate all fields
        const isFullNameValid = validateFullName();
        const isIndexNumberValid = validateIndexNumber();
        const isDepartmentValid = validateDepartment();
        const isPasswordValid = validatePassword();
        const isConfirmPasswordValid = validateConfirmPassword();
        const isTermsAccepted = termsCheckbox.checked;

        if (!isTermsAccepted) {
            showError('Please accept the Terms of Service and Privacy Policy');
            return;
        }

        if (!isFullNameValid || !isIndexNumberValid || !isDepartmentValid || !isPasswordValid || !isConfirmPasswordValid) {
            showError('Please fix the errors above before submitting');
            return;
        }

        // Set loading state
        setLoading(true);

        try {
            // Create email from index number
            const email = `${indexNumberInput.value.trim()}@st.uew.edu.gh`;

            // Call signUp function from supabase-config.js
            const result = await window.signUp(
                email,
                passwordInput.value,
                fullNameInput.value.trim(),
                indexNumberInput.value.trim(),
                departmentSelect.value
            );

            if (result.success) {
                // Show success modal
                successModal.classList.add('show');
            } else {
                // Handle "already registered" error specially
                if (result.alreadyExists) {
                    showError(
                        result.error + 
                        ' <br><br><a href="sign-in.html" style="color: #4f46e5; font-weight: 600; text-decoration: underline;">Click here to sign in</a>',
                        true
                    );
                } else {
                    showError(result.error || 'An error occurred. Please try again.');
                }
            }
        } catch (error) {
            console.error('Sign up error:', error);
            showError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
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