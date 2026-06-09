// ─── State ───────────────────────────────────────────────────────────────────
let allUsers     = [];
let allPosts     = [];
let allComments  = [];
let allTutorials = [];
let pendingAction = null;

// ─── Auth ─────────────────────────────────────────────────────────────────────
const ADMIN_EMAILS = ['5251170066@st.uew.edu.gh']; // add your admin emails here

async function adminLogin() {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btnText  = document.getElementById('loginBtnText');

    errEl.style.display = 'none';
    btnText.innerHTML = '<span class="spinner"></span>';

    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: profile } = await window.supabaseClient
            .from('profiles').select('is_admin, full_name').eq('id', data.user.id).single();

        if (!profile?.is_admin) {
            await window.supabaseClient.auth.signOut();
            throw new Error('Access denied. Admin privileges required.');
        }

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminApp').style.display = 'block';
        document.getElementById('adminName').textContent = profile.full_name || email;
        document.getElementById('adminInitials').textContent = (profile.full_name || email)[0].toUpperCase();
        loadAllData();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btnText.textContent = 'Sign In';
    }
}

async function adminLogout() {
    await window.supabaseClient.auth.signOut();
    location.reload();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showPage(name, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadAllData() {
    await Promise.all([loadUsers(), loadPosts(), loadComments(), loadTutorials(), loadSubsCount()]);
}

async function loadUsers() {
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = '<tr class="loading-row"><td colspan="7"><span class="pulse">Loading...</span></td></tr>';

    const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { showToast('Error loading users', 'error'); return; }
    allUsers = data || [];

    allUsers.forEach(u => {
        u._followersBoost = u.followers_boost || 0;
        u._followers = (u.followers_count || 0) + u._followersBoost;
        u._following = u.following_count || 0;
    });

    const activeCount  = allUsers.filter(u => !u.is_blocked).length;
    const blockedCount = allUsers.filter(u => u.is_blocked).length;

    document.getElementById('stat-users').textContent   = allUsers.length;
    document.getElementById('stat-blocked').textContent = blockedCount;
    document.getElementById('usersBadge').textContent   = activeCount;
    document.getElementById('blockedBadge').textContent = blockedCount;

    renderUsersTable(allUsers);
    renderBlockedTable(allUsers.filter(u => u.is_blocked));
    renderRecentUsers(allUsers.slice(0, 5));
}

async function loadPosts() {
    const { data, error } = await window.supabaseClient
        .from('posts')
        .select('*, boost_likes, boost_views, profiles:user_id(full_name, avatar_url)')
        .order('created_at', { ascending: false });

    if (error) { showToast('Error loading posts', 'error'); return; }
    allPosts = data || [];

    const totalLikes = allPosts.reduce((s, p) => s + (p.likes_count || 0) + (p.boost_likes || 0), 0);
    document.getElementById('stat-posts').textContent  = allPosts.length;
    document.getElementById('stat-likes').textContent  = fmtNum(totalLikes);
    document.getElementById('postsBadge').textContent  = allPosts.length;

    renderPostsTable(allPosts);
}

async function loadComments() {
    const { data, error } = await window.supabaseClient
        .from('comments')
        .select('*, profiles:user_id(full_name)')
        .order('created_at', { ascending: false });

    if (error) { showToast('Error loading comments', 'error'); return; }
    allComments = data || [];
    document.getElementById('commentsBadge').textContent = allComments.length;
    renderCommentsTable(allComments);
}

async function loadTutorials() {
    const { data, error } = await window.supabaseClient
        .from('tutorials')
        .select('*, boost_likes, boost_views, profiles:user_id(full_name, avatar_url)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('loadTutorials error:', error);
        showToast('Error loading tutorials: ' + (error.message || 'unknown'), 'error');
        return;
    }

    allTutorials = data || [];
    document.getElementById('tutorialsBadge').textContent = allTutorials.length;

    const sel = document.getElementById('tutorialDeptFilter');
    if (sel) {
        const depts = [...new Set(allTutorials.map(t => t.department).filter(Boolean))].sort();
        const cur = sel.value;
        sel.innerHTML = '<option value="">All departments</option>' +
            depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
        sel.value = cur;
    }
    renderTutorialsTable(allTutorials);
}


// ─── Render: Users ────────────────────────────────────────────────────────────
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTable');
    if (!users.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-icon">👤</div><div class="empty-text">No users found</div></td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr class="${u.is_blocked ? 'blocked-row' : ''}">
            <td><div class="user-cell">
                <div class="user-avatar">${u.avatar_url ? `<img src="${u.avatar_url}">` : esc(u.full_name||'?')[0]}</div>
                <div><div class="user-name">${esc(u.full_name||'Unknown')}</div><div class="user-email">${esc(u.email||'')}</div></div>
            </div></td>
            <td><span class="badge badge-dept">${esc(u.department||'—')}</span></td>
            <td style="font-family:var(--mono);font-size:12px;">${esc(u.index_number||'—')}</td>
            <td style="font-family:var(--mono);">${u.posts_count||0}</td>
            <td>
                <span style="font-family:var(--mono);font-size:13px;">
                    <i class="fas fa-user-friends" style="color:var(--accent);margin-right:4px;"></i>${fmtNum(u._followers)}${u._followersBoost ? ` <span style="color:var(--accent);font-size:11px;">(+${fmtNum(u._followersBoost)})</span>` : ''}
                </span>
            </td>
            <td><span class="badge ${u.is_blocked ? 'badge-blocked' : 'badge-active'}">${u.is_blocked ? 'BLOCKED' : 'ACTIVE'}</span></td>
            <td><div class="actions-cell">
                <button class="btn btn-ghost btn-sm" onclick="openFollowersModal('${u.id}','${esc(u.full_name||'')}',${u._followersBoost})">
                    <i class="fas fa-user-friends"></i> Followers
                </button>
                ${u.is_blocked
                    ? `<button class="btn btn-unblock btn-sm" onclick="confirmAction('unblock','${u.id}','${esc(u.full_name||'')}')"><i class="fas fa-unlock"></i> Unblock</button>`
                    : `<button class="btn btn-block btn-sm" onclick="confirmAction('block','${u.id}','${esc(u.full_name||'')}')"><i class="fas fa-ban"></i> Block</button>`}
                <button class="btn btn-danger btn-sm" onclick="confirmAction('deleteUser','${u.id}','${esc(u.full_name||'')}')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`).join('');
}

function renderRecentUsers(users) {
    const tbody = document.getElementById('recentUsersTable');
    if (!users.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No users yet</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `
        <tr class="${u.is_blocked ? 'blocked-row' : ''}">
            <td><div class="user-cell">
                <div class="user-avatar">${u.avatar_url ? `<img src="${u.avatar_url}">` : esc(u.full_name||'?')[0]}</div>
                <div><div class="user-name">${esc(u.full_name||'Unknown')}</div><div class="user-email">${esc(u.email||'')}</div></div>
            </div></td>
            <td><span class="badge badge-dept">${esc(u.department||'—')}</span></td>
            <td><span class="badge ${u.is_blocked ? 'badge-blocked' : 'badge-active'}">${u.is_blocked ? 'BLOCKED' : 'ACTIVE'}</span></td>
            <td><div class="actions-cell">
                <button class="btn btn-ghost btn-sm" onclick="openFollowersModal('${u.id}','${esc(u.full_name||'')}',${u._followersBoost})">
                    <i class="fas fa-user-friends"></i> Followers
                </button>
            </div></td>
        </tr>`).join('');
}

function renderBlockedTable(users) {
    const tbody = document.getElementById('blockedTable');
    if (!users.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-icon">✅</div><div class="empty-text">No blocked users</div></td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr class="blocked-row">
            <td><div class="user-cell">
                <div class="user-avatar">${u.avatar_url ? `<img src="${u.avatar_url}">` : esc(u.full_name||'?')[0]}</div>
                <div><div class="user-name">${esc(u.full_name||'Unknown')}</div><div class="user-email">${esc(u.email||'')}</div></div>
            </div></td>
            <td><span class="badge badge-dept">${esc(u.department||'—')}</span></td>
            <td><span style="font-size:13px;color:var(--blocked-color)">${esc(u.blocked_reason||'No reason given')}</span></td>
            <td style="font-family:var(--mono);font-size:12px;">${u.blocked_at ? new Date(u.blocked_at).toLocaleDateString() : '—'}</td>
            <td><button class="btn btn-unblock btn-sm" onclick="confirmAction('unblock','${u.id}','${esc(u.full_name||'')}')"><i class="fas fa-unlock"></i> Unblock</button></td>
        </tr>`).join('');
}

// ─── Render: Posts ────────────────────────────────────────────────────────────
function renderPostsTable(posts) {
    const tbody = document.getElementById('postsTable');
    if (!posts.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-icon">🖼️</div><div class="empty-text">No posts found</div></td></tr>';
        return;
    }
    tbody.innerHTML = posts.map(p => {
        const src = p.image_url || p.media_url;
        const thumb = src
            ? (p.media_type === 'video'
                ? `<div class="post-image-placeholder"><i class="fas fa-play"></i></div>`
                : `<img class="post-image" src="${src}" onerror="this.style.display='none'">`)
            : `<div class="post-image-placeholder"><i class="fas fa-image"></i></div>`;
        return `
        <tr>
            <td><div class="user-cell">${thumb}
                <div><div class="post-text">${esc(p.content||'(no caption)')}</div>
                <div class="post-meta">${p.department||'General'}</div></div>
            </div></td>
            <td><div class="user-cell">
                <div class="user-avatar" style="width:28px;height:28px;">${p.profiles?.avatar_url ? `<img src="${p.profiles.avatar_url}">` : (p.profiles?.full_name||'?')[0]}</div>
                <span style="font-size:13px;">${esc(p.profiles?.full_name||'Unknown')}</span>
            </div></td>
            <td><span class="badge ${p.visibility==='department' ? 'badge-dept-only' : 'badge-public'}">${p.visibility||'public'}</span></td>
            <td style="font-family:var(--mono);">${fmtNum((p.likes_count||0)+(p.boost_likes||0))}${p.boost_likes ? ` <span style="color:var(--accent);font-size:11px;">(+${fmtNum(p.boost_likes)})</span>` : ''}</td>
            <td style="font-family:var(--mono);">${p.media_type==='video' ? fmtNum((p.video_views||0)+(p.boost_views||0)) + (p.boost_views ? ` <span style="color:var(--accent);font-size:11px;">(+${fmtNum(p.boost_views)})</span>` : '') : '—'}</td>
            <td style="font-family:var(--mono);font-size:12px;">${new Date(p.created_at).toLocaleDateString()}</td>
            <td><div class="actions-cell">
                <button class="btn btn-ghost btn-sm" onclick="openBoostModal('${p.id}',${p.boost_likes||0},${p.boost_views||0},'${p.media_type||''}')">
                    <i class="fas fa-rocket"></i> Boost
                </button>
                <button class="btn btn-danger btn-sm" onclick="confirmAction('deletePost','${p.id}','')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

// ─── Render: Comments ─────────────────────────────────────────────────────────
function renderCommentsTable(comments) {
    const tbody = document.getElementById('commentsTable');
    if (!comments.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4"><div class="empty-icon">💬</div><div class="empty-text">No comments found</div></td></tr>';
        return;
    }
    tbody.innerHTML = comments.map(c => `
        <tr>
            <td><div class="post-text">${esc(c.content||'')}</div></td>
            <td style="font-size:13px;">${esc(c.profiles?.full_name||'Unknown')}</td>
            <td style="font-family:var(--mono);font-size:12px;">${new Date(c.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-danger btn-sm" onclick="confirmAction('deleteComment','${c.id}','')"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('');
}

// ─── Render: Tutorials ────────────────────────────────────────────────────────
function renderTutorialsTable(tutorials) {
    const tbody = document.getElementById('tutorialsTable');
    if (!tbody) return;
    if (!tutorials.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-icon">🎓</div><div class="empty-text">No tutorials found</div></td></tr>';
        return;
    }
    tbody.innerHTML = tutorials.map(t => {
        const thumb = t.video_url
            ? `<div class="post-image-placeholder"><i class="fas fa-play"></i></div>`
            : `<div class="post-image-placeholder"><i class="fas fa-graduation-cap"></i></div>`;
        const courseLine = [t.course_code, t.course_name].filter(Boolean).join(' · ');
        return `
        <tr>
            <td><div class="user-cell">${thumb}
                <div><div class="post-text">${esc(t.title||'(untitled)')}</div>
                <div class="post-meta">${esc(courseLine || 'No course')}</div></div>
            </div></td>
            <td><div class="user-cell">
                <div class="user-avatar" style="width:28px;height:28px;">${t.profiles?.avatar_url ? `<img src="${t.profiles.avatar_url}">` : esc((t.profiles?.full_name||'?')[0])}</div>
                <span style="font-size:13px;">${esc(t.profiles?.full_name||'Unknown')}</span>
            </div></td>
            <td><span class="badge badge-dept">${esc(t.department||'—')}</span></td>
            <td style="font-family:var(--mono);">${fmtNum((t.likes_count||0)+(t.boost_likes||0))}${t.boost_likes ? ` <span style="color:var(--accent);font-size:11px;">(+${fmtNum(t.boost_likes)})</span>` : ''}</td>
            <td style="font-family:var(--mono);">${fmtNum((t.views_count||0)+(t.boost_views||0))}${t.boost_views ? ` <span style="color:var(--accent);font-size:11px;">(+${fmtNum(t.boost_views)})</span>` : ''}</td>
            <td style="font-family:var(--mono);font-size:12px;">${new Date(t.created_at).toLocaleDateString()}</td>
            <td><div class="actions-cell">
                <button class="btn btn-ghost btn-sm" onclick="openBoostTutorialModal('${t.id}',${t.boost_likes||0},${t.boost_views||0})">
                    <i class="fas fa-rocket"></i> Boost
                </button>
                <button class="btn btn-danger btn-sm" onclick="confirmAction('deleteTutorial','${t.id}','')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}


// ─── Followers Modal ──────────────────────────────────────────────────────────
function openFollowersModal(userId, userName, currentBoost) {
    document.getElementById('followersUserId').value    = userId;
    document.getElementById('followersUserName').textContent = userName;
    document.getElementById('followersCount').value     = 0;

    const followingInput = document.getElementById('followingCount');
    if (followingInput) {
        const row = followingInput.closest('.form-group') || followingInput.parentElement;
        if (row) row.style.display = 'none';
    }

    const lbl = document.querySelector('label[for="followersCount"]')
        || document.getElementById('followersCount').previousElementSibling;
    if (lbl) lbl.textContent = `Add followers (current boost: +${currentBoost || 0})`;

    const modal = document.getElementById('followersModal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
}

function closeFollowersModal() {
    const modal = document.getElementById('followersModal');
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
}

async function saveFollowers() {
    const userId   = document.getElementById('followersUserId').value;
    const addCount = parseInt(document.getElementById('followersCount').value) || 0;
    const saveBtn  = document.getElementById('followersSaveBtn');

    if (addCount === 0) { showToast('Enter a number to add', 'error'); return; }

    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
    saveBtn.disabled  = true;

    try {
        const { data: cur, error: readErr } = await window.supabaseClient
            .from('profiles')
            .select('followers_boost')
            .eq('id', userId)
            .single();
        if (readErr) throw readErr;

        const newBoost = (cur?.followers_boost || 0) + addCount;

        const { error } = await window.supabaseClient
            .from('profiles')
            .update({ followers_boost: newBoost })
            .eq('id', userId);
        if (error) throw error;

        const user = allUsers.find(u => u.id === userId);
        if (user) {
            user.followers_boost = newBoost;
            user._followersBoost = newBoost;
            user._followers = (user.followers_count || 0) + newBoost;
        }

        renderUsersTable(allUsers);
        renderRecentUsers(allUsers.slice(0, 5));
        closeFollowersModal();
        showToast(`Added ${addCount} followers (boost now +${newBoost})`, 'success');
    } catch (err) {
        showToast('Error: ' + (err.message || 'unknown'), 'error');
    } finally {
        saveBtn.innerHTML = '<i class="fas fa-users"></i> Save';
        saveBtn.disabled  = false;
    }
}

// ─── Boost Modal ──────────────────────────────────────────────────────────────
let boostKind = 'post';

function openBoostModal(postId, currentBoostLikes, currentBoostViews, mediaType) {
    boostKind = 'post';
    const post = allPosts.find(p => p.id === postId);
    const title = post?.content || '(no caption)';
    document.getElementById('boostPostId').value    = postId;
    document.getElementById('boostPostTitle').textContent = title;
    document.getElementById('boostLikes').value     = 0;
    document.getElementById('boostIsVideo').value   = mediaType === 'video' ? '1' : '0';

    const viewsRow = document.getElementById('boostViewsRow');
    viewsRow.style.display = mediaType === 'video' ? 'flex' : 'none';
    document.getElementById('boostViews').value = 0;

    const likesLbl = document.querySelector('label[for="boostLikes"]') || document.getElementById('boostLikes').previousElementSibling;
    if (likesLbl) likesLbl.textContent = `Add likes (current boost: +${currentBoostLikes || 0})`;
    const viewsLbl = viewsRow.querySelector('label');
    if (viewsLbl) viewsLbl.textContent = `Add views (current boost: +${currentBoostViews || 0})`;

    const modal = document.getElementById('boostModal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
}

function openBoostTutorialModal(tutorialId, currentBoostLikes, currentBoostViews) {
    boostKind = 'tutorial';
    const tut = allTutorials.find(t => t.id === tutorialId);
    const title = tut?.title || '(untitled)';
    document.getElementById('boostPostId').value    = tutorialId;
    document.getElementById('boostPostTitle').textContent = title;
    document.getElementById('boostLikes').value     = 0;
    document.getElementById('boostIsVideo').value   = '1';

    const viewsRow = document.getElementById('boostViewsRow');
    viewsRow.style.display = 'flex';
    document.getElementById('boostViews').value = 0;

    const likesLbl = document.querySelector('label[for="boostLikes"]') || document.getElementById('boostLikes').previousElementSibling;
    if (likesLbl) likesLbl.textContent = `Add likes (current boost: +${currentBoostLikes || 0})`;
    const viewsLbl = viewsRow.querySelector('label');
    if (viewsLbl) viewsLbl.textContent = `Add views (current boost: +${currentBoostViews || 0})`;

    const modal = document.getElementById('boostModal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
}

function closeBoostModal() {
    const modal = document.getElementById('boostModal');
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
}

async function saveBoost() {
    const id        = document.getElementById('boostPostId').value;
    const addLikes  = parseInt(document.getElementById('boostLikes').value) || 0;
    const addViews  = parseInt(document.getElementById('boostViews').value) || 0;
    const isVideo   = document.getElementById('boostIsVideo').value === '1';
    const saveBtn   = document.getElementById('boostSaveBtn');

    if (addLikes === 0 && addViews === 0) { showToast('Enter a number to add', 'error'); return; }

    saveBtn.innerHTML = '<span class="spinner"></span>';
    saveBtn.disabled  = true;

    try {
        const table = boostKind === 'tutorial' ? 'tutorials' : 'posts';

        const { data: row, error: readErr } = await window.supabaseClient
            .from(table)
            .select('boost_likes, boost_views')
            .eq('id', id)
            .single();
        if (readErr) throw readErr;

        const newBoostLikes = (row?.boost_likes || 0) + addLikes;
        const update = { boost_likes: newBoostLikes };
        if (isVideo || boostKind === 'tutorial') {
            update.boost_views = (row?.boost_views || 0) + addViews;
        }

        const { error } = await window.supabaseClient.from(table).update(update).eq('id', id);
        if (error) throw error;

        if (boostKind === 'tutorial') {
            const t = allTutorials.find(x => x.id === id);
            if (t) { t.boost_likes = update.boost_likes; t.boost_views = update.boost_views; }
            renderTutorialsTable(allTutorials);
        } else {
            const post = allPosts.find(p => p.id === id);
            if (post) {
                post.boost_likes = update.boost_likes;
                if (update.boost_views != null) post.boost_views = update.boost_views;
            }
            renderPostsTable(allPosts);
        }

        closeBoostModal();
        showToast(`Boosted! +${addLikes} likes${addViews ? `, +${addViews} views` : ''}`, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        saveBtn.innerHTML = 'Save';
        saveBtn.disabled  = false;
    }
}


// ─── Confirm Modal ────────────────────────────────────────────────────────────
function confirmAction(action, id, name) {
    pendingAction = { action, id, name };
    const modal      = document.getElementById('confirmModal');
    const icon       = document.getElementById('modalIcon');
    const iconInner  = document.getElementById('modalIconInner');
    const title      = document.getElementById('modalTitle');
    const desc       = document.getElementById('modalDesc');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const confirmTxt = document.getElementById('modalConfirmText');
    const reasonInput = document.getElementById('blockReasonInput');
    reasonInput.style.display = 'none';

    const configs = {
        deleteUser:    { icon:'danger',  fa:'fa-trash',                 title:`Delete ${name}`,          desc:'This will permanently delete this user and all their data.',              btn:'btn-danger',  txt:'Delete User' },
        deletePost:    { icon:'danger',  fa:'fa-trash',                 title:'Delete Post',              desc:'This will permanently delete this post and all its comments.',           btn:'btn-danger',  txt:'Delete Post' },
        deleteComment: { icon:'danger',  fa:'fa-trash',                 title:'Delete Comment',           desc:'This will permanently delete this comment.',                            btn:'btn-danger',  txt:'Delete Comment' },
        deleteTutorial:{ icon:'danger',  fa:'fa-trash',                 title:'Delete Tutorial',          desc:'This will permanently delete this tutorial, its likes and comments.',    btn:'btn-danger',  txt:'Delete Tutorial' },
        block:         { icon:'block',   fa:'fa-ban',                   title:`Block ${name}`,            desc:'This user will be blocked and unable to use the platform.',             btn:'btn-block',   txt:'Block User', showReason: true },
        unblock:       { icon:'unblock', fa:'fa-unlock',                title:`Unblock ${name}`,          desc:'This user will regain access to the platform.',                         btn:'btn-unblock', txt:'Unblock User' },
        deleteAll:     { icon:'danger',  fa:'fa-exclamation-triangle',  title:'Delete ALL Data',          desc:'⚠️ This will delete EVERY user, post, and comment. This cannot be undone!', btn:'btn-danger', txt:'Delete Everything' },
    };

    const cfg = configs[action];
    if (!cfg) return;

    icon.className = `modal-icon ${cfg.icon}`;
    iconInner.className = `fas ${cfg.fa}`;
    title.textContent = cfg.title;
    desc.textContent  = cfg.desc;
    confirmBtn.className = `btn ${cfg.btn}`;
    confirmTxt.textContent = cfg.txt;
    if (cfg.showReason) { reasonInput.style.display = 'block'; reasonInput.value = ''; }

    modal.classList.add('open');
}

function closeModal() {
    document.getElementById('confirmModal').classList.remove('open');
    pendingAction = null;
}

async function executeAction() {
    if (!pendingAction) return;
    const { action, id } = pendingAction;
    const btn = document.getElementById('modalConfirmBtn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled  = true;

    try {
        if (action === 'deleteUser') {
            await window.supabaseClient.from('comments').delete().eq('user_id', id);
            await window.supabaseClient.from('likes').delete().eq('user_id', id);
            await window.supabaseClient.from('followers').delete().or(`follower_id.eq.${id},following_id.eq.${id}`);
            await window.supabaseClient.from('posts').delete().eq('user_id', id);
            const { error } = await window.supabaseClient.from('profiles').delete().eq('id', id);
            if (error) throw error;
            showToast('User deleted', 'success');
            await loadUsers();
        } else if (action === 'deletePost') {
            await window.supabaseClient.from('comments').delete().eq('post_id', id);
            await window.supabaseClient.from('likes').delete().eq('post_id', id);
            const { error } = await window.supabaseClient.from('posts').delete().eq('id', id);
            if (error) throw error;
            showToast('Post deleted', 'success');
            await loadPosts();
        } else if (action === 'deleteComment') {
            const { error } = await window.supabaseClient.from('comments').delete().eq('id', id);
            if (error) throw error;
            showToast('Comment deleted', 'success');
            await loadComments();
        } else if (action === 'deleteTutorial') {
            await window.supabaseClient.from('tutorial_likes').delete().eq('tutorial_id', id);
            await window.supabaseClient.from('tutorial_comments').delete().eq('tutorial_id', id);
            const { error } = await window.supabaseClient.from('tutorials').delete().eq('id', id);
            if (error) throw error;
            showToast('Tutorial deleted', 'success');
            await loadTutorials();
        } else if (action === 'block') {
            const reason = document.getElementById('blockReasonInput').value.trim() || 'Violation of community guidelines';
            const { error } = await window.supabaseClient.from('profiles')
                .update({ is_blocked: true, blocked_reason: reason, blocked_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            showToast('User blocked', 'warning');
            await loadUsers();
        } else if (action === 'unblock') {
            const { error } = await window.supabaseClient.from('profiles')
                .update({ is_blocked: false, blocked_reason: null, blocked_at: null }).eq('id', id);
            if (error) throw error;
            showToast('User unblocked', 'success');
            await loadUsers();
        } else if (action === 'deleteAll') {
            await window.supabaseClient.from('comments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await window.supabaseClient.from('likes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await window.supabaseClient.from('followers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await window.supabaseClient.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await window.supabaseClient.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            showToast('All data deleted', 'success');
            await loadAllData();
        }
        closeModal();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = document.getElementById('modalConfirmText')?.textContent || 'Confirm';
        btn.disabled  = false;
    }
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function filterUsers(q) {
    const s = q.toLowerCase();
    renderUsersTable(allUsers.filter(u =>
        (u.full_name||'').toLowerCase().includes(s) ||
        (u.email||'').toLowerCase().includes(s) ||
        (u.department||'').toLowerCase().includes(s)
    ));
}

function filterUsersByStatus(status) {
    if (!status)          return renderUsersTable(allUsers);
    if (status==='active')  return renderUsersTable(allUsers.filter(u => !u.is_blocked));
    if (status==='blocked') return renderUsersTable(allUsers.filter(u => u.is_blocked));
}

function filterPosts(q) {
    const s = q.toLowerCase();
    renderPostsTable(allPosts.filter(p =>
        (p.content||'').toLowerCase().includes(s) ||
        (p.profiles?.full_name||'').toLowerCase().includes(s)
    ));
}

function filterPostsByVisibility(v) {
    renderPostsTable(v ? allPosts.filter(p => (p.visibility||'public') === v) : allPosts);
}

function filterComments(q) {
    const s = q.toLowerCase();
    renderCommentsTable(allComments.filter(c =>
        (c.content||'').toLowerCase().includes(s) ||
        (c.profiles?.full_name||'').toLowerCase().includes(s)
    ));
}

function filterTutorials(q) {
    const s = (q || '').toLowerCase();
    const dept = document.getElementById('tutorialDeptFilter')?.value || '';
    renderTutorialsTable(allTutorials.filter(t =>
        (!dept || t.department === dept) && (
            (t.title||'').toLowerCase().includes(s) ||
            (t.course_name||'').toLowerCase().includes(s) ||
            (t.course_code||'').toLowerCase().includes(s) ||
            (t.description||'').toLowerCase().includes(s) ||
            (t.profiles?.full_name||'').toLowerCase().includes(s)
        )
    ));
}

function filterTutorialsByDept(d) {
    renderTutorialsTable(d ? allTutorials.filter(t => t.department === d) : allTutorials);
}


// ─── Push Notifications ───────────────────────────────────────────────────────
let notifLog = [];
let notifSentToday = 0;

async function loadSubsCount() {
    try {
        const { count, error } = await window.supabaseClient
            .from('push_subscriptions')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        document.getElementById('stat-subs').textContent = count ?? '—';
    } catch {
        document.getElementById('stat-subs').textContent = '—';
    }
}

function updateNotifPreview() {
    const t = document.getElementById('notifTitle').value || 'Your title here';
    const b = document.getElementById('notifBody').value || 'Your message body will appear here…';
    document.getElementById('notifPrevTitle').textContent = t;
    document.getElementById('notifPrevBody').textContent = b;
}

function updateNotifChar(inputId, hintId, max) {
    const len = document.getElementById(inputId).value.length;
    const hint = document.getElementById(hintId);
    hint.textContent = len + ' / ' + max;
    hint.className = 'char-hint' +
        (len >= max ? ' char-over' : len > max * 0.85 ? ' char-warn' : '');
}

function clearNotifForm() {
    ['notifTitle', 'notifBody', 'notifUrl'].forEach(id => document.getElementById(id).value = '');
    updateNotifPreview();
    updateNotifChar('notifTitle', 'notifTitleChar', 60);
    updateNotifChar('notifBody', 'notifBodyChar', 180);
}

async function sendPushNotification() {
    const title = document.getElementById('notifTitle').value.trim();
    const body  = document.getElementById('notifBody').value.trim();
    const url   = document.getElementById('notifUrl').value.trim();

    if (!title || !body) { showToast('Title and body are required', 'error'); return; }

    const btn = document.getElementById('notifSendBtn');
    btn.innerHTML = '<span class="spinner"></span> Sending…';
    btn.disabled = true;

    const ts = new Date();
    try {
        const r = await fetch('/api/push-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body, url: url || '/' })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Server error');

        notifSentToday += (d.sent || 0);
        document.getElementById('stat-sent-today').textContent = notifSentToday;

        notifLog.unshift({ title, body, sent: d.sent || 0, failed: d.failed || 0, ok: true, ts });
        renderNotifLog();
        clearNotifForm();
        showToast(`Sent to ${d.sent} subscriber${d.sent !== 1 ? 's' : ''}${d.failed ? ` (${d.failed} failed)` : ''}`, 'success');
    } catch (err) {
        notifLog.unshift({ title, body, sent: 0, failed: 0, ok: false, ts, errMsg: err.message });
        renderNotifLog();
        showToast('Error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send to all subscribers';
        btn.disabled = false;
    }
}

function renderNotifLog() {
    const tbody = document.getElementById('notifLogTable');
    if (!notifLog.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-icon">🔔</div><div class="empty-text">No notifications sent yet</div></td></tr>';
        return;
    }
    tbody.innerHTML = notifLog.map(l => `
        <tr>
            <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(l.title)}</td>
            <td style="color:var(--text2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">${esc(l.body)}</td>
            <td style="font-family:var(--mono);">${l.sent}</td>
            <td style="font-family:var(--mono);color:${l.failed ? 'var(--danger)' : 'var(--text2)'};">${l.failed}</td>
            <td><span class="badge ${l.ok ? 'badge-active' : 'badge-blocked'}">${l.ok ? 'SENT' : 'ERROR'}</span></td>
            <td style="font-size:12px;color:var(--text2);font-family:var(--mono);">${l.ts.toLocaleTimeString()}</td>
        </tr>`).join('');
}


// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n || 0);
}

function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    const i = t.querySelector('i');
    document.getElementById('toastMsg').textContent = msg;
    t.className = `toast ${type}`;
    i.className = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-times-circle' : 'fas fa-exclamation-circle';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    ['confirmModal','boostModal','followersModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => { if (e.target === el) { el.classList.remove('open'); if (id === 'confirmModal') pendingAction = null; } });
    });

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) {
        const { data: profile } = await window.supabaseClient
            .from('profiles').select('is_admin, full_name').eq('id', session.user.id).single();
        if (profile?.is_admin) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminApp').style.display = 'block';
            document.getElementById('adminName').textContent = profile.full_name || session.user.email;
            document.getElementById('adminInitials').textContent = (profile.full_name || session.user.email)[0].toUpperCase();
            loadAllData();
        }
    }
});
