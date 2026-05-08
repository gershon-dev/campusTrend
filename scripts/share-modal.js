/**
 * share-modal.js
 * Handles the Share Post modal: open, close, copy-link, and timeline/message options.
 *
 * Exports:
 *   setupShareModal(deps)   — call once from index.js after DOM is ready.
 *   openShareModal(postId)  — call when a post's share button is clicked.
 *
 * deps = {
 *   shareModal: HTMLElement,
 *   showToast: (msg: string, type?: string) => void,
 * }
 */

// Module-level state — which post is currently targeted for sharing
let _selectedPostId = null;

/**
 * Wire up all share modal event listeners.
 *
 * @param {{ shareModal: HTMLElement, showToast: Function }} deps
 */
export function setupShareModal({ shareModal, showToast }) {
    if (!shareModal) return;

    const closeShareModal = document.getElementById('closeShareModal');
    const copyLink        = document.getElementById('copyLink');
    const shareTimeline   = document.getElementById('shareTimeline');
    const shareMessage    = document.getElementById('shareMessage');

    // ── Close: X button ──────────────────────────────────────────────────────
    if (closeShareModal) {
        closeShareModal.addEventListener('click', () => _close(shareModal));
    }

    // ── Close: backdrop click ─────────────────────────────────────────────────
    shareModal.addEventListener('click', e => {
        if (e.target === shareModal) _close(shareModal);
    });

    // ── Close: Escape key ────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && shareModal.classList.contains('show')) {
            _close(shareModal);
        }
    });

    // ── Copy link ────────────────────────────────────────────────────────────
    if (copyLink) {
        copyLink.addEventListener('click', () => {
            if (!_selectedPostId) return;
            const url = `${window.location.origin}/index.html?post=${_selectedPostId}`;
            navigator.clipboard.writeText(url).then(() => {
                showToast('Link copied to clipboard!', 'success');
                _close(shareModal);
            }).catch(() => {
                showToast('Failed to copy link', 'error');
            });
        });
        // Keyboard accessibility
        copyLink.addEventListener('keypress', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyLink.click(); }
        });
    }

    // ── Share to timeline (placeholder — extend as needed) ───────────────────
    if (shareTimeline) {
        shareTimeline.addEventListener('click', () => {
            showToast('Shared to your timeline!', 'success');
            _close(shareModal);
        });
        shareTimeline.addEventListener('keypress', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shareTimeline.click(); }
        });
    }

    // ── Send as message (placeholder — extend as needed) ─────────────────────
    if (shareMessage) {
        shareMessage.addEventListener('click', () => {
            showToast('Message feature coming soon!', 'success');
            _close(shareModal);
        });
        shareMessage.addEventListener('keypress', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shareMessage.click(); }
        });
    }
}

/**
 * Open the share modal and record which post is being shared.
 *
 * @param {string} postId
 * @param {HTMLElement} shareModal
 */
export function openShareModal(postId, shareModal) {
    _selectedPostId = postId;
    if (shareModal) {
        shareModal.classList.add('show');
        shareModal.setAttribute('aria-hidden', 'false');
        // Move focus to the first focusable option for accessibility
        const firstOption = shareModal.querySelector('[role="listitem"]');
        if (firstOption) firstOption.focus();
    }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _close(shareModal) {
    shareModal.classList.remove('show');
    shareModal.setAttribute('aria-hidden', 'true');
    _selectedPostId = null;
}
