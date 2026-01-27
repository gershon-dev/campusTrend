// Check if supabase client is already initialized to prevent re-declaration
if (typeof window.supabaseClient === 'undefined') {
    // IMPORTANT: Replace these with your actual Supabase credentials
    // Your anon key should look like: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  
     const SUPABASE_URL = 'https://kkvelbfcwaydxiwzsnpb.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdmVsYmZjd2F5ZHhpd3pzbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzMxMjUsImV4cCI6MjA4NDk0OTEyNX0.bc7CweVNAWSsKevkCfL3d2aadEJ4Qay5kWMLhq8H3Nc'; 
    // Initialize Supabase client and store globally
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storageKey: 'campustrend-auth',
            storage: window.localStorage
        },
        global: {
            headers: {
                'X-Client-Info': 'campustrend-web'
            }
        }
    });
    console.log('Supabase client initialized successfully!');

    // Handle auth state changes and clear invalid sessions
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        if (event === 'TOKEN_REFRESHED') {
            console.log('Token refreshed successfully');
        }
        if (event === 'SIGNED_OUT') {
            console.log('User signed out');
        }
        // Clear invalid sessions
        if (event === 'SIGNED_OUT' || !session) {
            window.clearInvalidSession();
        }
    });
}

// ============================================
// SESSION MANAGEMENT
// ============================================

// Clear invalid session
window.clearInvalidSession = async function() {
    try {
        // Clear local storage items related to Supabase
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('supabase') || key.includes('sb-'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Also clear session storage
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('supabase') || key.includes('sb-'))) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        console.log('Cleared invalid session data');
        return true;
    } catch (error) {
        console.error('Error clearing session:', error);
        return false;
    }
};

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

// Sign Up (with trigger approach - profile created automatically)
window.signUp = async function(email, password, fullName, indexNumber, department) {
    try {
        // Validate inputs
        if (!email || !password || !fullName || !indexNumber || !department) {
            return { success: false, error: 'All fields are required' };
        }

        // Validate email format
        if (!email.includes('@')) {
            return { success: false, error: 'Invalid email format' };
        }

        // Clear any existing invalid session first
        await window.clearInvalidSession();
        
        // Create auth user with metadata (trigger will auto-create profile)
        const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    index_number: indexNumber,
                    email: email,
                    department: department
                },
                emailRedirectTo: `${window.location.origin}/index.html`
            }
        });

        if (authError) {
            console.error('Signup error:', authError);
            
            // Handle network errors
            if (authError.message.includes('Failed to fetch') || 
                authError.message.includes('ERR_CONNECTION') ||
                authError.name === 'AuthRetryableFetchError') {
                return { 
                    success: false, 
                    error: 'Network connection error. Please check your internet connection and try again.' 
                };
            }
            
            // Handle rate limiting
            if (authError.message.includes('429') || authError.message.includes('rate limit')) {
                return { success: false, error: 'Too many signup attempts. Please wait a few minutes and try again.' };
            }
            
            // Handle user already registered - UPDATED TO CATCH MORE CASES
            if (authError.message.includes('already registered') || 
                authError.message.includes('User already registered') ||
                authError.message.includes('already been registered') ||
                authError.status === 422 ||
                authError.code === 'user_already_exists') {
                return { 
                    success: false, 
                    error: 'This index number/email is already registered. Please sign in instead or use a different index number.',
                    alreadyExists: true 
                };
            }
            
            // Handle weak password
            if (authError.message.includes('Password')) {
                return { success: false, error: 'Password should be at least 6 characters long.' };
            }
            
            // For any other error, return the actual error message
            return { success: false, error: authError.message };
        }

        if (!authData.user) {
            return { success: false, error: 'Failed to create user account' };
        }

        // Profile is automatically created by database trigger
        return { success: true, user: authData.user };
    } catch (error) {
        console.error('Sign up error:', error);
        
        // Check if it's a user already exists error
        if (error.message && (
            error.message.includes('already registered') || 
            error.message.includes('User already registered') ||
            error.message.includes('already been registered')
        )) {
            return { 
                success: false, 
                error: 'This index number/email is already registered. Please sign in instead or use a different index number.',
                alreadyExists: true 
            };
        }
        
        return { success: false, error: error.message || 'An unexpected error occurred' };
    }
};

// Sign In
window.signIn = async function(email, password) {
    try {
        // Validate inputs
        if (!email || !password) {
            return { success: false, error: 'Email and password are required' };
        }

        // Clear any existing invalid session first
        await window.clearInvalidSession();
        
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Sign in error:', error);
            // Handle specific error types
            if (error.message.includes('Invalid Refresh Token') || 
                error.message.includes('Refresh Token Not Found')) {
                // Clear session and retry
                await window.clearInvalidSession();
                return { success: false, error: 'Session expired. Please try signing in again.' };
            }
            if (error.message.includes('Email not confirmed')) {
                return { success: false, error: 'Please confirm your email before signing in. Check your inbox for the confirmation link.' };
            }
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, error: 'Invalid email or password. Please check your credentials and try again.' };
            }
            return { success: false, error: error.message };
        }

        if (!data.user) {
            return { success: false, error: 'Sign in failed. Please try again.' };
        }

        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('Sign in error:', error);
        // If it's a refresh token error, clear and notify
        if (error.message && error.message.includes('Refresh Token')) {
            await window.clearInvalidSession();
            return { success: false, error: 'Session expired. Please try signing in again.' };
        }
        return { success: false, error: error.message || 'An unexpected error occurred' };
    }
};

// Sign Out
window.signOut = async function() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        
        // Clear all session data regardless of error
        await window.clearInvalidSession();
        
        if (error) {
            console.warn('Sign out had an error, but session was cleared:', error.message);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        // Still clear session even if signOut fails
        await window.clearInvalidSession();
        return { success: true }; // Return success since we cleared the session
    }
};

// Get Current User
window.getCurrentUser = async function() {
    try {
        const { data: { user }, error } = await window.supabaseClient.auth.getUser();
        
        if (error) {
            // Handle CORS errors
            if (error.message.includes('Failed to fetch') || 
                error.message.includes('CORS') ||
                error.name === 'AuthRetryableFetchError') {
                console.warn('CORS error detected. Please configure your Supabase URL settings.');
                console.warn('Add http://127.0.0.1:5500 to your allowed redirect URLs in Supabase Dashboard.');
                
                // Try to get user from session instead
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                return session?.user || null;
            }
            
            // Handle refresh token errors
            if (error.message.includes('Refresh Token') || 
                error.message.includes('Invalid') ||
                error.message.includes('expired')) {
                console.warn('Invalid session detected, clearing...');
                await window.clearInvalidSession();
                return null;
            }
            console.error('Get user error:', error);
            return null;
        }
        
        return user;
    } catch (error) {
        console.error('Get current user error:', error);
        
        // Try fallback method for CORS issues
        if (error.message && error.message.includes('fetch')) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                return session?.user || null;
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
            }
        }
        
        // Check if it's a token error
        if (error.message && (error.message.includes('Refresh Token') || error.message.includes('Invalid'))) {
            await window.clearInvalidSession();
        }
        return null;
    }
};

// Get Current User Profile
window.getCurrentProfile = async function() {
    try {
        const user = await window.getCurrentUser();
        if (!user) {
            console.log('No user logged in, cannot fetch profile');
            return null;
        }

        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Get profile error:', error);
            
            // If profile doesn't exist, try to create it
            if (error.code === 'PGRST116' || error.message.includes('no rows')) {
                console.log('Profile not found, attempting to create...');
                
                // Get user metadata
                const metadata = user.user_metadata || {};
                
                // Create profile
                const { data: newProfile, error: createError } = await window.supabaseClient
                    .from('profiles')
                    .insert({
                        id: user.id,
                        full_name: metadata.full_name || 'User',
                        email: user.email,
                        index_number: metadata.index_number || null,
                        department: metadata.department || 'Unknown',
                        avatar_url: null,
                        bio: null,
                        location: null
                    })
                    .select()
                    .single();
                
                if (createError) {
                    console.error('Error creating profile:', createError);
                    // Return a basic profile object even if creation fails
                    return {
                        id: user.id,
                        full_name: metadata.full_name || user.email?.split('@')[0] || 'User',
                        email: user.email,
                        department: metadata.department || 'Unknown',
                        index_number: metadata.index_number || null
                    };
                }
                
                return newProfile;
            }
            
            // Return null for other errors
            return null;
        }

        // If no profile found, create one
        if (!data) {
            console.log('No profile data, creating new profile...');
            const metadata = user.user_metadata || {};
            
            const { data: newProfile, error: createError } = await window.supabaseClient
                .from('profiles')
                .insert({
                    id: user.id,
                    full_name: metadata.full_name || 'User',
                    email: user.email,
                    index_number: metadata.index_number || null,
                    department: metadata.department || 'Unknown'
                })
                .select()
                .single();
            
            if (createError) {
                console.error('Error creating profile:', createError);
                return {
                    id: user.id,
                    full_name: metadata.full_name || user.email?.split('@')[0] || 'User',
                    email: user.email,
                    department: metadata.department || 'Unknown',
                    index_number: metadata.index_number || null
                };
            }
            
            return newProfile;
        }

        return data;
    } catch (error) {
        console.error('Get current profile error:', error);
        
        // Return a fallback profile
        const user = await window.getCurrentUser();
        if (user) {
            return {
                id: user.id,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                email: user.email,
                department: user.user_metadata?.department || 'Unknown',
                index_number: user.user_metadata?.index_number || null
            };
        }
        
        return null;
    }
};

// Check if user is logged in
window.isLoggedIn = async function() {
    try {
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        
        if (error) {
            // Handle refresh token errors silently
            if (error.message.includes('Refresh Token') || error.message.includes('Invalid')) {
                await window.clearInvalidSession();
                return false;
            }
            console.error('Session check error:', error);
            return false;
        }
        
        return session !== null;
    } catch (error) {
        console.error('Check login status error:', error);
        // If there's a token error, clear the session
        if (error.message && error.message.includes('Refresh Token')) {
            await window.clearInvalidSession();
        }
        return false;
    }
};

// ============================================
// DEPARTMENT LIST
// ============================================

window.DEPARTMENTS = [
    'Computer Science',
    'Mathematics',
    'Basic Education',
    'Business Administration',
    'Graphic Design',
    'Music Education',
    'Health Education',
    'Social Studies',
    'English Education',
    'Science Education',
    'Physical Education',
    'Special Education'
];

// ============================================
// POST FUNCTIONS
// ============================================

// Create Post
window.createPost = async function(content, imageFile, department, visibility = 'public') {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        let imageUrl = null;

        // Upload image if provided
        if (imageFile) {
            const fileName = `${user.id}/${Date.now()}_${imageFile.name}`;
            const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                .from('post-images')
                .upload(fileName, imageFile);

            if (uploadError) {
                console.error('Image upload error:', uploadError);
                return { success: false, error: uploadError.message };
            }

            // Get public URL
            const { data: urlData } = window.supabaseClient.storage
                .from('post-images')
                .getPublicUrl(fileName);

            imageUrl = urlData.publicUrl;
        }

        // Insert post
        const { data, error } = await window.supabaseClient
            .from('posts')
            .insert({
                user_id: user.id,
                content: content || null,
                image_url: imageUrl,
                department: department,
                visibility: visibility
            })
            .select(`
                *,
                profiles:user_id (
                    id,
                    full_name,
                    avatar_url,
                    department
                )
            `)
            .single();

        if (error) {
            console.error('Post creation error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, post: data };
    } catch (error) {
        console.error('Create post error:', error);
        return { success: false, error: error.message };
    }
};

// Get Posts (with user info)
window.getPosts = async function(filter = 'all', limit = 50) {
    try {
        let query = window.supabaseClient
            .from('posts')
            .select(`
                *,
                profiles:user_id (
                    id,
                    full_name,
                    avatar_url,
                    department
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        // Apply filters
        if (filter === 'popular') {
            query = query.gte('likes_count', 5).order('likes_count', { ascending: false });
        } else if (filter === 'recent') {
            // Already ordered by created_at
        }

        const { data, error } = await query;

        if (error) {
            console.error('Get posts error:', error);
            return { success: false, error: error.message, posts: [] };
        }

        return { success: true, posts: data || [] };
    } catch (error) {
        console.error('Get posts error:', error);
        return { success: false, error: error.message, posts: [] };
    }
};

// Get Posts by Department
window.getPostsByDepartment = async function(department) {
    try {
        const { data, error } = await window.supabaseClient
            .from('posts')
            .select(`
                *,
                profiles:user_id (
                    id,
                    full_name,
                    avatar_url,
                    department
                )
            `)
            .eq('department', department)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get posts by department error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, posts: data };
    } catch (error) {
        console.error('Get posts by department error:', error);
        return { success: false, error: error.message };
    }
};

// Delete Post
window.deletePost = async function(postId) {
    try {
        const { error } = await window.supabaseClient
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Delete post error:', error);
        return { success: false, error: error.message };
    }
};

// ============================================
// LIKE FUNCTIONS
// ============================================

// Toggle Like
window.toggleLike = async function(postId) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        // Check if already liked
        const { data: existingLike } = await window.supabaseClient
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('post_id', postId)
            .maybeSingle();

        if (existingLike) {
            // Unlike
            const { error } = await window.supabaseClient
                .from('likes')
                .delete()
                .eq('id', existingLike.id);

            if (error) return { success: false, error: error.message };
            return { success: true, liked: false };
        } else {
            // Like
            const { error } = await window.supabaseClient
                .from('likes')
                .insert({ user_id: user.id, post_id: postId });

            if (error) return { success: false, error: error.message };
            return { success: true, liked: true };
        }
    } catch (error) {
        console.error('Toggle like error:', error);
        return { success: false, error: error.message };
    }
};

// Check if user liked a post
window.hasUserLiked = async function(postId) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return false;

        const { data } = await window.supabaseClient
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('post_id', postId)
            .maybeSingle();

        return data !== null;
    } catch (error) {
        console.error('Check user liked error:', error);
        return false;
    }
};

// ============================================
// COMMENT FUNCTIONS
// ============================================

// Add Comment
// Add Comment (with optional parent_comment_id for replies)
window.addComment = async function(postId, content, parentCommentId = null) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const commentData = {
            user_id: user.id,
            post_id: postId,
            content: content
        };

        // Add parent_comment_id if this is a reply
        if (parentCommentId) {
            commentData.parent_comment_id = parentCommentId;
        }

        const { data, error } = await window.supabaseClient
            .from('comments')
            .insert(commentData)
            .select(`
                *,
                profiles:user_id (
                    full_name,
                    avatar_url
                )
            `)
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, comment: data };
    } catch (error) {
        console.error('Add comment error:', error);
        return { success: false, error: error.message };
    }
};

// Get Comments for Post (including parent_comment_id for threading)
window.getComments = async function(postId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('comments')
            .select(`
                *,
                profiles:user_id (
                    full_name,
                    avatar_url
                )
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, comments: data };
    } catch (error) {
        console.error('Get comments error:', error);
        return { success: false, error: error.message };
    }
};

// ============================================
// FOLLOW FUNCTIONS
// ============================================

// Toggle Follow
window.toggleFollow = async function(targetUserId) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        // Check if already following
        const { data: existingFollow } = await window.supabaseClient
            .from('followers')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetUserId)
            .maybeSingle();

        if (existingFollow) {
            // Unfollow
            const { error } = await window.supabaseClient
                .from('followers')
                .delete()
                .eq('id', existingFollow.id);

            if (error) return { success: false, error: error.message };
            return { success: true, following: false };
        } else {
            // Follow
            const { error } = await window.supabaseClient
                .from('followers')
                .insert({ follower_id: user.id, following_id: targetUserId });

            if (error) return { success: false, error: error.message };
            return { success: true, following: true };
        }
    } catch (error) {
        console.error('Toggle follow error:', error);
        return { success: false, error: error.message };
    }
};

// Check if following
window.isFollowing = async function(targetUserId) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return false;

        const { data } = await window.supabaseClient
            .from('followers')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetUserId)
            .maybeSingle();

        return data !== null;
    } catch (error) {
        console.error('Check following error:', error);
        return false;
    }
};

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

// Get Notifications
window.getNotifications = async function() {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const { data, error } = await window.supabaseClient
            .from('notifications')
            .select(`
                *,
                from_user:from_user_id (
                    full_name,
                    avatar_url
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, notifications: data };
    } catch (error) {
        console.error('Get notifications error:', error);
        return { success: false, error: error.message };
    }
};

// Mark Notification as Read
window.markNotificationRead = async function(notificationId) {
    try {
        const { error } = await window.supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (error) {
        console.error('Mark notification read error:', error);
        return { success: false, error: error.message };
    }
};

// Mark All Notifications as Read
window.markAllNotificationsRead = async function() {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const { error } = await window.supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        return { success: false, error: error.message };
    }
};

// Get Unread Notification Count
window.getUnreadNotificationCount = async function() {
    try {
        const user = await window.getCurrentUser();
        if (!user) return 0;

        const { count } = await window.supabaseClient
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        return count || 0;
    } catch (error) {
        console.error('Get unread notification count error:', error);
        return 0;
    }
};

// ============================================
// PROFILE FUNCTIONS
// ============================================

// Get Profile by ID
window.getProfile = async function(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, profile: data };
    } catch (error) {
        console.error('Get profile error:', error);
        return { success: false, error: error.message };
    }
};

// Update Profile
window.updateProfile = async function(updates) {
    try {
        const user = await window.getCurrentUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const { data, error } = await window.supabaseClient
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, profile: data };
    } catch (error) {
        console.error('Update profile error:', error);
        return { success: false, error: error.message };
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Get Star Rating based on likes
window.getStarRating = function(likesCount) {
    if (likesCount >= 100) return { stars: 5, label: 'Legendary', color: '#FFD700' };
    if (likesCount >= 50) return { stars: 4, label: 'Viral', color: '#FF6B6B' };
    if (likesCount >= 15) return { stars: 3, label: 'Popular', color: '#4ECDC4' };
    if (likesCount >= 10) return { stars: 2, label: 'Rising', color: '#95E1D3' };
    if (likesCount >= 5) return { stars: 1, label: 'Trending', color: '#A8E6CF' };
    return { stars: 0, label: '', color: '' };
};

// Format time ago
window.timeAgo = function(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString();
};

// Generate initials from name
window.getInitials = function(name) {
    if (!name) return 'U';
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

// Toast notification helper
window.showToast = window.showToast || function(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (toast && toastMessage) {
        const icon = toast.querySelector('i');
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        if (icon) {
            icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        }
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    } else {
        console.log(`Toast (${type}): ${message}`);
    }
};

console.log('Supabase config loaded successfully!');