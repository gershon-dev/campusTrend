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
    posts_count: 0,
    followers_count: 0,
    following_count: 0,
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

        // Load posts and update stats display
        await loadUserPosts();

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
                posts_count: profile.posts_count || 0,
                followers_count: profile.followers_count || 0,
                following_count: profile.following_count || 0,
                created_at: profile.created_at
            };

            updateProfileUI();
            updateStatsFromProfile();
            
            // Show edit buttons for own profile
            document.getElementById('editAvatarBtn').style.display = 'flex';
            document.getElementById('editProfileBtn').style.display = 'inline-flex';
            document.getElementById('followBtn').style.display = 'none';
            document.getElementById('messageBtn').style.display = 'none';

            // Show conversations section
            const convoSection = document.getElementById('conversationsSection');
            if (convoSection) convoSection.style.display = 'block';
            loadConversations(user.id);
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
                posts_count: profile.posts_count || 0,
                followers_count: profile.followers_count || 0,
                following_count: profile.following_count || 0,
                created_at: profile.created_at
            };

            updateProfileUI();
            updateStatsFromProfile();
            
            // Show follow button for other users
            document.getElementById('editAvatarBtn').style.display = 'none';
            document.getElementById('editProfileBtn').style.display = 'none';
            const followBtn = document.getElementById('followBtn');
            followBtn.style.display = 'inline-flex';
            followBtn.onclick = handleFollowClick;
            
            // Check if already following and update button state
            await updateFollowButton();

            // Show message button if there's a follow relationship
            await updateMessageButton();
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
        avatarImage.style.width = '100%';
        avatarImage.style.height = '100%';
        avatarImage.style.objectFit = 'cover';
        avatarImage.style.borderRadius = '50%';
        avatarInitials.style.display = 'none';
        // Fallback if image fails to load
        avatarImage.onerror = function() {
            avatarImage.style.display = 'none';
            avatarInitials.style.display = 'flex';
            avatarInitials.textContent = initials;
        };
    } else {
        avatarImage.style.display = 'none';
        avatarInitials.style.display = 'flex';
        avatarInitials.textContent = initials;
    }

    // Update profile info
    document.getElementById('profileName').textContent = profileData.full_name;
    // Show department as the subtitle instead of index number (index numbers are private)
    document.getElementById('profileUsername').textContent = profileData.department || 'UEW Student';
    document.getElementById('profileDepartment').style.display = 'none'; // hide duplicate since it's now in username line
    
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

// Update stats from profile data
function updateStatsFromProfile() {
    // Show cached values immediately while the accurate count loads
    statsData.followers = profileData.followers_count;
    statsData.following = profileData.following_count;
    statsData.postsCount = profileData.posts_count;

    document.getElementById('followersCount').textContent = statsData.followers;
    document.getElementById('followingCount').textContent = statsData.following;

    // Always recount live from the followers table — the cached column
    // can be stale if someone followed from the index feed (RLS blocks
    // updating another user's profile row from client code)
    refreshFollowerCounts();
}

async function refreshFollowerCounts() {
    try {
        const [followersRes, followingRes] = await Promise.all([
            window.supabaseClient
                .from('followers')
                .select('id', { count: 'exact', head: true })
                .eq('following_id', currentProfileUserId),
            window.supabaseClient
                .from('followers')
                .select('id', { count: 'exact', head: true })
                .eq('follower_id', currentProfileUserId)
        ]);

        const followers = followersRes.count ?? statsData.followers;
        const following = followingRes.count ?? statsData.following;

        statsData.followers = followers;
        statsData.following = following;
        document.getElementById('followersCount').textContent = followers;
        document.getElementById('followingCount').textContent = following;
    } catch (err) {
        console.error('refreshFollowerCounts error:', err);
    }
}

// ============================================
// POSTS LOADING - FIXED QUERY
// ============================================

// ============================================
// DIAGNOSTIC VERSION - POSTS LOADING
// Replace your loadUserPosts function with this
// to see detailed error information
// ============================================

async function loadUserPosts() {
    try {
        console.log('=== STARTING POST LOAD ===');
        console.log('Current profile user ID:', currentProfileUserId);
        
        // Check if we have a valid user ID
        if (!currentProfileUserId) {
            console.error('ERROR: No currentProfileUserId set!');
            showToast('Profile user ID not set', 'error');
            return;
        }
        
        // STEP 1: Fetch posts with simplified query first
        console.log('Step 1: Fetching posts...');
        const { data: posts, error: postsError } = await window.supabaseClient
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
            .eq('user_id', currentProfileUserId)
            .order('created_at', { ascending: false });
        
        if (postsError) {
            console.error('ERROR loading posts:', postsError);
            console.error('Error details:', {
                message: postsError.message,
                details: postsError.details,
                hint: postsError.hint,
                code: postsError.code
            });
            showToast('Error loading posts: ' + postsError.message, 'error');
            return;
        }

        const userPosts = posts || [];
        console.log('✓ Posts loaded successfully:', userPosts.length);
        console.log('Posts data:', userPosts);

        // STEP 2: Fetch likes separately
        console.log('Step 2: Fetching likes...');
        const postIds = userPosts.map(p => p.id);
        let likesData = [];
        
        if (postIds.length > 0) {
            const { data: likes, error: likesError } = await window.supabaseClient
                .from('likes')
                .select('id, user_id, post_id')
                .in('post_id', postIds);
            
            if (likesError) {
                console.error('ERROR loading likes:', likesError);
            } else {
                likesData = likes || [];
                console.log('✓ Likes loaded:', likesData.length);
            }
        }

        // STEP 3: Fetch comments separately
        console.log('Step 3: Fetching comments...');
        let commentsData = [];
        
        if (postIds.length > 0) {
            const { data: comments, error: commentsError } = await window.supabaseClient
                .from('comments')
                .select('id, content, created_at, user_id, post_id, parent_comment_id')
                .in('post_id', postIds)
                .order('created_at', { ascending: true });
            
            if (commentsError) {
                console.error('ERROR loading comments:', commentsError);
            } else {
                commentsData = comments || [];
                console.log('✓ Comments loaded:', commentsData.length);
            }
        }

        // STEP 4: Fetch comment author profiles
        console.log('Step 4: Fetching comment author profiles...');
        const commentUserIds = [...new Set(commentsData.map(c => c.user_id))];
        let commentProfiles = {};
        
        if (commentUserIds.length > 0) {
            const { data: profiles, error: profilesError } = await window.supabaseClient
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', commentUserIds);
            
            if (profilesError) {
                console.error('ERROR loading comment profiles:', profilesError);
            } else {
                (profiles || []).forEach(profile => {
                    commentProfiles[profile.id] = profile;
                });
                console.log('✓ Comment profiles loaded:', Object.keys(commentProfiles).length);
            }
        }

        // STEP 5: Combine all data
        console.log('Step 5: Combining data...');
        userPosts.forEach(post => {
            // Attach likes
            post.likes = likesData.filter(like => like.post_id === post.id);
            
            // Attach comments with profiles
            post.comments = commentsData
                .filter(comment => comment.post_id === post.id)
                .map(comment => ({
                    ...comment,
                    profiles: commentProfiles[comment.user_id] || null
                }));
        });
        
        console.log('✓ Data combined successfully');

        // STEP 6: Fetch tutorials by this user
        console.log('Step 6: Fetching tutorials...');
        let userTutorials = [];
        const { data: tutorials, error: tutorialsError } = await window.supabaseClient
            .from('tutorials')
            .select('*')
            .eq('user_id', currentProfileUserId)
            .order('created_at', { ascending: false });

        if (tutorialsError) {
            console.error('ERROR loading tutorials:', tutorialsError);
        } else {
            userTutorials = tutorials || [];
            console.log('✓ Tutorials loaded:', userTutorials.length);
        }

        // Calculate total likes and stars (posts + tutorials)
        statsData.totalLikes = 0;
        statsData.totalStars = 0;

        userPosts.forEach(post => {
            const likes = post.likes_count || 0;
            statsData.totalLikes += likes;
            const rating = window.getStarRating(likes);
            statsData.totalStars += rating.stars;
        });
        userTutorials.forEach(tut => {
            const likes = tut.likes_count || 0;
            statsData.totalLikes += likes;
            const rating = window.getStarRating(likes);
            statsData.totalStars += rating.stars;
        });

        // Update UI
        document.getElementById('totalLikes').textContent = statsData.totalLikes;
        document.getElementById('totalStars').textContent = statsData.totalStars;

        // --- Render IMAGE POSTS section ---
        if (userPosts.length === 0) {
            document.getElementById('noPosts').style.display = 'block';
            document.getElementById('postsContainer').innerHTML = '';
            const noPostsMessage = document.getElementById('noPostsMessage');
            noPostsMessage.textContent = isOwnProfile
                ? 'Share your first post with the campus community!'
                : "This user hasn't posted anything yet.";
        } else {
            document.getElementById('noPosts').style.display = 'none';
            await renderPosts(userPosts);
        }
        const imgCountEl = document.getElementById('imagePostCount');
        if (imgCountEl) imgCountEl.textContent = userPosts.length;

        // --- Render TUTORIAL VIDEOS section ---
        await renderTutorials(userTutorials);

        console.log('=== POST LOAD COMPLETE ===');
        
    } catch (error) {
        console.error('=== CRITICAL ERROR ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error object:', error);
        showToast('Error loading posts: ' + error.message, 'error');
    }
}

// INSTRUCTIONS:
// 1. Replace your loadUserPosts function with this diagnostic version
// 2. Open browser Console (F12)
// 3. Reload the profile page
// 4. Copy ALL the console output and share it
// 5. This will help identify exactly where the error is happening

// Render posts as full cards
async function renderPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    // Sort posts by date (newest first)
    const sortedPosts = [...posts].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );

    const currentUser = await window.getCurrentUser();
    
    const postCards = sortedPosts.map(post => {
        const userInitials = getInitials(post.profiles?.full_name || 'User');
        const rating = window.getStarRating(post.likes_count || 0);
        const timeAgo = window.timeAgo(post.created_at);
        
        // Check if current user liked this post
        let isLiked = false;
        if (currentUser && post.likes) {
            isLiked = post.likes.some(like => like.user_id === currentUser.id);
        }

        // Separate top-level comments and replies
        const allComments = post.comments || [];
        const topLevelComments = allComments.filter(c => !c.parent_comment_id);
        const repliesMap = {};
        allComments.forEach(c => {
            if (c.parent_comment_id) {
                if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = [];
                repliesMap[c.parent_comment_id].push(c);
            }
        });

        const commentsHTML = topLevelComments.length > 0
            ? topLevelComments.map(comment => buildCommentHTML(comment, repliesMap, post.id)).join('')
            : '<p class="no-comments-text">No comments yet. Be the first to comment!</p>';

        const isOwnPost = currentUser && post.user_id === currentUser.id;

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${post.profiles?.avatar_url ? 
                            `<img src="${post.profiles.avatar_url}" alt="${escapeHtml(post.profiles.full_name)}">` :
                            `<span>${userInitials}</span>`
                        }
                    </div>
                    <div class="post-user-info">
                        <div class="post-username">${escapeHtml(post.profiles?.full_name || 'Unknown User')}</div>
                        <div class="post-meta">
                            <i class="fas fa-clock"></i>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                    ${isOwnPost ? `
                    <div class="post-menu-wrapper">
                        <button class="post-menu-btn" data-post-id="${post.id}" aria-label="Post options">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                        <div class="post-menu-dropdown" id="menu-${post.id}">
                            <button class="post-menu-item delete" data-post-id="${post.id}">
                                <i class="fas fa-trash-alt"></i>
                                <span>Delete Post</span>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>

                ${post.content ? `<div class="post-description">${escapeHtml(post.content)}</div>` : ''}

                <div class="post-image-container">
                    ${post.image_url ? 
                        `<img src="${post.image_url}" alt="Post image" class="post-image" loading="lazy">` :
                        '<div style="padding:60px;text-align:center;color:#65676b"><i class="fas fa-image" style="font-size:48px"></i></div>'
                    }
                    ${rating.stars > 0 ? `
                        <div class="post-star-badge">
                            ${'<i class="fas fa-star"></i>'.repeat(rating.stars)}
                            <span>${rating.label}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="post-content">
                    <div class="post-department-tag">
                        <i class="fas fa-building"></i>
                        ${escapeHtml(post.department || 'General')}
                    </div>

                    <div class="post-actions">
                        <button class="post-action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" aria-pressed="${isLiked}">
                            <i class="fas fa-heart"></i>
                            <span class="likes-count">${post.likes_count || 0}</span>
                        </button>
                        <button class="post-action-btn comment-toggle-btn" data-post-id="${post.id}">
                            <i class="fas fa-comment"></i>
                            <span class="comments-count">${allComments.filter(c => !c.parent_comment_id).length}</span>
                        </button>
                        <button class="post-action-btn" onclick="sharePost('${post.id}')">
                            <i class="fas fa-share"></i>
                            <span>Share</span>
                        </button>
                    </div>
                </div>

                <div class="post-comments-section" id="comments-${post.id}" style="display:none;">
                    <div class="comments-list" id="comments-list-${post.id}">
                        ${commentsHTML}
                    </div>
                    <div class="comment-input-section">
                        <div class="comment-input-wrapper">
                            <input type="text"
                                   class="comment-input"
                                   id="comment-input-${post.id}"
                                   placeholder="Write a comment..."
                                   maxlength="500">
                            <button class="comment-submit-btn" data-post-id="${post.id}" disabled>
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = postCards.join('');

    // Attach all event listeners after DOM is ready
    sortedPosts.forEach(post => {
        setupPostListeners(post.id);
    });
}


// ============================================
// TUTORIAL RENDERING - SEPARATE SECTION
// ============================================


// ============================================
// POST FILTER TABS
// ============================================

function switchPostFilter(type) {
    const imageBtn      = document.getElementById('filterImageBtn');
    const tutorialBtn   = document.getElementById('filterTutorialBtn');
    const imagePosts    = document.getElementById('imagePosts');
    const tutorialPosts = document.getElementById('tutorialPosts');
    if (type === 'image') {
        imageBtn.classList.add('active');
        tutorialBtn.classList.remove('active');
        imagePosts.style.display    = 'block';
        tutorialPosts.style.display = 'none';
    } else {
        tutorialBtn.classList.add('active');
        imageBtn.classList.remove('active');
        tutorialPosts.style.display = 'block';
        imagePosts.style.display    = 'none';
    }
}

async function renderTutorials(tutorials) {
    const container = document.getElementById('tutorialsContainer');
    const noTuts    = document.getElementById('noTutorials');
    const countEl   = document.getElementById('tutorialPostCount');
    if (!container) return;

    if (countEl) countEl.textContent = tutorials.length;

    if (tutorials.length === 0) {
        container.innerHTML = '';
        if (noTuts) noTuts.style.display = 'block';
        return;
    }

    if (noTuts) noTuts.style.display = 'none';

    const currentUser = await window.getCurrentUser();

    container.innerHTML = tutorials.map(tut => buildTutorialCard(tut, currentUser)).join('');

    // Wire up delete buttons
    tutorials.forEach(tut => {
        const card = container.querySelector(`[data-tutorial-id="${tut.id}"]`);
        if (!card) return;
        const menuBtn = card.querySelector('.tut-menu-btn');
        const menuDropdown = card.querySelector('.post-menu-dropdown');
        if (menuBtn && menuDropdown) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.post-menu-dropdown.open').forEach(m => {
                    if (m !== menuDropdown) m.classList.remove('open');
                });
                menuDropdown.classList.toggle('open');
            });
        }
        const deleteBtn = card.querySelector('.tut-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeleteTutorial(tut.id, card));
        }
    });
}

function buildTutorialCard(tut, currentUser) {
    const initials = getInitials(profileData.full_name || 'User');
    const timeAgo = window.timeAgo(tut.created_at);
    const isOwnTut = currentUser && tut.user_id === currentUser.id;

    // Convert Google Drive share URL → embed URL (matches /file/d/ID and ?id=ID patterns)
    function getDriveEmbedUrl(url) {
        if (!url) return null;
        url = url.trim();
        const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (m1) return 'https://drive.google.com/file/d/' + m1[1] + '/preview';
        const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m2) return 'https://drive.google.com/file/d/' + m2[1] + '/preview';
        return null;
    }
    const embedUrl = getDriveEmbedUrl(tut.video_url);

    // Department + course badge
    const deptTag = tut.department
        ? '<span class="tut-dept-badge"><i class="fas fa-book-open"></i> ' +
          escapeHtml(tut.department) + (tut.course_code ? ' · ' + escapeHtml(tut.course_code) : '') + '</span>'
        : '';

    // Tags
    const tagsHTML = (tut.tags && tut.tags.length)
        ? '<div class="tut-tags">' + tut.tags.map(t => '<span class="tut-tag">#' + escapeHtml(t) + '</span>').join('') + '</div>'
        : '';

    // Description (truncated)
    const desc = tut.description || '';
    const isLong = desc.length > 120;
    const descId = 'tut-desc-' + tut.id;
    const descHTML = desc ? (
        '<div class="tut-description">' +
        '<span id="' + descId + '-short">' + escapeHtml(isLong ? desc.slice(0, 120) + '…' : desc) + '</span>' +
        (isLong
            ? '<span id="' + descId + '-full" style="display:none">' + escapeHtml(desc) + '</span>' +
              '<button class="tut-read-more" onclick="' +
                  'document.getElementById(\'' + descId + '-short\').style.display=\'none\';' +
                  'document.getElementById(\'' + descId + '-full\').style.display=\'inline\';' +
                  'this.style.display=\'none\';">See more</button>'
            : '') +
        '</div>'
    ) : '';

    // Avatar
    const avatarHtml = profileData.avatar_url
        ? '<img src="' + profileData.avatar_url + '" alt="' + escapeHtml(profileData.full_name) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : '<span>' + initials + '</span>';

    // Video: auto-embed iframe (no click-to-play)
    const videoHTML = embedUrl
        ? '<div class="tut-video-container"><iframe src="' + embedUrl + '" allowfullscreen allow="autoplay" loading="lazy" style="width:100%;aspect-ratio:16/9;border:none;display:block;"></iframe></div>'
        : '<div class="tut-no-video"><i class="fas fa-video-slash"></i><span>No video available</span></div>';

    return '<div class="post-card tutorial-card-profile" data-tutorial-id="' + tut.id + '">' +

        // Header
        '<div class="post-header">' +
            '<div class="post-avatar">' + avatarHtml + '</div>' +
            '<div class="post-user-info">' +
                '<div class="post-username">' + escapeHtml(profileData.full_name || 'Unknown') + '</div>' +
                '<div class="post-meta">' +
                    '<i class="fas fa-play-circle" style="color:#1877f2"></i>' +
                    '<span> Tutorial &nbsp;·&nbsp; </span>' +
                    '<i class="fas fa-clock"></i><span> ' + timeAgo + '</span>' +
                '</div>' +
            '</div>' +
            (isOwnTut
                ? '<div class="post-menu-wrapper">' +
                      '<button class="post-menu-btn tut-menu-btn" aria-label="Tutorial options"><i class="fas fa-ellipsis-h"></i></button>' +
                      '<div class="post-menu-dropdown">' +
                          '<button class="post-menu-item delete tut-delete-btn" data-tutorial-id="' + tut.id + '">' +
                              '<i class="fas fa-trash-alt"></i><span>Delete Tutorial</span>' +
                          '</button>' +
                      '</div>' +
                  '</div>'
                : '') +
        '</div>' +

        // Title + dept
        '<div class="tut-title-row">' +
            '<div class="tut-title">' + escapeHtml(tut.title || 'Untitled Tutorial') + '</div>' +
            deptTag +
        '</div>' +

        // Description
        descHTML +

        // Tags
        tagsHTML +

        // Video (auto-embed)
        videoHTML +

        // Action bar
        '<div class="post-content">' +
            '<div class="post-actions">' +
                '<span class="post-action-btn tut-views-badge" style="cursor:default;pointer-events:none;">' +
                    '<i class="fas fa-eye"></i><span> ' + (tut.views_count || 0) + '</span>' +
                '</span>' +
                '<span class="post-action-btn" style="cursor:default;pointer-events:none;">' +
                    '<i class="fas fa-heart" style="color:#e53935"></i><span> ' + (tut.likes_count || 0) + '</span>' +
                '</span>' +
                '<button class="post-action-btn" onclick="shareTutorial(\'' + tut.id + '\')">' +
                    '<i class="fas fa-share"></i><span>Share</span>' +
                '</button>' +
            '</div>' +
        '</div>' +

    '</div>';
}

function shareTutorial(tutId) {
    const url = window.location.origin + '/tutorials.html';
    if (navigator.share) {
        navigator.share({ title: 'Check out this tutorial on CampusTrend', url: url });
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'));
    }
}

async function handleDeleteTutorial(tutId, card) {
    document.querySelectorAll('.post-menu-dropdown.open').forEach(m => m.classList.remove('open'));
    if (!confirm('Delete this tutorial? This cannot be undone.')) return;
    try {
        const { error } = await window.supabaseClient.from('tutorials').delete().eq('id', tutId);
        if (!error) {
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.97)';
            setTimeout(() => {
                card.remove();
                showToast('Tutorial deleted', 'success');
            }, 300);
        } else {
            showToast('Failed to delete tutorial', 'error');
        }
    } catch (e) {
        showToast('Failed to delete tutorial', 'error');
    }
}

// Build a single comment's HTML (with nested replies)
function buildCommentHTML(comment, repliesMap, postId) {
    const initials = getInitials(comment.profiles?.full_name || 'User');
    const timeAgo = window.timeAgo(comment.created_at);
    const replies = repliesMap[comment.id] || [];

    const repliesHTML = replies.map(reply => {
        const replyInitials = getInitials(reply.profiles?.full_name || 'User');
        const replyTimeAgo = window.timeAgo(reply.created_at);
        return `
            <div class="comment reply-comment" data-comment-id="${reply.id}">
                <div class="comment-avatar">${replyInitials}</div>
                <div class="comment-body">
                    <div class="comment-content">
                        <div class="comment-author">${escapeHtml(reply.profiles?.full_name || 'Unknown')}</div>
                        <div class="comment-text">${escapeHtml(reply.content)}</div>
                    </div>
                    <div class="comment-meta">${replyTimeAgo}</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="comment" data-comment-id="${comment.id}">
            <div class="comment-avatar">${initials}</div>
            <div class="comment-body">
                <div class="comment-content">
                    <div class="comment-author">${escapeHtml(comment.profiles?.full_name || 'Unknown')}</div>
                    <div class="comment-text">${escapeHtml(comment.content)}</div>
                </div>
                <div class="comment-meta">
                    <span>${timeAgo}</span>
                    <button class="reply-toggle-btn" data-comment-id="${comment.id}" data-post-id="${postId}">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="replies-container">${repliesHTML}</div>` : ''}
                <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;">
                    <input type="text" class="reply-input" placeholder="Write a reply..." maxlength="500" data-comment-id="${comment.id}" data-post-id="${postId}">
                    <button class="reply-submit-btn" data-comment-id="${comment.id}" data-post-id="${postId}" disabled>
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Setup all event listeners for a post card
function setupPostListeners(postId) {
    const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (!card) return;

    // Like button
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => handleLikeClick(postId, likeBtn));
    }

    // Comment toggle
    const commentToggle = card.querySelector('.comment-toggle-btn');
    if (commentToggle) {
        commentToggle.addEventListener('click', () => toggleComments(postId));
    }

    // Comment input + submit
    const commentInput = card.querySelector(`#comment-input-${postId}`);
    const commentSubmit = card.querySelector(`.comment-submit-btn[data-post-id="${postId}"]`);
    if (commentInput && commentSubmit) {
        commentInput.addEventListener('input', () => {
            commentSubmit.disabled = !commentInput.value.trim();
        });
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && commentInput.value.trim()) {
                e.preventDefault();
                submitComment(postId, commentInput);
            }
        });
        commentSubmit.addEventListener('click', () => submitComment(postId, commentInput));
    }

    // Reply toggle buttons (event delegation on comments list)
    const commentsList = card.querySelector(`#comments-list-${postId}`);
    if (commentsList) {
        commentsList.addEventListener('click', (e) => {
            const replyToggle = e.target.closest('.reply-toggle-btn');
            if (replyToggle) {
                const commentId = replyToggle.dataset.commentId;
                toggleReplyInput(commentId);
            }
        });
        commentsList.addEventListener('input', (e) => {
            if (e.target.classList.contains('reply-input')) {
                const submitBtn = e.target.closest('.reply-input-container')
                    ?.querySelector('.reply-submit-btn');
                if (submitBtn) submitBtn.disabled = !e.target.value.trim();
            }
        });
        commentsList.addEventListener('keypress', (e) => {
            if (e.target.classList.contains('reply-input') && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const commentId = e.target.dataset.commentId;
                const replyPostId = e.target.dataset.postId;
                if (e.target.value.trim()) submitReply(replyPostId, commentId, e.target);
            }
        });
        commentsList.addEventListener('click', (e) => {
            const replySubmit = e.target.closest('.reply-submit-btn');
            if (replySubmit) {
                const commentId = replySubmit.dataset.commentId;
                const replyPostId = replySubmit.dataset.postId;
                const input = document.querySelector(`.reply-input[data-comment-id="${commentId}"]`);
                if (input && input.value.trim()) submitReply(replyPostId, commentId, input);
            }
        });
    }

    // 3-dot menu toggle
    const menuBtn = card.querySelector('.post-menu-btn');
    const menuDropdown = card.querySelector('.post-menu-dropdown');
    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.post-menu-dropdown.open').forEach(m => {
                if (m !== menuDropdown) m.classList.remove('open');
            });
            menuDropdown.classList.toggle('open');
        });
    }

    // Delete button
    const deleteBtn = card.querySelector('.post-menu-item.delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeletePost(postId, card));
    }
}

// ============================================
// COMMENT FUNCTIONALITY
// ============================================

async function handleDeletePost(postId, card) {
    const menu = card.querySelector('.post-menu-dropdown');
    if (menu) menu.classList.remove('open');
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
        const result = await window.deletePost(postId);
        if (result.success) {
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.97)';
            setTimeout(() => {
                card.remove();
                // Update posts count display
                const countEl = document.getElementById('imagePostCount');
                if (countEl) countEl.textContent = Math.max(0, (parseInt(countEl.textContent) || 1) - 1);
                showToast('Post deleted', 'success');
            }, 300);
        } else {
            showToast(result.error || 'Failed to delete post', 'error');
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        showToast('Failed to delete post', 'error');
    }
}

// Close all menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.post-menu-dropdown.open').forEach(m => m.classList.remove('open'));
});

function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) setTimeout(() => input.focus(), 100);
    }
}

function toggleReplyInput(commentId) {
    const container = document.getElementById(`reply-input-${commentId}`);
    if (!container) return;
    const isHidden = container.style.display === 'none';
    // Close all other open reply inputs first
    document.querySelectorAll('.reply-input-container').forEach(c => c.style.display = 'none');
    container.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
        const input = container.querySelector('.reply-input');
        if (input) setTimeout(() => input.focus(), 100);
    }
}

async function submitComment(postId, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;

    const submitBtn = inputEl.closest('.comment-input-wrapper')?.querySelector('.comment-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const result = await window.addComment(postId, text);
        if (result.success) {
            inputEl.value = '';
            showToast('Comment added!', 'success');
            await refreshComments(postId);
            inputEl.focus();
        } else {
            showToast(result.error || 'Error adding comment', 'error');
            if (submitBtn) submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error submitting comment:', error);
        showToast('Error adding comment', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function submitReply(postId, commentId, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;

    const submitBtn = inputEl.closest('.reply-input-container')?.querySelector('.reply-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const result = await window.addComment(postId, text, commentId);
        if (result.success) {
            inputEl.value = '';
            showToast('Reply added!', 'success');
            // Close the reply input
            const container = document.getElementById(`reply-input-${commentId}`);
            if (container) container.style.display = 'none';
            await refreshComments(postId);
        } else {
            showToast(result.error || 'Error adding reply', 'error');
            if (submitBtn) submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error submitting reply:', error);
        showToast('Error adding reply', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Refresh only the comments list for a post (no full re-render)
async function refreshComments(postId) {
    try {
        const result = await window.getComments(postId);
        if (!result.success) return;

        const allComments = result.comments || [];
        const topLevel = allComments.filter(c => !c.parent_comment_id);
        const repliesMap = {};
        allComments.forEach(c => {
            if (c.parent_comment_id) {
                if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = [];
                repliesMap[c.parent_comment_id].push(c);
            }
        });

        const commentsList = document.getElementById(`comments-list-${postId}`);
        if (!commentsList) return;

        if (topLevel.length === 0) {
            commentsList.innerHTML = '<p class="no-comments-text">No comments yet. Be the first to comment!</p>';
        } else {
            commentsList.innerHTML = topLevel.map(c => buildCommentHTML(c, repliesMap, postId)).join('');
        }

        // Update comment count badge
        const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        const countEl = card?.querySelector('.comments-count');
        if (countEl) countEl.textContent = topLevel.length;

        // Re-attach reply listeners (since innerHTML was replaced)
        const commentsListEl = document.getElementById(`comments-list-${postId}`);
        if (commentsListEl) {
            commentsListEl.addEventListener('click', (e) => {
                const replyToggle = e.target.closest('.reply-toggle-btn');
                if (replyToggle) toggleReplyInput(replyToggle.dataset.commentId);
                const replySubmit = e.target.closest('.reply-submit-btn');
                if (replySubmit) {
                    const input = document.querySelector(`.reply-input[data-comment-id="${replySubmit.dataset.commentId}"]`);
                    if (input?.value.trim()) submitReply(replySubmit.dataset.postId, replySubmit.dataset.commentId, input);
                }
            });
            commentsListEl.addEventListener('input', (e) => {
                if (e.target.classList.contains('reply-input')) {
                    const btn = e.target.closest('.reply-input-container')?.querySelector('.reply-submit-btn');
                    if (btn) btn.disabled = !e.target.value.trim();
                }
            });
            commentsListEl.addEventListener('keypress', (e) => {
                if (e.target.classList.contains('reply-input') && e.key === 'Enter' && !e.shiftKey && e.target.value.trim()) {
                    e.preventDefault();
                    submitReply(e.target.dataset.postId, e.target.dataset.commentId, e.target);
                }
            });
        }
    } catch (error) {
        console.error('Error refreshing comments:', error);
    }
}

// ============================================
// FOLLOW FUNCTIONALITY
// ============================================

// Update follow button state
async function updateFollowButton(isFollowing) {
    if (isOwnProfile) return;

    const followBtn = document.getElementById('followBtn');
    if (!followBtn) return;

    // If state not passed in, fetch it
    if (isFollowing === undefined) {
        isFollowing = await window.isFollowing(currentProfileUserId);
    }

    if (isFollowing) {
        followBtn.classList.add('following');
        followBtn.innerHTML = '<i class="fas fa-user-check"></i><span>Following</span>';
    } else {
        followBtn.classList.remove('following');
        followBtn.innerHTML = '<i class="fas fa-user-plus"></i><span>Follow</span>';
    }
}

// Toggle follow
async function handleFollowClick() {
    if (isOwnProfile) return;

    const followBtn = document.getElementById('followBtn');
    if (!followBtn) return;

    // Disable button while request is in-flight
    followBtn.disabled = true;

    try {
        const result = await window.toggleFollow(currentProfileUserId);

        if (result.success) {
            const nowFollowing = result.following;

            // Update button immediately in-place
            await updateFollowButton(nowFollowing);

            // Recount live from followers table for accuracy
            await refreshFollowerCounts();

            showToast(nowFollowing ? 'Followed!' : 'Unfollowed', 'success');

            // Update message button visibility after follow change
            await updateMessageButton();
        } else {
            showToast(result.error || 'Failed to update follow status', 'error');
        }
    } catch (error) {
        console.error('Error toggling follow:', error);
        showToast('Error updating follow status', 'error');
    } finally {
        followBtn.disabled = false;
    }
}

// ============================================
// AVATAR MANAGEMENT
// ============================================

// Open avatar modal
function openAvatarModal() {
    const modal = document.getElementById('avatarModal');
    if (modal) {
        modal.classList.add('show');
        
        // Set current avatar in preview
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewInitials = document.getElementById('avatarPreviewInitials');
        
        if (profileData.avatar_url) {
            avatarPreview.src = profileData.avatar_url;
            avatarPreview.style.display = 'block';
            avatarPreviewInitials.style.display = 'none';
        } else {
            avatarPreview.style.display = 'none';
            avatarPreviewInitials.style.display = 'flex';
            avatarPreviewInitials.textContent = getInitials(profileData.full_name);
        }
    }
}

// Close avatar modal
function closeAvatarModal() {
    const modal = document.getElementById('avatarModal');
    if (modal) {
        modal.classList.remove('show');
        selectedAvatarFile = null;
        document.getElementById('saveAvatarBtn').disabled = true;
    }
}

// Avatar input change handler
document.addEventListener('DOMContentLoaded', () => {
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image must be less than 5MB', 'error');
                return;
            }

            // Validate file type
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file', 'error');
                return;
            }

            selectedAvatarFile = file;
            
            // Preview the image
            const reader = new FileReader();
            reader.onload = function(e) {
                const avatarPreview = document.getElementById('avatarPreview');
                const avatarPreviewInitials = document.getElementById('avatarPreviewInitials');
                
                avatarPreview.src = e.target.result;
                avatarPreview.style.display = 'block';
                avatarPreviewInitials.style.display = 'none';
                
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
    
    try {
        saveBtn.disabled = true;
        saveText.textContent = 'Uploading...';

        const result = await window.uploadAvatar(selectedAvatarFile);
        
        if (result.success) {
            profileData.avatar_url = result.avatarUrl;
            updateProfileUI();
            closeAvatarModal();
            showToast('Profile picture updated!', 'success');
        } else {
            showToast('Error uploading avatar', 'error');
        }
    } catch (error) {
        console.error('Save avatar error:', error);
        showToast('Error uploading avatar', 'error');
    } finally {
        saveBtn.disabled = false;
        saveText.textContent = 'Save Photo';
    }
}

// ============================================
// PROFILE EDITING
// ============================================

// Open edit modal
function openEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.add('show');
    }
}

// Close edit modal
function closeEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('show');
    }
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

// Toggle like on a post (in-place update — no full re-render)
async function handleLikeClick(postId, button) {
    try {
        button.disabled = true;
        const result = await window.toggleLike(postId);

        if (result.success) {
            const isLiked = result.liked;
            button.classList.toggle('liked', isLiked);
            button.setAttribute('aria-pressed', String(isLiked));

            const likesCountEl = button.querySelector('.likes-count');
            if (likesCountEl) {
                const current = parseInt(likesCountEl.textContent) || 0;
                const newCount = isLiked ? current + 1 : Math.max(0, current - 1);
                likesCountEl.textContent = newCount;

                // Update star badge in-place
                const card = button.closest('.post-card');
                const imageContainer = card?.querySelector('.post-image-container');
                if (imageContainer) {
                    const rating = window.getStarRating(newCount);
                    let starBadge = imageContainer.querySelector('.post-star-badge');
                    if (rating.stars > 0) {
                        if (!starBadge) {
                            starBadge = document.createElement('div');
                            starBadge.className = 'post-star-badge';
                            imageContainer.appendChild(starBadge);
                        }
                        starBadge.innerHTML = `${'<i class="fas fa-star"></i>'.repeat(rating.stars)}<span>${rating.label}</span>`;
                    } else if (starBadge) {
                        starBadge.remove();
                    }
                }

                // Update total likes stat
                const totalLikesEl = document.getElementById('totalLikes');
                if (totalLikesEl) {
                    const current = parseInt(totalLikesEl.textContent) || 0;
                    totalLikesEl.textContent = isLiked ? current + 1 : Math.max(0, current - 1);
                }
            }
        } else {
            showToast('Error updating like', 'error');
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        showToast('Error updating like', 'error');
    } finally {
        button.disabled = false;
    }
}

// Share post
function sharePost(postId) {
    const url = `${window.location.origin}/index.html?post=${postId}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'CampusTrend UEW Post',
            url: url
        }).catch(err => {
            console.log('Share cancelled', err);
        });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link copied to clipboard!', 'success');
        });
    }
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

// ============================================
// PRIVATE CHAT
// ============================================

// Load all conversations for the logged-in user and render them
async function loadConversations(userId) {
    const list    = document.getElementById('conversationsList');
    const loading = document.getElementById('convosLoading');
    const noConvos = document.getElementById('noConvos');
    const countEl = document.getElementById('convoCountDisplay');

    if (!list) return;

    try {
        // Fetch all messages where this user is sender or receiver,
        // get the latest message per conversation_id
        const { data: messages, error } = await window.supabaseClient
            .from('messages')
            .select('*')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (loading) loading.style.display = 'none';

        if (error) {
            console.error('Error loading conversations:', error);
            list.innerHTML = '<p style="text-align:center;color:#e53935;padding:16px">Could not load conversations.</p>';
            return;
        }

        if (!messages || messages.length === 0) {
            list.innerHTML = '';
            if (noConvos) noConvos.style.display = 'block';
            if (countEl) countEl.textContent = '';
            return;
        }

        // Deduplicate — one entry per conversation_id (already sorted newest first)
        const seen = new Set();
        const convos = [];
        for (const msg of messages) {
            if (!seen.has(msg.conversation_id)) {
                seen.add(msg.conversation_id);
                convos.push(msg);
            }
        }

        if (countEl) countEl.textContent = `${convos.length} conversation${convos.length !== 1 ? 's' : ''}`;

        // For each conversation, find the other user's id and fetch their profile
        const otherIds = convos.map(msg =>
            msg.sender_id === userId ? msg.receiver_id : msg.sender_id
        );

        const uniqueOtherIds = [...new Set(otherIds)];
        const { data: profiles } = await window.supabaseClient
            .from('profiles')
            .select('id, full_name, avatar_url, department')
            .in('id', uniqueOtherIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Count unread messages per conversation
        const { data: unreadData } = await window.supabaseClient
            .from('messages')
            .select('conversation_id')
            .eq('receiver_id', userId)
            .eq('is_read', false);

        const unreadMap = {};
        (unreadData || []).forEach(m => {
            unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
        });

        // Render
        list.innerHTML = '';
        convos.forEach(msg => {
            const otherId   = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
            const profile   = profileMap[otherId] || {};
            const initials  = getInitials(profile.full_name || '?');
            const unread    = unreadMap[msg.conversation_id] || 0;
            const preview   = msg.content.length > 55 ? msg.content.substring(0, 55) + '…' : msg.content;
            const isSentByMe = msg.sender_id === userId;
            const timeLabel = formatConvoTime(msg.created_at);

            const avatarHtml = profile.avatar_url
                ? `<img src="${profile.avatar_url}" alt="${escapeHtml(profile.full_name || '')}" class="convo-avatar-img">`
                : `<span class="convo-avatar-initials">${initials}</span>`;

            const item = document.createElement('div');
            item.className = 'convo-item';
            item.innerHTML = `
                <div class="convo-avatar">${avatarHtml}</div>
                <div class="convo-info">
                    <div class="convo-top">
                        <span class="convo-name">${escapeHtml(profile.full_name || 'Unknown User')}</span>
                        <span class="convo-time">${timeLabel}</span>
                    </div>
                    <div class="convo-bottom">
                        <span class="convo-preview ${unread > 0 ? 'unread' : ''}">
                            ${isSentByMe ? '<i class="fas fa-reply convo-sent-icon"></i>' : ''}
                            ${escapeHtml(preview)}
                        </span>
                        ${unread > 0 ? `<span class="convo-unread-badge">${unread}</span>` : ''}
                    </div>
                </div>
            `;
            item.addEventListener('click', () => {
                window.location.href = `chat.html?userId=${otherId}`;
            });
            list.appendChild(item);
        });

    } catch (err) {
        console.error('loadConversations error:', err);
        if (loading) loading.style.display = 'none';
        list.innerHTML = '<p style="text-align:center;color:#e53935;padding:16px">Could not load conversations.</p>';
    }
}

function formatConvoTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Show the Message button only if a follow relationship exists (either direction)
async function updateMessageButton() {
    const btn = document.getElementById('messageBtn');
    if (!btn) { console.warn('messageBtn element not found'); return; }

    try {
        const currentUser = await window.getCurrentUser();
        if (!currentUser) return;

        console.log('Checking follow relationship for message button…', {
            me: currentUser.id, them: currentProfileUserId
        });

        // Check both directions in one query using OR
        const { data, error } = await window.supabaseClient
            .from('followers')
            .select('id')
            .or(
                `and(follower_id.eq.${currentUser.id},following_id.eq.${currentProfileUserId}),` +
                `and(follower_id.eq.${currentProfileUserId},following_id.eq.${currentUser.id})`
            )
            .limit(1);

        if (error) {
            console.error('Follow check error:', error);
            btn.style.display = 'none';
            return;
        }

        const canChat = data && data.length > 0;
        console.log('Can chat:', canChat, '| Follow record found:', data);
        btn.style.display = canChat ? 'inline-flex' : 'none';

    } catch (err) {
        console.error('updateMessageButton error:', err);
        btn.style.display = 'none';
    }
}

// Open private chat with this user
function openChat() {
    window.location.href = `chat.html?userId=${currentProfileUserId}`;
}

// Navigation functions
function goToHome() {
    window.location.href = 'index.html';
}

// Logout
function logout() {
    document.getElementById('logoutModal').classList.add('show');
}

function closeLogoutModal() {
    document.getElementById('logoutModal').classList.remove('show');
}

async function confirmLogout() {
    closeLogoutModal();
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