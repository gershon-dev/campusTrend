// ============================================================
// ADD THIS TO YOUR sign-in.js (inside the signIn function,
// right AFTER a successful login, BEFORE redirecting to index)
// ============================================================

// After: const result = await window.signIn(email, password);
// Before: window.location.href = 'index.html';

// Check if user is blocked
const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('is_blocked, blocked_reason')
    .eq('id', result.user.id)
    .single();

if (profile?.is_blocked) {
    // Sign them out immediately
    await window.supabaseClient.auth.signOut();

    // Show blocked message
    showToast(
        profile.blocked_reason
            ? `Your account has been suspended: ${profile.blocked_reason}`
            : 'Your account has been suspended. Contact admin for help.',
        'error'
    );

    // Stop the redirect
    return;
}

// If not blocked, proceed with redirect as normal
// window.location.href = 'index.html';
