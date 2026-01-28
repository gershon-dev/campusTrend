// Profile state
let currentProfileUserId = null;
let isOwnProfile = false;
let selectedAvatarFile = null;

// Profile data
let profileData = {
    id: null,
    full_name: "Loading...",
    email: "",
    department: "",
    bio: "",
    location: "",
    avatar_url: null,
    index_number: "",
    created_at: new Date()
};

// Stats data
let statsData = {
    followers: 0,
    following: 0,
    totalLikes: 0,
    totalStars: 0,
    postsCount: 0
};

// ============================================
// INITIALIZATION
// ============================================

// Initialize profile on page load
async function initializeProfile() {
    try {
        // Check authentication
        const isLoggedIn = await window.isLoggedIn();
        if (!isLoggedIn) {
            window.location.href = 'sign-in.html';
            return;
        }

        // Get current logged-in user
        const currentUser = await window.getCurrentUser();
        if (!currentUser) {
            window.location.href = 'sign-in.html';
            return;
        }

        // Check if viewing another user's profile (from URL parameter)
        const urlParams = new URLSearchParams(window.location.search);
        const viewUserId = urlParams.get('userId');

        if (viewUserId && viewUserId !== currentUser.id) {
            // Viewing another user's profile
            currentProfileUserId = viewUserId;
            isOwnProfile = false;
            await loadOtherUserProfile(viewUserId);
        } else {
            // Viewing own profile
            currentProfileUserId = currentUser.id;
            isOwnProfile = true;
            await loadOwnProfile(currentUser);
        }

        // Load posts and stats
        await loadUserPosts();
        await loadFollowCounts();

    } catch (error) {
        console.error('Profile initialization error:', error);
        showToast('Error loading profile', 'error');
    }
}

// Load own profile
async function loadOwnProfile(user) {
    try {
        const profile = await window.getCurrentProfile();
        
        if (profile) {
            profileData = {
                id: user.id,
                email: user.email,
                full_name: profile.full_name || 'Student',
                department: profile.department || 'UEW Student',
                bio: profile.bio || '',
                location: profile.location || '',
                avatar_url: profile.avatar_url,
                index_number: profile.index_number,
                created_at: profile.created_at
            };

            updateProfileUI();
            
            // Show edit buttons for own profile
            document.getElementById('editAvatarBtn').style.display = 'flex';
            document.getElementById('editProfileBtn').style.display = 'inline-flex';
            document.getElementById('followBtn').style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading own profile:', error);
        showToast('Error loading profile data', 'error');
    }
}

// Load another user's profile
async function loadOtherUserProfile(userId) {
    try {
        const result = await window.getProfile(userId);
        
        if (result.success && result.profile) {
            const profile = result.profile;
            
            profileData = {
                id: userId,
                email: profile.email || '',
                full_name: profile.full_name || 'Student',
                department: profile.department || 'UEW Student',
                bio: profile.bio || '',
                location: profile.location || '',
                avatar_url: profile.avatar_url,
                index_number: profile.index_number,
                created_at: profile.created_at
            };

            updateProfileUI();
            
            // Show follow button for other users
            document.getElementById('editAvatarBtn').style.display = 'none';
            document.getElementById('editProfileBtn').style.display = 'none';
            document.getElementById('followBtn').style.display = 'inline-flex';
            
            // Check if already following
            await updateFollowButton();
        } else {
            showToast('User not found', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        showToast('Error loading profile', 'error');
    }
}

// Update profile UI
function updateProfileUI() {
    const initials = getInitials(profileData.full_name);

    // Update avatar
    const avatarImage = document.getElementById('avatarImage');
    const avatarInitials = document.getElementById('avatarInitials');
    
    if (profileData.avatar_url) {
        avatarImage.src = profileData.avatar_url;
        avatarImage.style.display = 'block';
        avatarInitials.style.display = 'none';
    } else {
        avatarImage.style.display = 'none';
        avatarInitials.style.display = 'block';
        avatarInitials.textContent = initials;
    }

    // Update profile info
    document.getElementById('profileName').textContent = profileData.full_name;
    document.getElementById('profileUsername').textContent = `@${profileData.index_number || 'student'}`;
    document.getElementById('profileDepartment').textContent = profileData.department;
    
    const bioElement = document.getElementById('profileBio');
    if (profileData.bio) {
        bioElement.textContent = profileData.bio;
        bioElement.style.display = 'block';
    } else {
        bioElement.style.display = 'none';
    }

    // Set form values for editing (if own profile)
    if (isOwnProfile) {
        document.getElementById('editName').value = profileData.full_name;
        document.getElementById('editBio').value = profileData.bio || '';
        document.getElementById('editLocation').value = profileData.location || '';
        updateCharCount();
    }
}

// ============================================
// POSTS LOADING
// ============================================

// Load user's posts
async function loadUserPosts() {
    try {
        const result = await window.getPosts('all', 100);
        
        if (result.success && result.posts) {
            // Filter posts for current profile user
            const userPosts = result.posts.filter(post => post.user_id === currentProfileUserId);
            
            // Calculate stats
            statsData.postsCount = userPosts.length;
            
            // Calculate total likes and stars
            statsData.totalLikes = 0;
            statsData.totalStars = 0;
            
            userPosts.forEach(post => {
                const likes = post.likes_count || 0;
                statsData.totalLikes += likes;
                
                const rating = window.getStarRating(likes);
                statsData.totalStars += rating.stars;
            });

            // Update stats UI
            document.getElementById('totalLikes').textContent = statsData.totalLikes;
            document.getElementById('totalStars').textContent = statsData.totalStars;
            document.getElementById('postsCountDisplay').textContent = `${statsData.postsCount} post${statsData.postsCount !== 1 ? 's' : ''}`;

            // Render posts
            if (userPosts.length === 0) {
                document.getElementById('noPosts').style.display = 'block';
                document.getElementById('postsContainer').innerHTML = '';
                
                const noPostsMessage = document.getElementById('noPostsMessage');
                if (isOwnProfile) {
                    noPostsMessage.textContent = 'Share your first post with the campus community!';
                } else {
                    noPostsMessage.textContent = 'This user hasn\'t posted anything yet.';
                }
            } else {
                document.getElementById('noPosts').style.display = 'none';
                await renderPosts(userPosts);
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        showToast('Error loading posts', 'error');
    }
}

// Render posts as full cards
async function renderPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    // Sort posts by date (newest first)
    const sortedPosts = [...posts].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );

    const postCards = await Promise.all(sortedPosts.map(async post => {
        const userInitials = getInitials(post.profiles?.full_name || 'User');
        const rating = window.getStarRating(post.likes_count || 0);
        const timeAgo = window.timeAgo(post.created_at);
        
        // Check if current user liked this post
        const currentUser = await window.getCurrentUser();
        let isLiked = false;
        if (currentUser && post.likes) {
            isLiked = post.likes.some(like => like.user_id === currentUser.id);
        }

        // Get comments
        const comments = post.comments || [];
        
        return `
            <div class="post-card" data-post-id="${post.id}">
                <!-- Post Header -->
                <div class="post-header">
                    <div class="post-avatar">
                        ${post.profiles?.avatar_url ? 
                            `<img src="${post.profiles.avatar_url}" alt="${post.profiles.full_name}">` :
                            `<span>${userInitials}</span>`
                        }
                    </div>
                    <div class="post-user-info">
                        <div class="post-username">${post.profiles?.full_name || 'Unknown User'}</div>
                        <div class="post-meta">
                            <i class="fas fa-clock"></i>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                </div>

                <!-- Post Image -->
                <div class="post-image-container">
                    ${post.image_url ? 
                        `<img src="${post.image_url}" alt="Post image" class="post-image">` :
                        '<div style="padding: 60px; text-align: center; color: #65676b;"><i class="fas fa-image" style="font-size: 48px;"></i></div>'
                    }
                    ${rating.stars > 0 ? `
                        <div class="post-star-badge">
                            ${'<i class="fas fa-star"></i>'.repeat(rating.stars)}
                            <span>${rating.label}</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Post Content -->
                <div class="post-content">
                    ${post.description ? `
                        <div class="post-description">${escapeHtml(post.description)}</div>
                    ` : ''}
                    
                    <div class="post-department-tag">
                        <i class="fas fa-building"></i>
                        ${post.department || 'General'}
                    </div>

                    <!-- Post Actions -->
                    <div class="post-actions">
                        <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', this)">
                            <i class="fas fa-heart"></i>
                            <span class="likes-count">${post.likes_count || 0}</span>
                        </button>
                        <button class="post-action-btn" onclick="focusComment('${post.id}')">
                            <i class="fas fa-comment"></i>
                            <span>${comments.length}</span>
                        </button>
                        <button class="post-action-btn" onclick="sharePost('${post.id}')">
                            <i class="fas fa-share"></i>
                            <span>Share</span>
                        </button>
                    </div>
                </div>

                <!-- Comments Section -->
                ${comments.length > 0 ? `
                    <div class="post-comments">
                        ${comments.slice(0, 3).map(comment => {
                            const commentInitials = getInitials(comment.profiles?.full_name || 'User');
                            return `
                                <div class="comment">
                                    <div class="comment-avatar">${commentInitials}</div>
                                    <div>
                                        <div class="comment-content">
                                            <div class="comment-author">${comment.profiles?.full_name || 'Unknown'}</div>
                                            <div class="comment-text">${escapeHtml(comment.comment_text)}</div>
                                        </div>
                                        <div class="comment-time">${window.timeAgo(comment.created_at)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                        ${comments.length > 3 ? `
                            <div style="text-align: center; padding-top: 8px;">
                                <button class="post-action-btn" style="color: #1877f2;">
                                    View all ${comments.length} comments
                                </button>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }));

    container.innerHTML = postCards.join('');
}

// ============================================
// FOLLOW FUNCTIONALITY
// ============================================

// Load follow counts
async function loadFollowCounts() {
    try {
        const followersResult = await window.getFollowers(currentProfileUserId);
        const followingResult = await window.getFollowing(currentProfileUserId);

        statsData.followers = followersResult.success ? followersResult.followers.length : 0;
        statsData.following = followingResult.success ? followingResult.following.length : 0;

        document.getElementById('followersCount').textContent = statsData.followers;
        document.getElementById('followingCount').textContent = statsData.following;
    } catch (error) {
        console.error('Error loading follow counts:', error);
    }
}

// Update follow button state
async function updateFollowButton() {
    if (isOwnProfile) return;

    const followBtn = document.getElementById('followBtn');
    const isFollowing = await window.isFollowing(currentProfileUserId);
    
    if (isFollowing) {
        followBtn.classList.add('following');
        followBtn.innerHTML = '<i class="fas fa-user-check"></i><span id="followBtnText">Following</span>';
    } else {
        followBtn.classList.remove('following');
        followBtn.innerHTML = '<i class="fas fa-user-plus"></i><span id="followBtnText">Follow</span>';
    }
}

// Toggle follow
async function toggleFollow() {
    if (isOwnProfile) return;

    try {
        const isFollowing = await window.isFollowing(currentProfileUserId);
        
        if (isFollowing) {
            const result = await window.unfollowUser(currentProfileUserId);
            if (result.success) {
                showToast('Unfollowed successfully', 'success');
                await loadFollowCounts();
                await updateFollowButton();
            }
        } else {
            const result = await window.followUser(currentProfileUserId);
            if (result.success) {
                showToast('Following successfully', 'success');
                await loadFollowCounts();
                await updateFollowButton();
            }
        }
    } catch (error) {
        console.error('Error toggling follow:', error);
        showToast('Error updating follow status', 'error');
    }
}

// Add event listener to follow button
document.addEventListener('DOMContentLoaded', () => {
    const followBtn = document.getElementById('followBtn');
    if (followBtn) {
        followBtn.addEventListener('click', toggleFollow);
    }
});

// ============================================
// AVATAR UPLOAD
// ============================================

// Open avatar modal
function openAvatarModal() {
    if (!isOwnProfile) return;
    
    const modal = document.getElementById('avatarModal');
    const preview = document.getElementById('avatarPreview');
    const initials = document.getElementById('avatarPreviewInitials');
    
    // Show current avatar
    if (profileData.avatar_url) {
        preview.src = profileData.avatar_url;
        preview.style.display = 'block';
        initials.style.display = 'none';
    } else {
        preview.style.display = 'none';
        initials.style.display = 'block';
        initials.textContent = getInitials(profileData.full_name);
    }
    
    selectedAvatarFile = null;
    document.getElementById('saveAvatarBtn').disabled = true;
    modal.classList.add('show');
}

// Close avatar modal
function closeAvatarModal() {
    document.getElementById('avatarModal').classList.remove('show');
    selectedAvatarFile = null;
}

// Handle avatar file selection
document.addEventListener('DOMContentLoaded', () => {
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file', 'error');
                return;
            }

            // Validate file size (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image must be less than 5MB', 'error');
                return;
            }

            selectedAvatarFile = file;

            // Preview the image
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('avatarPreview');
                const initials = document.getElementById('avatarPreviewInitials');
                
                preview.src = e.target.result;
                preview.style.display = 'block';
                initials.style.display = 'none';
                
                document.getElementById('saveAvatarBtn').disabled = false;
            };
            reader.readAsDataURL(file);
        });
    }
});

// Save avatar
async function saveAvatar() {
    if (!selectedAvatarFile || !isOwnProfile) return;

    const saveBtn = document.getElementById('saveAvatarBtn');
    const saveText = document.getElementById('saveAvatarText');
    const originalText = saveText.textContent;

    try {
        saveBtn.disabled = true;
        saveText.textContent = 'Uploading...';

        // Upload to Supabase Storage
        const fileExt = selectedAvatarFile.name.split('.').pop();
        const fileName = `${profileData.id}_${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
            .from('avatars')
            .upload(filePath, selectedAvatarFile, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = window.supabaseClient.storage
            .from('avatars')
            .getPublicUrl(filePath);

        const avatarUrl = urlData.publicUrl;

        // Update profile with new avatar URL
        const result = await window.updateProfile({ avatar_url: avatarUrl });

        if (result.success) {
            profileData.avatar_url = avatarUrl;
            updateProfileUI();
            closeAvatarModal();
            showToast('Profile picture updated successfully!', 'success');
        } else {
            throw new Error('Failed to update profile');
        }

    } catch (error) {
        console.error('Error saving avatar:', error);
        showToast('Error uploading photo. Please try again.', 'error');
        saveBtn.disabled = false;
        saveText.textContent = originalText;
    }
}

// ============================================
// PROFILE EDITING
// ============================================

// Open edit modal
function openEditModal() {
    if (!isOwnProfile) return;
    
    document.getElementById('editProfileModal').classList.add('show');
    updateCharCount();
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editProfileModal').classList.remove('show');
}

// Update character count
function updateCharCount() {
    const bioInput = document.getElementById('editBio');
    const charCount = document.getElementById('bioCharCount');
    if (bioInput && charCount) {
        charCount.textContent = bioInput.value.length;
    }
}

// Add event listener for bio character count
document.addEventListener('DOMContentLoaded', () => {
    const bioInput = document.getElementById('editBio');
    if (bioInput) {
        bioInput.addEventListener('input', updateCharCount);
    }
});

// Save profile changes
async function saveProfile() {
    if (!isOwnProfile) return;

    try {
        const updates = {
            full_name: document.getElementById('editName').value.trim(),
            bio: document.getElementById('editBio').value.trim(),
            location: document.getElementById('editLocation').value.trim()
        };

        // Validate
        if (!updates.full_name) {
            showToast('Name cannot be empty', 'error');
            return;
        }

        // Update profile in Supabase
        const result = await window.updateProfile(updates);
        
        if (result.success) {
            profileData.full_name = updates.full_name;
            profileData.bio = updates.bio;
            profileData.location = updates.location;
            
            updateProfileUI();
            closeEditModal();
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast('Error updating profile', 'error');
        }
    } catch (error) {
        console.error('Save profile error:', error);
        showToast('Error saving profile', 'error');
    }
}

// ============================================
// POST INTERACTIONS
// ============================================

// Toggle like on a post
async function toggleLike(postId, button) {
    try {
        const isLiked = button.classList.contains('liked');
        
        if (isLiked) {
            const result = await window.unlikePost(postId);
            if (result.success) {
                button.classList.remove('liked');
                const likesCount = button.querySelector('.likes-count');
                likesCount.textContent = parseInt(likesCount.textContent) - 1;
            }
        } else {
            const result = await window.likePost(postId);
            if (result.success) {
                button.classList.add('liked');
                const likesCount = button.querySelector('.likes-count');
                likesCount.textContent = parseInt(likesCount.textContent) + 1;
            }
        }

        // Reload stats
        await loadUserPosts();
    } catch (error) {
        console.error('Error toggling like:', error);
        showToast('Error updating like', 'error');
    }
}

// Focus comment input
function focusComment(postId) {
    showToast('Comment feature coming soon!', 'success');
}

// Share post
function sharePost(postId) {
    showToast('Share feature coming soon!', 'success');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Get initials from name
function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Navigation functions
function goToHome() {
    window.location.href = 'index.html';
}

// Logout
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            const result = await window.signOut();
            if (result.success) {
                localStorage.removeItem('campusTrendSession');
                sessionStorage.removeItem('campusTrendSession');
                window.location.href = 'sign-in.html';
            }
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = 'sign-in.html';
        }
    }
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const icon = toast.querySelector('i');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Close modals when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });



    

    // Initialize profile
    initializeProfile();
});


// ADD THIS FUNCTION TO YOUR INDEX.JS FILE
// This enables viewing user profiles when clicking on their name/avatar in posts

// Function to view a user's profile
function viewUserProfile(userId) {
    if (!userId) return;
    
    // Redirect to user profile page with userId parameter
    window.location.href = `user-profile.html?userId=${userId}`;
}

// When rendering posts, make sure to add onclick handlers to user avatars and names
// Example modification for your renderPosts function:

/*
MODIFY YOUR POST RENDERING TO INCLUDE THESE onclick ATTRIBUTES:

In your post card HTML, update the post header section like this:

<div class="post-header">
    <div class="post-avatar" onclick="viewUserProfile('${post.user_id}')" style="cursor: pointer;">
        ${post.profiles?.avatar_url ? 
            `<img src="${post.profiles.avatar_url}" alt="${post.profiles.full_name}">` :
            `<span>${userInitials}</span>`
        }
    </div>
    <div class="post-user-info">
        <div class="post-username" onclick="viewUserProfile('${post.user_id}')" style="cursor: pointer;">
            ${post.profiles?.full_name || 'Unknown User'}
        </div>
        <div class="post-meta">
            <i class="fas fa-clock"></i>
            <span>${timeAgo}</span>
        </div>
    </div>
</div>

This makes both the avatar and username clickable to view that user's profile.
*/

// Also update your user profile click handler in the header
// Add this to your setupEventListeners function or similar:

if (userProfile) {
    userProfile.addEventListener('click', () => {
        // When clicking on own profile in header, go to own profile page
        window.location.href = 'user-profile.html';
    });
}

// Add CSS for clickable user elements (add to your styles/index.css):
/*
.post-avatar:hover,
.post-username:hover {
    opacity: 0.8;
}

.post-username {
    cursor: pointer;
    transition: opacity 0.2s;
}

.post-avatar {
    cursor: pointer;
    transition: opacity 0.2s;
}
*/