/**
 * apt-photos.js — P-rent Apartment Photo Manager
 * Requires: auth-data.js
 *
 * Allows landlords (and superadmin) to:
 *  - Upload up to 5 photos per apartment via file picker or drag-and-drop
 *  - Set a primary photo (shown on tenant dashboard)
 *  - Delete individual photos
 *  - View a photo gallery per apartment
 *
 * Storage:
 *  Photos are stored as base64 DataURLs under localStorage key:
 *  `prent_apt_photos_${aptId}` → { primary: string, gallery: string[] }
 *
 * The tenant dashboard reads `primary` automatically on load.
 *
 * NOTE: base64 images use localStorage space (~1.5–2 MB per photo).
 * For production, upload to a real file server (Cloudinary, Firebase Storage, S3)
 * and store just the URL string instead of the full base64.
 */

const AptPhotos = (() => {
    'use strict';

    const MAX_PHOTOS    = 5;
    const MAX_SIZE_MB   = 2;
    const STORAGE_KEY   = aptId => `prent_apt_photos_${aptId}`;

    // ── DATA ──────────────────────────────────────────────────────────────────
    function load(aptId) {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY(aptId)) || 'null') || { primary: null, gallery: [] };
        } catch (_) { return { primary: null, gallery: [] }; }
    }

    function save(aptId, data) {
        try {
            localStorage.setItem(STORAGE_KEY(aptId), JSON.stringify(data));
            // Notify other tabs (e.g. tenant dashboard open simultaneously)
            window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY(aptId) }));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                return { error: 'Storage full. Use smaller images or fewer photos.' };
            }
        }
        return { success: true };
    }

    // ── FILE → BASE64 ─────────────────────────────────────────────────────────
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) { reject(new Error('Not an image file.')); return; }
            if (file.size > MAX_SIZE_MB * 1024 * 1024) { reject(new Error(`Image too large. Max ${MAX_SIZE_MB}MB.`)); return; }
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(file);
        });
    }

    // ── ADD PHOTOS ────────────────────────────────────────────────────────────
    async function addPhotos(aptId, files, onProgress) {
        const data = load(aptId);
        const errors = [];

        for (const file of Array.from(files)) {
            if (data.gallery.length >= MAX_PHOTOS) {
                errors.push(`Max ${MAX_PHOTOS} photos reached.`);
                break;
            }
            try {
                const b64 = await fileToBase64(file);
                data.gallery.push(b64);
                if (!data.primary) data.primary = b64; // first photo = primary
                if (onProgress) onProgress(data.gallery.length, file.name);
            } catch (e) {
                errors.push(`${file.name}: ${e.message}`);
            }
        }

        const result = save(aptId, data);
        if (result?.error) errors.push(result.error);
        return { data, errors };
    }

    // ── SET PRIMARY ───────────────────────────────────────────────────────────
    function setPrimary(aptId, index) {
        const data = load(aptId);
        if (index >= 0 && index < data.gallery.length) {
            data.primary = data.gallery[index];
            save(aptId, data);
        }
        return data;
    }

    // ── DELETE PHOTO ──────────────────────────────────────────────────────────
    function deletePhoto(aptId, index) {
        const data = load(aptId);
        const removed = data.gallery.splice(index, 1)[0];
        if (data.primary === removed) {
            data.primary = data.gallery[0] || null;
        }
        save(aptId, data);
        return data;
    }

    // ── CLEAR ALL ─────────────────────────────────────────────────────────────
    function clearAll(aptId) {
        save(aptId, { primary: null, gallery: [] });
    }

    // ── RENDER GALLERY HTML (for use inside landlord dashboard modal) ─────────
    function renderGalleryHTML(aptId, aptName) {
        const data   = load(aptId);
        const remain = MAX_PHOTOS - data.gallery.length;

        return `
        <h3 style="font-family:var(--ff-d);font-size:1.4rem;font-weight:600;color:var(--paper);margin-bottom:0.25rem;">📸 Apartment Photos</h3>
        <p style="font-size:0.8rem;color:var(--muted);font-weight:300;margin-bottom:1.25rem;">${aptName} · ${data.gallery.length}/${MAX_PHOTOS} photos uploaded</p>

        <!-- Upload area -->
        ${remain > 0 ? `
        <div id="photo-drop-zone" style="border:2px dashed rgba(184,134,11,0.3);border-radius:10px;padding:1.5rem;text-align:center;margin-bottom:1.25rem;cursor:pointer;transition:all 0.25s;background:rgba(184,134,11,0.04);">
            <div style="font-size:1.8rem;margin-bottom:0.5rem;">📷</div>
            <div style="font-size:0.82rem;font-weight:500;color:var(--paper);margin-bottom:0.2rem;">Drop images here or click to browse</div>
            <div style="font-size:0.72rem;color:var(--muted)">JPG, PNG, WebP · Max ${MAX_SIZE_MB}MB each · ${remain} slot${remain !== 1 ? 's' : ''} remaining</div>
            <input type="file" id="photo-file-input" accept="image/*" multiple style="display:none"/>
        </div>` : `
        <div style="text-align:center;padding:0.75rem;background:rgba(224,160,80,0.08);border:1px solid rgba(224,160,80,0.2);border-radius:8px;font-size:0.8rem;color:var(--warning);margin-bottom:1.25rem;">
            Maximum ${MAX_PHOTOS} photos reached. Delete a photo to add more.
        </div>`}

        <!-- Upload status -->
        <div id="photo-upload-status" style="font-size:0.78rem;margin-bottom:0.75rem;"></div>

        <!-- Gallery grid -->
        <div id="photo-gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.65rem;margin-bottom:1.25rem;">
            ${data.gallery.length === 0
                ? `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted);font-size:0.83rem;">No photos yet. Upload your first photo above.</div>`
                : data.gallery.map((src, i) => renderThumbHTML(src, i, data.primary)).join('')}
        </div>

        <div style="display:flex;gap:0.65rem;justify-content:flex-end;">
            ${data.gallery.length > 0 ? `<button onclick="AptPhotos._clearAll('${aptId}')" style="padding:0.55rem 1rem;background:rgba(224,112,112,0.1);border:1px solid rgba(224,112,112,0.2);border-radius:7px;color:var(--danger);font-family:var(--ff-s);font-size:0.78rem;font-weight:500;cursor:pointer;">Delete All</button>` : ''}
            <button onclick="document.getElementById('photo-modal-overlay').classList.remove('open');document.body.style.overflow=''" style="padding:0.55rem 1.25rem;background:var(--gold-dim);border:1px solid rgba(184,134,11,0.25);border-radius:7px;color:var(--gold-lt);font-family:var(--ff-s);font-size:0.78rem;font-weight:500;cursor:pointer;">Done</button>
        </div>`;
    }

    function renderThumbHTML(src, index, primary) {
        const isPrimary = src === primary;
        return `
        <div style="position:relative;border-radius:8px;overflow:hidden;border:2px solid ${isPrimary ? 'var(--gold)' : 'var(--border)'};aspect-ratio:1;background:#1a1c18;">
            <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" alt="Photo ${index + 1}"/>
            ${isPrimary ? `<div style="position:absolute;top:4px;left:4px;background:var(--gold);color:var(--ink);font-size:0.6rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:3px;letter-spacing:0.05em;">PRIMARY</div>` : ''}
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:flex-end;justify-content:center;gap:0.3rem;padding:0.4rem;opacity:0;transition:opacity 0.2s;" class="thumb-overlay"
                onmouseover="this.style.background='rgba(0,0,0,0.55)';this.style.opacity='1'"
                onmouseout="this.style.background='rgba(0,0,0,0)';this.style.opacity='0'">
                ${!isPrimary ? `<button onclick="AptPhotos._setPrimary(event,'${CURRENT_APT_ID}',${index})" style="padding:0.28rem 0.6rem;background:rgba(184,134,11,0.9);border:none;border-radius:4px;color:var(--ink);font-size:0.66rem;font-weight:600;cursor:pointer;" title="Set as primary">★ Primary</button>` : ''}
                <button onclick="AptPhotos._delete(event,'${CURRENT_APT_ID}',${index})" style="padding:0.28rem 0.6rem;background:rgba(224,112,112,0.9);border:none;border-radius:4px;color:#fff;font-size:0.66rem;font-weight:600;cursor:pointer;" title="Delete">✕ Delete</button>
            </div>
        </div>`;
    }

    // Current apt in focus (set when modal opens)
    let CURRENT_APT_ID = null;

    // ── INTERACTIVE HANDLERS (attached via onclick in the HTML) ───────────────
    function _setPrimary(e, aptId, index) {
        e.stopPropagation();
        const data = setPrimary(aptId, index);
        refreshGalleryGrid(aptId, data);
        showStatus('✓ Primary photo updated.', 'success');
    }

    function _delete(e, aptId, index) {
        e.stopPropagation();
        const data = deletePhoto(aptId, index);
        refreshGalleryGrid(aptId, data);
        showStatus(`Photo deleted. ${MAX_PHOTOS - data.gallery.length} slots free.`, 'warn');
    }

    function _clearAll(aptId) {
        if (!confirm('Delete all photos for this apartment?')) return;
        clearAll(aptId);
        const grid = document.getElementById('photo-gallery-grid');
        if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted);font-size:0.83rem;">No photos yet.</div>`;
        showStatus('All photos removed.', 'warn');
    }

    function refreshGalleryGrid(aptId, data) {
        const grid = document.getElementById('photo-gallery-grid');
        if (!grid) return;
        grid.innerHTML = data.gallery.length === 0
            ? `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted);font-size:0.83rem;">No photos. Upload your first above.</div>`
            : data.gallery.map((src, i) => renderThumbHTML(src, i, data.primary)).join('');
    }

    function showStatus(msg, type = 'success') {
        const el = document.getElementById('photo-upload-status');
        if (!el) return;
        const colors = { success: 'var(--success)', warn: 'var(--warning)', error: 'var(--danger)' };
        el.innerHTML = `<span style="color:${colors[type] || colors.success}">${msg}</span>`;
        setTimeout(() => { if (el) el.innerHTML = ''; }, 3500);
    }

    // ── WIRE FILE INPUT & DRAG-DROP (after modal renders) ─────────────────────
    function wireUploader(aptId) {
        CURRENT_APT_ID = aptId;
        const dropZone = document.getElementById('photo-drop-zone');
        const fileInput= document.getElementById('photo-file-input');
        if (!dropZone || !fileInput) return;

        // Click to open file picker
        dropZone.addEventListener('click', () => fileInput.click());

        // File selected
        fileInput.addEventListener('change', async e => {
            await handleFiles(aptId, e.target.files);
            fileInput.value = ''; // reset so same file can be re-selected
        });

        // Drag-and-drop
        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--gold)';
            dropZone.style.background  = 'rgba(184,134,11,0.1)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'rgba(184,134,11,0.3)';
            dropZone.style.background  = 'rgba(184,134,11,0.04)';
        });
        dropZone.addEventListener('drop', async e => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(184,134,11,0.3)';
            dropZone.style.background  = 'rgba(184,134,11,0.04)';
            await handleFiles(aptId, e.dataTransfer.files);
        });
    }

    async function handleFiles(aptId, files) {
        if (!files || files.length === 0) return;
        showStatus('Uploading…', 'success');

        const { data, errors } = await addPhotos(aptId, files, (count, name) => {
            showStatus(`Added ${name} (${count}/${MAX_PHOTOS})`, 'success');
        });

        if (errors.length > 0) {
            showStatus(errors.join(' | '), 'error');
        } else {
            showStatus(`✓ ${files.length} photo${files.length > 1 ? 's' : ''} uploaded!`, 'success');
        }

        refreshGalleryGrid(aptId, data);

        // Update the drop-zone remaining count
        const remain = MAX_PHOTOS - data.gallery.length;
        const remainEl = document.querySelector('#photo-drop-zone div:last-of-type');
        if (remainEl) remainEl.textContent = `JPG, PNG, WebP · Max ${MAX_SIZE_MB}MB each · ${remain} slot${remain !== 1 ? 's' : ''} remaining`;
        if (data.gallery.length >= MAX_PHOTOS) {
            const dz = document.getElementById('photo-drop-zone');
            if (dz) dz.style.opacity = '0.5';
        }
    }

    // ── OPEN PHOTO MODAL (called from landlord dashboard) ─────────────────────
    function openPhotoModal(aptId, aptName, modalContainer) {
        CURRENT_APT_ID = aptId;

        // Create a separate modal overlay if one doesn't exist
        let overlay = document.getElementById('photo-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'photo-modal-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(8,9,7,0.88);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:1.5rem;transition:opacity 0.3s ease;';
            overlay.innerHTML = `
                <div id="photo-modal-box" style="background:#1c1f14;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:2rem;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;position:relative;">
                    <div id="photo-modal-content"></div>
                </div>`;
            document.body.appendChild(overlay);
        }

        document.getElementById('photo-modal-content').innerHTML = renderGalleryHTML(aptId, aptName);
        overlay.classList.add('open');
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'all';
        document.body.style.overflow = 'hidden';

        // Wire the file uploader after the HTML is in the DOM
        setTimeout(() => wireUploader(aptId), 50);

        // Close on overlay click
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
                overlay.style.opacity = '0';
                overlay.style.pointerEvents = 'none';
                document.body.style.overflow = '';
            }
        });
    }

    // ── PUBLIC ────────────────────────────────────────────────────────────────
    return {
        load,
        addPhotos,
        setPrimary,
        deletePhoto,
        clearAll,
        openPhotoModal,
        wireUploader,
        _setPrimary,
        _delete,
        _clearAll,
    };

})();