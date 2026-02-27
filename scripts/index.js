function viewUserProfile(userId) {
 if (!userId) return;
 window.location.href = `user-profile.html?userId=${userId}`;
}
document.addEventListener('DOMContentLoaded', async function() {
 console.log('DOM loaded, initializing app...');
 let currentUser = null;
 let currentProfile = null;
 let posts = [];
 let currentFilter = 'all';
 let currentDepartmentFilter = null;
 let selectedPostForShare = null;
 const profileModal = document.getElementById('profileModal');
 const postsContainer = document.getElementById('postsContainer');
 const uploadModal = document.getElementById('uploadModal');
 const shareModal = document.getElementById('shareModal');
 const notificationBell = document.getElementById('notificationBell');
 const notificationDropdown = document.getElementById('notificationDropdown');
 const notificationBadge = document.getElementById('notificationBadge');
 const currentUserAvatar = document.getElementById('currentUserAvatar');
 const currentUserName = document.getElementById('currentUserName');
 await init();
 async function init() {
 try {
 console.log('Checking authentication...');
 const isLoggedIn = await window.isLoggedIn();
 if (!isLoggedIn) {
 console.log('Not logged in, redirecting to sign-in...');
 window.location.href = 'sign-in.html';
 return;
 }
 currentUser = await window.getCurrentUser();
 currentProfile = await window.getCurrentProfile();
 console.log('Current user:', currentUser);
 console.log('Current profile:', currentProfile);
 if (!currentUser || !currentProfile) {
 console.error('Failed to load user or profile');
 window.location.href = 'sign-in.html';
 return;
 }
 updateUserUI();
 loadDepartments();
 await loadPosts();
 await loadNotifications();
 await loadTrends();
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
 const initials = getInitials(currentProfile.full_name);
 if (currentUserAvatar) {
 if (currentProfile.avatar_url) {
 currentUserAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" alt="${currentProfile.full_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
 } else {
 currentUserAvatar.textContent = initials;
 currentUserAvatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
 currentUserAvatar.style.color = 'white';
 }
 }
 if (currentUserName) {
 currentUserName.textContent = currentProfile.full_name;
 }
 const modalUserAvatar = document.getElementById('modalUserAvatar');
 const modalUserName = document.getElementById('modalUserName');
 if (modalUserAvatar) {
 if (currentProfile.avatar_url) {
 modalUserAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" alt="${currentProfile.full_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
 } else {
 modalUserAvatar.textContent = initials;
 }
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
 if (departmentSelect) {
 departmentSelect.innerHTML = '<option value="">Select your department</option>' +
 departments.map(dept => `<option value="${dept}">${dept}</option>`).join('');
 if (currentProfile?.department) {
 departmentSelect.value = currentProfile.department;
 }
 }
 if (departmentTags) {
 departmentTags.innerHTML = `
 <div class="department-tag active" data-department="">All</div>
 ${departments.map(dept =>
 `<div class="department-tag" data-department="${dept}">${dept}</div>`
 ).join('')}
 `;
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
 if (currentUser && posts.length > 0) {
 const postIds = posts.map(p => p.id);
 const userIds = [...new Set(posts.map(p => p.user_id))].filter(id => id !== currentUser.id);
 const { data: likes } = await window.supabaseClient
 .from('likes')
 .select('post_id')
 .eq('user_id', currentUser.id)
 .in('post_id', postIds);
 const likedPostIds = new Set(likes?.map(l => l.post_id) || []);
 const { data: following } = await window.supabaseClient
 .from('followers')
 .select('following_id')
 .eq('follower_id', currentUser.id)
 .in('following_id', userIds);
 const followingIds = new Set(following?.map(f => f.following_id) || []);
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
 <i class="fas fa-image" aria-hidden="true"></i>
 <h3>No posts yet</h3>
 <p>Be the first to share something!</p>
 </div>
 `;
 return;
 }
 postsContainer.innerHTML = posts.map((post, index) => createPostHTML(post, index)).join('');
 const observer = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 const postId = entry.target.dataset.postId;
 if (postId && !entry.target.dataset.commentsLoaded) {
 entry.target.dataset.commentsLoaded = 'true';
 loadComments(postId);
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
 loadComments(post.id);
 card.dataset.commentsLoaded = 'true';
 } else {
 observer.observe(card);
 }
 }
 });
 }
 function createPostHTML(post, index = 0) {
 const profile = post.profiles || {};
 const initials = getInitials(profile.full_name || 'User');
 const timeAgo = window.timeAgo(post.created_at);
 const isOwnPost = currentUser && post.user_id === currentUser.id;
 const starRating = window.getStarRating(post.likes_count);
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
 <div class="user-avatar" onclick="viewUserProfile('${post.user_id}')" style="cursor:pointer;background:${stringToColor(profile.full_name || 'User')}" role="button" tabindex="0" aria-label="View ${escapeHTML(profile.full_name || 'user')}'s profile">
 ${avatarHTML}
 </div>
 <div>
 <div class="post-username" onclick="viewUserProfile('${post.user_id}')" style="cursor:pointer;" role="button" tabindex="0" aria-label="View ${escapeHTML(profile.full_name || 'user')}'s profile">
 ${escapeHTML(profile.full_name || 'Unknown User')}
 ${isOwnPost ? '<span class="own-post-badge" aria-label="Your post">You</span>' : ''}
 </div>
 <div class="post-meta">
 <i class="fas fa-graduation-cap" aria-hidden="true"></i>
 ${escapeHTML(profile.department || 'Unknown')}
 <time class="post-time" datetime="${post.created_at}">${timeAgo}</time>
 </div>
 </div>
 </div>
 ${!isOwnPost ? `
 <button class="follow-btn ${post.isFollowing ? 'following' : ''}" data-user-id="${post.user_id}" aria-label="${post.isFollowing ? 'Unfollow' : 'Follow'} ${escapeHTML(profile.full_name || 'user')}" aria-pressed="${post.isFollowing ? 'true' : 'false'}">
 <i class="fas ${post.isFollowing ? 'fa-user-check' : 'fa-user-plus'}" aria-hidden="true"></i>
 <span>${post.isFollowing ? 'Following' : 'Follow'}</span>
 </button>
 ` : ''}
 </div>
 ${description ? `
 <div class="post-description">
 <p class="description-text ${needsTruncation ? 'truncated' : ''}" data-full-text="${escapeHTML(description)}">${escapeHTML(truncatedDescription)}${needsTruncation ? ` <button class="see-more-btn" data-action="expand" aria-expanded="false">See more</button>` : ''}</p>
 </div>
 ` : ''}
 ${post.image_url ? `
 <div class="post-image-container">
 <img
 src="${post.image_url}"
 alt="Post by ${escapeHTML(profile.full_name || 'user')}${description ? ': ' + escapeHTML(description.substring(0, 100)) : ''}"
 class="post-image"
 ${isLCP ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'}
 decoding="${isLCP ? 'sync' : 'async'}"
 >
 ${starRating.stars > 0 ? `
 <div class="star-rating-badge stars-${starRating.stars}" aria-label="${starRating.stars} star${starRating.stars > 1 ? 's' : ''} - ${starRating.label}">
 ${Array(starRating.stars).fill('<i class="fas fa-star" aria-hidden="true"></i>').join('')}
 <span class="star-rating-label">${starRating.label}</span>
 </div>
 ` : ''}
 </div>
 ` : ''}
 <div class="post-stats" aria-label="Post statistics">
 <span class="stat-item">
 <i class="fas fa-heart" aria-hidden="true"></i>
 <span class="likes-count">${post.likes_count || 0}</span> likes
 </span>
 <span class="stat-item">
 <i class="fas fa-comment" aria-hidden="true"></i>
 <span class="comments-count">${post.comments_count || 0}</span> comments
 </span>
 <span class="stat-item">
 <i class="fas fa-share" aria-hidden="true"></i>
 ${post.shares_count} shares
 </span>
 </div>
 <div class="post-actions" role="group" aria-label="Post actions">
 <button class="action-btn like-btn ${post.isLiked ? 'liked' : ''}" data-action="like" aria-label="${post.isLiked ? 'Unlike post' : 'Like post'}" aria-pressed="${post.isLiked ? 'true' : 'false'}">
 <i class="fas fa-heart" aria-hidden="true"></i>
 <span>Like</span>
 </button>
 <button class="action-btn comment-btn" data-action="comment" aria-label="Comment on post">
 <i class="fas fa-comment" aria-hidden="true"></i>
 <span>Comment</span>
 </button>
 <button class="action-btn share-btn" data-action="share" aria-label="Share post">
 <i class="fas fa-share" aria-hidden="true"></i>
 <span>Share</span>
 </button>
 </div>
 <div class="comments-section" data-post-id="${post.id}">
 <div class="comment-input-wrapper">
 <div class="user-avatar small" aria-hidden="true">${getInitials(currentProfile?.full_name || 'U')}</div>
 <input
 type="text"
 class="comment-input"
 placeholder="Write a comment..."
 data-post-id="${post.id}"
 aria-label="Write a comment"
 >
 <button class="send-comment-btn" data-post-id="${post.id}" disabled aria-label="Send comment" aria-disabled="true">
 <i class="fas fa-paper-plane" aria-hidden="true"></i>
 </button>
 </div>
 <div class="comments-list" data-post-id="${post.id}" role="list" aria-label="Comments">
 </div>
 </div>
 </article>
 `;
 }
 function setupPostEventListeners(postId) {
 const postCard = document.querySelector(`[data-post-id="${postId}"]`);
 if (!postCard) return;
 const likeBtn = postCard.querySelector('.like-btn');
 if (likeBtn) {
 likeBtn.addEventListener('click', () => handleLike(postId));
 }
 const commentBtn = postCard.querySelector('.comment-btn');
 if (commentBtn) {
 commentBtn.addEventListener('click', () => {
 const commentsSection = postCard.querySelector('.comments-section');
 const commentInput = postCard.querySelector('.comment-input');
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
 const shareBtn = postCard.querySelector('.share-btn');
 if (shareBtn) {
 shareBtn.addEventListener('click', () => openShareModal(postId));
 }
 const followBtn = postCard.querySelector('.follow-btn');
 if (followBtn) {
 const userId = followBtn.dataset.userId;
 followBtn.addEventListener('click', () => handleFollow(userId, followBtn));
 }
 const seeMoreBtn = postCard.querySelector('.see-more-btn');
 if (seeMoreBtn) {
 seeMoreBtn.addEventListener('click', function() {
 const descriptionText = postCard.querySelector('.description-text');
 const fullText = descriptionText.dataset.fullText;
 const isExpanded = this.dataset.action === 'collapse';
 const btn = this;
 if (isExpanded) {
 const maxLength = 200;
 descriptionText.innerHTML = '';
 descriptionText.appendChild(document.createTextNode(fullText.substring(0, maxLength) + '... '));
 descriptionText.appendChild(btn);
 btn.textContent = 'See more';
 btn.dataset.action = 'expand';
 descriptionText.classList.add('truncated');
 } else {
 descriptionText.innerHTML = '';
 descriptionText.appendChild(document.createTextNode(fullText + ' '));
 descriptionText.appendChild(btn);
 btn.textContent = 'See less';
 btn.dataset.action = 'collapse';
 descriptionText.classList.remove('truncated');
 }
 });
 }
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
 loadComments(postId);
 }
 async function handleLike(postId) {
 try {
 const post = posts.find(p => p.id === postId);
 if (!post) return;
 const result = await window.toggleLike(postId);
 if (result.success) {
 post.isLiked = result.liked;
 post.likes_count = result.liked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 0) - 1);
 const postCard = document.querySelector(`[data-post-id="${postId}"]`);
 if (postCard) {
 const likeBtn = postCard.querySelector('.like-btn');
 const likesCount = postCard.querySelector('.likes-count');
 if (likeBtn) {
 likeBtn.classList.toggle('liked', post.isLiked);
 likeBtn.setAttribute('aria-pressed', post.isLiked ? 'true' : 'false');
 likeBtn.setAttribute('aria-label', post.isLiked ? 'Unlike post' : 'Like post');
 }
 if (likesCount) {
 likesCount.textContent = post.likes_count;
 }
 const starRating = window.getStarRating(post.likes_count);
 const imageContainer = postCard.querySelector('.post-image-container');
 if (imageContainer) {
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
 }
 } catch (error) {
 console.error('Error handling like:', error);
 showToast('Failed to update like', 'error');
 }
 }
 async function handleFollow(userId, button) {
 try {
 if (!userId || !button) return false;
 const result = await window.toggleFollow(userId);
 if (result.success) {
 if (button.classList.contains('follow-btn')) {
 button.classList.toggle('following', result.following);
 const icon = button.querySelector('i');
 const span = button.querySelector('span');
 if (icon) icon.className = result.following ? 'fas fa-user-check' : 'fas fa-user-plus';
 if (span) span.textContent = result.following ? 'Following' : 'Follow';
 }
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
 async function handleComment(postId, content) {
 try {
 const result = await window.addComment(postId, content);
 if (result.success) {
 const postCard = document.querySelector(`[data-post-id="${postId}"]`);
 if (postCard) {
 const commentInput = postCard.querySelector('.comment-input');
 const sendBtn = postCard.querySelector('.send-comment-btn');
 if (commentInput) commentInput.value = '';
 if (sendBtn) sendBtn.disabled = true;
 const post = posts.find(p => p.id === postId);
 if (post) {
 post.comments_count = (post.comments_count || 0) + 1;
 const commentsCount = postCard.querySelector('.comments-count');
 if (commentsCount) {
 commentsCount.textContent = post.comments_count;
 }
 }
 }
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
 console.log('Sending reply:', { postId, commentId, content });
 const result = await window.addComment(postId, content, commentId);
 console.log('Reply result:', result);
 if (result.success) {
 const replyContainer = document.querySelector(`.reply-input-container[data-comment-id="${commentId}"]`);
 if (replyContainer) {
 replyContainer.classList.remove('show');
 const input = replyContainer.querySelector('.reply-input');
 if (input) input.value = '';
 }
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
 if (comments.length === 0) {
 container.innerHTML = '<p class="no-comments-text" style="text-align: center; color: #65676b; padding: 10px;">No comments yet. Be the first to comment!</p>';
 return;
 }
 const topLevelComments = comments.filter(c => !c.parent_comment_id);
 const repliesMap = {};
 comments.forEach(comment => {
 if (comment.parent_comment_id) {
 if (!repliesMap[comment.parent_comment_id]) {
 repliesMap[comment.parent_comment_id] = [];
 }
 repliesMap[comment.parent_comment_id].push(comment);
 }
 });
 topLevelComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
 Object.keys(repliesMap).forEach(commentId => {
 repliesMap[commentId].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
 });
 container.innerHTML = topLevelComments.map(comment => {
 const replies = repliesMap[comment.id] || [];
 return createCommentHTML(comment, postId, replies);
 }).join('');
 container.querySelectorAll('.reply-btn').forEach(btn => {
 btn.addEventListener('click', function() {
 const commentId = this.dataset.commentId;
 toggleReplyInput(postId, commentId);
 });
 });
 container.querySelectorAll('.reply-input').forEach(input => {
 const sendBtn = input.nextElementSibling;
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
 container.querySelectorAll('.send-reply-btn').forEach(btn => {
 btn.addEventListener('click', function() {
 const commentId = this.dataset.commentId;
 const replyInput = document.querySelector(`[data-reply-to="${commentId}"]`);
 if (replyInput && replyInput.value.trim()) {
 handleReply(postId, commentId, replyInput.value.trim());
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
 <div class="comment-author">${escapeHTML(profile.full_name || 'Unknown')}</div>
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
 <div class="comment-author">${escapeHTML(profile.full_name || 'Unknown')}</div>
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
 document.querySelectorAll('.reply-input-container.show').forEach(container => {
 container.classList.remove('show');
 });
 if (!isVisible) {
 replyContainer.classList.add('show');
 const input = replyContainer.querySelector('.reply-input');
 if (input) {
 setTimeout(() => input.focus(), 100);
 }
 }
 }
 }
 function stringToColor(str) {
 let hash = 0;
 for (let i = 0; i < str.length; i++) {
 hash = str.charCodeAt(i) + ((hash << 5) - hash);
 }
 const hue = hash % 360;
 return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
 }
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
 const submitBtnText = document.getElementById('submitBtnText');
 if (submitPostBtn) submitPostBtn.disabled = true;
 if (submitBtnText) submitBtnText.textContent = 'Posting...';
 const result = await window.createPost(description, imageFile, department);
 if (result.success) {
 showToast('Post created successfully!', 'success');
 if (postDescription) postDescription.value = '';
 if (charCount) charCount.textContent = '0';
 if (imageInput) imageInput.value = '';
 if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
 if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
 uploadModal.classList.remove('show');
 await loadPosts();
 } else {
 showToast(result.error || 'Failed to create post', 'error');
 }
 } catch (error) {
 console.error('Error creating post:', error);
 showToast('Failed to create post', 'error');
 } finally {
 const submitBtnText = document.getElementById('submitBtnText');
 if (submitPostBtn) submitPostBtn.disabled = false;
 if (submitBtnText) submitBtnText.textContent = 'Post';
 }
 }
 }
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
 async function loadTrends() {
 const trendsList = document.getElementById('trendsList');
 if (!trendsList) return;
 const trends = [
 { tag: 'CampusLife', posts: 245 },
 { tag: 'UEWEvents', posts: 189 },
 { tag: 'StudyTips', posts: 156 },
 { tag: 'SportsDay', posts: 134 }
 ];
 trendsList.setAttribute('role', 'list');
 trendsList.innerHTML = trends.map(trend => `
 <div class="trend-item" role="listitem">
 <div class="trend-tag">#${trend.tag}</div>
 <div class="trend-count">${trend.posts} posts</div>
 </div>
 `).join('');
 }
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
 function setupEventListeners() {
 setupCreatePostModal();
 setupShareModal();
 document.querySelectorAll('.filter-btn').forEach(btn => {
 btn.addEventListener('click', function() {
 document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
 this.classList.add('active');
 currentFilter = this.dataset.filter;
 loadPosts();
 });
 });
 if (notificationBell) {
 notificationBell.addEventListener('click', (e) => {
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
 document.addEventListener('click', (e) => {
 if (notificationDropdown && !notificationBell.contains(e.target) && !notificationDropdown.contains(e.target)) {
 notificationDropdown.classList.remove('show');
 }
 });
 const userProfile = document.getElementById('userProfile');
 if (userProfile) {
 userProfile.style.cursor = 'pointer';
 userProfile.addEventListener('click', function() {
 window.goToOwnProfile();
 });
 userProfile.addEventListener('mouseenter', function() {
 this.style.opacity = '0.8';
 });
 userProfile.addEventListener('mouseleave', function() {
 this.style.opacity = '1';
 });
 }
 }
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
 window.showToast = showToast;
});
window.goToOwnProfile = function() {
 window.location.href = 'user-profile.html';
};