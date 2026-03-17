/**
 * tutorials.js – CampusTrend UEW Tutorial Page
 * Fixed: function declaration order, null-safe tags, robust Supabase selects,
 *        Google Drive embed utilities defined before use.
 */

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let allTutorials   = [];
let filteredList   = [];
let myLikes        = new Set();
let myFollowing    = new Set();
let currentFilter  = 'all';
let currentDept    = '';

// ─── Course keyword map ───────────────────────────────────────────────────────
const COURSE_KEYWORDS = {
    'Mathematics':            ['math','calculus','algebra','geometry','statistics','trigonometry','integral','derivative','probability','linear','numerical'],
    'Computer Science':       ['programming','python','javascript','algorithm','data structure','oop','web','database','sql','network','os','ai','machine learning','java','c++','html','css'],
    'Physics':                ['physics','mechanics','thermodynamics','optics','quantum','electromagnetism','wave','force','energy','newton'],
    'Chemistry':              ['chemistry','organic','inorganic','reaction','bond','mole','element','periodic','acid','base'],
    'Biology':                ['biology','cell','genetics','evolution','ecology','organism','dna','rna','enzyme','anatomy'],
    'Basic Education':        ['basic education','primary','pedagogy','curriculum','lesson','foundation','early childhood'],
    'Business Administration':['accounting','economics','finance','marketing','management','entrepreneur','profit','supply','demand','ledger'],
    'English Education':      ['english','grammar','essay','literature','writing','comprehension','reading','poetry','prose','shakespeare'],
    'Social Studies':         ['social','history','geography','civics','culture','society','government','democracy','africa'],
    'Science Education':      ['science','experiment','laboratory','hypothesis','research','scientific method'],
    'Health Education':       ['health','nutrition','disease','hygiene','fitness','anatomy','public health','medicine'],
    'Graphic Design':         ['design','photoshop','illustrator','typography','color theory','branding','logo','ui','ux'],
    'Music Education':        ['music','theory','notation','rhythm','melody','harmony','instrument','chord','scale'],
    'Physical Education':     ['physical','sport','fitness','exercise','athletics','training','body'],
    'French':                 ['french','francais','grammaire','conjugaison','vocabulaire','langue'],
};

function detectCourse(title) {
    if (!title) return null;
    const lower = title.toLowerCase();
    for (const [course, keywords] of Object.entries(COURSE_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) return course;
    }
    return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name) {
    if (!name) return 'U';
    const p = name.trim().split(' ');
    return p.length >= 2
        ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
}

function escHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
}

function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const span  = document.getElementById('toastMsg');
    if (!toast || !span) return;
    const icon = toast.querySelector('i');
    span.textContent = msg;
    toast.className  = `toast ${type}`;
    if (icon) icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─── Google Drive utilities (MUST be defined before buildVideoEmbed) ──────────
function extractDriveId(url) {
    if (!url) return null;
    url = url.trim();
    // /file/d/ID/...
    const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return m1[1];
    // ?id=ID  or  &id=ID
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return m2[1];
    return null;
}

function buildDriveEmbedUrl(fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
}

function isValidDriveUrl(url) {
    return !!extractDriveId(url);
}

// ─── Video embed builder ──────────────────────────────────────────────────────
function buildVideoEmbed(url) {
    if (!url) {
        return `<div style="background:#1a1a2e;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-video" style="font-size:2.5rem;color:rgba(255,255,255,0.2);"></i>
                </div>`;
    }
    const driveId = extractDriveId(url);
    if (driveId) {
        return `<iframe src="${buildDriveEmbedUrl(driveId)}"
                        allow="autoplay" allowfullscreen loading="lazy"
                        style="width:100%;height:100%;border:none;display:block;"></iframe>`;
    }
    return `<div style="background:#1a1a2e;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;">
                <i class="fas fa-exclamation-circle" style="font-size:2rem;color:rgba(255,255,255,0.3);"></i>
                <span style="font-size:0.78rem;color:rgba(255,255,255,0.4);">Could not load video</span>
            </div>`;
}

// ─── Avatar helper ────────────────────────────────────────────────────────────
function avatarHtml(avatarUrl, fullName, extraStyle = '') {
    const initials = getInitials(fullName);
    if (avatarUrl) {
        return `<img src="${escHtml(avatarUrl)}" alt="${escHtml(fullName)}"
                     style="width:100%;height:100%;object-fit:cover;border-radius:50%;${extraStyle}">`;
    }
    return initials;
}

// ─── Auth & Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const loggedIn = await window.isLoggedIn();
        if (!loggedIn) { window.location.href = 'sign-in.html'; return; }

        currentUser    = await window.getCurrentUser();
        currentProfile = await window.getCurrentProfile();
        if (!currentUser || !currentProfile) { window.location.href = 'sign-in.html'; return; }

        initUI();
        setupEventListeners();          // wire up buttons before data arrives
        populateDepartmentFilter();
        await loadMyFollowing();
        await loadMyLikes();
        await loadTutorials();          // renders cards; sidebars called inside
    } catch (err) {
        console.error('Tutorial page init error:', err);
        showToast('Error loading page. Please refresh.', 'error');
    }
});

// ─── UI Init ──────────────────────────────────────────────────────────────────
function initUI() {
    const avatarEl = document.getElementById('currentUserAvatar');
    const nameEl   = document.getElementById('currentUserName');
    const upAvatar = document.getElementById('uploadBarAvatar');

    if (avatarEl) {
        if (currentProfile.avatar_url) {
            avatarEl.innerHTML = `<img src="${escHtml(currentProfile.avatar_url)}"
                alt="${escHtml(currentProfile.full_name)}"
                style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarEl.textContent = getInitials(currentProfile.full_name);
        }
    }
    if (nameEl)   nameEl.textContent = currentProfile.full_name;
    if (upAvatar) {
        if (currentProfile.avatar_url) {
            upAvatar.innerHTML = `<img src="${escHtml(currentProfile.avatar_url)}"
                alt="${escHtml(currentProfile.full_name)}"
                style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            upAvatar.textContent = getInitials(currentProfile.full_name);
        }
    }

    document.getElementById('userProfileBtn')?.addEventListener('click', () => {
        window.location.href = 'user-profile.html';
    });
}

function populateDepartmentFilter() {
    const departments = window.DEPARTMENTS || [
        'Computer Science','Mathematics','Basic Education','Business Administration',
        'Graphic Design','Music Education','Health Education','Science Education',
        'English Education','French','Social Studies','Early Childhood',
        'Special Education','Physical Education',
    ];
    const list = document.getElementById('deptFilterList');
    if (!list) return;
    departments.forEach(dept => {
        const d = document.createElement('div');
        d.className    = 'filter-item';
        d.dataset.dept = dept;
        d.innerHTML    = `<i class="fas fa-tag"></i> ${escHtml(dept)}`;
        d.addEventListener('click', () => setDeptFilter(dept, d));
        list.appendChild(d);
    });
}

// ─── Data Loaders ─────────────────────────────────────────────────────────────
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
        // Use a simple select without FK hint — works regardless of FK name
        const { data: tutorials, error } = await window.supabaseClient
            .from('tutorials')
            .select('id, title, course_name, course_code, department, description, tags, video_url, likes_count, views_count, comments_count, created_at, user_id')
            .order('created_at', { ascending: false });

        document.getElementById('skeletonCard')?.remove();
        if (error) throw error;

        // Fetch profile data separately to avoid FK name issues
        const userIds = [...new Set((tutorials || []).map(t => t.user_id))];
        let profileMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await window.supabaseClient
                .from('profiles')
                .select('id, full_name, avatar_url, department, followers_count')
                .in('id', userIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }

        // Attach profile to each tutorial
        allTutorials = (tutorials || []).map(t => ({
            ...t,
            tags: t.tags || [],          // ensure tags is always an array
            profiles: profileMap[t.user_id] || {},
        }));

        filteredList = [...allTutorials];
        updateHeroStats();
        applyFilters();
        renderTopTutors();
        renderTrendingTopics();

    } catch (err) {
        console.error('loadTutorials error:', err);
        document.getElementById('skeletonCard')?.remove();
        document.getElementById('tutorialsContainer').innerHTML = `
            <div class="tutorial-card">
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Could not load tutorials</h3>
                    <p>${escHtml(err.message || 'Check your connection and try refreshing.')}</p>
                </div>
            </div>`;
    }
}

// ─── Hero Stats ───────────────────────────────────────────────────────────────
function updateHeroStats() {
    const uniqueTutors = new Set(allTutorials.map(t => t.user_id)).size;
    const totalViews   = allTutorials.reduce((s, t) => s + (t.views_count || 0), 0);

    document.getElementById('heroTotalVideos').textContent = formatCount(allTutorials.length);
    document.getElementById('heroTotalTutors').textContent = formatCount(uniqueTutors);
    document.getElementById('heroTotalViews').textContent  = formatCount(totalViews);
    document.getElementById('countAll').textContent        = allTutorials.length;

    const weekAgo  = Date.now() - 7 * 24 * 3600 * 1000;
    const weekTuts = allTutorials.filter(t => new Date(t.created_at) > weekAgo);
    document.getElementById('weekUploads').textContent = weekTuts.length;
    document.getElementById('weekLikes').textContent   = formatCount(weekTuts.reduce((s, t) => s + (t.likes_count || 0), 0));
    document.getElementById('weekTutors').textContent  = new Set(weekTuts.map(t => t.user_id)).size;
}

// ─── Filtering & Search ───────────────────────────────────────────────────────
function applyFilters() {
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    let list = [...allTutorials];

    if (currentDept) {
        list = list.filter(t => t.department === currentDept);
    }

    if (currentFilter === 'recent') {
        list = list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (currentFilter === 'popular') {
        list = list.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    } else if (currentFilter === 'following') {
        list = list.filter(t => myFollowing.has(t.user_id));
    }

    if (searchVal) {
        list = list.filter(t =>
            (t.title       || '').toLowerCase().includes(searchVal) ||
            (t.description || '').toLowerCase().includes(searchVal) ||
            (t.course_name || '').toLowerCase().includes(searchVal) ||
            (t.course_code || '').toLowerCase().includes(searchVal) ||
            (t.department  || '').toLowerCase().includes(searchVal) ||
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

    container.innerHTML = filteredList.map(t => buildTutorialCard(t)).join('');
    filteredList.forEach(t => attachCardListeners(t));
}

function buildTutorialCard(t) {
    const profile    = t.profiles || {};
    const isLiked    = myLikes.has(t.id);
    const isFollowing = myFollowing.has(t.user_id);
    const isOwn      = t.user_id === currentUser.id;
    const tags       = (t.tags || []).slice(0, 4);
    const courseName = t.course_name || detectCourse(t.title) || t.department || '';
    const videoEmbed = buildVideoEmbed(t.video_url);

    return `
    <article class="tutorial-card" id="card-${t.id}" data-tutorial-id="${t.id}">

        <div class="tc-header">
            <a class="tc-avatar" href="user-profile.html?userId=${escHtml(t.user_id)}" title="View profile">
                ${avatarHtml(profile.avatar_url, profile.full_name)}
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
                    data-uid="${t.user_id}" id="follow-btn-${t.id}">
                ${isFollowing
                    ? '<i class="fas fa-user-check"></i> Following'
                    : '<i class="fas fa-user-plus"></i> Follow'}
            </button>` : ''}
        </div>

        ${courseName ? `
        <div class="tc-course-tag">
            <i class="fas fa-book-open"></i> ${escHtml(courseName)}
            ${t.course_code ? `· <span style="opacity:.8">${escHtml(t.course_code)}</span>` : ''}
        </div>` : ''}

        <div class="tc-video-wrap" id="video-wrap-${t.id}">
            ${videoEmbed}
        </div>

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
            <button class="tc-action-btn share-btn" id="share-btn-${t.id}" title="Share">
                <i class="fas fa-share-alt"></i> Share
            </button>
        </div>

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

// ─── Card event listeners ─────────────────────────────────────────────────────
function attachCardListeners(t) {
    document.getElementById(`like-btn-${t.id}`)
        ?.addEventListener('click', () => toggleLike(t.id));

    document.getElementById(`comment-toggle-${t.id}`)
        ?.addEventListener('click', () => toggleComments(t.id));

    document.getElementById(`follow-btn-${t.id}`)
        ?.addEventListener('click', () => toggleFollow(t.user_id, t.id));

    document.getElementById(`share-btn-${t.id}`)
        ?.addEventListener('click', () => {
            const url = `${location.origin}${location.pathname}?tutorial=${t.id}`;
            if (navigator.share) {
                navigator.share({ title: t.title, url }).catch(() => {});
            } else {
                navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
            }
        });
}

function toggleDesc(tutorialId) {
    const el  = document.getElementById(`desc-${tutorialId}`);
    const btn = document.getElementById(`readmore-${tutorialId}`);
    if (!el || !btn) return;
    const collapsed = el.classList.toggle('collapsed');
    btn.textContent = collapsed ? 'See more' : 'See less';
}
window.toggleDesc = toggleDesc;

// ─── Like ─────────────────────────────────────────────────────────────────────
async function toggleLike(tutorialId) {
    const btn     = document.getElementById(`like-btn-${tutorialId}`);
    const countEl = document.getElementById(`like-count-${tutorialId}`);
    if (!btn || !countEl) return;

    const wasLiked = myLikes.has(tutorialId);
    const tut = allTutorials.find(t => t.id === tutorialId);

    // Optimistic UI
    if (wasLiked) {
        myLikes.delete(tutorialId);
        btn.classList.remove('liked');
        btn.querySelector('i').className = 'far fa-heart';
        if (tut) tut.likes_count = Math.max(0, (tut.likes_count || 1) - 1);
    } else {
        myLikes.add(tutorialId);
        btn.classList.add('liked');
        btn.querySelector('i').className = 'fas fa-heart';
        if (tut) tut.likes_count = (tut.likes_count || 0) + 1;
    }
    if (tut) countEl.textContent = formatCount(tut.likes_count);

    try {
        if (wasLiked) {
            await window.supabaseClient
                .from('tutorial_likes')
                .delete()
                .eq('tutorial_id', tutorialId)
                .eq('user_id', currentUser.id);
        } else {
            await window.supabaseClient
                .from('tutorial_likes')
                .upsert({ tutorial_id: tutorialId, user_id: currentUser.id });
        }
        // Sync count to DB
        if (tut) {
            await window.supabaseClient
                .from('tutorials')
                .update({ likes_count: tut.likes_count })
                .eq('id', tutorialId);
        }
    } catch (err) {
        console.error('toggleLike:', err);
        showToast('Could not update like', 'error');
        // Revert
        if (wasLiked) { myLikes.add(tutorialId); } else { myLikes.delete(tutorialId); }
        if (tut) {
            tut.likes_count = wasLiked ? (tut.likes_count + 1) : Math.max(0, tut.likes_count - 1);
            countEl.textContent = formatCount(tut.likes_count);
            btn.classList.toggle('liked', !wasLiked);
        }
    }
}

// ─── Follow ───────────────────────────────────────────────────────────────────
async function toggleFollow(targetUserId, cardId) {
    if (targetUserId === currentUser.id) return;
    const btn = document.getElementById(`follow-btn-${cardId}`);
    if (!btn) return;

    const wasFollowing = myFollowing.has(targetUserId);

    // Optimistic UI
    if (wasFollowing) {
        myFollowing.delete(targetUserId);
        btn.classList.remove('following');
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
    } else {
        myFollowing.add(targetUserId);
        btn.classList.add('following');
        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
    }

    try {
        if (wasFollowing) {
            await window.supabaseClient
                .from('followers')
                .delete()
                .eq('follower_id', currentUser.id)
                .eq('following_id', targetUserId);
        } else {
            await window.supabaseClient
                .from('followers')
                .upsert({ follower_id: currentUser.id, following_id: targetUserId });
        }
        showToast(wasFollowing ? 'Unfollowed' : 'Now following!');
    } catch (err) {
        console.error('toggleFollow:', err);
        showToast('Could not update follow', 'error');
        // Revert
        if (wasFollowing) { myFollowing.add(targetUserId); } else { myFollowing.delete(targetUserId); }
        btn.classList.toggle('following', wasFollowing);
        btn.innerHTML = wasFollowing
            ? '<i class="fas fa-user-check"></i> Following'
            : '<i class="fas fa-user-plus"></i> Follow';
    }
}

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
    const opening = !section.classList.contains('open');
    section.classList.toggle('open');
    if (opening && !loadedComments.has(tutorialId)) {
        loadedComments.add(tutorialId);
        await loadComments(tutorialId);
    }
}

async function loadComments(tutorialId) {
    const list = document.getElementById(`comment-list-${tutorialId}`);
    if (!list) return;
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:10px;">Loading…</p>';

    try {
        const { data, error } = await window.supabaseClient
            .from('tutorial_comments')
            .select('id, content, created_at, user_id')
            .eq('tutorial_id', tutorialId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:8px;">No comments yet. Be the first!</p>';
            return;
        }

        // Fetch commenter profiles separately
        const uids = [...new Set(data.map(c => c.user_id))];
        const { data: profiles } = await window.supabaseClient
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', uids);
        const pMap = {};
        (profiles || []).forEach(p => { pMap[p.id] = p; });

        list.innerHTML = data.map(c => {
            const p  = pMap[c.user_id] || {};
            const av = p.avatar_url
                ? `<img src="${escHtml(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
                : getInitials(p.full_name);
            return `
            <div class="tc-comment-item">
                <div class="tc-comment-avatar">${av}</div>
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
    const input   = document.getElementById(`comment-input-${tutorialId}`);
    const content = (input?.value || '').trim();
    if (!content) return;

    input.value    = '';
    input.disabled = true;

    try {
        const { error } = await window.supabaseClient
            .from('tutorial_comments')
            .insert({ tutorial_id: tutorialId, user_id: currentUser.id, content });
        if (error) throw error;

        const tut = allTutorials.find(t => t.id === tutorialId);
        if (tut) tut.comments_count = (tut.comments_count || 0) + 1;
        const countEl = document.getElementById(`comment-count-${tutorialId}`);
        if (countEl && tut) countEl.textContent = formatCount(tut.comments_count);

        await window.supabaseClient
            .from('tutorials')
            .update({ comments_count: tut?.comments_count ?? 1 })
            .eq('id', tutorialId);

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
const viewedTutorials = new Set();
async function incrementViews(tutorialId) {
    if (viewedTutorials.has(tutorialId)) return;
    viewedTutorials.add(tutorialId);
    try {
        const tut = allTutorials.find(t => t.id === tutorialId);
        const newCount = (tut?.views_count || 0) + 1;
        if (tut) tut.views_count = newCount;
        await window.supabaseClient
            .from('tutorials')
            .update({ views_count: newCount })
            .eq('id', tutorialId);
    } catch (e) { console.warn('incrementViews:', e); }
}

// ─── Sidebars ─────────────────────────────────────────────────────────────────
function renderTopTutors() {
    const container = document.getElementById('topTutorsList');
    if (!container) return;

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

    const colors = ['#667eea','#f093fb','#4facfe','#43e97b','#fa709a'];
    container.innerHTML = tutors.map((tutor, i) => {
        const av = tutor.avatar_url
            ? `<img src="${escHtml(tutor.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
            : getInitials(tutor.full_name);
        return `
        <div class="top-tutor-item" onclick="viewUserProfile('${tutor.id}')">
            <div class="top-tutor-avatar" style="background:${colors[i % colors.length]};">${av}</div>
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
    const el = document.getElementById('searchInput');
    if (el) el.value = tag;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.filterByTag = filterByTag;

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function openUploadModal() {
    document.getElementById('uploadModal')?.classList.add('show');
}
function closeUploadModal() {
    document.getElementById('uploadModal')?.classList.remove('show');
    resetUploadForm();
}

function resetUploadForm() {
    ['videoTitle','videoDesc','videoTags','videoCourse','videoUrlInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const dept = document.getElementById('videoDepartment');
    if (dept) dept.value = '';
    const detected = document.getElementById('courseDetected');
    if (detected) detected.style.display = 'none';
    const preview = document.getElementById('ytPreview');
    const frame   = document.getElementById('ytPreviewFrame');
    if (preview) preview.classList.remove('show');
    if (frame)   frame.src = '';
}

// Live Drive preview in the modal
function initDrivePreview() {
    const input    = document.getElementById('videoUrlInput');
    const preview  = document.getElementById('ytPreview');
    const frame    = document.getElementById('ytPreviewFrame');
    const clearBtn = document.getElementById('clearYtUrl');
    const warning  = document.getElementById('drivePermWarning');
    const infoBar  = document.getElementById('ytPreviewInfo');
    let debounce;

    function resetWarning() {
        if (warning)  warning.style.display  = 'none';
        if (infoBar)  infoBar.style.background = '';
        if (infoBar)  infoBar.querySelector('span').textContent = 'Preview looks good? Fill in the details below and publish.';
        if (infoBar)  infoBar.querySelector('i').className = 'fab fa-google-drive';
    }

    // After the iframe loads, try to detect if Drive is showing "You need access"
    // We do this by checking the iframe's title attribute which Drive sets
    frame?.addEventListener('load', () => {
        // Give Drive a moment to fully render its page title
        setTimeout(() => {
            try {
                // If we can read the iframe title (same-origin only, but try anyway)
                const iframeTitle = frame.contentDocument?.title || '';
                if (iframeTitle.toLowerCase().includes('sign in') ||
                    iframeTitle.toLowerCase().includes('access')) {
                    showPermissionError();
                    return;
                }
            } catch (e) {
                // Cross-origin — can't read title, use size heuristic instead
            }

            // Heuristic: Drive's "You need access" page loads very quickly and is tiny.
            // A real video player takes longer. We check the iframe's natural height.
            try {
                const h = frame.contentWindow?.document?.body?.scrollHeight;
                if (h && h < 200) {
                    showPermissionError();
                    return;
                }
            } catch (e) { /* cross-origin, ignore */ }

            // Passed checks — assume it's fine
            resetWarning();
        }, 1500);
    });

    function showPermissionError() {
        if (warning) warning.style.display = 'block';
        // Change the preview info bar to a warning state
        if (infoBar) {
            infoBar.style.background = '#fff0f0';
            const span = infoBar.querySelector('span');
            const icon = infoBar.querySelector('i');
            if (span) span.textContent = '⚠️ Access denied — update sharing settings and paste the link again.';
            if (icon) icon.className = 'fas fa-lock';
            if (icon) icon.style.color = '#e53935';
        }
    }

    input?.addEventListener('input', () => {
        clearTimeout(debounce);
        resetWarning();
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
        if (input)   input.value = '';
        if (preview) preview.classList.remove('show');
        if (frame)   frame.src = '';
        resetWarning();
    });
}

async function submitTutorial() {
    const videoUrl = (document.getElementById('videoUrlInput')?.value || '').trim();
    const title    = (document.getElementById('videoTitle')?.value || '').trim();
    const dept     = document.getElementById('videoDepartment')?.value || '';
    const desc     = (document.getElementById('videoDesc')?.value || '').trim();
    const tagsRaw  = (document.getElementById('videoTags')?.value || '');
    const tags     = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const course   = (document.getElementById('videoCourse')?.value || '').trim();
    const detectedCourse = detectCourse(title) || dept;

    if (!videoUrl || !isValidDriveUrl(videoUrl)) {
        showToast('Please paste a valid Google Drive link', 'error');
        document.getElementById('videoUrlInput')?.focus();
        return;
    }

    // Block publish if permission warning is visible
    const permWarning = document.getElementById('drivePermWarning');
    if (permWarning && permWarning.style.display !== 'none') {
        showToast('Fix the sharing permissions on your Drive file first', 'error');
        permWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    if (!title) { showToast('Please enter a video title', 'error'); return; }
    if (!dept)  { showToast('Please select a department', 'error'); return; }
    if (!desc)  { showToast('Please add a description', 'error'); return; }

    const btn = document.getElementById('submitTutorialBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';

    try {
        const { data, error } = await window.supabaseClient
            .from('tutorials')
            .insert({
                user_id:        currentUser.id,
                title,
                course_name:    detectedCourse,
                course_code:    course,
                department:     dept,
                description:    desc,
                tags,
                video_url:      videoUrl,
                likes_count:    0,
                views_count:    0,
                comments_count: 0,
            })
            .select('id, title, course_name, course_code, department, description, tags, video_url, likes_count, views_count, comments_count, created_at, user_id')
            .single();

        if (error) throw error;

        // Attach current user's profile so the card renders correctly
        const newTutorial = {
            ...data,
            tags: data.tags || [],
            profiles: {
                id:             currentUser.id,
                full_name:      currentProfile.full_name,
                avatar_url:     currentProfile.avatar_url,
                department:     currentProfile.department,
                followers_count: currentProfile.followers_count || 0,
            },
        };

        allTutorials.unshift(newTutorial);
        applyFilters();
        updateHeroStats();
        renderTopTutors();
        renderTrendingTopics();
        closeUploadModal();
        showToast('Tutorial published! 🎉');

    } catch (err) {
        console.error('submitTutorial:', err);
        showToast(`Failed to publish: ${err.message || 'Please try again.'}`, 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Tutorial';
    }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
    // Open modal
    ['heroUploadBtn','uploadBarTrigger','uploadIconBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openUploadModal);
    });

    // Close modal
    document.getElementById('closeUploadModal')?.addEventListener('click', closeUploadModal);
    document.getElementById('cancelUpload')?.addEventListener('click', closeUploadModal);
    document.getElementById('uploadModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('uploadModal')) closeUploadModal();
    });

    // Publish button
    document.getElementById('submitTutorialBtn')?.addEventListener('click', submitTutorial);

    // Drive live preview
    initDrivePreview();

    // Title → auto-detect course
    document.getElementById('videoTitle')?.addEventListener('input', e => {
        const course   = detectCourse(e.target.value);
        const detected = document.getElementById('courseDetected');
        const name     = document.getElementById('courseDetectedName');
        if (course && detected && name) {
            name.textContent = course;
            detected.style.display = 'block';
            const sel = document.getElementById('videoDepartment');
            if (sel && !sel.value) {
                const opt = [...sel.options].find(o => o.value === course);
                if (opt) sel.value = course;
            }
        } else if (detected) {
            detected.style.display = 'none';
        }
    });

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

    // Dept filter "All" item
    document.querySelector('#deptFilterList .filter-item[data-dept=""]')
        ?.addEventListener('click', function () {
            currentDept = '';
            document.querySelectorAll('#deptFilterList .filter-item')
                .forEach(e => e.classList.remove('active'));
            this.classList.add('active');
            applyFilters();
        });

    // Feed tabs
    document.querySelectorAll('.feed-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabMap = {
                math:    'Mathematics',
                cs:      'Computer Science',
                edu:     'Basic Education',
                science: 'Science Education',
                biz:     'Business Administration',
            };
            currentDept = tabMap[tab.dataset.tab] || '';
            applyFilters();
        });
    });
}