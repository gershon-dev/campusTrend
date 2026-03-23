// ============================================================
// SUPABASE + CLOUDINARY CONFIG
// Supabase → database & auth
// Cloudinary → all media storage (images & videos)
// ============================================================

const SUPABASE_URL = 'https://kkvelbfcwaydxiwzsnpb.supabase.co';           // 🔁 Replace
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdmVsYmZjd2F5ZHhpd3pzbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzMxMjUsImV4cCI6MjA4NDk0OTEyNX0.bc7CweVNAWSsKevkCfL3d2aadEJ4Qay5kWMLhq8H3Nc'; // 🔁 Replace

const CLOUDINARY_CLOUD_NAME = 'deyu6uccg';
const CLOUDINARY_UPLOAD_PRESET = 'campus_app_uploads';

// ============================================================
// CLOUDINARY UPLOAD FUNCTION
// Supports images and videos with optional progress callback
// ============================================================
async function uploadToCloudinary(file, onProgress) {
    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        // Progress tracking
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && typeof onProgress === 'function') {
                const percent = Math.round((e.loaded / e.total) * 100);
                onProgress(percent);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve({
                    url: data.secure_url,
                    publicId: data.public_id,
                    resourceType: data.resource_type, // 'image' or 'video'
                });
            } else {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.error?.message || 'Cloudinary upload failed'));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.open('POST', url);
        xhr.send(formData);
    });
}

// ============================================================
// SUPABASE CLIENT INIT
// ============================================================
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

// Departments list
window.DEPARTMENTS = [
    'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'English', 'History', 'Geography', 'Economics', 'Business Administration',
    'Accounting', 'Marketing', 'Education', 'Psychology', 'Sociology',
    'Political Science', 'Law', 'Medicine', 'Nursing', 'Engineering',
    'Architecture', 'Agriculture', 'Environmental Science', 'Communication Studies',
    'Information Technology', 'Library Science', 'Physical Education', 'Music',
    'Fine Arts', 'Drama', 'French', 'Arabic', 'Religious Studies', 'Philosophy'
];

// ============================================================
// AUTH FUNCTIONS
// ============================================================
window.signUp = async function(email, password, fullName, indexNumber, department) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName, index_number: indexNumber, department }
            }
        });
        if (error) {
            if (error.message.includes('already registered') || error.message.includes('already exists')) {
                return { success: false, error: 'This index number is already registered.', alreadyExists: true };
            }
            return { success: false, error: error.message };
        }
        if (data.user) {
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    full_name: fullName,
                    index_number: indexNumber,
                    department,
                    email,
                    created_at: new Date().toISOString()
                });
            if (profileError) console.error('Profile creation error:', profileError);
        }
        return { success: true, user: data.user };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.signIn = async function(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, error: 'Invalid index number or password. Please try again.' };
            }
            if (error.message.includes('Email not confirmed')) {
                return { success: false, error: 'Please verify your email before signing in.' };
            }
            return { success: false, error: error.message };
        }
        return { success: true, user: data.user, session: data.session };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.signOut = async function() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.isLoggedIn = async function() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return !!session;
    } catch { return false; }
};

window.getCurrentUser = async function() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    } catch { return null; }
};

window.getCurrentProfile = async function() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (error) return null;
        return data;
    } catch { return null; }
};

// ============================================================
// POST FUNCTIONS
// ============================================================

/**
 * createPost — uploads media to Cloudinary, saves post to Supabase
 * @param {string} content - post text/description
 * @param {File} mediaFile - image or video file
 * @param {string} department - user's department
 * @param {string} visibility - 'public' or 'department'
 * @param {Function} onProgress - optional callback(percent)
 */
window.createPost = async function(content, mediaFile, department, visibility = 'public', onProgress) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        let mediaUrl = null;
        let mediaType = null;
        let publicId = null;

        if (mediaFile) {
            try {
                const uploaded = await uploadToCloudinary(mediaFile, onProgress);
                mediaUrl = uploaded.url;
                mediaType = uploaded.resourceType; // 'image' or 'video'
                publicId = uploaded.publicId;
            } catch (uploadErr) {
                return { success: false, error: `Upload failed: ${uploadErr.message}` };
            }
        }

        const { data, error } = await supabaseClient
            .from('posts')
            .insert([{
                user_id: user.id,
                content,
                image_url: mediaUrl,      // kept as image_url for backward compatibility
                media_url: mediaUrl,      // also saved as media_url
                media_type: mediaType,    // 'image' or 'video'
                public_id: publicId,      // for future deletion
                department,
                visibility,
                likes_count: 0,
                comments_count: 0,
                created_at: new Date().toISOString()
            }])
            .select('*, profiles(*)')
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, post: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.getPosts = async function(filter = 'all', department = null) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        let query = supabaseClient
            .from('posts')
            .select('*, profiles(*)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (filter === 'department' && department) {
            query = query.eq('department', department);
        }

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };

        // Check liked status for current user
        if (user && data) {
            const postIds = data.map(p => p.id);
            const { data: likes } = await supabaseClient
                .from('likes')
                .select('post_id')
                .eq('user_id', user.id)
                .in('post_id', postIds);
            const likedSet = new Set((likes || []).map(l => l.post_id));
            data.forEach(p => { p.isLiked = likedSet.has(p.id); });
        }

        return { success: true, posts: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.deletePost = async function(postId, publicId, mediaType) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        // Delete from Supabase
        const { error } = await supabaseClient
            .from('posts')
            .delete()
            .eq('id', postId)
            .eq('user_id', user.id);

        if (error) return { success: false, error: error.message };

        // Note: Cloudinary deletion from the client requires a signed request.
        // For unsigned deletion, set up a Supabase Edge Function or backend endpoint.
        // The post is removed from your DB — the Cloudinary file will remain until
        // you clean it up from the Cloudinary dashboard or via a server-side function.
        console.log(`Post ${postId} deleted. Cloudinary asset (${publicId}) can be cleaned via dashboard.`);

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.likePost = async function(postId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        const { data: existing } = await supabaseClient
            .from('likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .single();

        if (existing) {
            await supabaseClient.from('likes').delete().eq('id', existing.id);
            await supabaseClient.rpc('decrement_likes', { post_id: postId });
            return { success: true, liked: false };
        } else {
            await supabaseClient.from('likes').insert([{ post_id: postId, user_id: user.id }]);
            await supabaseClient.rpc('increment_likes', { post_id: postId });
            return { success: true, liked: true };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.addComment = async function(postId, content, parentCommentId = null) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        const record = { post_id: postId, user_id: user.id, content };
        if (parentCommentId) record.parent_comment_id = parentCommentId;

        const { data, error } = await supabaseClient
            .from('comments')
            .insert([record])
            .select('*, profiles(*)')
            .single();
        if (error) return { success: false, error: error.message };

        // Only increment top-level comment count, not replies
        if (!parentCommentId) {
            await supabaseClient.rpc('increment_comments', { post_id: postId });
        }
        return { success: true, comment: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.getComments = async function(postId) {
    try {
        const { data, error } = await supabaseClient
            .from('comments')
            .select('*, profiles(*)')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
        if (error) return { success: false, error: error.message };
        return { success: true, comments: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ============================================================
// PROFILE / AVATAR FUNCTIONS
// ============================================================

/**
 * uploadAvatar — uploads profile picture to Cloudinary
 */
window.uploadAvatar = async function(file) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        const { url } = await uploadToCloudinary(file);

        const { error } = await supabaseClient
            .from('profiles')
            .update({ avatar_url: url })
            .eq('id', user.id);

        if (error) return { success: false, error: error.message };
        return { success: true, url };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.updateProfile = async function(updates) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        const { error } = await supabaseClient
            .from('profiles')
            .update(updates)
            .eq('id', user.id);
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.getUserProfile = async function(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) return { success: false, error: error.message };
        return { success: true, profile: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ============================================================
// FOLLOW FUNCTIONS
// ============================================================
window.followUser = async function(targetUserId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        const { data: existing } = await supabaseClient
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetUserId)
            .single();
        if (existing) {
            await supabaseClient.from('follows').delete().eq('id', existing.id);
            return { success: true, following: false };
        } else {
            await supabaseClient.from('follows').insert([{ follower_id: user.id, following_id: targetUserId }]);
            return { success: true, following: true };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ============================================================
// NOTIFICATIONS
// ============================================================
window.getNotifications = async function() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*, profiles!notifications_sender_id_fkey(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) return { success: false, error: error.message };
        return { success: true, notifications: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

window.markNotificationsRead = async function() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { success: false };
        await supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ============================================================
// UTILITY
// ============================================================
window.timeAgo = function(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
};

window.getStarRating = function(likesCount) {
    if (likesCount >= 100) return { stars: 5, label: 'Viral' };
    if (likesCount >= 50) return { stars: 4, label: 'Popular' };
    if (likesCount >= 20) return { stars: 3, label: 'Trending' };
    if (likesCount >= 5) return { stars: 2, label: 'Rising' };
    if (likesCount >= 1) return { stars: 1, label: 'New' };
    return { stars: 0, label: '' };
};

// ============================================================
// ALIASES — index.js and user-profile.js call these names
// ============================================================
window.toggleLike               = window.likePost;
window.toggleFollow             = window.followUser;
window.markAllNotificationsRead = window.markNotificationsRead;
window.getProfile               = window.getUserProfile;

console.log('✅ supabase-config.js loaded — Cloudinary + Supabase ready');