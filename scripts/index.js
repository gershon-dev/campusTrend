/**
 * index.js  — CampusTrend UEW main feed script
 *
 * Feature modules (ES modules, type="module" in HTML):
 *   scripts/upload-modal.js  — Create Post modal + video compression
 *   scripts/comments.js      — Comments / replies
 *   scripts/share-modal.js   — Share modal
 */

import { setupCreatePostModal }               from './upload-modal.js';
import {
    getInitials,
    escapeHTML,
    stringToColor,
    loadComments,
    handleComment,
    setupCommentInput,
    renderComments,
}                                              from './comments.js';
import { setupShareModal, openShareModal }     from './share-modal.js';

// ─── Global helper ────────────────────────────────────────────────────────────

export function viewUserProfile(userId) {
    if (!userId) return;
    window.location.href = `user-profile.html?userId=${userId}`;
}
// Keep accessible to inline onclick attributes in post HTML
window.viewUserProfile = viewUserProfile;

// ─── Cache constants ─────────────────────────────────────────────────────────

const POSTS_CACHE_KEY = 'ct_posts_cache';
const POSTS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// ─── DOMContentLoaded ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {

    // ── App state ─────────────────────────────────────────────────────────────
    let currentUser    = null;
    let currentProfile = null;
    let posts          = [];
    let currentFilter  = 'all';
    let currentDepartmentFilter = null;

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const postsContainer      = document.getElementById('postsContainer');
    const uploadModal         = document.getElementById('uploadModal');
    const shareModal          = document.getElementById('shareModal');
    const notificationBell    = document.getElementById('notificationBell');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const notificationBadge   = document.getElementById('notificationBadge');
    const currentUserAvatar   = document.getElementById('currentUserAvatar');
    const currentUserName     = document.getElementById('currentUserName');

    // ── Shared deps object passed to modules ─────────────────────────────────
    const commentDeps = {
        getProfile:   () => currentProfile,
        showToast,
        getInitials,
        escapeHTML,
        stringToColor,
    };

    // ── Boot ──────────────────────────────────────────────────────────────────
    await init();

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────
    async function init() {
        try {
            const isLoggedIn = await window.isLoggedIn();
            if (!isLoggedIn) {
                if (!navigator.onLine) {
                    console.warn('Offline and not logged in — staying on page');
                    showError('You are offline. Please check your internet connection.');
                    return;
                }
                window.location.href = 'sign-in.html';
                return;
            }

            currentUser    = await window.getCurrentUser();
            currentProfile = await window.getCurrentProfile();

            if (!currentUser || !currentProfile) {
                if (!navigator.onLine) {
                    console.warn('Offline — could not load profile, staying on page');
                    showError('You are offline. Please check your internet connection.');
                    return;
                }
                console.error('Failed to load user or profile');
                window.location.href = 'sign-in.html';
                return;
            }

            updateUserUI();
            loadDepartments();
            loadTutorialsStrip();       // parallel — doesn't block feed
            await loadPosts();
            await loadNotifications();
            await loadTrends();
            setupEventListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to load app. Please try refreshing the page.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // USER UI
    // ─────────────────────────────────────────────────────────────────────────
    function updateUserUI() {
        if (!currentProfile) return;
        const initials = getInitials(currentProfile.full_name);

        if (currentUserAvatar) {
            if (currentProfile.avatar_url) {
                currentUserAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" alt="${currentProfile.full_name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                currentUserAvatar.textContent = initials;
                currentUserAvatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                currentUserAvatar.style.color = 'white';
            }
        }
        if (currentUserName) currentUserName.textContent = currentProfile.full_name;

        const modalUserAvatar = document.getElementById('modalUserAvatar');
        const modalUserName   = document.getElementById('modalUserName');
        if (modalUserAvatar) {
            modalUserAvatar.innerHTML = currentProfile.avatar_url
                ? `<img src="${currentProfile.avatar_url}" alt="${currentProfile.full_name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : initials;
        }
        if (modalUserName) modalUserName.textContent = currentProfile.full_name;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEPARTMENTS
    // ─────────────────────────────────────────────────────────────────────────
    function loadDepartments() {
        const departmentTags = document.getElementById('departmentTags');
        const departments = window.DEPARTMENTS || [
            'Computer Science', 'Mathematics', 'Basic Education',
            'Business Administration', 'Graphic Design', 'Music Education',
            'Health Education', 'Social Studies', 'English Education',
            'Science Education', 'Physical Education', 'Special Education',
        ];
        if (!departmentTags) return;

        departmentTags.innerHTML = `
            <div class="department-tag active" data-department="">All</div>
            ${departments.map(dept =>
                `<div class="department-tag" data-department="${dept}">${dept}</div>`
            ).join('')}`;

        departmentTags.querySelectorAll('.department-tag').forEach(tag => {
            tag.addEventListener('click', function () {
                departmentTags.querySelectorAll('.department-tag').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentDepartmentFilter = this.dataset.department || null;
                loadPosts();
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POSTS
    // ─────────────────────────────────────────────────────────────────────────
    async function loadPosts() {
        try {
            // Show cached posts instantly
            try {
                const cached = localStorage.getItem(POSTS_CACHE_KEY);
                if (cached) {
                    const { data: cachedPosts, ts } = JSON.parse(cached);
                    if (cachedPosts && Array.isArray(cachedPosts) && Date.now() - ts < POSTS_CACHE_TTL) {
                        posts = cachedPosts;
                        renderPosts();
                    }
                }
            } catch (e) { /* ignore cache errors */ }

            showLoading();

            let query = window.supabaseClient
                .from('posts')
                .select(`*, profiles:user_id (id, full_name, avatar_url, department)`)
                .order('created_at', { ascending: false });

            if (currentFilter === 'popular') {
                query = query.gte('likes_count', 5).order('likes_count', { ascending: false });
            } else if (currentFilter === 'recent') {
                query = query.order('created_at', { ascending: false });
            }
            if (currentDepartmentFilter) {
                query = query.eq('department', currentDepartmentFilter);
            }

            const { data, error } = await query.limit(50);
            if (error) throw error;

            posts = data || [];

            if (currentUser && posts.length > 0) {
                const postIds  = posts.map(p => p.id);
                const userIds  = [...new Set(posts.map(p => p.user_id))].filter(id => id !== currentUser.id);

                const { data: likes } = await window.supabaseClient
                    .from('likes').select('post_id')
                    .eq('user_id', currentUser.id).in('post_id', postIds);
                const likedPostIds = new Set(likes?.map(l => l.post_id) || []);

                const { data: following } = await window.supabaseClient
                    .from('followers').select('following_id')
                    .eq('follower_id', currentUser.id).in('following_id', userIds);
                const followingIds = new Set(following?.map(f => f.following_id) || []);

                posts = posts.map(post => ({
                    ...post,
                    isLiked:     likedPostIds.has(post.id),
                    isFollowing: followingIds.has(post.user_id),
                }));
            }

            renderPosts();

            try {
                localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify({ data: posts, ts: Date.now() }));
            } catch (e) { /* storage full */ }

        } catch (error) {
            console.error('Error loading posts:', error);
            showError('Failed to load posts. Please try refreshing the page.');
        }
    }

    function showLoading() {
        if (!postsContainer) return;
        const skeletonCard = () => `
            <div class="post-skeleton" aria-hidden="true">
                <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
                    <div class="skeleton-avatar"></div>
                    <div style="flex:1">
                        <div class="skeleton-line" style="width:40%;margin-bottom:6px"></div>
                        <div class="skeleton-line" style="width:25%;height:10px"></div>
                    </div>
                </div>
                <div class="skeleton-line" style="width:90%"></div>
                <div class="skeleton-line" style="width:70%"></div>
                <div class="skeleton-image" style="margin:10px 0"></div>
                <div class="skeleton-line" style="width:50%;height:10px"></div>
            </div>`;
        postsContainer.innerHTML = skeletonCard() + skeletonCard() + skeletonCard();
    }

    function showError(message) {
        if (postsContainer) {
            postsContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>`;
        }
    }

    function renderPosts() {
        if (!postsContainer) return;
        if (posts.length === 0) {
            postsContainer.innerHTML = `
                <div class="no-posts">
                    <i class="fas fa-image" aria-hidden="true"></i>
                    <h3>No posts yet</h3>
                    <p>Be the first to share something!</p>
                </div>`;
            return;
        }

        postsContainer.innerHTML = posts.map((post, index) => createPostHTML(post, index)).join('');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const postId = entry.target.dataset.postId;
                    if (postId && !entry.target.dataset.commentsLoaded) {
                        entry.target.dataset.commentsLoaded = 'true';
                        loadComments(postId, commentDeps);
                    }
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '200px' });

        posts.forEach((post, index) => {
            setupPostEventListeners(post.id);
            const card = document.querySelector(`[data-post-id="${post.id}"]`);
            if (card) {
                if (index < 2) {
                    loadComments(post.id, commentDeps);
                    card.dataset.commentsLoaded = 'true';
                } else {
                    observer.observe(card);
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST HTML
    // ─────────────────────────────────────────────────────────────────────────
    function createPostHTML(post, index = 0) {
        const profile  = post.profiles || {};
        const initials = getInitials(profile.full_name || 'User');
        const timeAgo  = window.timeAgo(post.created_at);
        const isOwnPost = currentUser && post.user_id === currentUser.id;
        // STAR RATING LOCKED
        const isLCP = index === 0;

        const avatarHTML = profile.avatar_url
            ? `<img src="${profile.avatar_url}" alt="${escapeHTML(profile.full_name || 'User')}" width="40" height="40" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="${isLCP ? 'eager' : 'lazy'}" decoding="async">`
            : initials;

        const maxLength = 200;
        const description = post.content || '';
        const needsTruncation = description.length > maxLength;
        const truncatedDescription = needsTruncation ? description.substring(0, maxLength) + '...' : description;

        return `
        <article class="post-card" data-post-id="${post.id}" aria-label="Post by ${escapeHTML(profile.full_name || 'Unknown User')}">
            <div class="post-header">
                <div class="post-user-info">
                    <div class="user-avatar"
                        onclick="viewUserProfile('${post.user_id}')"
                        style="cursor:pointer;background:${stringToColor(profile.full_name || 'User')}"
                        role="button" tabindex="0"
                        aria-label="View ${escapeHTML(profile.full_name || 'user')}'s profile">
                        ${avatarHTML}
                    </div>
                    <div>
                        <div class="post-username"
                            onclick="viewUserProfile('${post.user_id}')"
                            style="cursor:pointer;" role="button" tabindex="0"
                            aria-label="View ${escapeHTML(profile.full_name || 'user')}'s profile">
                            ${escapeHTML(profile.full_name || 'Unknown User')}
                            ${isOwnPost ? '<span class="own-post-badge" aria-label="Your post">You</span>' : ''}
                        </div>
                        <div class="post-meta">
                            <span class="department-badge"><i class="fas fa-graduation-cap" aria-hidden="true"></i> ${escapeHTML(profile.department || 'Unknown')}</span>
                            <time class="post-time" datetime="${post.created_at}">${timeAgo}</time>
                        </div>
                    </div>
                </div>
                ${!isOwnPost ? `
                <button class="follow-btn ${post.isFollowing ? 'following' : ''}" data-user-id="${post.user_id}"
                    aria-label="${post.isFollowing ? 'Unfollow' : 'Follow'} ${escapeHTML(profile.full_name || 'user')}"
                    aria-pressed="${post.isFollowing ? 'true' : 'false'}">
                    <i class="fas ${post.isFollowing ? 'fa-user-check' : 'fa-user-plus'}" aria-hidden="true"></i>
                    <span>${post.isFollowing ? 'Following' : 'Follow'}</span>
                </button>` : ''}
            </div>

            ${description ? `
            <div class="post-description">
                <p class="description-text ${needsTruncation ? 'truncated' : ''}"
                    data-full-text="${escapeHTML(description)}">
                    ${escapeHTML(truncatedDescription)}
                </p>
                ${needsTruncation ? `<button class="see-more-btn" data-action="expand" aria-expanded="false">See more</button>` : ''}
            </div>` : ''}

            ${(post.image_url || post.media_url) ? `
            <div class="post-image-container">
                ${post.media_type === 'video' ? `
                <video src="${post.media_url || post.image_url}" class="post-video"
                    controls playsinline preload="metadata"
                    style="width:100%;max-height:500px;border-radius:12px;background:#000;">
                </video>` : `
                <img src="${post.image_url || post.media_url}"
                    alt="Post by ${escapeHTML(profile.full_name || 'user')}${description ? ': ' + escapeHTML(description.substring(0, 100)) : ''}"
                    class="post-image"
                    ${isLCP ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'}
                    decoding="${isLCP ? 'sync' : 'async'}">
                `}
            </div>` : ''}

            <div class="post-stats" aria-label="Post statistics">
                <span class="stat-item"><i class="fas fa-heart" aria-hidden="true"></i> <span class="likes-count">${post.likes_count || 0}</span> likes</span>
                <span class="stat-item"><i class="fas fa-comment" aria-hidden="true"></i> <span class="comments-count">${post.comments_count || 0}</span> comments</span>
                <span class="stat-item"><i class="fas fa-share" aria-hidden="true"></i> shares</span>
            </div>

            <div class="post-actions" role="group" aria-label="Post actions">
                <button class="action-btn like-btn ${post.isLiked ? 'liked' : ''}" data-action="like"
                    aria-label="${post.isLiked ? 'Unlike post' : 'Like post'}"
                    aria-pressed="${post.isLiked ? 'true' : 'false'}">
                    <i class="fas fa-heart" aria-hidden="true"></i><span>Like</span>
                </button>
                <button class="action-btn comment-btn" data-action="comment" aria-label="Comment on post">
                    <i class="fas fa-comment" aria-hidden="true"></i><span>Comment</span>
                </button>
                <button class="action-btn share-btn" data-action="share" aria-label="Share post">
                    <i class="fas fa-share" aria-hidden="true"></i><span>Share</span>
                </button>
            </div>

            <div class="comments-section" data-post-id="${post.id}">
                <div class="comments-list" data-post-id="${post.id}" role="list" aria-label="Comments"></div>
                <div class="comment-input-wrapper">
                    <div class="user-avatar small" aria-hidden="true"
                        style="background:${stringToColor(currentProfile?.full_name || 'U')}">
                        ${getInitials(currentProfile?.full_name || 'U')}
                    </div>
                    <input type="text" class="comment-input"
                        placeholder="Write a comment..."
                        data-post-id="${post.id}" aria-label="Write a comment">
                    <button class="send-comment-btn" data-post-id="${post.id}"
                        disabled aria-label="Send comment" aria-disabled="true">
                        <i class="fas fa-paper-plane" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        </article>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST EVENT LISTENERS
    // ─────────────────────────────────────────────────────────────────────────
    function setupPostEventListeners(postId) {
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (!postCard) return;

        // Like
        const likeBtn = postCard.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', () => {
                handleLike(postId);
            });
        }

        // Comment toggle
        const commentBtn = postCard.querySelector('.comment-btn');
        if (commentBtn) {
            commentBtn.addEventListener('click', () => {
                const commentsSection = postCard.querySelector('.comments-section');
                const commentInput   = postCard.querySelector('.comment-input');
                if (commentsSection) {
                    commentsSection.classList.toggle('show');
                    if (commentsSection.classList.contains('show') && commentInput) {
                        setTimeout(() => {
                            commentInput.focus();
                            commentInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }
            });
        }

        // Share — delegate to share-modal module
        const shareBtn = postCard.querySelector('.share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => openShareModal(postId, shareModal));
        }

        // Follow
        const followBtn = postCard.querySelector('.follow-btn');
        if (followBtn) {
            followBtn.addEventListener('click', () => {
                handleFollow(followBtn.dataset.userId, followBtn);
            });
        }

        // See more / See less
        const seeMoreBtn = postCard.querySelector('.see-more-btn');
        if (seeMoreBtn) {
            seeMoreBtn.addEventListener('click', function () {
                const descriptionText = postCard.querySelector('.description-text');
                const fullText = descriptionText.dataset.fullText;
                const isExpanded = this.dataset.action === 'collapse';
                const maxLength = 200;
                if (isExpanded) {
                    descriptionText.textContent = fullText.substring(0, maxLength) + '...';
                    descriptionText.classList.add('truncated');
                    this.textContent = 'See more';
                    this.dataset.action = 'expand';
                    this.setAttribute('aria-expanded', 'false');
                } else {
                    descriptionText.textContent = fullText;
                    descriptionText.classList.remove('truncated');
                    this.textContent = 'See less';
                    this.dataset.action = 'collapse';
                    this.setAttribute('aria-expanded', 'true');
                }
            });
        }

        // Comment input — delegated to comments module
        setupCommentInput(postId, commentDeps, posts);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LIKE
    // ─────────────────────────────────────────────────────────────────────────
    const _likeInFlight = new Set();

    async function handleLike(postId) {
        if (_likeInFlight.has(postId)) return;

        const post = posts.find(p => p.id === postId);
        if (!post) return;

        if (!navigator.onLine) { showToast('You are offline. Please check your connection.', 'error'); return; }

        const postCard   = document.querySelector(`[data-post-id="${postId}"]`);
        const likeBtn    = postCard?.querySelector('.like-btn');
        const likesCount = postCard?.querySelector('.likes-count');

        const prevIsLiked  = post.isLiked;
        const prevCount    = post.likes_count || 0;
        const optimistic   = !prevIsLiked;
        const optCount     = optimistic ? prevCount + 1 : Math.max(0, prevCount - 1);

        post.isLiked      = optimistic;
        post.likes_count  = optCount;
        if (likeBtn) {
            likeBtn.classList.toggle('liked', optimistic);
            likeBtn.setAttribute('aria-pressed', optimistic ? 'true' : 'false');
            likeBtn.setAttribute('aria-label', optimistic ? 'Unlike post' : 'Like post');
            likeBtn.disabled = true;
        }
        if (likesCount) likesCount.textContent = optCount;

        _likeInFlight.add(postId);
        try {
            const result = await window.toggleLike(postId);
            if (result.success) {
                post.isLiked     = result.liked;
                post.likes_count = typeof result.likes_count === 'number'
                    ? result.likes_count
                    : result.liked ? prevCount + 1 : Math.max(0, prevCount - 1);
                if (likeBtn) {
                    likeBtn.classList.toggle('liked', post.isLiked);
                    likeBtn.setAttribute('aria-pressed', post.isLiked ? 'true' : 'false');
                    likeBtn.setAttribute('aria-label', post.isLiked ? 'Unlike post' : 'Like post');
                }
                if (likesCount) likesCount.textContent = post.likes_count;
            } else {
                _rollbackLike(post, likeBtn, likesCount, prevIsLiked, prevCount);
                showToast(result.error || 'Failed to update like', 'error');
            }
        } catch (error) {
            _rollbackLike(post, likeBtn, likesCount, prevIsLiked, prevCount);
            console.error('Error handling like:', error);
            showToast(navigator.onLine ? 'Failed to update like. Please try again.' : 'You are offline.', 'error');
        } finally {
            _likeInFlight.delete(postId);
            if (likeBtn) likeBtn.disabled = false;
        }
    }

    function _rollbackLike(post, likeBtn, likesCount, prevIsLiked, prevCount) {
        post.isLiked     = prevIsLiked;
        post.likes_count = prevCount;
        if (likeBtn) {
            likeBtn.classList.toggle('liked', prevIsLiked);
            likeBtn.setAttribute('aria-pressed', prevIsLiked ? 'true' : 'false');
            likeBtn.setAttribute('aria-label', prevIsLiked ? 'Unlike post' : 'Like post');
        }
        if (likesCount) likesCount.textContent = prevCount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FOLLOW
    // ─────────────────────────────────────────────────────────────────────────
    const _followInFlight = new Set();

    async function handleFollow(userId, button) {
        if (!userId || !button) return false;
        if (_followInFlight.has(userId)) return false;
        if (!navigator.onLine) { showToast('You are offline. Please check your connection.', 'error'); return false; }

        const prevFollowing    = button.classList.contains('following');
        const optimisticFollow = !prevFollowing;

        function applyFollowState(isFollowing) {
            document.querySelectorAll(`.follow-btn[data-user-id="${userId}"]`).forEach(btn => {
                btn.classList.toggle('following', isFollowing);
                btn.setAttribute('aria-pressed', isFollowing ? 'true' : 'false');
                btn.setAttribute('aria-label', `${isFollowing ? 'Unfollow' : 'Follow'} user`);
                const icon = btn.querySelector('i');
                const span = btn.querySelector('span');
                if (icon) icon.className = isFollowing ? 'fas fa-user-check' : 'fas fa-user-plus';
                if (span) span.textContent = isFollowing ? 'Following' : 'Follow';
                btn.disabled = _followInFlight.has(userId);
            });
        }

        applyFollowState(optimisticFollow);
        document.querySelectorAll(`.follow-btn[data-user-id="${userId}"]`).forEach(btn => btn.disabled = true);

        _followInFlight.add(userId);
        try {
            const result = await window.toggleFollow(userId);
            if (result.success) {
                applyFollowState(result.following);
                posts.forEach(p => { if (p.user_id === userId) p.isFollowing = result.following; });
                showToast(result.following ? 'Following!' : 'Unfollowed successfully', 'success');
                return true;
            } else {
                applyFollowState(prevFollowing);
                posts.forEach(p => { if (p.user_id === userId) p.isFollowing = prevFollowing; });
                showToast(result.error || 'Failed to update follow status', 'error');
                return false;
            }
        } catch (error) {
            applyFollowState(prevFollowing);
            posts.forEach(p => { if (p.user_id === userId) p.isFollowing = prevFollowing; });
            console.error('Error handling follow:', error);
            showToast(navigator.onLine ? 'Failed to update follow status. Please try again.' : 'You are offline.', 'error');
            return false;
        } finally {
            _followInFlight.delete(userId);
            document.querySelectorAll(`.follow-btn[data-user-id="${userId}"]`).forEach(btn => btn.disabled = false);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────────────────
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
            notificationList.innerHTML = '<p style="text-align:center;color:#6b7280;padding:20px;">No notifications yet</p>';
            return;
        }
        notificationList.innerHTML = notifications.map(notif => {
            const timeAgo  = window.timeAgo(notif.created_at);
            const initials = getInitials(notif.from_user?.full_name || 'User');
            return `
            <div class="notification-item ${notif.is_read ? '' : 'unread'}">
                <div class="user-avatar small">${initials}</div>
                <div class="notification-content">
                    <p><strong>${escapeHTML(notif.from_user?.full_name || 'Someone')}</strong> ${escapeHTML(notif.message || 'interacted with your post')}</p>
                    <span class="notification-time">${timeAgo}</span>
                </div>
            </div>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRENDS
    // ─────────────────────────────────────────────────────────────────────────
    async function loadTrends() {
        const trendsList = document.getElementById('trendsList');
        if (!trendsList) return;
        const trends = [
            { tag: 'CampusLife', posts: 245 },
            { tag: 'UEWEvents',  posts: 189 },
            { tag: 'StudyTips',  posts: 156 },
            { tag: 'SportsDay',  posts: 134 },
        ];
        trendsList.setAttribute('role', 'list');
        trendsList.innerHTML = trends.map(trend => `
            <div class="trend-item" role="listitem">
                <div class="trend-tag">#${trend.tag}</div>
                <div class="trend-count">${trend.posts} posts</div>
            </div>`).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOAST / STAR MILESTONE
    // ─────────────────────────────────────────────────────────────────────────
    function showToast(message, type = 'success') {
        const toast        = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        if (!toast || !toastMessage) return;
        const icon = toast.querySelector('i');
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        if (icon) icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
    window.showToast = showToast;

    function showStarMilestone(milestone) {
        const starMilestone  = document.getElementById('starMilestone');
        const milestoneStars = document.getElementById('milestoneStars');
        const milestoneText  = document.getElementById('milestoneText');
        if (starMilestone && milestoneStars && milestoneText) {
            milestoneStars.innerHTML = Array(milestone.stars).fill('<i class="fas fa-star"></i>').join('');
            milestoneText.textContent = `${milestone.label}! Your post reached ${milestone.likes} likes!`;
            starMilestone.classList.add('show');
            setTimeout(() => starMilestone.classList.remove('show'), 5000);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SETUP ALL EVENT LISTENERS
    // ─────────────────────────────────────────────────────────────────────────
    function setupEventListeners() {
        // ── Upload modal (from module) ────────────────────────────────────────
        setupCreatePostModal({
            getProfile:  () => currentProfile,
            uploadModal,
            postsContainer,
            getPosts:    () => posts,
            showToast,
            createPostHTML,
            setupPostEventListeners,
            onPostCreated(newPost, fileToUpload, isVideo) {
                newPost.isLiked = false;
                newPost.isFollowing = false;
                if (fileToUpload && (newPost.image_url || newPost.media_url)) {
                    newPost._localBlobUrl = URL.createObjectURL(fileToUpload);
                    newPost._localIsVideo = isVideo;
                }
                posts.unshift(newPost);
                try { localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify({ data: posts, ts: Date.now() })); } catch (e) {}

                const tempHTML = createPostHTML(newPost, 0);
                const tempDiv  = document.createElement('div');
                tempDiv.innerHTML = tempHTML;
                const newCard  = tempDiv.firstElementChild;

                if (newPost._localBlobUrl) {
                    if (isVideo) { const vid = newCard.querySelector('.post-video'); if (vid) vid.src = newPost._localBlobUrl; }
                    else         { const img = newCard.querySelector('.post-image'); if (img) img.src = newPost._localBlobUrl; }
                }

                if (postsContainer.firstChild) postsContainer.insertBefore(newCard, postsContainer.firstChild);
                else postsContainer.appendChild(newCard);
                setupPostEventListeners(newPost.id);
            },
        });

        // ── Share modal (from module) ─────────────────────────────────────────
        setupShareModal({ shareModal, showToast });

        // ── Filter buttons ────────────────────────────────────────────────────
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                loadPosts();
            });
        });

        // ── Notification bell ─────────────────────────────────────────────────
        if (notificationBell) {
            notificationBell.addEventListener('click', e => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('show');
            });
        }
        const markAllRead = document.getElementById('markAllRead');
        if (markAllRead) {
            markAllRead.addEventListener('click', async () => {
                await window.markAllNotificationsRead();
                await loadNotifications();
            });
        }
        document.addEventListener('click', e => {
            if (notificationDropdown &&
                !notificationBell?.contains(e.target) &&
                !notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.remove('show');
            }
        });

        // ── Profile link ──────────────────────────────────────────────────────
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            userProfile.style.cursor = 'pointer';
            userProfile.addEventListener('click', () => window.goToOwnProfile());
            userProfile.addEventListener('mouseenter', function () { this.style.opacity = '0.8'; });
            userProfile.addEventListener('mouseleave', function () { this.style.opacity = '1'; });
        }
    }

}); // end DOMContentLoaded

// ─── Go to own profile (used by header) ──────────────────────────────────────
window.goToOwnProfile = function () {
    window.location.href = 'user-profile.html';
};

// ─── Tutorials strip (independent; runs in parallel with feed) ───────────────

function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _ini(n) {
    if (!n) return 'U';
    const p = n.trim().split(' ');
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : n.substring(0, 2).toUpperCase();
}
function extractDriveFileId(url) {
    if (!url) return null;
    const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return m1[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m2 ? m2[1] : null;
}

const TUT_CACHE_KEY = 'ct_tutorials_strip';
const TUT_CACHE_TTL = 5 * 60 * 1000;

async function loadTutorialsStrip() {
    const scroll = document.getElementById('tutorialsScroll');
    const strip  = document.getElementById('tutorialsStrip');
    if (!scroll || !strip) return;

    try {
        const cached = localStorage.getItem(TUT_CACHE_KEY);
        if (cached) {
            const { html, ts } = JSON.parse(cached);
            if (html && Date.now() - ts < TUT_CACHE_TTL) {
                scroll.innerHTML = html;
                strip.style.display = '';
                _fetchAndRenderTutorials(scroll, strip, true);
                return;
            }
        }
    } catch (e) { /* ignore */ }

    await _fetchAndRenderTutorials(scroll, strip, false);
}

async function _fetchAndRenderTutorials(scroll, strip, isBgRefresh) {
    try {
        const { data: tutorials, error } = await window.supabaseClient
            .from('tutorials')
            .select('id, title, course_name, department, video_url, likes_count, created_at, user_id')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!tutorials || tutorials.length === 0) {
            strip.style.display = 'none';
            localStorage.removeItem(TUT_CACHE_KEY);
            return;
        }

        const userIds = [...new Set(tutorials.map(t => t.user_id))];
        let profileMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await window.supabaseClient
                .from('profiles').select('id, full_name, avatar_url').in('id', userIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }

        const chipsHtml = tutorials.map(t => {
            const profile  = profileMap[t.user_id] || {};
            const name     = profile.full_name || 'UEW Student';
            const initials = _ini(name);
            const course   = t.course_name || t.department || 'Tutorial';
            const driveId  = extractDriveFileId(t.video_url);

            const thumbHtml = driveId
                ? `<img src="https://drive.google.com/thumbnail?id=${driveId}&sz=w400"
                        alt="${_esc(t.title)}"
                        style="width:100%;height:100%;object-fit:cover;display:block;"
                        onload="this.style.display='block';this.parentElement.querySelector('.chip-play').style.display='flex';"
                        onerror="this.style.display='none';this.parentElement.querySelector('.chip-play').style.display='flex';">
                   <div class="chip-play" style="display:none;"><i class="fas fa-play"></i></div>`
                : `<i class="fas fa-play-circle" style="font-size:2rem;color:rgba(255,255,255,0.25);"></i>
                   <div class="chip-play"><i class="fas fa-play"></i></div>`;

            const avatarHtml = profile.avatar_url
                ? `<img src="${_esc(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
                : initials;

            return `<a class="tutorial-chip" href="tutorials.html" title="${_esc(t.title)}">
                <div class="tutorial-chip-thumb">${thumbHtml}</div>
                <div class="tutorial-chip-body">
                    <div class="tutorial-chip-course">${_esc(course)}</div>
                    <div class="tutorial-chip-title">${_esc(t.title)}</div>
                    <div class="tutorial-chip-meta">
                        <div class="tutorial-chip-avatar">${avatarHtml}</div>
                        <span>${_esc(name.split(' ')[0])}</span>
                    </div>
                </div>
            </a>`;
        }).join('');

        const seeAllHtml = `<a class="tutorial-chip-seeall" href="tutorials.html">
            <i class="fas fa-th-large"></i><span>See all</span>
        </a>`;
        const finalHtml = chipsHtml + seeAllHtml;

        scroll.innerHTML = finalHtml;
        strip.style.display = '';

        try {
            localStorage.setItem(TUT_CACHE_KEY, JSON.stringify({ html: finalHtml, ts: Date.now() }));
        } catch (e) { /* storage full */ }

    } catch (err) {
        console.warn('loadTutorialsStrip:', err);
        if (!isBgRefresh) strip.style.display = 'none';
    }
}