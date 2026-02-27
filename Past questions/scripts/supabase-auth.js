// ============================================
// SUPABASE AUTHENTICATION FUNCTIONS
// Auth is OPTIONAL for all pages except the upload page.
// ============================================

// Sign up a new user
async function signUp(email, password, fullName) {
    try {
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: fullName } }
        });

        if (error) throw error;

        if (data.user) {
            await window.supabaseClient
                .from('user_profiles')
                .insert({ id: data.user.id, email: email, full_name: fullName });
        }

        return { success: true, data };
    } catch (error) {
        console.error('Error signing up:', error);
        return { success: false, error: error.message };
    }
}

// Sign in user
async function signIn(email, password) {
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error signing in:', error);
        return { success: false, error: error.message };
    }
}

// Sign out user
async function signOut() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) throw error;
        window.location.href = 'past-questions.html';
        return { success: true };
    } catch (error) {
        console.error('Error signing out:', error);
        return { success: false, error: error.message };
    }
}

// Get current user — never throws, always returns safely
// Returns { success: true, user: null } for guests (not logged in)
async function getCurrentUser() {
    try {
        const { data: { user }, error } = await window.supabaseClient.auth.getUser();

        // Supabase throws an AuthSessionMissingError when no session exists.
        // This is normal for guests — we treat it as "not logged in", not an error.
        if (error) {
            if (error.message?.includes('Auth session missing') || error.status === 400) {
                return { success: true, user: null };
            }
            throw error;
        }

        if (user) {
            // Use maybeSingle() — returns null (not 406) if no profile row exists yet
            const { data: profile } = await window.supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            return { success: true, user: { ...user, profile } };
        }

        return { success: true, user: null };
    } catch (error) {
        // Don't propagate auth errors to the rest of the app — just treat as guest
        console.warn('getCurrentUser: treating as guest due to error:', error.message);
        return { success: true, user: null };
    }
}

// Update user profile (requires login)
async function updateProfile(updates) {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();

        if (!user) throw new Error('User not authenticated');

        const { data, error } = await window.supabaseClient
            .from('user_profiles')
            .update({
                full_name: updates.fullName,
                phone_number: updates.phoneNumber,
                student_id: updates.studentId,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error updating profile:', error);
        return { success: false, error: error.message };
    }
}

// Reset password
async function resetPassword(email) {
    try {
        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });

        if (error) throw error;
        return { success: true, message: 'Password reset email sent' };
    } catch (error) {
        console.error('Error resetting password:', error);
        return { success: false, error: error.message };
    }
}

// Update password
async function updatePassword(newPassword) {
    try {
        const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        return { success: true, message: 'Password updated successfully' };
    } catch (error) {
        console.error('Error updating password:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// requireUploadAuth() — Call this ONLY on the upload page.
// Redirects to login if the user is not authenticated.
// DO NOT call this on any public-facing page.
// ============================================================
async function requireUploadAuth() {
    const result = await getCurrentUser();

    if (!result.user) {
        // Save the intended destination so we can redirect back after login
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
        window.location.href = 'login.html?reason=upload';
        return false;
    }

    return true;
}

// Check auth status and update nav UI — safe to call on any page
// Will NOT redirect guests; just updates login/logout button visibility
async function checkAuthStatus() {
    const result = await getCurrentUser();

    if (result.success && result.user) {
        updateUIForLoggedInUser(result.user);
        return result.user;
    } else {
        updateUIForLoggedOutUser();
        return null;
    }
}

// UI update functions — update nav login/logout buttons
function updateUIForLoggedInUser(user) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');

    if (authButtons) authButtons.style.display = 'none';

    if (userMenu) {
        userMenu.style.display = 'block';
        const userName = document.getElementById('userName');
        if (userName) {
            userName.textContent = user.profile?.full_name || user.email;
        }
    }
}

function updateUIForLoggedOutUser() {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');

    if (authButtons) authButtons.style.display = 'block';
    if (userMenu) userMenu.style.display = 'none';
}

// Listen for auth state changes (safe — only updates UI)
if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            checkAuthStatus();
        } else if (event === 'SIGNED_OUT') {
            updateUIForLoggedOutUser();
        }
    });
}

// Export functions
window.authFunctions = {
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    updateProfile,
    resetPassword,
    updatePassword,
    checkAuthStatus,
    requireUploadAuth   // ← use this ONLY on the upload page
};