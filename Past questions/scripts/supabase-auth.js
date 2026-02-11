// ============================================
// SUPABASE AUTHENTICATION FUNCTIONS
// ============================================

// Sign up a new user
async function signUp(email, password, fullName) {
    try {
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        
        if (error) throw error;
        
        // Create user profile
        if (data.user) {
            await window.supabaseClient
                .from('user_profiles')
                .insert({
                    id: data.user.id,
                    email: email,
                    full_name: fullName
                });
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
        
        // Redirect to home page
        window.location.href = 'past-questions.html';
        return { success: true };
    } catch (error) {
        console.error('Error signing out:', error);
        return { success: false, error: error.message };
    }
}

// Get current user
async function getCurrentUser() {
    try {
        const { data: { user }, error } = await window.supabaseClient.auth.getUser();
        if (error) throw error;
        
        if (user) {
            // Get user profile
            const { data: profile } = await window.supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            
            return { success: true, user: { ...user, profile } };
        }
        
        return { success: true, user: null };
    } catch (error) {
        console.error('Error getting current user:', error);
        return { success: false, error: error.message };
    }
}

// Update user profile
async function updateProfile(updates) {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (!user) {
            throw new Error('User not authenticated');
        }
        
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
        const { error } = await window.supabaseClient.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        return { success: true, message: 'Password updated successfully' };
    } catch (error) {
        console.error('Error updating password:', error);
        return { success: false, error: error.message };
    }
}

// Check authentication status on page load
async function checkAuthStatus() {
    const result = await getCurrentUser();
    
    if (result.success && result.user) {
        // User is logged in
        updateUIForLoggedInUser(result.user);
        return result.user;
    } else {
        // User is not logged in
        updateUIForLoggedOutUser();
        return null;
    }
}

// UI update functions
function updateUIForLoggedInUser(user) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    
    if (authButtons) {
        authButtons.style.display = 'none';
    }
    
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
    
    if (authButtons) {
        authButtons.style.display = 'block';
    }
    
    if (userMenu) {
        userMenu.style.display = 'none';
    }
}

// Listen for auth state changes
if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
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
    checkAuthStatus
};