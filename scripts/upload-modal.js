/**
 * upload-modal.js
 * Handles the "Create Post" upload modal, video compression, and post submission.
 *
 * Exports:
 *   setupCreatePostModal(deps) — call once from index.js after DOM is ready.
 *
 * deps = {
 *   currentProfile,      // reactive getter  — pass as () => currentProfile
 *   uploadModal,         // DOM element ref
 *   postsContainer,      // DOM element ref
 *   posts,               // reactive getter  — pass as () => posts
 *   onPostCreated,       // (newPost, fileToUpload, isVideo) => void
 *   showToast,
 *   createPostHTML,
 *   setupPostEventListeners,
 * }
 */

// ─── Video Compression ───────────────────────────────────────────────────────

const COMPRESS_THRESHOLD = 90 * 1024 * 1024; // 90 MB

/**
 * Compress a video file to ~720p / 1.5 Mbps via MediaRecorder + canvas.
 * Falls back to the original file if compression fails or isn't supported.
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<File>}
 */
export function compressVideo(file, onProgress) {
    return new Promise((resolve) => {
        const statusBox  = document.getElementById('compressStatus');
        const statusText = document.getElementById('compressStatusText');
        const bar        = document.getElementById('compressProgressBar');
        if (statusBox)  statusBox.style.display  = 'block';
        if (statusText) statusText.textContent    = 'Compressing video…';
        if (bar)        bar.style.width           = '0%';

        const video   = document.createElement('video');
        const blobUrl = URL.createObjectURL(file);
        video.src     = blobUrl;
        video.muted   = false;
        video.preload = 'auto';

        video.onloadedmetadata = () => {
            const duration = video.duration;
            const MAX_W = 1280, MAX_H = 720;
            let w = video.videoWidth  || MAX_W;
            let h = video.videoHeight || MAX_H;
            if (w > MAX_W || h > MAX_H) {
                const ratio = Math.min(MAX_W / w, MAX_H / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }

            const canvas  = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx    = canvas.getContext('2d');
            const stream = canvas.captureStream(24);

            // Capture audio if available
            let combined = stream;
            try {
                const audioCtx = new AudioContext();
                const src  = audioCtx.createMediaElementSource(video);
                const dest = audioCtx.createMediaStreamDestination();
                src.connect(dest);
                src.connect(audioCtx.destination);
                combined = new MediaStream([...stream.getTracks(), ...dest.stream.getTracks()]);
            } catch (e) { /* no audio */ }

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
                ? 'video/webm;codecs=vp8'
                : 'video/webm';

            let recorder;
            try {
                recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 1_500_000 });
            } catch (e) {
                URL.revokeObjectURL(blobUrl);
                if (statusBox) statusBox.style.display = 'none';
                resolve(file);
                return;
            }

            const chunks = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                URL.revokeObjectURL(blobUrl);
                const blob       = new Blob(chunks, { type: mimeType });
                const ext        = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const compressed = new File([blob], `compressed.${ext}`, { type: mimeType });
                const result     = compressed.size < file.size ? compressed : file;
                if (statusBox) statusBox.style.display = 'none';
                resolve(result);
            };

            video.currentTime = 0;
            video.onseeked = () => {
                recorder.start(100);
                video.play();
                const draw = () => {
                    if (!video.paused && !video.ended) {
                        ctx.drawImage(video, 0, 0, w, h);
                        const pct = duration > 0
                            ? Math.min(100, Math.round((video.currentTime / duration) * 100))
                            : 0;
                        if (bar) bar.style.width = pct + '%';
                        if (onProgress) onProgress(pct);
                        requestAnimationFrame(draw);
                    }
                };
                requestAnimationFrame(draw);
                video.onended = () => {
                    if (recorder.state !== 'inactive') recorder.stop();
                };
            };
        };

        video.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            if (statusBox) statusBox.style.display = 'none';
            resolve(file);
        };
    });
}

// ─── Modal Setup ─────────────────────────────────────────────────────────────

/**
 * Wire up the upload modal: open/close, file selection, preview, form
 * validation, compression and submission.
 *
 * @param {{
 *   getProfile: () => object,
 *   uploadModal: HTMLElement,
 *   postsContainer: HTMLElement,
 *   getPosts: () => object[],
 *   onPostCreated: (post: object, file: File, isVideo: boolean) => void,
 *   showToast: (msg: string, type?: string) => void,
 *   createPostHTML: (post: object, index?: number) => string,
 *   setupPostEventListeners: (postId: string) => void,
 * }} deps
 */
export function setupCreatePostModal(deps) {
    const {
        getProfile,
        uploadModal,
        postsContainer,
        getPosts,
        onPostCreated,
        showToast,
        createPostHTML,
        setupPostEventListeners,
    } = deps;

    // DOM refs
    const openUploadModal       = document.getElementById('openUploadModal');
    const closeUploadModal      = document.getElementById('closeUploadModal');
    const imageUploadArea       = document.getElementById('imageUploadArea');
    const imageInput            = document.getElementById('imageInput');
    const imagePreview          = document.getElementById('imagePreview');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const uploadPlaceholder     = document.getElementById('uploadPlaceholder');
    const removeImageBtn        = document.getElementById('removeImageBtn');
    const postDescription       = document.getElementById('postDescription');
    const charCount             = document.getElementById('charCount');
    const submitPostBtn         = document.getElementById('submitPostBtn');

    let _rawFile = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function checkFormValidity() {
        if (submitPostBtn) {
            submitPostBtn.disabled = !(imageInput && imageInput.files.length > 0);
        }
    }

    function resetPreview() {
        _rawFile = null;
        if (imageInput)      imageInput.value = '';
        if (imagePreview)    { imagePreview.src = ''; imagePreview.style.display = 'none'; }
        const videoEl   = document.getElementById('videoPreview');
        const videoWrap = document.getElementById('videoPreviewWrap');
        const compStat  = document.getElementById('compressStatus');
        if (videoEl)   { videoEl.pause(); videoEl.src = ''; videoEl.style.display = 'none'; }
        if (videoWrap)  videoWrap.style.display  = 'none';
        if (compStat)   compStat.style.display   = 'none';
        if (uploadPlaceholder)     uploadPlaceholder.style.display     = 'flex';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        checkFormValidity();
    }

    // ── Open / Close ─────────────────────────────────────────────────────────

    if (openUploadModal) {
        openUploadModal.addEventListener('click', () => {
            uploadModal.classList.add('show');
            checkFormValidity();
        });
    }
    if (closeUploadModal) {
        closeUploadModal.addEventListener('click', () => uploadModal.classList.remove('show'));
    }
    if (uploadModal) {
        uploadModal.addEventListener('click', e => {
            if (e.target === uploadModal) uploadModal.classList.remove('show');
        });
    }

    // ── Upload area click ────────────────────────────────────────────────────

    if (imageUploadArea) {
        imageUploadArea.addEventListener('click', e => {
            const videoWrap = document.getElementById('videoPreviewWrap');
            if (videoWrap && videoWrap.contains(e.target)) return;
            if (imageInput) imageInput.click();
        });
    }

    // ── File select ──────────────────────────────────────────────────────────

    if (imageInput) {
        imageInput.setAttribute('accept', 'image/*,video/*');
        imageInput.addEventListener('change', e => {
            const file = e.target.files[0];
            _rawFile = null;
            if (!file) return;

            const isVideo   = file.type.startsWith('video/');
            const videoWrap = document.getElementById('videoPreviewWrap');
            const videoEl   = document.getElementById('videoPreview');

            if (isVideo) {
                _rawFile = file;
                if (videoEl) { videoEl.src = URL.createObjectURL(file); videoEl.style.display = 'block'; }
                if (videoWrap)  videoWrap.style.display  = 'block';
                if (imagePreview) { imagePreview.src = ''; imagePreview.style.display = 'none'; }
            } else {
                if (videoWrap) videoWrap.style.display = 'none';
                const reader = new FileReader();
                reader.onload = evt => {
                    if (imagePreview) { imagePreview.src = evt.target.result; imagePreview.style.display = 'block'; }
                };
                reader.readAsDataURL(file);
            }

            if (uploadPlaceholder)     uploadPlaceholder.style.display     = 'none';
            if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
            checkFormValidity();
        });
    }

    // ── Remove button ────────────────────────────────────────────────────────

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', e => {
            e.stopPropagation();
            resetPreview();
        });
    }

    // ── Description char count ───────────────────────────────────────────────

    if (postDescription) {
        postDescription.addEventListener('input', () => {
            if (charCount) charCount.textContent = postDescription.value.length;
            checkFormValidity();
        });
    }

    // ── Submit ───────────────────────────────────────────────────────────────

    if (submitPostBtn) {
        submitPostBtn.addEventListener('click', async () => { await handleCreatePost(); });
    }

    async function handleCreatePost() {
        const currentProfile = getProfile();
        const description    = postDescription?.value.trim() || '';
        const department     = currentProfile?.department || '';
        const rawFile        = imageInput?.files[0];

        if (!rawFile) { showToast('Please select an image or video', 'error'); return; }

        const isVideo       = rawFile.type.startsWith('video/');
        const submitBtnText = document.getElementById('submitBtnText');
        if (submitPostBtn) submitPostBtn.disabled = true;

        let fileToUpload = rawFile;

        // Optionally compress large videos
        if (isVideo && rawFile.size > COMPRESS_THRESHOLD) {
            if (submitBtnText) submitBtnText.textContent = 'Compressing…';
            try {
                fileToUpload = await compressVideo(rawFile, pct => {
                    const progressBar = document.getElementById('uploadProgressBar');
                    if (progressBar) progressBar.style.width = pct + '%';
                });
            } catch (e) {
                console.error('Compression failed:', e);
                showToast('Compression failed — uploading original', 'error');
                fileToUpload = rawFile;
            }
            if (submitBtnText) submitBtnText.textContent = 'Uploading video…';
        } else {
            if (submitBtnText) submitBtnText.textContent = isVideo ? 'Uploading video…' : 'Uploading…';
        }

        const progressBar       = document.getElementById('uploadProgressBar');
        const progressContainer = document.getElementById('uploadProgressContainer');
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar)       progressBar.style.width         = '0%';

        try {
            const result = await window.createPost(description, fileToUpload, department, 'public', percent => {
                if (progressBar) progressBar.style.width = percent + '%';
                const progressText = document.getElementById('uploadProgressText');
                if (progressText) progressText.textContent = percent + '%';
                if (submitBtnText) submitBtnText.textContent = 'Uploading… ' + percent + '%';
            });

            if (progressContainer) progressContainer.style.display = 'none';

            if (result.success) {
                showToast('Post created successfully!', 'success');

                // Reset form
                if (postDescription) postDescription.value = '';
                if (charCount)       charCount.textContent = '0';
                resetPreview();
                uploadModal.classList.remove('show');

                // Notify parent
                onPostCreated(result.post, fileToUpload, isVideo);
            } else {
                showToast(result.error || 'Failed to create post', 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            showToast('Failed to create post', 'error');
            if (progressContainer) progressContainer.style.display = 'none';
        } finally {
            if (submitPostBtn) submitPostBtn.disabled = false;
            const submitBtnText = document.getElementById('submitBtnText');
            if (submitBtnText) submitBtnText.textContent = 'Post';
        }
    }
}
