// index.js - Main application logic
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing app...');
    
    // State
    let currentUser = null;
    let currentProfile = null;
    let posts = [];
    let currentFilter = 'all';
    let currentDepartmentFilter = null;
    let selectedPostForShare = null;

    // DOM Elements
    const postsContainer = document.getElementById('postsContainer');
    const uploadModal = document.getElementById('uploadModal');
    const shareModal = document.getElementById('shareModal');
    const profileModal = document.getElementById('profileModal');
    const notificationBell = document.getElementById('notificationBell');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const notificationBadge = document.getElementById('notificationBadge');
    const currentUserAvatar = document.getElementById('currentUserAvatar');
    const currentUserName = document.getElementById('currentUserName');
    const userProfile = document.getElementById('userProfile');

    // Initialize app
    await init();

    async function init() {
        try {
            console.log('Checking authentication...');
            
            // Check if user is logged in
            const isLoggedIn = await window.isLoggedIn();
            
            if (!isLoggedIn) {
                console.log('Not logged in, redirecting to sign-in...');
                window.location.href = 'sign-in.html';
                return;
            }

            // Get current user and profile
            currentUser = await window.getCurrentUser();
            currentProfile = await window.getCurrentProfile();

            console.log('Current user:', currentUser);
            console.log('Current profile:', currentProfile);

            if (!currentUser || !currentProfile) {
                console.error('Failed to load user or profile');
                window.location.href = 'sign-in.html';
                return;
            }

            // Update UI with user info
            updateUserUI();

            // Load departments
            loadDepartments();

            // Load initial data
            await loadPosts();
            await loadNotifications();
            await loadTrends();

            // Set up event listeners
            setupEventListeners();

            console.log('App initialized successfully!');
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to load app. Please try refreshing the page.');
        }
    }

    function updateUserUI() {
        if (!currentProfile) return;

        console.log('Updating UI with profile:', currentProfile);

        // Get initials
        const initials = getInitials(currentProfile.full_name);

        // Update header avatar
        if (currentUserAvatar) {
            currentUserAvatar.textContent = initials;
            currentUserAvatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            currentUserAvatar.style.color = 'white';
        }

        // Update header username
        if (currentUserName) {
            currentUserName.textContent = currentProfile.full_name;
        }

        // Update modal avatar and username
        const modalUserAvatar = document.getElementById('modalUserAvatar');
        const modalUserName = document.getElementById('modalUserName');
        
        if (modalUserAvatar) {
            modalUserAvatar.textContent = initials;
        }
        
        if (modalUserName) {
            modalUserName.textContent = currentProfile.full_name;
        }

        console.log('UI updated with user info');
    }

    function getInitials(name) {
        if (!name) return 'U';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    // ==================== DEPARTMENTS ====================

    function loadDepartments() {
        const departmentSelect = document.getElementById('departmentSelect');
        const departmentTags = document.getElementById('departmentTags');

        const departments = window.DEPARTMENTS || [
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

        // Populate department select
        if (departmentSelect) {
            departmentSelect.innerHTML = '<option value="">Select your department</option>' +
                departments.map(dept => `<option value="${dept}">${dept}</option>`).join('');
            
            // Pre-select current user's department
            if (currentProfile?.department) {
                departmentSelect.value = currentProfile.department;
            }
        }

        // Populate department tags in sidebar
        if (departmentTags) {
            departmentTags.innerHTML = `
                <div class="department-tag active" data-department="">All</div>
                ${departments.map(dept => 
                    `<div class="department-tag" data-department="${dept}">${dept}</div>`
                ).join('')}
            `;

            // Add click handlers
            departmentTags.querySelectorAll('.department-tag').forEach(tag => {
                tag.addEventListener('click', function() {
                    departmentTags.querySelectorAll('.department-tag').forEach(t => 
                        t.classList.remove('active')
                    );
                    this.classList.add('active');
                    currentDepartmentFilter = this.dataset.department || null;
                    loadPosts();
                });
            });
        }
    }

    // ==================== POSTS ====================

    async function loadPosts() {
        try {
            console.log('Loading posts...');
            showLoading();

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
                .order('created_at', { ascending: false });

            // Apply filters
            if (currentFilter === 'popular') {
                query = query.gte('likes_count', 5).order('likes_count', { ascending: false });
            } else if (currentFilter === 'recent') {
                query = query.order('created_at', { ascending: false });
            }

            if (currentDepartmentFilter) {
                query = query.eq('department', currentDepartmentFilter);
            }

            const { data, error } = await query.limit(50);

            if (error) {
                console.error('Error loading posts:', error);
                throw error;
            }

            posts = data || [];
            console.log('Loaded posts:', posts.length);

            // Check which posts the current user has liked
            if (currentUser && posts.length > 0) {
                const postIds = posts.map(p => p.id);
                const { data: userLikes } = await window.supabaseClient
                    .from('likes')
                    .select('post_id')
                    .eq('user_id', currentUser.id)
                    .in('post_id', postIds);

                const likedPostIds = new Set(userLikes?.map(l => l.post_id) || []);
                posts = posts.map(post => ({
                    ...post,
                    isLiked: likedPostIds.has(post.id)
                }));
            }

            renderPosts();
        } catch (error) {
            console.error('Error loading posts:', error);
            showError('Failed to load posts');
        }
    }

    function showLoading() {
        if (postsContainer) {
            postsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="border: 3px solid #f3f4f6; border-top: 3px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                    <p style="color: #6b7280; margin-top: 10px;">Loading posts...</p>
                </div>
            `;
        }
    }

    function showError(message) {
        if (postsContainer) {
            postsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 10px;"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    function renderPosts() {
        if (!postsContainer) return;

        if (posts.length === 0) {
            postsContainer.innerHTML = `
                <div class="post-card" style="text-align: center; padding: 60px 20px;">
                    <i class="fas fa-image" style="font-size: 64px; color: #e5e7eb; margin-bottom: 20px;"></i>
                    <h3 style="color: #374151; margin-bottom: 10px;">No posts yet</h3>
                    <p style="color: #6b7280;">Be the first to share something with the campus!</p>
                </div>
            `;
            return;
        }

        postsContainer.innerHTML = posts.map(post => createPostHTML(post)).join('');
        setupPostEventListeners();
    }

    function createPostHTML(post) {
        const profile = post.profiles;
        const timeAgo = window.timeAgo(post.created_at);
        const starRating = window.getStarRating(post.likes_count);
        const initials = getInitials(profile?.full_name || 'User');
        const isOwnPost = currentUser && post.user_id === currentUser.id;
        
        // Generate star rating HTML
        let starHTML = '';
        if (starRating.stars > 0) {
            const stars = Array(starRating.stars).fill('<i class="fas fa-star"></i>').join('');
            starHTML = `<span class="star-rating-badge stars-${starRating.stars}">${stars}<span class="star-rating-label">${starRating.label}</span></span>`;
        }
        
        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar" style="background: linear-gradient(135deg, #667eea, #764ba2);">${initials}</div>
                    <div class="post-user-info">
                        <div class="post-username-container">
                            <div class="post-username">${escapeHTML(profile?.full_name || 'Anonymous')}</div>
                            ${!isOwnPost ? `<button class="follow-btn" data-user-id="${post.user_id}">Follow</button>` : ''}
                        </div>
                        <div class="post-meta">
                            ${timeAgo}
                            <span>•</span>
                            <span class="post-department">${escapeHTML(post.department || profile?.department || 'Unknown')}</span>
                            ${starHTML}
                        </div>
                    </div>
                </div>

                ${post.content ? `<div class="post-content"><div class="post-content-text">${escapeHTML(post.content)}</div></div>` : ''}
                
                ${post.image_url ? `
                    <div class="post-image-container">
                        <img src="${post.image_url}" alt="Post image" class="post-image">
                    </div>
                ` : ''}

                <div class="post-stats">
                    <div class="post-stats-left">
                        ${post.likes_count > 0 ? `
                            <i class="fas fa-heart" style="color: #e74c3c;"></i>
                            <span>${post.likes_count}</span>
                        ` : ''}
                    </div>
                    <div class="post-stats-right">
                        ${post.comments_count > 0 ? `<span>${post.comments_count} comment${post.comments_count !== 1 ? 's' : ''}</span>` : ''}
                    </div>
                </div>

                <div class="post-actions">
                    <button class="action-btn like-btn ${post.isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                        <i class="${post.isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span>Like</span>
                    </button>
                    <button class="action-btn comment-btn" data-post-id="${post.id}">
                        <i class="far fa-comment"></i>
                        <span>Comment</span>
                    </button>
                    <button class="action-btn share-btn" data-post-id="${post.id}">
                        <i class="far fa-share-square"></i>
                        <span>Share</span>
                    </button>
                </div>

                <div class="comments-section" data-post-id="${post.id}">
                    <div class="comments-list"></div>
                </div>
            </div>
        `;
    }

    function escapeHTML(str) {
        if (!str) return '';
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

        // Follow buttons
        document.querySelectorAll('.follow-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const userId = this.dataset.userId;
                await handleFollow(userId, this);
            });
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

    // ==================== FOLLOW FUNCTIONALITY ====================

    async function handleFollow(userId, buttonElement) {
        if (!userId) return;

        try {
            const result = await window.toggleFollow(userId);
            
            if (result.success) {
                if (result.following) {
                    buttonElement.textContent = 'Following';
                    buttonElement.classList.add('following');
                    showToast('Now following!', 'success');
                } else {
                    buttonElement.textContent = 'Follow';
                    buttonElement.classList.remove('following');
                    showToast('Unfollowed', 'success');
                }
            }
        } catch (error) {
            console.error('Follow error:', error);
            showToast('Failed to update follow status', 'error');
        }
    }

    // ==================== LIKE FUNCTIONALITY ====================

    async function handleLike(postId) {
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
        const likesCountSpan = likeBtn.querySelector('.likes-count');

        try {
            const result = await window.toggleLike(postId);
            
            if (result.success) {
                post.isLiked = result.liked;
                post.likes_count = result.liked 
                    ? (post.likes_count || 0) + 1 
                    : Math.max(0, (post.likes_count || 1) - 1);

                likeBtn.classList.toggle('liked', post.isLiked);
                likesCountSpan.textContent = post.likes_count;
            }
        } catch (error) {
            console.error('Like error:', error);
            showToast('Failed to update like', 'error');
        }
    }

    // ==================== COMMENT FUNCTIONALITY ====================

    async function toggleComments(postId) {
        const commentsSection = document.querySelector(`.comments-section[data-post-id="${postId}"]`);
        
        if (commentsSection.style.display === 'none') {
            commentsSection.style.display = 'block';
            await loadComments(postId);
        } else {
            commentsSection.style.display = 'none';
        }
    }

    async function loadComments(postId) {
        const commentsList = document.querySelector(`.comments-section[data-post-id="${postId}"] .comments-list`);
        
        try {
            const result = await window.getComments(postId);
            
            if (result.success && result.comments) {
                if (result.comments.length === 0) {
                    commentsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No comments yet</p>';
                } else {
                    commentsList.innerHTML = result.comments.map(comment => {
                        const initials = getInitials(comment.profiles?.full_name || 'User');
                        return `
                            <div class="comment">
                                <div class="user-avatar small">${initials}</div>
                                <div class="comment-content">
                                    <div class="comment-username">${escapeHTML(comment.profiles?.full_name || 'Anonymous')}</div>
                                    <div class="comment-text">${escapeHTML(comment.content)}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            commentsList.innerHTML = '<p style="color: #ef4444;">Failed to load comments</p>';
        }
    }

    async function handleComment(postId, content) {
        try {
            const result = await window.addComment(postId, content);
            
            if (result.success) {
                await loadComments(postId);
                
                // Update comment count
                const post = posts.find(p => p.id === postId);
                if (post) {
                    post.comments_count = (post.comments_count || 0) + 1;
                    const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"] span`);
                    if (commentBtn) {
                        commentBtn.textContent = post.comments_count;
                    }
                }
                
                showToast('Comment added!', 'success');
            }
        } catch (error) {
            console.error('Comment error:', error);
            showToast('Failed to add comment', 'error');
        }
    }

    // ==================== CREATE POST ====================

    function setupCreatePostModal() {
        const openUploadModal = document.getElementById('openUploadModal');
        const closeUploadModal = document.getElementById('closeUploadModal');
        const imageUploadArea = document.getElementById('imageUploadArea');
        const imageInput = document.getElementById('imageInput');
        const imagePreview = document.getElementById('imagePreview');
        const imagePreviewContainer = document.getElementById('imagePreviewContainer');
        const uploadPlaceholder = document.getElementById('uploadPlaceholder');
        const removeImageBtn = document.getElementById('removeImageBtn');
        const postDescription = document.getElementById('postDescription');
        const charCount = document.getElementById('charCount');
        const submitPostBtn = document.getElementById('submitPostBtn');

        // Open modal
        if (openUploadModal) {
            openUploadModal.addEventListener('click', () => {
                uploadModal.classList.add('show');
            });
        }

        // Close modal
        if (closeUploadModal) {
            closeUploadModal.addEventListener('click', () => {
                uploadModal.classList.remove('show');
                resetUploadForm();
            });
        }

        // Click outside to close
        if (uploadModal) {
            uploadModal.addEventListener('click', (e) => {
                if (e.target === uploadModal) {
                    uploadModal.classList.remove('show');
                    resetUploadForm();
                }
            });
        }

        // Image upload area click
        if (imageUploadArea) {
            imageUploadArea.addEventListener('click', () => {
                imageInput.click();
            });
        }

        // Image selection
        if (imageInput) {
            imageInput.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                        showToast('Image must be less than 10MB', 'error');
                        this.value = '';
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.src = e.target.result;
                        uploadPlaceholder.style.display = 'none';
                        imagePreviewContainer.style.display = 'block';
                        validateForm();
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Remove image
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                imageInput.value = '';
                uploadPlaceholder.style.display = 'flex';
                imagePreviewContainer.style.display = 'none';
                validateForm();
            });
        }

        // Character count
        if (postDescription) {
            postDescription.addEventListener('input', () => {
                charCount.textContent = postDescription.value.length;
                validateForm();
            });
        }

        // Form validation
        function validateForm() {
            const departmentSelect = document.getElementById('departmentSelect');
            const hasImage = imageInput.files.length > 0;
            const hasDescription = postDescription.value.trim().length > 0;
            const hasDepartment = departmentSelect.value !== '';

            submitPostBtn.disabled = !hasDepartment || (!hasImage && !hasDescription);
        }

        // Department select change
        const departmentSelect = document.getElementById('departmentSelect');
        if (departmentSelect) {
            departmentSelect.addEventListener('change', validateForm);
        }

        // Submit post
        if (submitPostBtn) {
            submitPostBtn.addEventListener('click', createPost);
        }

        function resetUploadForm() {
            imageInput.value = '';
            postDescription.value = '';
            charCount.textContent = '0';
            uploadPlaceholder.style.display = 'flex';
            imagePreviewContainer.style.display = 'none';
            submitPostBtn.disabled = true;
        }
    }

    async function createPost() {
        const departmentSelect = document.getElementById('departmentSelect');
        const postDescription = document.getElementById('postDescription');
        const imageInput = document.getElementById('imageInput');
        const submitPostBtn = document.getElementById('submitPostBtn');
        const submitBtnText = document.getElementById('submitBtnText');

        const department = departmentSelect.value;
        const content = postDescription.value.trim();
        const imageFile = imageInput.files[0];

        if (!department) {
            showToast('Please select a department', 'error');
            return;
        }

        submitPostBtn.disabled = true;
        submitBtnText.textContent = 'Posting...';

        try {
            const result = await window.createPost(content, imageFile, department);

            if (result.success) {
                showToast('Post created successfully!', 'success');
                uploadModal.classList.remove('show');
                
                // Reset form
                departmentSelect.value = currentProfile?.department || '';
                postDescription.value = '';
                imageInput.value = '';
                document.getElementById('charCount').textContent = '0';
                document.getElementById('uploadPlaceholder').style.display = 'flex';
                document.getElementById('imagePreviewContainer').style.display = 'none';

                // Reload posts
                await loadPosts();
            } else {
                showToast(result.error || 'Failed to create post', 'error');
            }
        } catch (error) {
            console.error('Create post error:', error);
            showToast('Failed to create post', 'error');
        } finally {
            submitPostBtn.disabled = false;
            submitBtnText.textContent = 'Post';
        }
    }

    // ==================== NOTIFICATIONS ====================

    async function loadNotifications() {
        try {
            const result = await window.getNotifications();
            
            if (result.success && result.notifications) {
                const unreadCount = result.notifications.filter(n => !n.is_read).length;
                
                if (notificationBadge) {
                    notificationBadge.textContent = unreadCount;
                    notificationBadge.style.display = unreadCount > 0 ? 'block' : 'none';
                }

                renderNotifications(result.notifications);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    function renderNotifications(notifications) {
        const notificationList = document.getElementById('notificationList');
        if (!notificationList) return;

        if (notifications.length === 0) {
            notificationList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No notifications yet</p>';
            return;
        }

        notificationList.innerHTML = notifications.map(notif => {
            const timeAgo = window.timeAgo(notif.created_at);
            const initials = getInitials(notif.from_user?.full_name || 'User');
            
            return `
                <div class="notification-item ${notif.is_read ? '' : 'unread'}">
                    <div class="user-avatar small">${initials}</div>
                    <div class="notification-content">
                        <p><strong>${escapeHTML(notif.from_user?.full_name || 'Someone')}</strong> ${escapeHTML(notif.message || 'interacted with your post')}</p>
                        <span class="notification-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==================== TRENDS ====================

    async function loadTrends() {
        const trendsList = document.getElementById('trendsList');
        if (!trendsList) return;

        // For now, show static trends - you can make this dynamic later
        const trends = [
            { tag: 'CampusLife', posts: 245 },
            { tag: 'UEWEvents', posts: 189 },
            { tag: 'StudyTips', posts: 156 },
            { tag: 'SportsDay', posts: 134 }
        ];

        trendsList.innerHTML = trends.map(trend => `
            <div class="trend-item">
                <div class="trend-tag">#${trend.tag}</div>
                <div class="trend-count">${trend.posts} posts</div>
            </div>
        `).join('');
    }

    // ==================== SHARE MODAL ====================

    function openShareModal(postId) {
        selectedPostForShare = postId;
        if (shareModal) {
            shareModal.classList.add('show');
        }
    }

    function setupShareModal() {
        const closeShareModal = document.getElementById('closeShareModal');
        const copyLink = document.getElementById('copyLink');

        if (closeShareModal) {
            closeShareModal.addEventListener('click', () => {
                shareModal.classList.remove('show');
            });
        }

        if (shareModal) {
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) {
                    shareModal.classList.remove('show');
                }
            });
        }

        if (copyLink) {
            copyLink.addEventListener('click', () => {
                const url = `${window.location.origin}/index.html?post=${selectedPostForShare}`;
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link copied to clipboard!', 'success');
                    shareModal.classList.remove('show');
                });
            });
        }
    }

    // ==================== EVENT LISTENERS ====================

    function setupEventListeners() {
        setupCreatePostModal();
        setupShareModal();

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                loadPosts();
            });
        });

        // Notification bell
        if (notificationBell) {
            notificationBell.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('show');
            });
        }

        // Mark all read
        const markAllRead = document.getElementById('markAllRead');
        if (markAllRead) {
            markAllRead.addEventListener('click', async () => {
                await window.markAllNotificationsRead();
                await loadNotifications();
            });
        }

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (notificationDropdown && !notificationBell.contains(e.target) && !notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.remove('show');
            }
        });

        // User profile click
        if (userProfile) {
            userProfile.addEventListener('click', () => {
                window.location.href = 'user-profile.html';
            });
        }
    }

    // ==================== TOAST ====================

    function showToast(message, type = 'success') {
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
        }
    }

    // Make showToast available globally
    window.showToast = showToast;
});