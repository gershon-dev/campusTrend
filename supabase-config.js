// supabase-config.js

// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://znzkjoeqvxwgzemlyhhc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R9XJYbEsfY4DjJ9I5ycIug_oOhMyM5p';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

// Sign Up
async function signUp(email, password, fullName, indexNumber, department) {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password
    });

    if (authError) {
        return { success: false, error: authError.message };
    }

    // 2. Create profile
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            id: authData.user.id,
            full_name: fullName,
            index_number: indexNumber,
            email: email,
            department: department
        });

    if (profileError) {
        return { success: false, error: profileError.message };
    }

    return { success: true, user: authData.user };
}

// Sign In
async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, user: data.user, session: data.session };
}

// Sign Out
async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

// Get Current User
async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Get Current User Profile
async function getCurrentProfile() {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    return data;
}

// Check if user is logged in
async function isLoggedIn() {
    const user = await getCurrentUser();
    return user !== null;
}

// ============================================
// POST FUNCTIONS
// ============================================

// Create Post
async function createPost(content, imageFile, department, visibility = 'public') {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    let imageUrl = null;

    // Upload image if provided
    if (imageFile) {
        const fileName = `${user.id}/${Date.now()}_${imageFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(fileName, imageFile);

        if (uploadError) {
            return { success: false, error: uploadError.message };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('post-images')
            .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
    }

    // Insert post
    const { data, error } = await supabase
        .from('posts')
        .insert({
            user_id: user.id,
            content: content,
            image_url: imageUrl,
            department: department,
            visibility: visibility
        })
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, post: data };
}

// Get Posts (with user info)
async function getPosts(filter = 'all', limit = 20) {
    let query = supabase
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
        query = query.gte('likes_count', 10);
    } else if (filter === 'rising') {
        query = query.gte('likes_count', 5);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, posts: data };
}

// Get Posts by Department
async function getPostsByDepartment(department) {
    const { data, error } = await supabase
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
        return { success: false, error: error.message };
    }

    return { success: true, posts: data };
}

// Delete Post
async function deletePost(postId) {
    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}

// ============================================
// LIKE FUNCTIONS
// ============================================

// Toggle Like
async function toggleLike(postId) {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Check if already liked
    const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .single();

    if (existingLike) {
        // Unlike
        const { error } = await supabase
            .from('likes')
            .delete()
            .eq('id', existingLike.id);

        if (error) return { success: false, error: error.message };
        return { success: true, liked: false };
    } else {
        // Like
        const { error } = await supabase
            .from('likes')
            .insert({ user_id: user.id, post_id: postId });

        if (error) return { success: false, error: error.message };
        return { success: true, liked: true };
    }
}

// Check if user liked a post
async function hasUserLiked(postId) {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .single();

    return data !== null;
}

// ============================================
// COMMENT FUNCTIONS
// ============================================

// Add Comment
async function addComment(postId, content) {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await supabase
        .from('comments')
        .insert({
            user_id: user.id,
            post_id: postId,
            content: content
        })
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
}

// Get Comments for Post
async function getComments(postId) {
    const { data, error } = await supabase
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
}

// ============================================
// FOLLOW FUNCTIONS
// ============================================

// Toggle Follow
async function toggleFollow(targetUserId) {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Check if already following
    const { data: existingFollow } = await supabase
        .from('followers')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .single();

    if (existingFollow) {
        // Unfollow
        const { error } = await supabase
            .from('followers')
            .delete()
            .eq('id', existingFollow.id);

        if (error) return { success: false, error: error.message };
        return { success: true, following: false };
    } else {
        // Follow
        const { error } = await supabase
            .from('followers')
            .insert({ follower_id: user.id, following_id: targetUserId });

        if (error) return { success: false, error: error.message };
        return { success: true, following: true };
    }
}

// Check if following
async function isFollowing(targetUserId) {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data } = await supabase
        .from('followers')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .single();

    return data !== null;
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

// Get Notifications
async function getNotifications() {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await supabase
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
}

// Mark Notification as Read
async function markNotificationRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// Mark All Notifications as Read
async function markAllNotificationsRead() {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// Get Unread Notification Count
async function getUnreadNotificationCount() {
    const user = await getCurrentUser();
    if (!user) return 0;

    const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

    return count || 0;
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

// Get Profile by ID
async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, profile: data };
}

// Update Profile
async function updateProfile(updates) {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, profile: data };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Get Star Rating based on likes
function getStarRating(likesCount) {
    if (likesCount >= 100) return { stars: 5, label: 'Legendary', color: '#FFD700' };
    if (likesCount >= 50) return { stars: 4, label: 'Viral', color: '#FF6B6B' };
    if (likesCount >= 10) return { stars: 3, label: 'Popular', color: '#4ECDC4' };
    if (likesCount >= 5) return { stars: 2, label: 'Rising', color: '#95E1D3' };
    return { stars: 0, label: '', color: '' };
}

// Format time ago
function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString();
}

// Generate initials from name
function getInitials(name) {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

console.log('Supabase config loaded successfully!');