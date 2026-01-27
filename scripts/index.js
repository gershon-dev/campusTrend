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

            // Check which posts the current user has liked and who they're following
            if (currentUser && posts.length > 0) {
                const postIds = posts.map(p => p.id);
                const userIds = [...new Set(posts.map(p => p.user_id))].filter(id => id !== currentUser.id);

                // Get liked posts
                const { data: likes } = await window.supabaseClient
                    .from('likes')
                    .select('post_id')
                    .eq('user_id', currentUser.id)
                    .in('post_id', postIds);

                const likedPostIds = new Set(likes?.map(l => l.post_id) || []);

                // Get following status
                const { data: following } = await window.supabaseClient
                    .from('followers')
                    .select('following_id')
                    .eq('follower_id', currentUser.id)
                    .in('following_id', userIds);

                const followingIds = new Set(following?.map(f => f.following_id) || []);

                // Update posts with like and follow status
                posts = posts.map(post => ({
                    ...post,
                    isLiked: likedPostIds.has(post.id),
                    isFollowing: followingIds.has(post.user_id)
                }));
            }

            renderPosts();
        } catch (error) {
            console.error('Error loading posts:', error);
            showError('Failed to load posts. Please try refreshing the page.');
        }
    }

    function showLoading() {
        if (postsContainer) {
            postsContainer.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading posts...</p>
                </div>
            `;
        }
    }

    function showError(message) {
        if (postsContainer) {
            postsContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    function renderPosts() {
        if (!postsContainer) return;

        if (posts.length === 0) {
            postsContainer.innerHTML = `
                <div class="no-posts">
                    <i class="fas fa-image"></i>
                    <h3>No posts yet</h3>
                    <p>Be the first to share something!</p>
                </div>
            `;
            return;
        }

        postsContainer.innerHTML = posts.map(post => createPostHTML(post)).join('');

        // Add event listeners to all posts
        posts.forEach(post => {
            setupPostEventListeners(post.id);
        });
    }

    function createPostHTML(post) {
        const profile = post.profiles || {};
        const initials = getInitials(profile.full_name || 'User');
        const timeAgo = window.timeAgo(post.created_at);
        const isOwnPost = currentUser && post.user_id === currentUser.id;
        const starRating = window.getStarRating(post.likes_count);

        // Truncate description for "see more" functionality
        const maxLength = 200;
        const description = post.content || '';
        const needsTruncation = description.length > maxLength;
        const truncatedDescription = needsTruncation ? description.substring(0, maxLength) + '...' : description;

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-user-info" onclick="window.openUserProfile('${post.user_id}')">
                        <div class="user-avatar" style="background: linear-gradient(135deg, #${Math.random().toString(16).substr(-6)}, #${Math.random().toString(16).substr(-6)})">
                            ${initials}
                        </div>
                        <div>
                            <div class="post-username">
                                ${escapeHTML(profile.full_name || 'Unknown User')}
                                ${isOwnPost ? '<span class="own-post-badge">You</span>' : ''}
                            </div>
                            <div class="post-meta">
                                <i class="fas fa-graduation-cap"></i>
                                ${escapeHTML(profile.department || 'Unknown')}
                                <span class="post-time">${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                    ${!isOwnPost ? `
                        <button class="follow-btn ${post.isFollowing ? 'following' : ''}" data-user-id="${post.user_id}">
                            <i class="fas ${post.isFollowing ? 'fa-user-check' : 'fa-user-plus'}"></i>
                            <span>${post.isFollowing ? 'Following' : 'Follow'}</span>
                        </button>
                    ` : ''}
                </div>

                ${description ? `
                    <div class="post-description">
                        <p class="description-text ${needsTruncation ? 'truncated' : ''}" data-full-text="${escapeHTML(description)}">
                            ${escapeHTML(truncatedDescription)}
                        </p>
                        ${needsTruncation ? `
                            <button class="see-more-btn" data-action="expand">
                                See more
                            </button>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="post-image-container">
                    <img src="${post.image_url}" alt="Post image" class="post-image">
                    ${starRating.stars > 0 ? `
                        <div class="star-rating-badge stars-${starRating.stars}">
                            ${Array(starRating.stars).fill('<i class="fas fa-star"></i>').join('')}
                            <span class="star-rating-label">${starRating.label}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="post-stats">
                    <span class="stat-item">
                        <i class="fas fa-heart"></i>
                        <span class="likes-count">${post.likes_count || 0}</span> likes
                    </span>
                    <span class="stat-item">
                        <i class="fas fa-comment"></i>
                        <span class="comments-count">${post.comments_count || 0}</span> comments
                    </span>
                    <span class="stat-item">
                        <i class="fas fa-share"></i>
                        ${post.shares_count || 0} shares
                    </span>
                </div>

                <div class="post-actions">
                    <button class="action-btn like-btn ${post.isLiked ? 'liked' : ''}" data-action="like">
                        <i class="fas fa-heart"></i>
                        <span>Like</span>
                    </button>
                    <button class="action-btn comment-btn" data-action="comment">
                        <i class="fas fa-comment"></i>
                        <span>Comment</span>
                    </button>
                    <button class="action-btn share-btn" data-action="share">
                        <i class="fas fa-share"></i>
                        <span>Share</span>
                    </button>
                </div>

                <div class="comments-section" data-post-id="${post.id}">
                    <div class="comment-input-wrapper">
                        <div class="user-avatar small">${getInitials(currentProfile?.full_name || 'U')}</div>
                        <input 
                            type="text" 
                            class="comment-input" 
                            placeholder="Write a comment..."
                            data-post-id="${post.id}"
                        >
                        <button class="send-comment-btn" data-post-id="${post.id}" disabled>
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div class="comments-list" data-post-id="${post.id}">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
            </div>
        `;
    }

    function setupPostEventListeners(postId) {
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (!postCard) return;

        // Like button
        const likeBtn = postCard.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', () => handleLike(postId));
        }

        // Comment button - toggle comments section and scroll to comment input
        const commentBtn = postCard.querySelector('.comment-btn');
        if (commentBtn) {
            commentBtn.addEventListener('click', () => {
                const commentsSection = postCard.querySelector('.comments-section');
                const commentInput = postCard.querySelector('.comment-input');
                
                if (commentsSection) {
                    // Toggle the show class to make comments visible
                    commentsSection.classList.toggle('show');
                    
                    // If showing comments, focus on input
                    if (commentsSection.classList.contains('show') && commentInput) {
                        setTimeout(() => {
                            commentInput.focus();
                            commentInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }
            });
        }

        // Share button
        const shareBtn = postCard.querySelector('.share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => openShareModal(postId));
        }

        // Follow button
        const followBtn = postCard.querySelector('.follow-btn');
        if (followBtn) {
            const userId = followBtn.dataset.userId;
            followBtn.addEventListener('click', () => handleFollow(userId, followBtn));
        }

        // See more/less button
        const seeMoreBtn = postCard.querySelector('.see-more-btn');
        if (seeMoreBtn) {
            seeMoreBtn.addEventListener('click', function() {
                const descriptionText = postCard.querySelector('.description-text');
                const fullText = descriptionText.dataset.fullText;
                const isExpanded = this.dataset.action === 'collapse';

                if (isExpanded) {
                    // Collapse
                    const maxLength = 200;
                    descriptionText.textContent = fullText.substring(0, maxLength) + '...';
                    this.textContent = 'See more';
                    this.dataset.action = 'expand';
                    descriptionText.classList.add('truncated');
                } else {
                    // Expand
                    descriptionText.textContent = fullText;
                    this.textContent = 'See less';
                    this.dataset.action = 'collapse';
                    descriptionText.classList.remove('truncated');
                }
            });
        }

        // Comment input
        const commentInput = postCard.querySelector('.comment-input');
        const sendCommentBtn = postCard.querySelector('.send-comment-btn');
        
        if (commentInput && sendCommentBtn) {
            commentInput.addEventListener('input', () => {
                sendCommentBtn.disabled = !commentInput.value.trim();
            });

            commentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && commentInput.value.trim()) {
                    handleComment(postId, commentInput.value.trim());
                }
            });

            sendCommentBtn.addEventListener('click', () => {
                if (commentInput.value.trim()) {
                    handleComment(postId, commentInput.value.trim());
                }
            });
        }

        // Load comments for this post
        loadComments(postId);
    }

    // ==================== PROFILE MODAL ====================

    window.openUserProfile = async function(userId) {
        try {
            if (!userId) return;

            console.log('Opening profile for user:', userId);

            // Fetch user profile data
            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
                showToast('Failed to load profile', 'error');
                return;
            }

            // Fetch user's posts count
            const { count: postsCount } = await window.supabaseClient
                .from('posts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            // Fetch followers count
            const { count: followersCount } = await window.supabaseClient
                .from('followers')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', userId);

            // Fetch following count
            const { count: followingCount } = await window.supabaseClient
                .from('followers')
                .select('*', { count: 'exact', head: true })
                .eq('follower_id', userId);

            // Calculate total likes and stars from user's posts
            let totalLikes = 0;
            let totalStars = 0;

            if (userPosts) {
                userPosts.forEach(post => {
                    totalLikes += post.likes_count || 0;
                    const rating = window.getStarRating(post.likes_count || 0);
                    totalStars += rating.stars;
                });
            }

            // Check if current user is following this user
            let isFollowing = false;
            if (currentUser && userId !== currentUser.id) {
                const { data: followData } = await window.supabaseClient
                    .from('followers')
                    .select('id')
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', userId)
                    .maybeSingle();
                
                isFollowing = !!followData;
            }

            // Fetch user's full posts with profile data
            const { data: userPosts } = await window.supabaseClient
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
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            // Update modal content
            const initials = getInitials(profile.full_name);
            const profileModalAvatar = document.getElementById('profileModalAvatar');
            const profileModalName = document.getElementById('profileModalName');
            const profileModalDepartment = document.getElementById('profileModalDepartment');
            const profilePostsCount = document.getElementById('profilePostsCount');
            const profileFollowersCount = document.getElementById('profileFollowersCount');
            const profileFollowingCount = document.getElementById('profileFollowingCount');
            const profileFollowBtn = document.getElementById('profileFollowBtn');

            if (profileModalAvatar) {
                profileModalAvatar.textContent = initials;
                profileModalAvatar.style.background = `linear-gradient(135deg, #${Math.random().toString(16).substr(-6)}, #${Math.random().toString(16).substr(-6)})`;
            }

            if (profileModalName) {
                profileModalName.textContent = profile.full_name || 'Unknown User';
            }

            if (profileModalDepartment) {
                profileModalDepartment.textContent = profile.department || 'No department specified';
            }

            if (profilePostsCount) {
                profilePostsCount.textContent = postsCount || 0;
            }

            if (profileFollowersCount) {
                profileFollowersCount.textContent = followersCount || 0;
            }

            if (profileFollowingCount) {
                profileFollowingCount.textContent = followingCount || 0;
            }

            // Add total likes and stars stats
            const statsContainer = document.querySelector('.profile-modal-stats');
            if (statsContainer) {
                // Check if we already added the extra stats
                if (!document.getElementById('profileTotalLikes')) {
                    statsContainer.innerHTML += `
                        <div class="profile-stat">
                            <div class="profile-stat-value" id="profileTotalLikes">${totalLikes}</div>
                            <div class="profile-stat-label">Total Likes</div>
                        </div>
                        <div class="profile-stat">
                            <div class="profile-stat-value" id="profileTotalStars">${totalStars}</div>
                            <div class="profile-stat-label">Total Stars</div>
                        </div>
                    `;
                } else {
                    document.getElementById('profileTotalLikes').textContent = totalLikes;
                    document.getElementById('profileTotalStars').textContent = totalStars;
                }
            }

            // Update follow button
            if (profileFollowBtn) {
                if (userId === currentUser.id) {
                    // It's the current user's profile
                    profileFollowBtn.style.display = 'none';
                } else {
                    profileFollowBtn.style.display = 'block';
                    profileFollowBtn.textContent = isFollowing ? 'Following' : 'Follow';
                    profileFollowBtn.className = isFollowing ? 'profile-follow-btn following' : 'profile-follow-btn';
                    profileFollowBtn.dataset.userId = userId;
                    profileFollowBtn.dataset.following = isFollowing;

                    // Remove old event listeners and add new one
                    const newBtn = profileFollowBtn.cloneNode(true);
                    profileFollowBtn.parentNode.replaceChild(newBtn, profileFollowBtn);
                    
                    newBtn.addEventListener('click', async function() {
                        const success = await handleFollow(userId, newBtn);
                        if (success) {
                            const nowFollowing = newBtn.dataset.following === 'false';
                            newBtn.dataset.following = nowFollowing;
                            newBtn.textContent = nowFollowing ? 'Following' : 'Follow';
                            newBtn.className = nowFollowing ? 'profile-follow-btn following' : 'profile-follow-btn';
                            
                            // Update follower count
                            if (profileFollowersCount) {
                                const currentCount = parseInt(profileFollowersCount.textContent);
                                profileFollowersCount.textContent = nowFollowing ? currentCount + 1 : currentCount - 1;
                            }
                        }
                    });
                }
            }

            // Add user's posts section
            const modalBody = profileModal.querySelector('.modal-body');
            let postsSection = modalBody.querySelector('.profile-posts-section');
            
            if (!postsSection) {
                postsSection = document.createElement('div');
                postsSection.className = 'profile-posts-section';
                modalBody.querySelector('.profile-modal-content').appendChild(postsSection);
            }

            if (userPosts && userPosts.length > 0) {
                // Get liked posts for this user
                let likedPostIds = [];
                if (currentUser) {
                    const { data: likedData } = await window.supabaseClient
                        .from('likes')
                        .select('post_id')
                        .eq('user_id', currentUser.id)
                        .in('post_id', userPosts.map(p => p.id));
                    
                    if (likedData) {
                        likedPostIds = likedData.map(l => l.post_id);
                    }
                }

                postsSection.innerHTML = `
                    <h3 style="font-size: 16px; margin: 20px 0 15px 0; text-align: left; color: #050505;">
                        <i class="fas fa-images"></i> Posts (${postsCount})
                    </h3>
                    <div class="profile-posts-container">
                        ${userPosts.map(post => createProfilePostHTML(post, likedPostIds.includes(post.id))).join('')}
                    </div>
                `;

                // Add event listeners to the profile posts
                setupProfilePostListeners(postsSection);
            } else {
                postsSection.innerHTML = `
                    <p style="text-align: center; color: #65676b; margin-top: 20px;">
                        <i class="fas fa-image"></i><br>No posts yet
                    </p>
                `;
            }

            // Show modal
            if (profileModal) {
                profileModal.classList.add('show');
            }

        } catch (error) {
            console.error('Error opening profile:', error);
            showToast('Failed to load profile', 'error');
        }
    };

    // Helper function to create HTML for posts in profile modal
    function createProfilePostHTML(post, isLiked) {
        const profile = post.profiles || {};
        const initials = getInitials(profile.full_name || 'User');
        const timeAgo = window.timeAgo(post.created_at);
        const starRating = window.getStarRating(post.likes_count || 0);
        const avatarColor = stringToColor(profile.full_name || 'User');
        
        // Truncate description if too long
        const maxLength = 200;
        const description = post.description || '';
        const truncated = description.length > maxLength;
        const displayDescription = truncated ? description.substring(0, maxLength) + '...' : description;

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-user" onclick="window.openUserProfile('${post.user_id}')">
                        <div class="user-avatar" style="background: ${avatarColor}">
                            ${initials}
                        </div>
                        <div>
                            <div class="post-username">${escapeHTML(profile.full_name || 'Unknown User')}</div>
                            <div class="post-meta">
                                <i class="fas fa-graduation-cap"></i>
                                ${escapeHTML(post.department || 'Unknown')}
                                <span class="post-time">• ${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                    ${starRating.stars > 0 ? `
                        <div class="star-rating-badge stars-${starRating.stars}">
                            ${Array(starRating.stars).fill('<i class="fas fa-star"></i>').join('')}
                            <span class="star-rating-label">${starRating.label}</span>
                        </div>
                    ` : ''}
                </div>

                ${description ? `
                    <p class="post-description">
                        <span class="description-text ${truncated ? 'truncated' : ''}" data-full-text="${escapeHTML(description)}">
                            ${escapeHTML(displayDescription)}
                        </span>
                        ${truncated ? `<button class="see-more-btn" data-action="expand">See more</button>` : ''}
                    </p>
                ` : ''}

                <div class="post-image-container">
                    <img src="${post.image_url}" alt="Post image" class="post-image" loading="lazy">
                </div>

                <div class="post-stats">
                    <span><i class="fas fa-heart"></i> <span class="likes-count">${post.likes_count || 0}</span></span>
                    <span><i class="fas fa-comment"></i> <span class="comments-count">${post.comments_count || 0}</span></span>
                    <span><i class="fas fa-share"></i> ${post.shares_count || 0}</span>
                </div>

                <div class="post-actions">
                    <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-action="like">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span>Like</span>
                    </button>
                    <button class="action-btn comment-btn" data-action="comment">
                        <i class="far fa-comment"></i>
                        <span>Comment</span>
                    </button>
                    <button class="action-btn share-btn" data-action="share">
                        <i class="far fa-share-square"></i>
                        <span>Share</span>
                    </button>
                </div>

                <div class="comments-section">
                    <div class="comment-input-wrapper">
                        <div class="user-avatar small" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">
                            ${currentProfile ? getInitials(currentProfile.full_name) : 'U'}
                        </div>
                        <input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post.id}">
                        <button class="send-comment-btn" disabled>
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div class="comments-list" data-post-id="${post.id}">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
            </div>
        `;
    }

    // Setup event listeners for profile posts
    function setupProfilePostListeners(container) {
        // Like buttons
        container.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                const postCard = this.closest('.post-card');
                const postId = postCard.dataset.postId;
                await handleLike(postId, this);
            });
        });

        // Comment buttons
        container.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const postCard = this.closest('.post-card');
                const commentsSection = postCard.querySelector('.comments-section');
                const postId = postCard.dataset.postId;
                
                commentsSection.classList.toggle('active');
                
                if (commentsSection.classList.contains('active')) {
                    const commentInput = commentsSection.querySelector('.comment-input');
                    commentInput.focus();
                    
                    // Load comments if not already loaded
                    const commentsList = commentsSection.querySelector('.comments-list');
                    if (!commentsList.hasChildNodes()) {
                        loadComments(postId);
                    }
                }
            });
        });

        // Share buttons
        container.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const postCard = this.closest('.post-card');
                const postId = postCard.dataset.postId;
                openShareModal(postId);
            });
        });

        // See more/less buttons
        container.querySelectorAll('.see-more-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const descriptionText = this.previousElementSibling;
                const fullText = descriptionText.dataset.fullText;
                const isExpanded = this.dataset.action === 'collapse';

                if (isExpanded) {
                    const maxLength = 200;
                    descriptionText.textContent = fullText.substring(0, maxLength) + '...';
                    this.textContent = 'See more';
                    this.dataset.action = 'expand';
                    descriptionText.classList.add('truncated');
                } else {
                    descriptionText.textContent = fullText;
                    this.textContent = 'See less';
                    this.dataset.action = 'collapse';
                    descriptionText.classList.remove('truncated');
                }
            });
        });

        // Comment inputs
        container.querySelectorAll('.comment-input').forEach(input => {
            const sendBtn = input.nextElementSibling;
            
            input.addEventListener('input', function() {
                if (sendBtn) {
                    sendBtn.disabled = !this.value.trim();
                }
            });

            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && this.value.trim()) {
                    const postId = this.dataset.postId;
                    handleComment(postId, this.value.trim());
                }
            });
        });

        // Send comment buttons
        container.querySelectorAll('.send-comment-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const input = this.previousElementSibling;
                const postId = input.dataset.postId;
                if (input.value.trim()) {
                    handleComment(postId, input.value.trim());
                }
            });
        });
    }

    // ==================== INTERACTIONS ====================

    async function handleLike(postId) {
        try {
            const post = posts.find(p => p.id === postId);
            if (!post) return;

            const isCurrentlyLiked = post.isLiked;
            
            // Use toggleLike function
            const result = await window.toggleLike(postId);

            if (result.success) {
                // Update local state
                post.isLiked = result.liked;
                post.likes_count = result.liked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 0) - 1);

                // Update UI
                const postCard = document.querySelector(`[data-post-id="${postId}"]`);
                if (postCard) {
                    const likeBtn = postCard.querySelector('.like-btn');
                    const likesCount = postCard.querySelector('.likes-count');
                    
                    if (likeBtn) {
                        likeBtn.classList.toggle('liked', post.isLiked);
                    }
                    
                    if (likesCount) {
                        likesCount.textContent = post.likes_count;
                    }

                    // Update star rating
                    const starRating = window.getStarRating(post.likes_count);
                    const imageContainer = postCard.querySelector('.post-image-container');
                    let starBadge = imageContainer.querySelector('.star-rating-badge');
                    
                    if (starRating.stars > 0) {
                        if (!starBadge) {
                            starBadge = document.createElement('div');
                            imageContainer.appendChild(starBadge);
                        }
                        starBadge.className = `star-rating-badge stars-${starRating.stars}`;
                        starBadge.innerHTML = `
                            ${Array(starRating.stars).fill('<i class="fas fa-star"></i>').join('')}
                            <span class="star-rating-label">${starRating.label}</span>
                        `;
                        
                        // Show milestone notification if just reached a new star level
                        const previousRating = window.getStarRating(post.likes_count - 1);
                        if (result.liked && starRating.stars > previousRating.stars) {
                            showStarMilestone({
                                stars: starRating.stars,
                                label: starRating.label,
                                likes: post.likes_count
                            });
                        }
                    } else if (starBadge) {
                        starBadge.remove();
                    }
                }
            }
        } catch (error) {
            console.error('Error handling like:', error);
            showToast('Failed to update like', 'error');
        }
    }

    async function handleFollow(userId, button) {
        try {
            if (!userId || !button) return false;

            const isCurrentlyFollowing = button.classList.contains('following') || button.dataset.following === 'true';
            
            // Use toggleFollow function
            const result = await window.toggleFollow(userId);

            if (result.success) {
                // Update button state
                if (button.classList.contains('follow-btn')) {
                    button.classList.toggle('following', result.following);
                    const icon = button.querySelector('i');
                    const span = button.querySelector('span');
                    if (icon) icon.className = result.following ? 'fas fa-user-check' : 'fas fa-user-plus';
                    if (span) span.textContent = result.following ? 'Following' : 'Follow';
                }

                // Update post state
                const post = posts.find(p => p.user_id === userId);
                if (post) {
                    post.isFollowing = result.following;
                }

                showToast(result.following ? 'Following!' : 'Unfollowed successfully', 'success');
                return true;
            } else {
                showToast('Failed to update follow status', 'error');
                return false;
            }
        } catch (error) {
            console.error('Error handling follow:', error);
            showToast('Failed to update follow status', 'error');
            return false;
        }
    }

    async function handleComment(postId, content, parentCommentId = null) {
        try {
            // Use addComment function
            const result = await window.addComment(postId, content);

            if (result.success) {
                // Clear input
                const postCard = document.querySelector(`[data-post-id="${postId}"]`);
                if (postCard) {
                    const commentInput = postCard.querySelector('.comment-input');
                    const sendBtn = postCard.querySelector('.send-comment-btn');
                    if (commentInput) commentInput.value = '';
                    if (sendBtn) sendBtn.disabled = true;

                    // Update comment count
                    const post = posts.find(p => p.id === postId);
                    if (post) {
                        post.comments_count = (post.comments_count || 0) + 1;
                        const commentsCount = postCard.querySelector('.comments-count');
                        if (commentsCount) {
                            commentsCount.textContent = post.comments_count;
                        }
                    }
                }

                // Reload comments
                await loadComments(postId);
                
                showToast('Comment added!', 'success');
            } else {
                showToast('Failed to add comment', 'error');
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            showToast('Failed to add comment', 'error');
        }
    }

    async function handleReply(postId, commentId, content) {
        try {
            // Use addComment function with parent comment ID for replies
            const result = await window.addComment(postId, content, commentId);

            if (result.success) {
                // Clear reply input
                const replyInput = document.querySelector(`[data-reply-to="${commentId}"]`);
                if (replyInput) {
                    replyInput.value = '';
                    replyInput.style.display = 'none';
                }

                // Hide the send reply button
                const sendReplyBtn = document.querySelector(`.send-reply-btn[data-comment-id="${commentId}"]`);
                if (sendReplyBtn) {
                    sendReplyBtn.style.display = 'none';
                }

                // Reload comments to show the new reply
                await loadComments(postId);
                
                showToast('Reply added!', 'success');
            } else {
                showToast('Failed to add reply', 'error');
            }
        } catch (error) {
            console.error('Error adding reply:', error);
            showToast('Failed to add reply', 'error');
        }
    }
    // ==================== COMMENTS ====================

async function loadComments(postId) {
    try {
        const result = await window.getComments(postId);
        
        if (result.success) {
            console.log('All comments for post', postId, ':', result.comments);
            const commentsList = document.querySelector(`.comments-list[data-post-id="${postId}"]`);
            if (commentsList) {
                renderComments(commentsList, result.comments, postId);
            }
        }
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

function renderComments(container, comments, postId) {
    if (!container || !comments) return;

    console.log('renderComments called with', comments.length, 'comments');
    console.log('All comments:', comments);

    if (comments.length === 0) {
        container.innerHTML = '<p class="no-comments-text" style="text-align: center; color: #65676b; padding: 10px;">No comments yet. Be the first to comment!</p>';
        return;
    }

    // Separate top-level comments and replies
    const topLevelComments = comments.filter(c => !c.parent_comment_id);
    const repliesMap = {};

    // Group replies by parent comment ID
    comments.forEach(comment => {
        if (comment.parent_comment_id) {
            if (!repliesMap[comment.parent_comment_id]) {
                repliesMap[comment.parent_comment_id] = [];
            }
            repliesMap[comment.parent_comment_id].push(comment);
        }
    });

    console.log('Top level comments:', topLevelComments.length);
    console.log('Replies map:', repliesMap);

    // Sort top-level comments by created_at in descending order (newest first)
    topLevelComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Sort replies within each comment by created_at in descending order (newest first)
    Object.keys(repliesMap).forEach(commentId => {
        repliesMap[commentId].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    });
    // Render top-level comments with their replies
    container.innerHTML = topLevelComments.map(comment => {
        const replies = repliesMap[comment.id] || [];
        console.log(`Comment ${comment.id} has ${replies.length} replies:`, replies);
        return createCommentHTML(comment, postId, replies);
    }).join('');

    // Add event listeners for reply buttons
    container.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const commentId = this.dataset.commentId;
            toggleReplyInput(postId, commentId);
        });
    });

    // Add event listeners for reply inputs
    container.querySelectorAll('.reply-input').forEach(input => {
        const sendBtn = input.nextElementSibling;
        
        // Enable/disable send button based on input
        input.addEventListener('input', function() {
            if (sendBtn) {
                sendBtn.disabled = !this.value.trim();
            }
        });

        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim()) {
                const commentId = this.dataset.replyTo;
                handleReply(postId, commentId, this.value.trim());
            }
        });
    });

    // Add event listeners for send reply buttons
    container.querySelectorAll('.send-reply-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const commentId = this.dataset.commentId;
            const replyInput = document.querySelector(`[data-reply-to="${commentId}"]`);
            if (replyInput && replyInput.value.trim()) {
                handleReply(postId, commentId, replyInput.value.trim());
            }
        });
    });

    // Add event listeners for comment user avatars
    container.querySelectorAll('.comment-user').forEach(userDiv => {
        userDiv.addEventListener('click', function() {
            const userId = this.dataset.userId;
            if (userId) {
                window.openUserProfile(userId);
            }
        });
    });
}

function createCommentHTML(comment, postId, replies = []) {
    const profile = comment.profiles || {};
    const initials = getInitials(profile.full_name || 'User');
    const timeAgo = window.timeAgo(comment.created_at);
    const avatarColor = stringToColor(profile.full_name || 'User');

    return `
        <div class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-user" data-user-id="${comment.user_id}">
                <div class="user-avatar small" style="background: ${avatarColor}">
                    ${initials}
                </div>
            </div>
            <div class="comment-content">
                <div class="comment-bubble">
                    <div class="comment-author" onclick="window.openUserProfile('${comment.user_id}')">${escapeHTML(profile.full_name || 'Unknown')}</div>
                    <div class="comment-text">${escapeHTML(comment.content)}</div>
                </div>
                <div class="comment-actions">
                    <span class="comment-time">${timeAgo}</span>
                    <button class="reply-btn" data-comment-id="${comment.id}">Reply</button>
                </div>
                
                <!-- Reply input (hidden by default) -->
                <div class="reply-input-container" data-comment-id="${comment.id}">
                    <div class="user-avatar small" style="background: linear-gradient(135deg, #667eea, #764ba2)">
                        ${getInitials(currentProfile?.full_name || 'U')}
                    </div>
                    <input 
                        type="text" 
                        class="reply-input" 
                        placeholder="Write a reply..."
                        data-reply-to="${comment.id}"
                    >
                    <button class="send-reply-btn" data-comment-id="${comment.id}" disabled>
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
                
                <!-- Nested Replies -->
                ${replies.length > 0 ? `
                    <div class="replies-container">
                        ${replies.map(reply => createReplyHTML(reply, postId)).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function createReplyHTML(reply, postId) {
    const profile = reply.profiles || {};
    const initials = getInitials(profile.full_name || 'User');
    const timeAgo = window.timeAgo(reply.created_at);
    const avatarColor = stringToColor(profile.full_name || 'User');

    return `
        <div class="comment-item reply" data-comment-id="${reply.id}">
            <div class="comment-user" data-user-id="${reply.user_id}">
                <div class="user-avatar small" style="background: ${avatarColor}">
                    ${initials}
                </div>
            </div>
            <div class="comment-content">
                <div class="comment-bubble">
                    <div class="comment-author" onclick="window.openUserProfile('${reply.user_id}')">${escapeHTML(profile.full_name || 'Unknown')}</div>
                    <div class="comment-text">${escapeHTML(reply.content)}</div>
                </div>
                <div class="comment-actions">
                    <span class="comment-time">${timeAgo}</span>
                </div>
            </div>
        </div>
    `;
}

function toggleReplyInput(postId, commentId) {
    const replyContainer = document.querySelector(`.reply-input-container[data-comment-id="${commentId}"]`);
    
    if (replyContainer) {
        const isVisible = replyContainer.classList.contains('show');
        
        // Hide all other reply inputs first
        document.querySelectorAll('.reply-input-container.show').forEach(container => {
            container.classList.remove('show');
        });
        
        // Toggle current one
        if (!isVisible) {
            replyContainer.classList.add('show');
            const input = replyContainer.querySelector('.reply-input');
            if (input) {
                setTimeout(() => input.focus(), 100);
            }
        }
    }
}

// Helper function to generate consistent colors from strings
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
}

async function handleReply(postId, commentId, content) {
    try {
        console.log('Sending reply:', { postId, commentId, content });
        
        // Use addComment function with parent comment ID for replies
        const result = await window.addComment(postId, content, commentId);

        console.log('Reply result:', result);

        if (result.success) {
            // Hide the reply input
            const replyContainer = document.querySelector(`.reply-input-container[data-comment-id="${commentId}"]`);
            if (replyContainer) {
                replyContainer.classList.remove('show');
                const input = replyContainer.querySelector('.reply-input');
                if (input) input.value = '';
            }

            // Reload comments to show the new reply
            await loadComments(postId);
            
            showToast('Reply added!', 'success');
        } else {
            showToast(result.error || 'Failed to add reply', 'error');
        }
    } catch (error) {
        console.error('Error adding reply:', error);
        showToast('Failed to add reply', 'error');
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
        const departmentSelect = document.getElementById('departmentSelect');

        if (openUploadModal) {
            openUploadModal.addEventListener('click', () => {
                uploadModal.classList.add('show');
                // Pre-select user's department
                if (currentProfile?.department && departmentSelect) {
                    departmentSelect.value = currentProfile.department;
                }
                checkFormValidity();
            });
        }

        if (closeUploadModal) {
            closeUploadModal.addEventListener('click', () => {
                uploadModal.classList.remove('show');
            });
        }

        if (uploadModal) {
            uploadModal.addEventListener('click', (e) => {
                if (e.target === uploadModal) {
                    uploadModal.classList.remove('show');
                }
            });
        }

        if (imageUploadArea) {
            imageUploadArea.addEventListener('click', () => {
                if (imageInput) imageInput.click();
            });
        }

        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (imagePreview) imagePreview.src = e.target.result;
                        if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
                        if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                        checkFormValidity();
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (imageInput) imageInput.value = '';
                if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
                checkFormValidity();
            });
        }

        if (postDescription) {
            postDescription.addEventListener('input', () => {
                if (charCount) {
                    charCount.textContent = postDescription.value.length;
                }
                checkFormValidity();
            });
        }

        if (departmentSelect) {
            departmentSelect.addEventListener('change', () => {
                checkFormValidity();
            });
        }

        if (submitPostBtn) {
            submitPostBtn.addEventListener('click', async () => {
                await handleCreatePost();
            });
        }

        function checkFormValidity() {
            const hasImage = imageInput && imageInput.files.length > 0;
            const hasDepartment = departmentSelect && departmentSelect.value;
            
            if (submitPostBtn) {
                submitPostBtn.disabled = !(hasImage && hasDepartment);
            }
        }

        async function handleCreatePost() {
            try {
                const description = postDescription?.value.trim() || '';
                const department = departmentSelect?.value;
                const imageFile = imageInput?.files[0];

                if (!imageFile || !department) {
                    showToast('Please select an image and department', 'error');
                    return;
                }

                // Disable button and show loading
                const submitBtnText = document.getElementById('submitBtnText');
                if (submitPostBtn) submitPostBtn.disabled = true;
                if (submitBtnText) submitBtnText.textContent = 'Posting...';

                const result = await window.createPost(description, imageFile, department);

                if (result.success) {
                    showToast('Post created successfully!', 'success');
                    
                    // Reset form
                    if (postDescription) postDescription.value = '';
                    if (charCount) charCount.textContent = '0';
                    if (imageInput) imageInput.value = '';
                    if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
                    if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
                    
                    // Close modal
                    uploadModal.classList.remove('show');
                    
                    // Reload posts
                    await loadPosts();
                } else {
                    showToast(result.error || 'Failed to create post', 'error');
                }
            } catch (error) {
                console.error('Error creating post:', error);
                showToast('Failed to create post', 'error');
            } finally {
                // Re-enable button
                const submitBtnText = document.getElementById('submitBtnText');
                if (submitPostBtn) submitPostBtn.disabled = false;
                if (submitBtnText) submitBtnText.textContent = 'Post';
            }
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

    function setupProfileModal() {
        const closeProfileModal = document.getElementById('closeProfileModal');

        if (closeProfileModal) {
            closeProfileModal.addEventListener('click', () => {
                profileModal.classList.remove('show');
            });
        }

        if (profileModal) {
            profileModal.addEventListener('click', (e) => {
                if (e.target === profileModal) {
                    profileModal.classList.remove('show');
                }
            });
        }
    }

    // ==================== EVENT LISTENERS ====================

    function setupEventListeners() {
        setupCreatePostModal();
        setupShareModal();
        setupProfileModal();

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

        // User profile click - now opens own profile modal
        if (userProfile) {
            userProfile.addEventListener('click', () => {
                if (currentUser) {
                    window.openUserProfile(currentUser.id);
                }
            });
        }
    }

    // ==================== UTILITY FUNCTIONS ====================

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showStarMilestone(milestone) {
        const starMilestone = document.getElementById('starMilestone');
        const milestoneStars = document.getElementById('milestoneStars');
        const milestoneText = document.getElementById('milestoneText');

        if (starMilestone && milestoneStars && milestoneText) {
            milestoneStars.innerHTML = Array(milestone.stars).fill('<i class="fas fa-star"></i>').join('');
            milestoneText.textContent = `${milestone.label}! Your post reached ${milestone.likes} likes!`;
            
            starMilestone.classList.add('show');
            
            setTimeout(() => {
                starMilestone.classList.remove('show');
            }, 5000);
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