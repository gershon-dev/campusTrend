/**
 * tutorials.js – CampusTrend UEW Tutorial Page
 * Handles: auth check, UI init, video upload (Supabase Storage),
 * tutorial CRUD, likes, follows, comments, search/filter.
 *
 * Expects: window.supabaseClient, window.isLoggedIn, window.getCurrentUser,
 *          window.getCurrentProfile, window.getProfile, window.DEPARTMENTS
 * Table expected: tutorials (id, user_id, title, course_name, course_code,
 *   department, description, tags[], video_url, video_path, likes_count,
 *   views_count, comments_count, created_at)
 * Also uses: tutorial_likes (id, tutorial_id, user_id)
 *            tutorial_comments (id, tutorial_id, user_id, content, created_at)
 *            followers (follower_id, following_id)
 *            profiles (id, full_name, avatar_url, department, followers_count,
 *                      following_count, posts_count)
 */

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentProfile = null;
let allTutorials  = [];          // raw list from DB
let filteredList  = [];          // current filtered / searched list
let myLikes       = new Set();   // tutorial IDs liked by me
let myFollowing   = new Set();   // user IDs I follow
let currentFilter = 'all';       // sidebar category filter
let currentDept   = '';          // sidebar department filter


// ─── Course keyword map ──────────────────────────────────────────────────────
const COURSE_KEYWORDS = {
    'Mathematics':           ['math','calculus','algebra','geometry','statistics','trigonometry','integral','derivative','probability','linear','numerical'],
    'Computer Science':      ['programming','python','javascript','algorithm','data structure','oop','web','database','sql','network','os','ai','machine learning','java','c++','html','css'],
    'Physics':               ['physics','mechanics','thermodynamics','optics','quantum','electromagnetism','wave','force','energy','newton'],
    'Chemistry':             ['chemistry','organic','inorganic','reaction','bond','mole','element','periodic','acid','base'],
    'Biology':               ['biology','cell','genetics','evolution','ecology','organism','dna','rna','enzyme','anatomy'],
    'Basic Education':       ['basic education','primary','pedagogy','curriculum','lesson','foundation','early childhood'],
    'Business Administration':['accounting','economics','finance','marketing','management','entrepreneur','profit','supply','demand','ledger'],
    'English Education':     ['english','grammar','essay','literature','writing','comprehension','reading','poetry','prose','shakespeare'],
    'Social Studies':        ['social','history','geography','civics','culture','society','government','democracy','africa'],
    'Science Education':     ['science','experiment','laboratory','hypothesis','research','scientific method'],
    'Health Education':      ['health','nutrition','disease','hygiene','fitness','anatomy','public health','medicine'],
    'Graphic Design':        ['design','photoshop','illustrator','typography','color theory','branding','logo','ui','ux'],
    'Music Education':       ['music','theory','notation','rhythm','melody','harmony','instrument','chord','scale'],
    'Physical Education':    ['physical','sport','fitness','exercise','athletics','training','body'],
    'French':                ['french','francais','grammaire','conjugaison','vocabulaire','langue'],
};



// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name) {
    if (!name) return 'U';
    const p = name.trim().split(' ');
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

function escHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
}

function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const span  = document.getElementById('toastMsg');
    const icon  = toast.querySelector('i');
    span.textContent = msg;
    toast.className = `toast ${type}`;
    icon.className  = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function supaFetch(table, query) {
    return query; // just a pass-through; queries are chained on the caller side
}

// ─── Auth & Init ─────────────────────────────────────────────────────────────
const TUT_PAGE_CACHE_KEY = 'ct_tut_page_cache';
const TUT_PAGE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // ── Step 1: show cached tutorials instantly while auth checks run ──────
        showCachedTutorials();

        // ── Step 2: auth (run in parallel with cache render) ──────────────────
        const loggedIn = await window.isLoggedIn();
        if (!loggedIn) { window.location.href = 'sign-in.html'; return; }

        // Get user + profile in parallel
        [currentUser, currentProfile] = await Promise.all([
            window.getCurrentUser(),
            window.getCurrentProfile()
        ]);
        if (!currentUser || !currentProfile) { window.location.href = 'sign-in.html'; return; }

        initUI();
        setupEventListeners();
        populateDepartmentFilter();

        // ── Step 3: fetch likes + following + tutorials ALL in parallel ────────
        await Promise.all([
            loadMyFollowing(),
            loadMyLikes(),
            loadTutorials()   // will overwrite cache render with fresh data
        ]);

    } catch (err) {
        console.error('Tutorial page init error:', err);
        showToast('Error loading page. Please refresh.', 'error');
    }
});

// Show cached tutorials immediately — zero network requests
function showCachedTutorials() {
    try {
        const raw = localStorage.getItem(TUT_PAGE_CACHE_KEY);
        if (!raw) return;
        const { tutorials: cached, ts } = JSON.parse(raw);
        if (!cached || Date.now() - ts > TUT_PAGE_CACHE_TTL) return;

        // Render cached data instantly
        allTutorials = cached;
        filteredList = [...cached];
        document.getElementById('skeletonCard')?.remove();
        updateHeroStats();
        applyFilters();
        renderTopTutors();
        renderTrendingTopics();
    } catch (e) { /* ignore cache errors */ }
}

// ─── UI Init ─────────────────────────────────────────────────────────────────
function initUI() {
    // Header avatar
    const avatarEl = document.getElementById('currentUserAvatar');
    const nameEl   = document.getElementById('currentUserName');
    if (avatarEl) {
        if (currentProfile.avatar_url) {
            avatarEl.innerHTML = `<img src="${currentProfile.avatar_url}" alt="${escHtml(currentProfile.full_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarEl.textContent = getInitials(currentProfile.full_name);
        }
    }
    if (nameEl) nameEl.textContent = currentProfile.full_name;

    // Upload bar avatar
    const upAvatar = document.getElementById('uploadBarAvatar');
    if (upAvatar) {
        if (currentProfile.avatar_url) {
            upAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" alt="${escHtml(currentProfile.full_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            upAvatar.textContent = getInitials(currentProfile.full_name);
        }
    }

    // Profile click → user-profile page
    document.getElementById('userProfileBtn')?.addEventListener('click', () => {
        window.location.href = `user-profile.html`;
    });
}

function populateDepartmentFilter() {
    const departments = window.DEPARTMENTS || [
        'Computer Science','Mathematics','Basic Education','Business Administration',
        'Graphic Design','Music Education','Health Education','Science Education',
        'English Education','French','Social Studies','Early Childhood','Special Education','Physical Education'
    ];
    const list = document.getElementById('deptFilterList');
    if (!list) return;
    departments.forEach(dept => {
        const d = document.createElement('div');
        d.className = 'filter-item';
        d.dataset.dept = dept;
        d.innerHTML = `<i class="fas fa-tag"></i> ${escHtml(dept)}`;
        d.addEventListener('click', () => setDeptFilter(dept, d));
        list.appendChild(d);
    });
}

// ─── Data Loaders ────────────────────────────────────────────────────────────
async function loadMyFollowing() {
    try {
        const { data } = await window.supabaseClient
            .from('followers')
            .select('following_id')
            .eq('follower_id', currentUser.id);
        myFollowing = new Set((data || []).map(r => r.following_id));
    } catch (e) { console.warn('loadMyFollowing:', e); }
}

async function loadMyLikes() {
    try {
        const { data } = await window.supabaseClient
            .from('tutorial_likes')
            .select('tutorial_id')
            .eq('user_id', currentUser.id);
        myLikes = new Set((data || []).map(r => r.tutorial_id));
    } catch (e) { console.warn('loadMyLikes:', e); }
}

async function loadTutorials() {
    try {
        // No FK hint — fetch tutorials and profiles separately
        const { data: tutorials, error } = await window.supabaseClient
            .from('tutorials')
            .select('id, title, course_name, course_code, department, description, tags, video_url, likes_count, views_count, comments_count, created_at, user_id')
            .order('created_at', { ascending: false });

        document.getElementById('skeletonCard')?.remove();
        if (error) throw error;

        // Fetch profiles in parallel
        const userIds = [...new Set((tutorials || []).map(t => t.user_id))];
        let profileMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await window.supabaseClient
                .from('profiles')
                .select('id, full_name, avatar_url, department, followers_count')
                .in('id', userIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }

        allTutorials = (tutorials || []).map(t => ({
            ...t,
            tags: t.tags || [],
            profiles: profileMap[t.user_id] || {},
        }));

        // Cache for instant load next visit
        try {
            localStorage.setItem(TUT_PAGE_CACHE_KEY, JSON.stringify({
                tutorials: allTutorials, ts: Date.now()
            }));
        } catch (e) {}

        filteredList = [...allTutorials];
        updateHeroStats();
        applyFilters();
        renderTopTutors();
        renderTrendingTopics();

    } catch (err) {
        console.error('loadTutorials:', err);
        document.getElementById('skeletonCard')?.remove();
        if (!allTutorials.length) {
            document.getElementById('tutorialsContainer').innerHTML = `
                <div class="tutorial-card">
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>Could not load tutorials</h3>
                        <p>${err.message || 'Check your connection and try refreshing.'}</p>
                    </div>
                </div>`;
        }
    }
}

function updateHeroStats() {
    const uniqueTutors = new Set(allTutorials.map(t => t.user_id)).size;
    document.getElementById('heroTotalTutors').textContent = formatCount(uniqueTutors);

    // week stats (approximate using created_at in last 7 days)
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const weekTuts = allTutorials.filter(t => new Date(t.created_at) > weekAgo);
    document.getElementById('weekUploads').textContent = weekTuts.length;
    document.getElementById('weekLikes').textContent   = formatCount(weekTuts.reduce((s,t)=>s+(t.likes_count||0),0));
    document.getElementById('weekTutors').textContent  = new Set(weekTuts.map(t=>t.user_id)).size;
    document.getElementById('countAll').textContent    = allTutorials.length;
}

// ─── Filtering & Search ───────────────────────────────────────────────────────
function applyFilters() {
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase();

    let list = [...allTutorials];

    // Department filter
    if (currentDept) {
        list = list.filter(t => t.department === currentDept);
    }

    // Category filter
    if (currentFilter === 'recent') {
        list = list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (currentFilter === 'popular') {
        list = list.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    } else if (currentFilter === 'following') {
        list = list.filter(t => myFollowing.has(t.user_id));
    }

    // Search
    if (searchVal) {
        list = list.filter(t =>
            (t.title || '').toLowerCase().includes(searchVal) ||
            (t.description || '').toLowerCase().includes(searchVal) ||
            (t.course_name || '').toLowerCase().includes(searchVal) ||
            (t.course_code || '').toLowerCase().includes(searchVal) ||
            (t.department || '').toLowerCase().includes(searchVal) ||
            (t.tags || []).some(tag => tag.toLowerCase().includes(searchVal))
        );
    }

    filteredList = list;
    renderTutorials();
}

function setDeptFilter(dept, clickedEl) {
    currentDept = dept;
    document.querySelectorAll('#deptFilterList .filter-item').forEach(el => el.classList.remove('active'));
    clickedEl.classList.add('active');
    applyFilters();
}

function setCategoryFilter(filter, clickedEl) {
    currentFilter = filter;
    document.querySelectorAll('#categoryFilterList .filter-item').forEach(el => el.classList.remove('active'));
    clickedEl.classList.add('active');
    applyFilters();
}

// ─── Render Tutorials ─────────────────────────────────────────────────────────
function renderTutorials() {
    const container = document.getElementById('tutorialsContainer');
    if (!container) return;

    if (filteredList.length === 0) {
        container.innerHTML = `
            <div class="tutorial-card">
                <div class="empty-state">
                    <i class="fas fa-video-slash"></i>
                    <h3>No tutorials found</h3>
                    <p>Be the first to post a tutorial${currentDept ? ' for ' + escHtml(currentDept) : ''}!</p>
                </div>
            </div>`;
        return;
    }

    container.innerHTML = filteredList.map(tutorial => buildTutorialCard(tutorial)).join('');

    // Attach event listeners to each card
    filteredList.forEach(tutorial => {
        attachCardListeners(tutorial);
    });
}

function buildTutorialCard(t) {
    const profile  = t.profiles || {};
    const initials = getInitials(profile.full_name);
    const avatarHtml = profile.avatar_url
        ? `<img src="${escHtml(profile.avatar_url)}" alt="${escHtml(profile.full_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : initials;
    const isLiked     = myLikes.has(t.id);
    const isFollowing = myFollowing.has(t.user_id);
    const isOwn       = t.user_id === currentUser.id;
    const tags        = (t.tags || []).slice(0, 4);

    const videoEmbed = buildVideoEmbed(t.video_url);
    const courseName = t.course_name || t.department || '';

    return `
    <article class="tutorial-card" id="card-${t.id}" data-tutorial-id="${t.id}">
        <!-- Poster header -->
        <div class="tc-header">
            <a class="tc-avatar" href="user-profile.html?userId=${escHtml(t.user_id)}" title="View profile">
                ${avatarHtml}
            </a>
            <div class="tc-user-info">
                <div class="tc-user-name" onclick="viewUserProfile('${t.user_id}')">
                    ${escHtml(profile.full_name || 'UEW Student')}
                </div>
                <div class="tc-meta">
                    <span class="tc-dept-badge">${escHtml(profile.department || 'UEW')}</span>
                    <span>·</span>
                    <span>${timeAgo(t.created_at)}</span>
                </div>
            </div>
            ${!isOwn ? `
            <button class="tc-follow-btn ${isFollowing ? 'following' : ''}"
                    data-uid="${t.user_id}"
                    id="follow-btn-${t.id}">
                ${isFollowing ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
            </button>` : ''}
        </div>

        <!-- Course tag -->
        ${courseName ? `
        <div class="tc-course-tag">
            <i class="fas fa-book-open"></i> ${escHtml(courseName)}
            ${t.course_code ? `· <span style="opacity:.8">${escHtml(t.course_code)}</span>` : ''}
        </div>` : ''}

        <!-- Video -->
        <div class="tc-video-wrap" id="video-wrap-${t.id}">
            ${videoEmbed}
        </div>

        <!-- Body -->
        <div class="tc-body">
            <h2 class="tc-title">${escHtml(t.title)}</h2>
            ${t.description ? `
            <p class="tc-description collapsed" id="desc-${t.id}">${escHtml(t.description)}</p>
            <button class="tc-read-more" id="readmore-${t.id}" onclick="toggleDesc('${t.id}')">See more</button>
            ` : ''}
            ${tags.length ? `
            <div class="tc-tags">
                ${tags.map(tag => `<span class="tc-tag">#${escHtml(tag)}</span>`).join('')}
            </div>` : ''}
        </div>

        <!-- Actions -->
        <div class="tc-actions">
            <button class="tc-action-btn ${isLiked ? 'liked' : ''}" id="like-btn-${t.id}" title="Like">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                <span id="like-count-${t.id}">${formatCount(t.likes_count || 0)}</span>
            </button>
            <button class="tc-action-btn" id="comment-toggle-${t.id}" title="Comment">
                <i class="far fa-comment"></i>
                <span id="comment-count-${t.id}">${formatCount(t.comments_count || 0)}</span>
            </button>
            <div class="tc-views">
                <i class="far fa-eye"></i>
                <span>${formatCount(t.views_count || 0)}</span>
            </div>
            <button class="tc-action-btn share-btn" title="Share">
                <i class="fas fa-share-alt"></i> Share
            </button>
        </div>

        <!-- Comments -->
        <div class="tc-comments" id="comments-${t.id}">
            <div class="tc-comment-input-wrap">
                <div class="tc-comment-avatar">${getInitials(currentProfile.full_name)}</div>
                <input class="tc-comment-input" id="comment-input-${t.id}"
                       placeholder="Write a comment…" type="text"
                       onkeypress="handleCommentKey(event, '${t.id}')">
                <button class="tc-comment-send" onclick="submitComment('${t.id}')">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            <div id="comment-list-${t.id}">
                <div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:10px;">
                    Loading comments…
                </div>
            </div>
        </div>
    </article>`;
}

function buildVideoEmbed(url) {
    if (!url) {
        return `
        <div class="tc-video-thumb" style="background:#1a1a2e;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-video" style="font-size:2.5rem;color:rgba(255,255,255,0.2);"></i>
        </div>`;
    }

    // Google Drive — extract file ID and build /preview embed URL
    const driveId = extractDriveId(url);
    if (driveId) {
        return `<iframe src="${buildDriveEmbedUrl(driveId)}"
                        allow="autoplay" allowfullscreen loading="lazy"></iframe>`;
    }

    // Fallback placeholder for unrecognised URLs
    return `
        <div class="tc-video-thumb" style="background:#1a1a2e;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;">
            <i class="fas fa-exclamation-circle" style="font-size:2rem;color:rgba(255,255,255,0.3);"></i>
            <span style="font-size:0.78rem;color:rgba(255,255,255,0.4);">Could not load video</span>
        </div>`;
}

// ─── Card Event Listeners ─────────────────────────────────────────────────────
function attachCardListeners(t) {
    // Like
    document.getElementById(`like-btn-${t.id}`)?.addEventListener('click', () => toggleLike(t.id));

    // Comment toggle
    document.getElementById(`comment-toggle-${t.id}`)?.addEventListener('click', () => toggleComments(t.id));

    // Follow button
    const followBtn = document.getElementById(`follow-btn-${t.id}`);
    followBtn?.addEventListener('click', () => toggleFollow(t.user_id, t.id));

    // Share
    document.querySelector(`#card-${t.id} .share-btn`)?.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?tutorial=${t.id}`;
        if (navigator.share) {
            navigator.share({ title: t.title, url: shareUrl }).catch(() => {});
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => showToast('Link copied!'));
        }
    });

    // View count — fires when the video area scrolls into view (works for iframes too)
    const videoWrap = document.getElementById(`video-wrap-${t.id}`);
    if (videoWrap) {
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    obs.disconnect(); // only count once per session render
                    incrementViews(t.id);
                }
            });
        }, { threshold: 0.5 }); // at least 50% of the video must be visible
        observer.observe(videoWrap);
    }
}

function toggleDesc(tutorialId) {
    const descEl = document.getElementById(`desc-${tutorialId}`);
    const btn    = document.getElementById(`readmore-${tutorialId}`);
    if (!descEl || !btn) return;
    if (descEl.classList.contains('collapsed')) {
        descEl.classList.remove('collapsed');
        btn.textContent = 'See less';
    } else {
        descEl.classList.add('collapsed');
        btn.textContent = 'See more';
    }
}
window.toggleDesc = toggleDesc;

// ─── Like ─────────────────────────────────────────────────────────────────────
async function toggleLike(tutorialId) {
    const btn       = document.getElementById(`like-btn-${tutorialId}`);
    const countEl   = document.getElementById(`like-count-${tutorialId}`);
    if (!btn || !countEl) return;

    const isLiked = myLikes.has(tutorialId);

    // Optimistic update
    if (isLiked) {
        myLikes.delete(tutorialId);
        btn.classList.remove('liked');
        btn.querySelector('i').className = 'far fa-heart';
    } else {
        myLikes.add(tutorialId);
        btn.classList.add('liked');
        btn.querySelector('i').className = 'fas fa-heart';
    }

    // Find tutorial in local list and update count
    const tut = allTutorials.find(t => t.id === tutorialId);
    if (tut) {
        tut.likes_count = (tut.likes_count || 0) + (isLiked ? -1 : 1);
        countEl.textContent = formatCount(tut.likes_count);
    }

    try {
        if (isLiked) {
            // Remove like
            await window.supabaseClient
                .from('tutorial_likes')
                .delete()
                .eq('tutorial_id', tutorialId)
                .eq('user_id', currentUser.id);

            await window.supabaseClient
                .from('tutorials')
                .update({ likes_count: Math.max(0, (tut?.likes_count ?? 0)) })
                .eq('id', tutorialId);
        } else {
            // Insert like
            await window.supabaseClient
                .from('tutorial_likes')
                .insert({ tutorial_id: tutorialId, user_id: currentUser.id });

            await window.supabaseClient
                .from('tutorials')
                .update({ likes_count: (tut?.likes_count ?? 1) })
                .eq('id', tutorialId);
        }
    } catch (err) {
        console.error('toggleLike error:', err);
        showToast('Could not update like', 'error');
        // Revert
        if (isLiked) myLikes.add(tutorialId); else myLikes.delete(tutorialId);
    }
}

// ─── Follow ───────────────────────────────────────────────────────────────────
async function toggleFollow(targetUserId, cardId) {
    if (targetUserId === currentUser.id) return;
    const btn = document.getElementById(`follow-btn-${cardId}`);
    if (!btn) return;

    const isFollowing = myFollowing.has(targetUserId);

    // Optimistic update
    if (isFollowing) {
        myFollowing.delete(targetUserId);
        btn.classList.remove('following');
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
    } else {
        myFollowing.add(targetUserId);
        btn.classList.add('following');
        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
    }

    try {
        if (isFollowing) {
            await window.supabaseClient
                .from('followers')
                .delete()
                .eq('follower_id', currentUser.id)
                .eq('following_id', targetUserId);
        } else {
            await window.supabaseClient
                .from('followers')
                .insert({ follower_id: currentUser.id, following_id: targetUserId });
        }

        // ── Update followers_count on the target user's profile ──────────────
        const { data: targetProfile } = await window.supabaseClient
            .from('profiles')
            .select('followers_count')
            .eq('id', targetUserId)
            .single();
        if (targetProfile) {
            const newFollowers = isFollowing
                ? Math.max(0, (targetProfile.followers_count || 0) - 1)
                : (targetProfile.followers_count || 0) + 1;
            await window.supabaseClient
                .from('profiles')
                .update({ followers_count: newFollowers })
                .eq('id', targetUserId);
        }

        // ── Update following_count on the current user's profile ─────────────
        const { data: myProfile } = await window.supabaseClient
            .from('profiles')
            .select('following_count')
            .eq('id', currentUser.id)
            .single();
        if (myProfile) {
            const newFollowing = isFollowing
                ? Math.max(0, (myProfile.following_count || 0) - 1)
                : (myProfile.following_count || 0) + 1;
            await window.supabaseClient
                .from('profiles')
                .update({ following_count: newFollowing })
                .eq('id', currentUser.id);
        }

        // ── Update all follow buttons in the feed for this user ───────────────
        document.querySelectorAll(`.tc-follow-btn[data-uid="${targetUserId}"]`).forEach(btn => {
            if (!isFollowing) {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
            } else {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
            }
        });

        showToast(isFollowing ? 'Unfollowed' : 'Now following!');
    } catch (err) {
        console.error('toggleFollow error:', err);
        showToast('Could not update follow', 'error');
        // Revert optimistic update
        if (isFollowing) myFollowing.add(targetUserId); else myFollowing.delete(targetUserId);
        const btn = document.getElementById(`follow-btn-${cardId}`);
        if (btn) {
            if (isFollowing) {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
            } else {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
            }
        }
    }
}

// navigate to user profile (mirrors index.js pattern)
function viewUserProfile(userId) {
    if (!userId) return;
    window.location.href = `user-profile.html?userId=${userId}`;
}
window.viewUserProfile = viewUserProfile;

// ─── Comments ─────────────────────────────────────────────────────────────────
const loadedComments = new Set();

async function toggleComments(tutorialId) {
    const section = document.getElementById(`comments-${tutorialId}`);
    if (!section) return;

    const isOpen = section.classList.contains('open');
    section.classList.toggle('open');

    if (!isOpen && !loadedComments.has(tutorialId)) {
        loadedComments.add(tutorialId);
        await loadComments(tutorialId);
    }
}

async function loadComments(tutorialId) {
    const list = document.getElementById(`comment-list-${tutorialId}`);
    if (!list) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('tutorial_comments')
            .select(`id, content, created_at, user_id,
                     profiles!tutorial_comments_user_id_fkey(full_name, avatar_url)`)
            .eq('tutorial_id', tutorialId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:8px;">No comments yet. Be the first!</p>';
            return;
        }

        list.innerHTML = data.map(c => {
            const p = c.profiles || {};
            const initials = getInitials(p.full_name);
            const avatarHtml = p.avatar_url
                ? `<img src="${escHtml(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
                : initials;
            return `
            <div class="tc-comment-item">
                <div class="tc-comment-avatar">${avatarHtml}</div>
                <div class="tc-comment-bubble">
                    <div class="tc-comment-author">${escHtml(p.full_name || 'Student')}</div>
                    <div class="tc-comment-text">${escHtml(c.content)}</div>
                    <div class="tc-comment-time">${timeAgo(c.created_at)}</div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('loadComments:', err);
        list.innerHTML = '<p style="font-size:0.8rem;color:#e53935;text-align:center;padding:8px;">Could not load comments.</p>';
    }
}

function handleCommentKey(e, tutorialId) {
    if (e.key === 'Enter') submitComment(tutorialId);
}
window.handleCommentKey = handleCommentKey;

async function submitComment(tutorialId) {
    const input = document.getElementById(`comment-input-${tutorialId}`);
    const content = (input?.value || '').trim();
    if (!content) return;

    input.value = '';
    input.disabled = true;

    try {
        const { error } = await window.supabaseClient
            .from('tutorial_comments')
            .insert({ tutorial_id: tutorialId, user_id: currentUser.id, content });

        if (error) throw error;

        // Update comment count locally
        const tut = allTutorials.find(t => t.id === tutorialId);
        if (tut) tut.comments_count = (tut.comments_count || 0) + 1;
        const countEl = document.getElementById(`comment-count-${tutorialId}`);
        if (countEl && tut) countEl.textContent = formatCount(tut.comments_count);

        // Update tutorials table
        await window.supabaseClient
            .from('tutorials')
            .update({ comments_count: tut?.comments_count ?? 1 })
            .eq('id', tutorialId);

        // Reload comments
        loadedComments.delete(tutorialId);
        await loadComments(tutorialId);
    } catch (err) {
        console.error('submitComment:', err);
        showToast('Could not post comment', 'error');
        input.value = content;
    } finally {
        input.disabled = false;
        input.focus();
    }
}
window.submitComment = submitComment;

// ─── View Count ───────────────────────────────────────────────────────────────
const VIEWED_KEY = 'ct_viewed_tutorials';
function getViewedKey() {
    // Per-user key so switching accounts on same device counts correctly
    const uid = currentUser?.id || 'guest';
    return `${VIEWED_KEY}_${uid}`;
}
function getViewedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(getViewedKey()) || '[]')); }
    catch { return new Set(); }
}
function saveViewedSet(s) {
    try { localStorage.setItem(getViewedKey(), JSON.stringify([...s])); } catch {}
}
async function incrementViews(tutorialId) {
    const id = String(tutorialId);
    const viewed = getViewedSet();
    if (viewed.has(id)) return; // already counted for this user on this device
    viewed.add(id);
    saveViewedSet(viewed);
    try {
        // Fetch the true current count from DB to avoid stale read-modify-write
        const { data: tut } = await window.supabaseClient
            .from('tutorials')
            .select('views_count')
            .eq('id', tutorialId)
            .single();
        const newCount = (tut?.views_count || 0) + 1;
        // Update local data array
        const local = allTutorials.find(t => t.id === tutorialId);
        if (local) local.views_count = newCount;
        const viewEl = document.querySelector(`#card-${tutorialId} .tc-views span`);
        if (viewEl) viewEl.textContent = formatCount(newCount);
        await window.supabaseClient
            .from('tutorials')
            .update({ views_count: newCount })
            .eq('id', tutorialId);
    } catch (e) { console.warn('incrementViews:', e); }
}

// ─── Google Drive URL Utilities ───────────────────────────────────────────────

/**
 * Extracts the file ID from any Google Drive share URL.
 * Handles:
 *   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   https://drive.google.com/file/d/FILE_ID/view
 *   https://drive.google.com/open?id=FILE_ID
 *   https://docs.google.com/file/d/FILE_ID/...
 */
function extractDriveId(url) {
    if (!url) return null;
    url = url.trim();

    // /file/d/ID pattern
    const filePattern = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
    const m1 = url.match(filePattern);
    if (m1) return m1[1];

    // ?id=ID pattern
    const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
    const m2 = url.match(idPattern);
    if (m2) return m2[1];

    return null;
}

function buildDriveEmbedUrl(fileId) {
    // /preview gives a clean embeddable player with no Google sign-in prompt
    return `https://drive.google.com/file/d/${fileId}/preview`;
}

function isValidDriveUrl(url) {
    return !!extractDriveId(url);
}

// Live preview: watch the URL input and show embed as student types
function initYouTubePreview() {
    const input    = document.getElementById('videoUrlInput');
    const preview  = document.getElementById('ytPreview');
    const frame    = document.getElementById('ytPreviewFrame');
    const clearBtn = document.getElementById('clearYtUrl');
    let debounce;

    input?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const driveId = extractDriveId(input.value.trim());
            if (driveId) {
                frame.src = buildDriveEmbedUrl(driveId);
                preview.classList.add('show');
            } else {
                preview.classList.remove('show');
                frame.src = '';
            }
        }, 700);
    });

    clearBtn?.addEventListener('click', () => {
        input.value = '';
        preview.classList.remove('show');
        frame.src = '';
    });
}

// ─── Upload Tutorial ──────────────────────────────────────────────────────────
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('show');
}
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('show');
    resetUploadForm();
}

function resetUploadForm() {
    ['videoTitle','videoDesc','videoTags','videoCourse','videoUrlInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('videoDepartment').value = '';
    
    // Clear YouTube preview
    const preview = document.getElementById('ytPreview');
    const frame   = document.getElementById('ytPreviewFrame');
    if (preview) preview.classList.remove('show');
    if (frame)   frame.src = '';
}

async function submitTutorial() {
    const videoUrl = (document.getElementById('videoUrlInput')?.value || '').trim();
    const title    = (document.getElementById('videoTitle')?.value || '').trim();
    const dept     = document.getElementById('videoDepartment')?.value || '';
    const desc     = (document.getElementById('videoDesc')?.value || '').trim();
    const tags     = (document.getElementById('videoTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    const course   = (document.getElementById('videoCourse')?.value || '').trim();
    // Validation
    if (!videoUrl || !isValidDriveUrl(videoUrl)) {
        showToast('Please paste a valid Google Drive link', 'error');
        document.getElementById('videoUrlInput')?.focus();
        return;
    }
    if (!title) { showToast('Please enter a video title', 'error'); return; }
    if (!dept)  { showToast('Please select a department', 'error'); return; }
    
    const btn = document.getElementById('submitTutorialBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';

    try {
        const { data, error } = await window.supabaseClient
            .from('tutorials')
            .insert({
                user_id:        currentUser.id,
                title,
                course_name:    course,
                course_code:    course,
                department:     dept,
                description:    desc,
                tags,
                video_url:      videoUrl,
                likes_count:    0,
                views_count:    50,
                comments_count: 0,
            })
            .select('id, title, course_name, course_code, department, description, tags, video_url, likes_count, views_count, comments_count, created_at, user_id')
            .single();

        if (error) throw error;

        // Attach current user profile so card renders immediately
        const newTutorial = {
            ...data,
            tags: data.tags || [],
            profiles: {
                id:              currentUser.id,
                full_name:       currentProfile.full_name,
                avatar_url:      currentProfile.avatar_url,
                department:      currentProfile.department,
                followers_count: currentProfile.followers_count || 0,
            },
        };

        // Prepend to local list and re-render
        allTutorials.unshift(newTutorial);
        applyFilters();
        updateHeroStats();
        renderTopTutors();
        renderTrendingTopics();
        closeUploadModal();
        showToast('Tutorial published! 🎉');

    } catch (err) {
        console.error('submitTutorial:', err);
        showToast('Failed to publish. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Tutorial';
    }
}

// ─── Sidebar: Top Tutors & Trending ──────────────────────────────────────────
function renderTopTutors() {
    const container = document.getElementById('topTutorsList');
    if (!container) return;

    // Aggregate by user
    const tutorMap = {};
    allTutorials.forEach(t => {
        const p = t.profiles || {};
        if (!tutorMap[t.user_id]) {
            tutorMap[t.user_id] = { ...p, id: t.user_id, videoCount: 0, totalLikes: 0 };
        }
        tutorMap[t.user_id].videoCount++;
        tutorMap[t.user_id].totalLikes += (t.likes_count || 0);
    });

    const tutors = Object.values(tutorMap)
        .sort((a, b) => b.totalLikes - a.totalLikes)
        .slice(0, 5);

    if (tutors.length === 0) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem;">No tutors yet</div>';
        return;
    }

    const avatarColors = ['#667eea','#f093fb','#4facfe','#43e97b','#fa709a'];

    container.innerHTML = tutors.map((tutor, i) => {
        const initials = getInitials(tutor.full_name);
        const avatarHtml = tutor.avatar_url
            ? `<img src="${escHtml(tutor.avatar_url)}" style="width:100%;height:100%;object-fit:cover;" alt="">`
            : initials;
        return `
        <div class="top-tutor-item" onclick="viewUserProfile('${tutor.id}')">
            <div class="top-tutor-avatar" style="background:${avatarColors[i % avatarColors.length]};">
                ${avatarHtml}
            </div>
            <div>
                <div class="top-tutor-name">${escHtml(tutor.full_name || 'Student')}</div>
                <div class="top-tutor-dept">${escHtml(tutor.department || 'UEW')}</div>
            </div>
            <div class="top-tutor-count">${tutor.videoCount} video${tutor.videoCount !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');
}

function renderTrendingTopics() {
    const container = document.getElementById('trendingTopicsList');
    if (!container) return;

    // Count tags
    const tagCount = {};
    allTutorials.forEach(t => {
        (t.tags || []).forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
    });

    const topTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    if (topTags.length === 0) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem;">No topics yet</div>';
        return;
    }

    container.innerHTML = topTags.map(([tag, count]) => `
        <div class="trending-tag-item" onclick="filterByTag('${escHtml(tag)}')">
            <span class="trending-tag-name">#${escHtml(tag)}</span>
            <span class="trending-tag-count">${count} tutorial${count !== 1 ? 's' : ''}</span>
        </div>`).join('');
}

function filterByTag(tag) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) { searchInput.value = tag; }
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.filterByTag = filterByTag;

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
    // Upload modal openers
    ['heroUploadBtn','uploadBarTrigger','uploadIconBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openUploadModal);
    });

    // Modal close
    document.getElementById('closeUploadModal')?.addEventListener('click', closeUploadModal);
    document.getElementById('cancelUpload')?.addEventListener('click', closeUploadModal);
    document.getElementById('uploadModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('uploadModal')) closeUploadModal();
    });

    // Submit
    document.getElementById('submitTutorialBtn')?.addEventListener('click', submitTutorial);

    // YouTube live preview
    initYouTubePreview();



    // Search
    let searchTimeout;
    document.getElementById('searchInput')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 280);
    });

    // Sidebar category filter
    document.querySelectorAll('#categoryFilterList .filter-item').forEach(el => {
        el.addEventListener('click', () => setCategoryFilter(el.dataset.filter, el));
    });

    // Dept filter: "All Departments" item
    document.querySelector('#deptFilterList .filter-item[data-dept=""]')
        ?.addEventListener('click', function() {
            currentDept = '';
            document.querySelectorAll('#deptFilterList .filter-item').forEach(e => e.classList.remove('active'));
            this.classList.add('active');
            applyFilters();
        });

    // Feed tabs
    document.querySelectorAll('.feed-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabMap = {
                math: 'Mathematics', cs: 'Computer Science',
                edu: 'Basic Education', science: 'Science Education', biz: 'Business Administration'
            };
            currentDept = tabMap[tab.dataset.tab] || '';
            applyFilters();
        });
    });
}
// ─── Fix header offset ────────────────────────────────────────────────────────
function fixLayout() {
    var h = document.querySelector('.header');
    var w = document.getElementById('pageWrapper') || document.querySelector('.page-wrapper');
    if (h && w) w.style.marginTop = (h.getBoundingClientRect().height + 12) + 'px';
}
document.addEventListener('DOMContentLoaded', fixLayout);
window.addEventListener('resize', fixLayout);
window.addEventListener('load', fixLayout);