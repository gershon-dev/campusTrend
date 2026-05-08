/**
 * comments.js
 * Handles loading, rendering, and submitting comments/replies on posts.
 *
 * Exports:
 *   loadComments(postId, deps)
 *   renderComments(container, comments, postId, deps)
 *   handleComment(postId, content, deps)
 *   handleReply(postId, commentId, content, deps)
 *   setupCommentInput(postId, deps)   — wire up a single post's input row
 *
 * deps = {
 *   getProfile: () => object,       // reactive getter for currentProfile
 *   showToast: (msg, type?) => void,
 *   getInitials: (name: string) => string,
 *   stringToColor: (str: string) => string,
 *   timeAgo: (iso: string) => string,
 *   escapeHTML: (str: string) => string,
 * }
 */

// ─── Helpers (re-exported so index.js doesn't duplicate them) ────────────────

export function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

export function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
}

// ─── Comment HTML builders ───────────────────────────────────────────────────

/**
 * Build HTML for a single top-level comment (including its nested replies).
 */
export function createCommentHTML(comment, postId, replies, deps) {
    const { getProfile, getInitials: gi, stringToColor: sc, escapeHTML: esc } = deps;
    const _gi  = gi  || getInitials;
    const _sc  = sc  || stringToColor;
    const _esc = esc || escapeHTML;

    const currentProfile = getProfile();
    const profile    = comment.profiles || {};
    const initials   = _gi(profile.full_name || 'User');
    const timeAgo    = window.timeAgo ? window.timeAgo(comment.created_at) : '';
    const avatarColor = _sc(profile.full_name || 'User');

    return `
    <div class="comment-item" data-comment-id="${comment.id}">
        <div class="comment-user" data-user-id="${comment.user_id}">
            <div class="user-avatar small" style="background: ${avatarColor}">${initials}</div>
        </div>
        <div class="comment-content">
            <div class="comment-bubble">
                <div class="comment-author">${_esc(profile.full_name || 'Unknown')}</div>
                <div class="comment-text">${_esc(comment.content)}</div>
            </div>
            <div class="comment-actions">
                <span class="comment-time">${timeAgo}</span>
                <button class="reply-btn" data-comment-id="${comment.id}">Reply</button>
            </div>
            <!-- Reply input (hidden by default) -->
            <div class="reply-input-container" data-comment-id="${comment.id}">
                <div class="user-avatar small" style="background: linear-gradient(135deg, #667eea, #764ba2)">
                    ${_gi(currentProfile?.full_name || 'U')}
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
            ${replies.length > 0 ? `
            <div class="replies-container">
                ${replies.map(reply => createReplyHTML(reply, postId, deps)).join('')}
            </div>` : ''}
        </div>
    </div>`;
}

/**
 * Build HTML for a reply item.
 */
export function createReplyHTML(reply, postId, deps) {
    const { getInitials: gi, stringToColor: sc, escapeHTML: esc } = deps;
    const _gi  = gi  || getInitials;
    const _sc  = sc  || stringToColor;
    const _esc = esc || escapeHTML;

    const profile     = reply.profiles || {};
    const initials    = _gi(profile.full_name || 'User');
    const timeAgo     = window.timeAgo ? window.timeAgo(reply.created_at) : '';
    const avatarColor = _sc(profile.full_name || 'User');

    return `
    <div class="comment-item reply" data-comment-id="${reply.id}">
        <div class="comment-user" data-user-id="${reply.user_id}">
            <div class="user-avatar small" style="background: ${avatarColor}">${initials}</div>
        </div>
        <div class="comment-content">
            <div class="comment-bubble">
                <div class="comment-author">${_esc(profile.full_name || 'Unknown')}</div>
                <div class="comment-text">${_esc(reply.content)}</div>
            </div>
            <div class="comment-actions">
                <span class="comment-time">${timeAgo}</span>
            </div>
        </div>
    </div>`;
}

// ─── Toggle reply input ──────────────────────────────────────────────────────

export function toggleReplyInput(commentId) {
    const replyContainer = document.querySelector(`.reply-input-container[data-comment-id="${commentId}"]`);
    if (!replyContainer) return;

    const isVisible = replyContainer.classList.contains('show');
    document.querySelectorAll('.reply-input-container.show').forEach(c => c.classList.remove('show'));

    if (!isVisible) {
        replyContainer.classList.add('show');
        const input = replyContainer.querySelector('.reply-input');
        if (input) setTimeout(() => input.focus(), 100);
    }
}

// ─── Render comments list ────────────────────────────────────────────────────

/**
 * Render all comments (and nested replies) into `container`.
 */
export function renderComments(container, comments, postId, deps) {
    if (!container || !comments) return;

    if (comments.length === 0) {
        container.innerHTML =
            '<p class="no-comments-text" style="text-align:center;color:#65676b;padding:10px;">No comments yet. Be the first to comment!</p>';
        return;
    }

    const topLevel  = comments.filter(c => !c.parent_comment_id);
    const repliesMap = {};
    comments.forEach(c => {
        if (c.parent_comment_id) {
            (repliesMap[c.parent_comment_id] = repliesMap[c.parent_comment_id] || []).push(c);
        }
    });

    topLevel.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    Object.values(repliesMap).forEach(arr =>
        arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    );

    container.innerHTML = topLevel.map(comment => {
        const replies = repliesMap[comment.id] || [];
        return createCommentHTML(comment, postId, replies, deps);
    }).join('');

    // Wire reply toggle buttons
    container.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            toggleReplyInput(this.dataset.commentId);
        });
    });

    // Wire reply inputs
    container.querySelectorAll('.reply-input').forEach(input => {
        const sendBtn = input.nextElementSibling;
        input.addEventListener('input', function () {
            if (sendBtn) sendBtn.disabled = !this.value.trim();
        });
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && this.value.trim()) {
                handleReply(postId, this.dataset.replyTo, this.value.trim(), deps);
            }
        });
    });

    container.querySelectorAll('.send-reply-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const commentId  = this.dataset.commentId;
            const replyInput = document.querySelector(`[data-reply-to="${commentId}"]`);
            if (replyInput?.value.trim()) {
                handleReply(postId, commentId, replyInput.value.trim(), deps);
            }
        });
    });
}

// ─── Data actions ────────────────────────────────────────────────────────────

/**
 * Load comments for a post from Supabase and render them.
 */
export async function loadComments(postId, deps) {
    try {
        const result = await window.getComments(postId);
        if (result.success) {
            const commentsList = document.querySelector(`.comments-list[data-post-id="${postId}"]`);
            if (commentsList) renderComments(commentsList, result.comments, postId, deps);
        }
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

/**
 * Submit a new top-level comment, optimistically update the count, then
 * re-render the comments list.
 */
export async function handleComment(postId, content, deps, postsArr) {
    const { showToast } = deps;
    const postCard   = document.querySelector(`[data-post-id="${postId}"]`);
    const commentInput = postCard?.querySelector('.comment-input');
    const sendBtn      = postCard?.querySelector('.send-comment-btn');

    if (sendBtn) sendBtn.disabled = true;

    try {
        const result = await window.addComment(postId, content);
        if (result.success) {
            if (commentInput) commentInput.value = '';
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.setAttribute('aria-disabled', 'true');
            }
            // Update count in memory + DOM
            const post = (postsArr || []).find(p => p.id === postId);
            if (post) {
                post.comments_count = (post.comments_count || 0) + 1;
                const commentsCount = postCard.querySelector('.comments-count');
                if (commentsCount) commentsCount.textContent = post.comments_count;
            }
            await loadComments(postId, deps);
            if (commentInput) commentInput.focus();
            showToast('Comment added!', 'success');
        } else {
            showToast(result.error || 'Failed to add comment', 'error');
            if (sendBtn) sendBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Failed to add comment', 'error');
    }
}

/**
 * Submit a reply to an existing comment, collapse the reply input, and
 * re-render the comments list.
 */
export async function handleReply(postId, commentId, content, deps) {
    const { showToast } = deps;
    try {
        const result = await window.addComment(postId, content, commentId);
        if (result.success) {
            const replyContainer = document.querySelector(`.reply-input-container[data-comment-id="${commentId}"]`);
            if (replyContainer) {
                replyContainer.classList.remove('show');
                const input = replyContainer.querySelector('.reply-input');
                if (input) input.value = '';
            }
            await loadComments(postId, deps);
            showToast('Reply added!', 'success');
        } else {
            showToast(result.error || 'Failed to add reply', 'error');
        }
    } catch (error) {
        console.error('Error adding reply:', error);
        showToast('Failed to add reply', 'error');
    }
}

// ─── Per-post comment input wiring ───────────────────────────────────────────

/**
 * Attach input/keypress/click handlers to the comment input row of one post.
 * Called from setupPostEventListeners in index.js.
 */
export function setupCommentInput(postId, deps, postsArr) {
    const postCard      = document.querySelector(`[data-post-id="${postId}"]`);
    if (!postCard) return;
    const commentInput  = postCard.querySelector('.comment-input');
    const sendCommentBtn = postCard.querySelector('.send-comment-btn');
    if (!commentInput || !sendCommentBtn) return;

    commentInput.addEventListener('input', () => {
        const hasText = commentInput.value.trim().length > 0;
        sendCommentBtn.disabled = !hasText;
        sendCommentBtn.setAttribute('aria-disabled', String(!hasText));
    });
    commentInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey && commentInput.value.trim()) {
            e.preventDefault();
            handleComment(postId, commentInput.value.trim(), deps, postsArr);
        }
    });
    sendCommentBtn.addEventListener('click', () => {
        const text = commentInput.value.trim();
        if (text) handleComment(postId, text, deps, postsArr);
    });
}
