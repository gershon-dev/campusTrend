// app.js - Main application logic for index.html
// Include after supabase-config.js

document.addEventListener('DOMContentLoaded', function() {
    // State
    let currentUser = null;
    let currentProfile = null;
    let posts = [];
    let currentFilter = 'all'; // 'all', 'popular', 'recent'
    let currentDepartmentFilter = null;

    // DOM Elements
    const feedContainer = document.getElementById('feedContainer');
    const createPostBtn = document.getElementById('createPostBtn');
    const postModal = document.getElementById('postModal');
    const shareModal = document.getElementById('shareModal');
    const profileModal = document.getElementById('profileModal');
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const notificationCount = document.getElementById('notificationCount');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    // Initialize app
    init();

    async function init() {
        // Check authentication
        const user = await getCurrentUser();
        
        if (!user) {
            window.location.href = 'sign-in.html';
            return;
        }

        currentUser = user;
        currentProfile = await getCurrentProfile();

        // Update UI with user info
        updateUserUI();

        // Load initial data
        await loadPosts();
        await loadNotifications();

        // Set up real-time subscriptions
        setupRealtimeSubscriptions();

        // Set up event listeners
        setupEventListeners();
    }

    function updateUserUI() {
        if (currentProfile) {
            // Update avatar
            if (userAvatar) {
                if (currentProfile.avatar_url) {
                    userAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
                } else {
                    userAvatar.textContent = currentProfile.full_name.charAt(0).toUpperCase();
                }
            }
            
            // Update username display
            if (userName) {
                userName.textContent = currentProfile.full_name;
            }
        }
    }

    // ==================== POSTS ====================

    async function loadPosts() {
        try {
            let query = supabaseClient
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
                .order('created_at', { ascending: false });

            // Apply filters
            if (currentFilter === 'popular') {
                query = query.gte('likes_count', 5).order('likes_count', { ascending: false });
            }

            if (currentDepartmentFilter) {
                query = query.eq('department', currentDepartmentFilter);
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;

            posts = data || [];
            
            // Check which posts the current user has liked
            if (currentUser) {
                const { data: userLikes } = await supabaseClient
                    .from('likes')
                    .select('post_id')
                    .eq('user_id', currentUser.id);
                
                const likedPostIds = new Set(userLikes?.map(l => l.post_id) || []);
                posts = posts.map(post => ({
                    ...post,
                    isLiked: likedPostIds.has(post.id)
                }));
            }

            renderPosts();
        } catch (error) {
            console.error('Error loading posts:', error);
            showToast('Failed to load posts', 'error');
        }
    }

    function renderPosts() {
        if (!feedContainer) return;

        if (posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                    <p class="text-lg font-medium">No posts yet</p>
                    <p class="text-sm">Be the first to share something!</p>
                </div>
            `;
            return;
        }

        feedContainer.innerHTML = posts.map(post => createPostHTML(post)).join('');

        // Add event listeners to post actions
        setupPostEventListeners();
    }

    function createPostHTML(post) {
        const profile = post.profiles;
        const timeAgo = getTimeAgo(post.created_at);
        const starRating = getStarRating(post.likes_count);
        const avatarInitial = profile?.full_name?.charAt(0).toUpperCase() || 'U';
        
        return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden post-card" data-post-id="${post.id}">
                <!-- Post Header -->
                <div class="p-4 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                            ${profile?.avatar_url ? 
                                `<img src="${profile.avatar_url}" alt="Avatar" class="w-full h-full object-cover rounded-full">` : 
                                avatarInitial
                            }
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-900">${profile?.full_name || 'Anonymous'}</h4>
                            <div class="flex items-center space-x-2 text-sm text-gray-500">
                                <span>${profile?.department || 'Unknown'}</span>
                                <span>•</span>
                                <span>${timeAgo}</span>
                                ${starRating ? `<span>•</span><span>${starRating}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <button class="text-gray-400 hover:text-gray-600 post-menu-btn">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                        </svg>
                    </button>
                </div>

                <!-- Post Content -->
                ${post.content ? `<p class="px-4 pb-3 text-gray-800">${escapeHTML(post.content)}</p>` : ''}
                
                <!-- Post Image -->
                ${post.image_url ? `
                    <div class="relative">
                        <img src="${post.image_url}" alt="Post image" class="w-full max-h-96 object-cover">
                    </div>
                ` : ''}

                <!-- Post Actions -->
                <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                    <div class="flex items-center space-x-6">
                        <button class="flex items-center space-x-2 text-gray-500 hover:text-red-500 transition-colors like-btn ${post.isLiked ? 'text-red-500' : ''}" data-post-id="${post.id}">
                            <svg class="w-5 h-5 ${post.isLiked ? 'fill-current' : ''}" fill="${post.isLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                            </svg>
                            <span class="likes-count">${post.likes_count || 0}</span>
                        </button>
                        <button class="flex items-center space-x-2 text-gray-500 hover:text-blue-500 transition-colors comment-btn" data-post-id="${post.id}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                            </svg>
                            <span>${post.comments_count || 0}</span>
                        </button>
                    </div>
                    <button class="text-gray-500 hover:text-green-500 transition-colors share-btn" data-post-id="${post.id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                        </svg>
                    </button>
                </div>

                <!-- Comments Section (Hidden by default) -->
                <div class="comments-section hidden border-t border-gray-100 p-4" data-post-id="${post.id}">
                    <div class="comments-list space-y-3 mb-3"></div>
                    <div class="flex items-center space-x-2">
                        <input type="text" placeholder="Write a comment..." class="comment-input flex-1 px-3 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:border-blue-500">
                        <button class="send-comment-btn px-4 py-2 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors">Send</button>
                    </div>
                </div>
            </div>
        `;
    }

    function getStarRating(likes) {
        if (likes >= 100) return '⭐⭐⭐⭐⭐ Legendary';
        if (likes >= 50) return '⭐⭐⭐⭐ Viral';
        if (likes >= 10) return '⭐⭐⭐ Popular';
        if (likes >= 5) return '⭐⭐ Rising';
        return '';
    }

    function getTimeAgo(dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function setupPostEventListeners() {
        // Like buttons
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', () => handleLike(btn.dataset.postId));
        });

        // Comment buttons
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', () => toggleComments(btn.dataset.postId));
        });

        // Share buttons
        document.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', () => openShareModal(btn.dataset.postId));
        });

        // Send comment buttons
        document.querySelectorAll('.send-comment-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const section = this.closest('.comments-section');
                const postId = section.dataset.postId;
                const input = section.querySelector('.comment-input');
                if (input.value.trim()) {
                    handleComment(postId, input.value.trim());
                    input.value = '';
                }
            });
        });

        // Comment input enter key
        document.querySelectorAll('.comment-input').forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const section = this.closest('.comments-section');
                    const postId = section.dataset.postId;
                    if (this.value.trim()) {
                        handleComment(postId, this.value.trim());
                        this.value = '';
                    }
                }
            });
        });
    }

    // ==================== LIKE FUNCTIONALITY ====================

    async function handleLike(postId) {
        if (!currentUser) {
            showToast('Please sign in to like posts', 'error');
            return;
        }

        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const likeBtn = postCard.querySelector('.like-btn');
        const likesCountSpan = likeBtn.querySelector('.likes-count');
        const post = posts.find(p => p.id === postId);

        try {
            if (post.isLiked) {
                // Unlike
                const { error } = await supabaseClient
                    .from('likes')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('post_id', postId);

                if (error) throw error;

                post.isLiked = false;
                post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
                likeBtn.classList.remove('text-red-500');
                likeBtn.querySelector('svg').setAttribute('fill', 'none');
            } else {
                // Like
                const { error } = await supabaseClient
                    .from('likes')
                    .insert({
                        user_id: currentUser.id,
                        post_id: postId
                    });

                if (error) throw error;

                post.isLiked = true;
                post.likes_count = (post.likes_count || 0) + 1;
                likeBtn.classList.add('text-red-500');
                likeBtn.querySelector('svg').setAttribute('fill', 'currentColor');
            }

            likesCountSpan.textContent = post.likes_count;
        } catch (error) {
            console.error('Like error:', error);
            showToast('Failed to update like', 'error');
        }
    }

    // ==================== COMMENT FUNCTIONALITY ====================

    async function toggleComments(postId) {
        const commentsSection = document.querySelector(`.comments-section[data-post-id="${postId}"]`);
        
        if (commentsSection.classList.contains('hidden')) {
            commentsSection.classList.remove('hidden');
            await loadComments(postId);
        } else {
            commentsSection.classList.add('hidden');
        }
    }

    async function loadComments(postId) {
        const commentsList = document.querySelector(`.comments-section[data-post-id="${postId}"] .comments-list`);
        
        try {
            const { data, error } = await supabaseClient
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

            if (error) throw error;

            if (data.length === 0) {
                commentsList.innerHTML = '<p class="text-gray-500 text-sm text-center">No comments yet. Be the first!</p>';
            } else {
                commentsList.innerHTML = data.map(comment => `
                    <div class="flex items-start space-x-2">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            ${comment.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div class="flex-1 bg-gray-100 rounded-2xl px-3 py-2">
                            <p class="font-semibold text-sm text-gray-900">${comment.profiles?.full_name || 'Anonymous'}</p>
                            <p class="text-sm text-gray-700">${escapeHTML(comment.content)}</p>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            commentsList.innerHTML = '<p class="text-red-500 text-sm">Failed to load comments</p>';
        }
    }

    async function handleComment(postId, content) {
        if (!currentUser) {
            showToast('Please sign in to comment', 'error');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('comments')
                .insert({
                    user_id: currentUser.id,
                    post_id: postId,
                    content: content
                });

            if (error) throw error;

            // Reload comments
            await loadComments(postId);
            
            // Update comment count in UI
            const post = posts.find(p => p.id === postId);
            if (post) {
                post.comments_count = (post.comments_count || 0) + 1;
                const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"] span`);
                if (commentBtn) {
                    commentBtn.textContent = post.comments_count;
                }
            }

            showToast('Comment added!', 'success');
        } catch (error) {
            console.error('Comment error:', error);
            showToast('Failed to add comment', 'error');
        }
    }

    // ==================== CREATE POST ====================

    function setupCreatePostModal() {
        const postForm = document.getElementById('createPostForm');
        const postContent = document.getElementById('postContent');
        const postDepartment = document.getElementById('postDepartment');
        const postImageInput = document.getElementById('postImage');
        const imagePreview = document.getElementById('imagePreview');
        const charCount = document.getElementById('charCount');
        const closeModalBtn = document.getElementById('closePostModal');

        // Open modal
        if (createPostBtn) {
            createPostBtn.addEventListener('click', () => {
                if (!currentUser) {
                    showToast('Please sign in to create posts', 'error');
                    return;
                }
                postModal.classList.remove('hidden');
                // Pre-select user's department
                if (currentProfile?.department) {
                    postDepartment.value = currentProfile.department;
                }
            });
        }

        // Close modal
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                postModal.classList.add('hidden');
                resetPostForm();
            });
        }

        // Close on backdrop click
        if (postModal) {
            postModal.addEventListener('click', (e) => {
                if (e.target === postModal) {
                    postModal.classList.add('hidden');
                    resetPostForm();
                }
            });
        }

        // Character count
        if (postContent) {
            postContent.addEventListener('input', () => {
                const count = postContent.value.length;
                charCount.textContent = count;
                if (count > 2000) {
                    charCount.classList.add('text-red-500');
                } else {
                    charCount.classList.remove('text-red-500');
                }
            });
        }

        // Image preview
        if (postImageInput) {
            postImageInput.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                        showToast('Image must be less than 10MB', 'error');
                        this.value = '';
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.innerHTML = `
                            <div class="relative">
                                <img src="${e.target.result}" alt="Preview" class="max-h-48 rounded-lg mx-auto">
                                <button type="button" class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 remove-image-btn">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        `;
                        
                        imagePreview.querySelector('.remove-image-btn').addEventListener('click', () => {
                            postImageInput.value = '';
                            imagePreview.innerHTML = `
                                <p class="text-gray-500">Click to upload image</p>
                                <p class="text-gray-400 text-xs">JPG, PNG or GIF (Max 10MB)</p>
                            `;
                        });
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Submit form
        if (postForm) {
            postForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await createPost();
            });
        }

        function resetPostForm() {
            if (postForm) postForm.reset();
            if (charCount) charCount.textContent = '0';
            if (imagePreview) {
                imagePreview.innerHTML = `
                    <p class="text-gray-500">Click to upload image</p>
                    <p class="text-gray-400 text-xs">JPG, PNG or GIF (Max 10MB)</p>
                `;
            }
        }
    }

    async function createPost() {
        const postContent = document.getElementById('postContent');
        const postDepartment = document.getElementById('postDepartment');
        const postImageInput = document.getElementById('postImage');
        const submitBtn = document.getElementById('submitPostBtn');

        const content = postContent.value.trim();
        const department = postDepartment.value;
        const imageFile = postImageInput.files[0];

        if (!department) {
            showToast('Please select a department', 'error');
            return;
        }

        if (!content && !imageFile) {
            showToast('Please add some content or an image', 'error');
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            let imageUrl = null;

            // Upload image if exists
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('post-images')
                    .upload(fileName, imageFile);

                if (uploadError) throw uploadError;

                // Get public URL
                const { data: { publicUrl } } = supabaseClient.storage
                    .from('post-images')
                    .getPublicUrl(fileName);

                imageUrl = publicUrl;
            }

            // Create post
            const { data: newPost, error } = await supabaseClient
                .from('posts')
                .insert({
                    user_id: currentUser.id,
                    content: content || null,
                    department: department,
                    image_url: imageUrl
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

            if (error) throw error;

            // Add to posts array and re-render
            posts.unshift({ ...newPost, isLiked: false });
            renderPosts();

            // Close modal and reset
            postModal.classList.add('hidden');
            document.getElementById('createPostForm').reset();
            document.getElementById('charCount').textContent = '0';

            showToast('Post created successfully!', 'success');

        } catch (error) {
            console.error('Create post error:', error);
            showToast('Failed to create post', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
    }

    // ==================== NOTIFICATIONS ====================

    async function loadNotifications() {
        if (!currentUser) return;

        try {
            const { data, error } = await supabaseClient
                .from('notifications')
                .select(`
                    *,
                    from_user:from_user_id (
                        full_name,
                        avatar_url
                    )
                `)
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            renderNotifications(data || []);
            
            // Update count
            const unreadCount = data?.filter(n => !n.is_read).length || 0;
            if (notificationCount) {
                notificationCount.textContent = unreadCount;
                notificationCount.classList.toggle('hidden', unreadCount === 0);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    function renderNotifications(notifications) {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (notifications.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-4">No notifications yet</p>';
            return;
        }

        list.innerHTML = notifications.map(notification => {
            const icon = getNotificationIcon(notification.type);
            const timeAgo = getTimeAgo(notification.created_at);
            
            return `
                <div class="p-3 hover:bg-gray-50 cursor-pointer ${notification.is_read ? '' : 'bg-blue-50'}" data-notification-id="${notification.id}">
                    <div class="flex items-start space-x-3">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs">
                            ${notification.from_user?.full_name?.charAt(0) || icon}
                        </div>
                        <div class="flex-1">
                            <p class="text-sm">
                                <span class="font-semibold">${notification.from_user?.full_name || 'Someone'}</span>
                                ${notification.message || getNotificationMessage(notification.type)}
                            </p>
                            <p class="text-xs text-gray-500">${timeAgo}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function getNotificationIcon(type) {
        switch (type) {
            case 'like': return '❤️';
            case 'comment': return '💬';
            case 'follow': return '👤';
            default: return '🔔';
        }
    }

    function getNotificationMessage(type) {
        switch (type) {
            case 'like': return 'liked your post';
            case 'comment': return 'commented on your post';
            case 'follow': return 'started following you';
            default: return 'sent you a notification';
        }
    }

    async function markAllNotificationsRead() {
        if (!currentUser) return;

        try {
            const { error } = await supabaseClient
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', currentUser.id)
                .eq('is_read', false);

            if (error) throw error;

            if (notificationCount) {
                notificationCount.classList.add('hidden');
            }
            
            // Update UI
            document.querySelectorAll('#notificationList > div').forEach(el => {
                el.classList.remove('bg-blue-50');
            });
        } catch (error) {
            console.error('Error marking notifications as read:', error);
        }
    }

    // ==================== SHARE MODAL ====================

    function openShareModal(postId) {
        if (shareModal) {
            shareModal.classList.remove('hidden');
            shareModal.dataset.postId = postId;
        }
    }

    function setupShareModal() {
        const closeBtn = document.getElementById('closeShareModal');
        const copyLinkBtn = document.getElementById('copyLinkBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                shareModal.classList.add('hidden');
            });
        }

        if (shareModal) {
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) {
                    shareModal.classList.add('hidden');
                }
            });
        }

        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                const postId = shareModal.dataset.postId;
                const url = `${window.location.origin}/post/${postId}`;
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link copied to clipboard!', 'success');
                    shareModal.classList.add('hidden');
                });
            });
        }
    }

    // ==================== PROFILE MODAL ====================

    function setupProfileModal() {
        const profileBtn = document.getElementById('profileBtn');
        const closeBtn = document.getElementById('closeProfileModal');

        if (profileBtn) {
            profileBtn.addEventListener('click', async () => {
                if (!currentUser) return;
                await showProfile(currentUser.id);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                profileModal.classList.add('hidden');
            });
        }

        if (profileModal) {
            profileModal.addEventListener('click', (e) => {
                if (e.target === profileModal) {
                    profileModal.classList.add('hidden');
                }
            });
        }
    }

    async function showProfile(userId) {
        try {
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            // Update profile modal content
            const profileContent = document.getElementById('profileContent');
            if (profileContent) {
                const isOwnProfile = currentUser && currentUser.id === userId;
                
                profileContent.innerHTML = `
                    <div class="text-center">
                        <div class="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                            ${profile.avatar_url ? 
                                `<img src="${profile.avatar_url}" alt="Avatar" class="w-full h-full object-cover rounded-full">` : 
                                profile.full_name.charAt(0).toUpperCase()
                            }
                        </div>
                        <h2 class="text-xl font-bold text-gray-900">${profile.full_name}</h2>
                        <p class="text-gray-500">${profile.department}</p>
                        ${profile.bio ? `<p class="text-gray-600 mt-2">${profile.bio}</p>` : ''}
                        
                        <div class="flex justify-center space-x-8 mt-6">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-gray-900">${profile.posts_count || 0}</p>
                                <p class="text-sm text-gray-500">Posts</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-gray-900">${profile.followers_count || 0}</p>
                                <p class="text-sm text-gray-500">Followers</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-gray-900">${profile.following_count || 0}</p>
                                <p class="text-sm text-gray-500">Following</p>
                            </div>
                        </div>

                        ${!isOwnProfile ? `
                            <button class="mt-6 px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors follow-profile-btn" data-user-id="${userId}">
                                Follow
                            </button>
                        ` : `
                            <button class="mt-6 px-6 py-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors" onclick="signOut()">
                                Sign Out
                            </button>
                        `}
                    </div>
                `;
            }

            profileModal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading profile:', error);
            showToast('Failed to load profile', 'error');
        }
    }

    // ==================== FILTERS ====================

    function setupFilters() {
        // Tab filters
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                loadPosts();
            });
        });

        // Department filters
        document.querySelectorAll('.department-filter').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.department-filter').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentDepartmentFilter = this.dataset.department || null;
                loadPosts();
            });
        });
    }

    // ==================== REAL-TIME SUBSCRIPTIONS ====================

    function setupRealtimeSubscriptions() {
        // Subscribe to new posts
        supabaseClient
            .channel('public:posts')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'posts' 
            }, async (payload) => {
                // Fetch the complete post with profile
                const { data, error } = await supabaseClient
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
                    .eq('id', payload.new.id)
                    .single();

                if (!error && data) {
                    // Only add if not already in the list
                    if (!posts.find(p => p.id === data.id)) {
                        posts.unshift({ ...data, isLiked: false });
                        renderPosts();
                    }
                }
            })
            .subscribe();

        // Subscribe to notifications for current user
        if (currentUser) {
            supabaseClient
                .channel(`notifications:${currentUser.id}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${currentUser.id}`
                }, () => {
                    loadNotifications();
                })
                .subscribe();
        }
    }

    // ==================== EVENT LISTENERS ====================

    function setupEventListeners() {
        setupCreatePostModal();
        setupShareModal();
        setupProfileModal();
        setupFilters();

        // Notification dropdown toggle
        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => {
                notificationDropdown.classList.toggle('hidden');
            });
        }

        // Mark all read button
        const markAllReadBtn = document.getElementById('markAllReadBtn');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', markAllNotificationsRead);
        }

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (notificationDropdown && !notificationBtn?.contains(e.target) && !notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.add('hidden');
            }
        });

        // Sign out handler
        window.signOut = async function() {
            try {
                const { error } = await supabaseClient.auth.signOut();
                if (error) throw error;
                window.location.href = 'sign-in.html';
            } catch (error) {
                console.error('Sign out error:', error);
                showToast('Failed to sign out', 'error');
            }
        };
    }
});