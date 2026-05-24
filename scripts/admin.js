// =============================================
// CONFIG — Add your admin email here
// =============================================
const ADMIN_EMAILS = [
    '5251170066@st.uew.edu.gh'
];

// ── SERVICE ROLE CLIENT (bypasses RLS for admin deletes) ─────────────────────
// Paste your Supabase service_role key below.
// Find it: Supabase Dashboard → Settings → API → service_role (secret key)
const SUPABASE_SERVICE_ROLE_KEY = ''; // <-- paste service_role key here

function getAdminClient() {
    if (SUPABASE_SERVICE_ROLE_KEY) {
        if (!window._adminServiceClient) {
            window._adminServiceClient = window.supabase.createClient(
                window.supabaseClient.supabaseUrl,
                SUPABASE_SERVICE_ROLE_KEY,
                { auth: { autoRefreshToken: false, persistSession: false } }
            );
        }
        return window._adminServiceClient;
    }
    // No service key set — use anon client (RLS may block deletes)
    console.warn('[Admin] No service role key configured. Destructive operations may be blocked by RLS.');
    return window.supabaseClient;
}

let allUsers = [], allPosts = [], allComments = [], pendingAction = null;

// AUTH
async function adminLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.querySelector('.login-btn');
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = 'Invalid credentials. Please try again.'; errEl.style.display = 'block'; btn.innerHTML = 'Sign In'; btn.disabled = false; return; }
    if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) { await window.supabaseClient.auth.signOut(); errEl.textContent = 'Access denied. Admin only.'; errEl.style.display = 'block'; btn.innerHTML = 'Sign In'; btn.disabled = false; return; }
    initAdmin(email);
}
function initAdmin(email) {
    document.getElementById('adminInitials').textContent = email.substring(0,2).toUpperCase();
    document.getElementById('adminName').textContent = email.split('@')[0];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    loadAllData();
    setupRealtimePosts();
}
async function adminLogout() { await window.supabaseClient.auth.signOut(); location.reload(); }
window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) { const e = session.user.email; if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(e)) return; initAdmin(e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') adminLogin(); });

// NAV
function showPage(name, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    if (el) el.classList.add('active');
    if (name === 'users') renderUsers(allUsers);
    if (name === 'blocked') renderBlocked(allUsers.filter(u => u.is_blocked));
    if (name === 'posts') renderPosts(allPosts);
    if (name === 'comments') renderComments(allComments);
}

// DATA
async function loadAllData() { await Promise.all([loadUsers(), loadPosts(), loadComments()]); }

async function loadUsers() {
    const { data } = await window.supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) {
        allUsers = data;
        const blocked = data.filter(u => u.is_blocked).length;
        document.getElementById('stat-users').textContent = data.length;
        document.getElementById('usersBadge').textContent = data.length;
        document.getElementById('stat-blocked').textContent = blocked;
        document.getElementById('blockedBadge').textContent = blocked;
        renderRecentUsers(data.slice(0, 5));
        renderUsers(data);
        renderBlocked(data.filter(u => u.is_blocked));
    }
}
async function loadPosts() {
    const { data } = await window.supabaseClient.from('posts').select('*, profiles(full_name, avatar_url, is_blocked)').order('created_at', { ascending: false });
    if (data) { allPosts = data; const likes = data.reduce((s, p) => s + (p.likes_count || 0), 0); document.getElementById('stat-posts').textContent = data.length; document.getElementById('stat-likes').textContent = likes; document.getElementById('postsBadge').textContent = data.length; renderPosts(data); }
}
async function loadComments() {
    const { data } = await window.supabaseClient.from('comments').select('*, profiles(full_name)').order('created_at', { ascending: false });
    if (data) { allComments = data; document.getElementById('commentsBadge').textContent = data.length; renderComments(data); }
}

// HELPERS
const gi = n => n ? n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : '?';
function timeAgo(d) { if(!d)return'—'; const s=Date.now()-new Date(d), dd=Math.floor(s/86400000), h=Math.floor(s/3600000), m=Math.floor(s/60000); return dd>0?dd+'d ago':h>0?h+'h ago':m>0?m+'m ago':'Just now'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'; }
function esc(s) { return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function emptyRow(c, icon, text) { return `<tr class="empty-row"><td colspan="${c}"><div class="empty-icon">${icon}</div><div class="empty-text">${text}</div></td></tr>`; }
function avatarHTML(u, extra='') {
    return `<div class="user-avatar ${extra}">${u.avatar_url?`<img src="${u.avatar_url}" onerror="this.style.display='none'">`:''}<span style="${u.avatar_url?'display:none':''}">${gi(u.full_name)}</span></div>`;
}
function statusBadge(u) {
    return u.is_blocked
        ? `<div><span class="badge badge-blocked">🚫 Blocked</span>${u.blocked_reason?`<div class="blocked-reason">${u.blocked_reason}</div>`:''}</div>`
        : `<span class="badge badge-active">✓ Active</span>`;
}
function userActions(u) {
    const block = u.is_blocked
        ? `<button class="btn btn-unblock btn-sm" onclick="confirmAction('unblock','${u.id}','${esc(u.full_name)}')"><i class="fas fa-unlock"></i> Unblock</button>`
        : `<button class="btn btn-block btn-sm" onclick="confirmAction('block','${u.id}','${esc(u.full_name)}')"><i class="fas fa-ban"></i> Block</button>`;
    return `<div class="actions-cell">${block}<button class="btn btn-danger btn-sm" onclick="confirmAction('deleteUser','${u.id}','${esc(u.full_name)}')"><i class="fas fa-trash"></i></button></div>`;
}

// RENDER
function renderRecentUsers(users) {
    const t = document.getElementById('recentUsersTable');
    if (!users.length) { t.innerHTML = emptyRow(4,'👥','No users yet'); return; }
    t.innerHTML = users.map(u => `<tr class="${u.is_blocked?'blocked-row':''}"><td><div class="user-cell">${avatarHTML(u)}<div><div class="user-name">${u.full_name||'Unknown'}</div><div class="user-email">${u.email||''}</div></div></div></td><td><span class="badge badge-dept">${u.department||'—'}</span></td><td>${statusBadge(u)}</td><td>${userActions(u)}</td></tr>`).join('');
}
function renderUsers(users) {
    const t = document.getElementById('usersTable');
    if (!users.length) { t.innerHTML = emptyRow(6,'👥','No users found'); return; }
    t.innerHTML = users.map(u => `<tr class="${u.is_blocked?'blocked-row':''}"><td><div class="user-cell">${avatarHTML(u)}<div><div class="user-name">${u.full_name||'Unknown'}</div><div class="user-email">${u.email||''}</div></div></div></td><td><span class="badge badge-dept">${u.department||'—'}</span></td><td style="font-family:var(--mono);font-size:12px">${u.index_number||'—'}</td><td style="font-family:var(--mono)">${u.posts_count||0}</td><td>${statusBadge(u)}</td><td>${userActions(u)}</td></tr>`).join('');
}
function renderBlocked(users) {
    const t = document.getElementById('blockedTable');
    if (!users.length) { t.innerHTML = emptyRow(5,'✅','No blocked users — all clear!'); return; }
    t.innerHTML = users.map(u => `<tr class="blocked-row"><td><div class="user-cell">${avatarHTML(u)}<div><div class="user-name">${u.full_name||'Unknown'}</div><div class="user-email">${u.email||''}</div></div></div></td><td><span class="badge badge-dept">${u.department||'—'}</span></td><td style="font-size:13px;color:var(--blocked-color)">${u.blocked_reason||'No reason given'}</td><td style="font-size:12px;color:var(--text2);font-family:var(--mono)">${fmtDate(u.blocked_at)}</td><td><div class="actions-cell"><button class="btn btn-unblock btn-sm" onclick="confirmAction('unblock','${u.id}','${esc(u.full_name)}')"><i class="fas fa-unlock"></i> Unblock</button><button class="btn btn-danger btn-sm" onclick="confirmAction('deleteUser','${u.id}','${esc(u.full_name)}')"><i class="fas fa-trash"></i></button></div></td></tr>`).join('');
}
function renderPosts(posts) {
    const t = document.getElementById('postsTable');
    if (!posts.length) { t.innerHTML = emptyRow(7,'📭','No posts found'); return; }
    window._adminPostsRef = posts;
    const escHtml = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    t.innerHTML = posts.map((p, i) => {
        const isVideo = p.media_type === 'video';
        const thumb = (p.image_url || p.media_url)
            ? (isVideo
                ? '<div class="post-image-placeholder"><i class="fas fa-film" style="color:#6c8fdd"></i></div>'
                : `<img class="post-image" src="${escHtml(p.image_url||p.media_url)}" onerror="this.style.display='none'">`)
            : '<div class="post-image-placeholder"><i class="fas fa-file-alt"></i></div>';
        const authorBadge = p.profiles?.is_blocked ? ' <span class="badge badge-blocked" style="font-size:9px">blocked</span>' : '';
        const visClass = p.visibility === 'public' ? 'badge-public' : 'badge-dept-only';
        return '<tr>'
            + `<td><div class="user-cell">${thumb}<div><div class="post-text">${escHtml(p.content)||'(no text)'}</div><div class="post-meta">${escHtml(p.department||'')}${isVideo ? ' <span style="color:#6c8fdd;font-size:10px">▶ video</span>' : ''}</div></div></div></td>`
            + `<td style="font-size:13px">${escHtml(p.profiles?.full_name||'—')}${authorBadge}</td>`
            + `<td><span class="badge ${visClass}">${p.visibility||'public'}</span></td>`
            + `<td style="font-family:var(--mono)" id="admin-likes-${p.id}">${p.likes_count||0}</td>`
            + `<td style="font-family:var(--mono)" id="admin-views-${p.id}">${isVideo ? (p.video_views||0) : '—'}</td>`
            + `<td style="font-size:12px;color:var(--text2);font-family:var(--mono)">${timeAgo(p.created_at)}</td>`
            + `<td><div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="openBoostModal(${i})" title="Set likes/views"><i class="fas fa-sliders-h"></i></button><button class="btn btn-danger btn-sm" onclick="confirmAction('deletePost',window._adminPostsRef[${i}].id,null)"><i class="fas fa-trash"></i></button></div></td>`
            + '</tr>';
    }).join('');
}
function renderComments(comments) {
    const t = document.getElementById('commentsTable');
    if (!comments.length) { t.innerHTML = emptyRow(4,'💬','No comments found'); return; }
    t.innerHTML = comments.map(c => `<tr><td style="max-width:320px"><div style="font-size:13px">${(c.content||'').substring(0,120)}${(c.content||'').length>120?'...':''}</div></td><td style="font-size:13px">${c.profiles?.full_name||'—'}</td><td style="font-size:12px;color:var(--text2);font-family:var(--mono)">${timeAgo(c.created_at)}</td><td><button class="btn btn-danger btn-sm" onclick="confirmAction('deleteComment','${c.id}',null)"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

// FILTER
function filterUsers(q) { renderUsers(allUsers.filter(u => (u.full_name||'').toLowerCase().includes(q.toLowerCase())||(u.email||'').toLowerCase().includes(q.toLowerCase()))); }
function filterUsersByStatus(s) { if(!s)renderUsers(allUsers); else if(s==='blocked')renderUsers(allUsers.filter(u=>u.is_blocked)); else renderUsers(allUsers.filter(u=>!u.is_blocked)); }
function filterPosts(q) { renderPosts(allPosts.filter(p=>(p.content||'').toLowerCase().includes(q.toLowerCase())||(p.profiles?.full_name||'').toLowerCase().includes(q.toLowerCase()))); }
function filterPostsByVisibility(v) { renderPosts(v?allPosts.filter(p=>p.visibility===v):allPosts); }
function filterComments(q) { renderComments(allComments.filter(c=>(c.content||'').toLowerCase().includes(q.toLowerCase())||(c.profiles?.full_name||'').toLowerCase().includes(q.toLowerCase()))); }

// MODAL CONFIG
const modalCfg = {
    block:     { icon:'block',   iconCls:'fas fa-ban',                btnCls:'btn-block',   title:n=>`Block ${n}`,          desc:()=>'Enter a reason for blocking. The user cannot sign in until unblocked.', showReason:true,  confirmText:'🚫 Block User' },
    unblock:   { icon:'unblock', iconCls:'fas fa-unlock',             btnCls:'btn-unblock', title:n=>`Unblock ${n}`,        desc:()=>'This user will be able to sign in again immediately.',                  showReason:false, confirmText:'✓ Unblock User' },
    deleteUser:{ icon:'danger',  iconCls:'fas fa-trash',              btnCls:'btn-danger',  title:n=>`Delete ${n}`,         desc:()=>'Permanently deletes this user and all their posts, comments, and files.',showReason:false, confirmText:'Delete User' },
    deletePost:{ icon:'danger',  iconCls:'fas fa-trash',              btnCls:'btn-danger',  title:()=>'Delete Post',        desc:()=>'This post and all its comments and likes will be deleted.',              showReason:false, confirmText:'Delete Post' },
    deleteComment:{icon:'danger',iconCls:'fas fa-trash',              btnCls:'btn-danger',  title:()=>'Delete Comment',     desc:()=>'This comment will be permanently deleted.',                             showReason:false, confirmText:'Delete Comment' },
    deleteAll: { icon:'danger',  iconCls:'fas fa-exclamation-triangle',btnCls:'btn-danger', title:()=>'⚠️ Delete ALL Data', desc:()=>'Deletes ALL users, posts, comments, likes, messages, and storage. CANNOT be undone.', showReason:false, confirmText:'Delete Everything' },
};

function confirmAction(type, id, name) {
    const cfg = modalCfg[type]; pendingAction = { type, id, name };
    document.getElementById('modalIcon').className = `modal-icon ${cfg.icon}`;
    document.getElementById('modalIconInner').className = cfg.iconCls;
    document.getElementById('modalTitle').textContent = cfg.title(name||'');
    document.getElementById('modalDesc').textContent = cfg.desc();
    document.getElementById('blockReasonInput').style.display = cfg.showReason ? 'block' : 'none';
    document.getElementById('blockReasonInput').value = '';
    const btn = document.getElementById('modalConfirmBtn');
    btn.className = `btn ${cfg.btnCls}`; btn.disabled = false;
    document.getElementById('modalConfirmText').textContent = cfg.confirmText;
    document.getElementById('confirmModal').classList.add('open');
}
function closeModal() { document.getElementById('confirmModal').classList.remove('open'); pendingAction = null; }

let _actionRunning = false;
async function executeAction() {
    if (!pendingAction || _actionRunning) return;
    _actionRunning = true;
    const btn = document.getElementById('modalConfirmBtn');
    btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
    try {
        const { type, id } = pendingAction;
        const reason = document.getElementById('blockReasonInput').value.trim();
        if (type==='block') await blockUser(id, reason);
        else if (type==='unblock') await unblockUser(id);
        else if (type==='deleteUser') await deleteUser(id);
        else if (type==='deletePost') await deletePost(id);
        else if (type==='deleteComment') await deleteComment(id);
        else if (type==='deleteAll') await deleteAllData();
    } catch(e) { showToast('Error: '+e.message, 'error'); }
    btn.innerHTML = '<span id="modalConfirmText">Confirm</span>'; btn.disabled = false;
    _actionRunning = false;
    closeModal(); await loadAllData();
}

// ACTIONS
async function blockUser(userId, reason) {
    const { error } = await window.supabaseClient.from('profiles').update({ is_blocked: true, blocked_reason: reason || 'Blocked by admin', blocked_at: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
    showToast('User has been blocked 🚫', 'warning');
}
async function unblockUser(userId) {
    const { error } = await window.supabaseClient.from('profiles').update({ is_blocked: false, blocked_reason: null, blocked_at: null }).eq('id', userId);
    if (error) throw new Error(error.message);
    showToast('User has been unblocked ✓', 'success');
}
async function deleteUser(userId) {
    const db = getAdminClient();
    await db.from('notifications').delete().or(`user_id.eq.${userId},from_user_id.eq.${userId}`);
    await db.from('messages').delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await db.from('followers').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`);
    await db.from('likes').delete().eq('user_id', userId);
    await db.from('comments').delete().eq('user_id', userId);
    await db.from('posts').delete().eq('user_id', userId);
    await db.from('profiles').delete().eq('id', userId);
    for (const b of ['avatar','post-images']) {
        const { data: files } = await db.storage.from(b).list();
        if (files) { const uf = files.filter(f=>f.name.startsWith(userId)); if(uf.length) await db.storage.from(b).remove(uf.map(f=>f.name)); }
    }
    showToast('User data deleted. Run SQL to remove auth record.', 'success');
}
async function deletePost(postId) {
    const db = getAdminClient();
    const { error: likeErr } = await db.from('likes').delete().eq('post_id', postId);
    if (likeErr) console.warn('[deletePost] likes:', likeErr.message);
    const { error: commentErr } = await db.from('comments').delete().eq('post_id', postId);
    if (commentErr) console.warn('[deletePost] comments:', commentErr.message);
    const { error } = await db.from('posts').delete().eq('id', postId);
    if (error) throw new Error('Post delete failed: ' + error.message);
    showToast('Post deleted', 'success');
}
async function deleteComment(commentId) {
    const { error } = await getAdminClient().from('comments').delete().eq('id', commentId);
    if (error) throw new Error('Comment delete failed: ' + error.message);
    showToast('Comment deleted', 'success');
}
async function deleteAllData() {
    const db = getAdminClient();
    for (const t of ['notifications','messages','followers','likes','comments','posts','profiles'])
        await db.from(t).delete().neq('id','00000000-0000-0000-0000-000000000000');
    for (const b of ['avatar','post-images']) {
        const { data: files } = await db.storage.from(b).list();
        if (files && files.length) await db.storage.from(b).remove(files.map(f=>f.name));
    }
    showToast('All data cleared. Run SQL to remove auth users.', 'success');
}

// TOAST
function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.className = `toast ${type}`;
    t.querySelector('i').className = type==='success'?'fas fa-check-circle':type==='warning'?'fas fa-ban':'fas fa-exclamation-circle';
    t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3500);
}

// ── Boost Modal ───────────────────────────────────────────────────────────────
function openBoostModal(i) {
    const p = window._adminPostsRef[i];
    if (!p) return;
    document.getElementById('boostPostId').value  = p.id;
    document.getElementById('boostLikes').value   = p.likes_count  || 0;
    document.getElementById('boostViews').value   = p.video_views  || 0;
    document.getElementById('boostIsVideo').value = p.media_type === 'video' ? '1' : '0';
    document.getElementById('boostViewsRow').style.display = p.media_type === 'video' ? 'flex' : 'none';
    document.getElementById('boostPostTitle').textContent  = (p.content || 'this post').substring(0, 60);
    document.getElementById('boostModal').style.display = 'flex';
}
function closeBoostModal() { document.getElementById('boostModal').style.display = 'none'; }

async function saveBoost() {
    const btn     = document.getElementById('boostSaveBtn');
    const postId  = document.getElementById('boostPostId').value;
    const likes   = parseInt(document.getElementById('boostLikes').value)  || 0;
    const views   = parseInt(document.getElementById('boostViews').value)  || 0;
    const isVideo = document.getElementById('boostIsVideo').value === '1';

    btn.textContent = '...'; btn.disabled = true;

    const { error } = await window.supabaseClient.rpc('admin_boost_post', {
        post_id: postId, new_likes: likes, new_views: isVideo ? views : 0
    });

    btn.textContent = 'Save'; btn.disabled = false;

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    // Update local cache
    const post = window._adminPostsRef.find(p => p.id === postId);
    if (post) { post.likes_count = likes; if (isVideo) post.video_views = views; }

    // Update cells directly without full re-render
    const likesEl = document.getElementById('admin-likes-' + postId);
    const viewsEl = document.getElementById('admin-views-' + postId);
    if (likesEl) likesEl.textContent = likes;
    if (viewsEl && isVideo) viewsEl.textContent = views;

    showToast('Updated successfully ✓', 'success');
    closeBoostModal();
}

// ── Realtime: live-update admin table when users like/watch ──────────────────
function setupRealtimePosts() {
    try {
        window.supabaseClient
            .channel('admin-posts-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
                const u = payload.new;
                if (!u || !u.id) return;
                const post = allPosts.find(p => p.id === u.id);
                if (post) { post.likes_count = u.likes_count; post.video_views = u.video_views; }
                const likesEl = document.getElementById('admin-likes-' + u.id);
                const viewsEl = document.getElementById('admin-views-' + u.id);
                if (likesEl) likesEl.textContent = u.likes_count || 0;
                if (viewsEl && u.media_type === 'video') viewsEl.textContent = u.video_views || 0;
                const totalLikes = allPosts.reduce((s, p) => s + (p.likes_count || 0), 0);
                const statLikes = document.getElementById('stat-likes');
                if (statLikes) statLikes.textContent = totalLikes;
            })
            .subscribe();
    } catch(e) { console.warn('Admin realtime failed:', e.message); }
}
