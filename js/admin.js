/**
 * admin.js — P-rent Superadmin Panel
 *
 * Only accessible when session.role === 'superadmin'.
 * Allows the platform owner to:
 *   - Add / edit / delete landlords (with their apartment assignment)
 *   - Add / edit / delete apartments
 *   - View all tenants (read-only; tenants are added by landlords)
 *   - Force-reset any tenant or landlord password
 */

(() => {
    'use strict';

    // ── GUARD ─────────────────────────────────────────────────────────────────
    const session = AUTH.requireRole('superadmin');
    if (!session) return; // requireRole handles redirect

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qs  = (s, r = document) => r.querySelector(s);
    const qsa = (s, r = document) => [...r.querySelectorAll(s)];

    function genId(prefix) {
        return prefix + Math.random().toString(36).slice(2,7).toUpperCase();
    }

    function showToast(msg, type = 'success') {
        const t = $('toast');
        t.textContent = msg;
        t.className = `toast show ${type}`;
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.className = 'toast', 3000);
    }

    function openModal(html) {
        $('modal-body').innerHTML = html;
        $('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        $('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
        $('modal-body').innerHTML = '';
    }

    // ── TABS ──────────────────────────────────────────────────────────────────
    let activeTab = 'landlords';

    function switchTab(tab) {
        activeTab = tab;
        qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        qsa('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + tab));
        renderAll();
    }

    qsa('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // ── ═══════════════════ APARTMENTS ═══════════════════ ──────────────────

    function renderApartments() {
        const list = AUTH.getApartments();
        const tbody = $('apt-tbody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">No apartments yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(a => `
            <tr>
                <td><span class="apt-icon-sm">${a.icon || '🏢'}</span> <strong>${a.name}</strong></td>
                <td style="color:var(--muted)">${a.location}</td>
                <td><span class="badge">${a.totalRooms} rooms</span></td>
                <td><span class="badge success">${a.availableRooms} free</span></td>
                <td class="actions">
                    <button class="act-btn edit"   onclick="Admin.editApartment('${a.id}')">Edit</button>
                    <button class="act-btn danger" onclick="Admin.deleteApartment('${a.id}')">Delete</button>
                </td>
            </tr>`).join('');
    }

    function aptForm(apt = null) {
        const isEdit = !!apt;
        return `
            <h3>${isEdit ? 'Edit' : 'Add'} Apartment</h3>
            <div class="mfield"><label>Apartment ID</label>
                <input id="f-apt-id" placeholder="e.g. victoria" value="${apt?.id||''}" ${isEdit ? 'readonly style="opacity:0.5"' : ''} /></div>
            <div class="mfield"><label>Name</label>
                <input id="f-apt-name" placeholder="Victoria Apartments" value="${apt?.name||''}" /></div>
            <div class="mfield"><label>Location</label>
                <input id="f-apt-location" placeholder="Area, Sub-county, County" value="${apt?.location||''}" /></div>
            <div class="mfield"><label>County</label>
                <input id="f-apt-county" placeholder="e.g. Nairobi County" value="${apt?.county||''}" /></div>
            <div class="mfield"><label>Icon (emoji)</label>
                <input id="f-apt-icon" placeholder="🏢" value="${apt?.icon||'🏢'}" maxlength="2" /></div>
            <div class="mrow">
                <div class="mfield"><label>Total Rooms</label>
                    <input type="number" id="f-apt-total" placeholder="10" value="${apt?.totalRooms||''}" min="1" /></div>
                <div class="mfield"><label>Available Rooms</label>
                    <input type="number" id="f-apt-avail" placeholder="3" value="${apt?.availableRooms||''}" min="0" /></div>
            </div>
            <div class="mfield"><label>Rent Range</label>
                <input id="f-apt-rent" placeholder="KES 8,000 – 12,000" value="${apt?.rentRange||''}" /></div>
            <div class="mfield"><label>Description</label>
                <input id="f-apt-desc" placeholder="Short description" value="${apt?.description||''}" /></div>
            <div class="mbtn-row">
                <button class="mprimary" onclick="Admin.saveApartment(${isEdit})">
                    ${isEdit ? 'Save Changes' : 'Add Apartment'}
                </button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`;
    }

    function saveApartment(isEdit) {
        const id       = $('f-apt-id')?.value.trim().toLowerCase().replace(/\s+/g,'-');
        const name     = $('f-apt-name')?.value.trim();
        const location = $('f-apt-location')?.value.trim();
        const county   = $('f-apt-county')?.value.trim();
        const icon     = $('f-apt-icon')?.value.trim() || '🏢';
        const total    = parseInt($('f-apt-total')?.value);
        const avail    = parseInt($('f-apt-avail')?.value);
        const rentRange= $('f-apt-rent')?.value.trim();
        const desc     = $('f-apt-desc')?.value.trim();

        if (!id || !name || !location || !county || isNaN(total) || isNaN(avail)) {
            showToast('Fill in all required fields.', 'error'); return;
        }
        if (avail > total) { showToast('Available rooms cannot exceed total rooms.', 'error'); return; }

        const list = AUTH.getApartments();

        if (!isEdit) {
            if (list.find(a => a.id === id)) { showToast('An apartment with this ID already exists.', 'error'); return; }
        }

        const apt = { id, name, location, county, icon, totalRooms: total, availableRooms: avail, rentRange, description: desc, amenities: [], rooms: [] };

        if (isEdit) {
            const idx = list.findIndex(a => a.id === id);
            if (idx === -1) return;
            list[idx] = { ...list[idx], ...apt };
        } else {
            list.push(apt);
        }

        AUTH.saveApartments(list);
        closeModal();
        renderApartments();
        showToast(`Apartment ${isEdit ? 'updated' : 'added'} successfully.`);
    }

    function editApartment(id) {
        const apt = AUTH.getApartments().find(a => a.id === id);
        if (!apt) return;
        openModal(aptForm(apt));
    }

    function deleteApartment(id) {
        // Check if any landlord is assigned
        const landlords = AUTH.getLandlords().filter(l => l.apartment === id);
        if (landlords.length) {
            showToast(`Cannot delete: ${landlords.length} landlord(s) are assigned here.`, 'error'); return;
        }
        openModal(`
            <h3>Delete Apartment</h3>
            <p style="color:var(--muted);margin-bottom:1.5rem">Are you sure? This cannot be undone.</p>
            <div class="mbtn-row">
                <button class="mprimary danger" onclick="Admin._confirmDeleteApartment('${id}')">Yes, Delete</button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`);
    }

    function _confirmDeleteApartment(id) {
        const list = AUTH.getApartments().filter(a => a.id !== id);
        AUTH.saveApartments(list);
        closeModal();
        renderApartments();
        showToast('Apartment deleted.');
    }

    // ── ═══════════════════ LANDLORDS ════════════════════ ──────────────────

    function renderLandlords() {
        const list  = AUTH.getLandlords();
        const apts  = AUTH.getApartments();
        const tbody = $('ll-tbody');
        if (!tbody) return;

        $('ll-count').textContent = list.length;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">No landlords yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(l => {
            const apt = apts.find(a => a.id === l.apartment);
            return `
            <tr>
                <td><strong>${l.name}</strong></td>
                <td style="color:var(--muted)">${l.phone}</td>
                <td style="color:var(--muted)">${l.email}</td>
                <td><span class="badge">${apt ? apt.name : l.apartment}</span></td>
                <td><span class="badge info">${l.id}</span></td>
                <td class="actions">
                    <button class="act-btn edit"   onclick="Admin.editLandlord('${l.id}')">Edit</button>
                    <button class="act-btn reset"  onclick="Admin.resetPassword('landlord','${l.id}')">Reset PW</button>
                    <button class="act-btn danger" onclick="Admin.deleteLandlord('${l.id}')">Delete</button>
                </td>
            </tr>`;
        }).join('');
    }

    function landlordForm(ll = null) {
        const isEdit = !!ll;
        const apts   = AUTH.getApartments();
        const aptOpts = apts.map(a =>
            `<option value="${a.id}" ${ll?.apartment === a.id ? 'selected' : ''}>${a.name}</option>`
        ).join('');

        return `
            <h3>${isEdit ? 'Edit' : 'Add'} Landlord</h3>
            <div class="mfield"><label>Full Name</label>
                <input id="f-ll-name" placeholder="Peter Kamau" value="${ll?.name||''}" /></div>
            <div class="mfield"><label>Phone Number</label>
                <input id="f-ll-phone" placeholder="07XX XXX XXX" value="${ll?.phone||''}" /></div>
            <div class="mfield"><label>Email Address</label>
                <input id="f-ll-email" placeholder="peter@email.com" value="${ll?.email||''}" /></div>
            <div class="mfield"><label>Assigned Apartment</label>
                <select id="f-ll-apt"><option value="">— Select —</option>${aptOpts}</select></div>
            ${!isEdit ? `
            <div class="mfield"><label>Password</label>
                <input type="password" id="f-ll-pw" placeholder="Set a password" />
            </div>` : ''}
            <div class="mbtn-row">
                <button class="mprimary" onclick="Admin.saveLandlord('${ll?.id||''}')">
                    ${isEdit ? 'Save Changes' : 'Add Landlord'}
                </button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`;
    }

    function saveLandlord(existingId) {
        const isEdit = !!existingId;
        const name   = $('f-ll-name')?.value.trim();
        const phone  = $('f-ll-phone')?.value.trim().replace(/\s/g,'');
        const email  = $('f-ll-email')?.value.trim();
        const apt    = $('f-ll-apt')?.value;
        const pw     = $('f-ll-pw')?.value;

        if (!name || !phone || !email || !apt) {
            showToast('Fill in all required fields.', 'error'); return;
        }
        if (!isEdit && !pw) {
            showToast('Set a password for this landlord.', 'error'); return;
        }
        if (!isEdit && pw.length < 6) {
            showToast('Password must be at least 6 characters.', 'error'); return;
        }

        const list = AUTH.getLandlords();

        if (isEdit) {
            const idx = list.findIndex(l => l.id === existingId);
            if (idx === -1) return;
            list[idx] = { ...list[idx], name, phone, email, apartment: apt };
        } else {
            // Check duplicate phone
            if (list.find(l => l.phone === phone)) {
                showToast('A landlord with this phone already exists.', 'error'); return;
            }
            list.push({ id: genId('LL'), name, phone, email, apartment: apt, password: pw, role: 'landlord' });
        }

        AUTH.saveLandlords(list);
        closeModal();
        renderLandlords();
        showToast(`Landlord ${isEdit ? 'updated' : 'added'} successfully.`);
    }

    function editLandlord(id) {
        const ll = AUTH.getLandlords().find(l => l.id === id);
        if (!ll) return;
        openModal(landlordForm(ll));
    }

    function deleteLandlord(id) {
        openModal(`
            <h3>Delete Landlord</h3>
            <p style="color:var(--muted);margin-bottom:1.5rem">This will remove their access. Tenants they added will remain.</p>
            <div class="mbtn-row">
                <button class="mprimary danger" onclick="Admin._confirmDeleteLandlord('${id}')">Yes, Delete</button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`);
    }

    function _confirmDeleteLandlord(id) {
        const list = AUTH.getLandlords().filter(l => l.id !== id);
        AUTH.saveLandlords(list);
        closeModal();
        renderLandlords();
        showToast('Landlord removed.');
    }

    // ── ════════════════════ TENANTS ═════════════════════ ──────────────────

    function renderTenants() {
        const list  = AUTH.getTenants();
        const apts  = AUTH.getApartments();
        const tbody = $('tn-tbody');
        if (!tbody) return;

        $('tn-count').textContent = list.length;

        const search = $('tn-search')?.value.toLowerCase() || '';
        const aptFilter = $('tn-apt-filter')?.value || '';

        const filtered = list.filter(t => {
            const matchApt  = !aptFilter || t.apartment === aptFilter;
            const matchSearch = !search ||
                t.name.toLowerCase().includes(search) ||
                t.phone.includes(search) ||
                t.room.toLowerCase().includes(search);
            return matchApt && matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No tenants found.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(t => {
            const apt = apts.find(a => a.id === t.apartment);
            return `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td style="color:var(--muted)">${t.phone}</td>
                <td><span class="badge">${apt ? apt.name : t.apartment}</span></td>
                <td><span class="badge info">Rm ${t.room}</span></td>
                <td>KES ${Number(t.rent).toLocaleString('en-KE')}</td>
                <td><span class="badge">${t.id}</span></td>
                <td class="actions">
                    <button class="act-btn reset" onclick="Admin.resetPassword('tenant','${t.id}')">Reset PW</button>
                    <button class="act-btn danger" onclick="Admin.deleteTenant('${t.id}')">Remove</button>
                </td>
            </tr>`;
        }).join('');
    }

    function deleteTenant(id) {
        openModal(`
            <h3>Remove Tenant</h3>
            <p style="color:var(--muted);margin-bottom:1.5rem">This will delete their account and access.</p>
            <div class="mbtn-row">
                <button class="mprimary danger" onclick="Admin._confirmDeleteTenant('${id}')">Yes, Remove</button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`);
    }

    function _confirmDeleteTenant(id) {
        const list = AUTH.getTenants().filter(t => t.id !== id);
        AUTH.saveTenants(list);
        closeModal();
        renderTenants();
        showToast('Tenant removed.');
    }

    // ── PASSWORD RESET ────────────────────────────────────────────────────────
    function resetPassword(role, id) {
        openModal(`
            <h3>Reset Password</h3>
            <p style="color:var(--muted);margin-bottom:1.25rem">Set a new password for this ${role}.</p>
            <div class="mfield"><label>New Password</label>
                <input type="password" id="f-newpw" placeholder="Min 6 characters" /></div>
            <div class="mfield"><label>Confirm Password</label>
                <input type="password" id="f-confirmpw" placeholder="Repeat password" /></div>
            <div class="mbtn-row">
                <button class="mprimary" onclick="Admin._confirmReset('${role}','${id}')">Update Password</button>
                <button class="mghost" onclick="Admin.closeModal()">Cancel</button>
            </div>`);
    }

    function _confirmReset(role, id) {
        const pw1 = $('f-newpw')?.value;
        const pw2 = $('f-confirmpw')?.value;
        if (!pw1 || pw1.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
        if (pw1 !== pw2) { showToast('Passwords do not match.', 'error'); return; }

        if (role === 'landlord') {
            const list = AUTH.getLandlords();
            const idx  = list.findIndex(l => l.id === id);
            if (idx > -1) { list[idx].password = pw1; AUTH.saveLandlords(list); }
        } else {
            const list = AUTH.getTenants();
            const idx  = list.findIndex(t => t.id === id);
            if (idx > -1) { list[idx].password = pw1; AUTH.saveTenants(list); }
        }

        closeModal();
        showToast('Password updated successfully.');
    }

    // ── RENDER ALL ────────────────────────────────────────────────────────────
    function renderAll() {
        renderApartments();
        renderLandlords();
        renderTenants();
        renderStats();
        populateTenantFilters();
    }

    function renderStats() {
        const apts = AUTH.getApartments();
        const lls  = AUTH.getLandlords();
        const tns  = AUTH.getTenants();
        $('stat-apts')?.setAttribute('data-val', apts.length);
        $('stat-lls')?.setAttribute('data-val',  lls.length);
        $('stat-tns')?.setAttribute('data-val',  tns.length);
        const freeRooms = apts.reduce((s,a) => s + a.availableRooms, 0);
        $('stat-rooms')?.setAttribute('data-val', freeRooms);

        // Animate
        document.querySelectorAll('.stat-num').forEach(el => {
            const target = parseInt(el.closest('.s-card')?.getAttribute('data-val') || el.getAttribute('data-val') || '0');
            animateCount(el, target);
        });
    }

    function animateCount(el, target, ms = 800) {
        const start = performance.now();
        const run = now => {
            const p = Math.min((now - start) / ms, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(ease * target);
            if (p < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
    }

    function populateTenantFilters() {
        const sel = $('tn-apt-filter');
        if (!sel) return;
        const apts = AUTH.getApartments();
        sel.innerHTML = '<option value="">All Apartments</option>' +
            apts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }

    // ── SEARCH / FILTER EVENTS ────────────────────────────────────────────────
    $('tn-search')?.addEventListener('input', renderTenants);
    $('tn-apt-filter')?.addEventListener('change', renderTenants);

    // ── LOGOUT ────────────────────────────────────────────────────────────────
    $('logout-btn')?.addEventListener('click', () => {
        AUTH.clearSession();
        window.location.href = 'login.html';
    });

    // ── MODAL CLOSE ───────────────────────────────────────────────────────────
    $('modal-close')?.addEventListener('click', closeModal);
    $('modal-overlay')?.addEventListener('click', e => {
        if (e.target === $('modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // ── PUBLIC API (called from inline onclick) ───────────────────────────────
    window.Admin = {
        closeModal,
        editApartment,
        deleteApartment,
        saveApartment,
        _confirmDeleteApartment,
        editLandlord,
        deleteLandlord,
        saveLandlord,
        _confirmDeleteLandlord,
        deleteTenant,
        _confirmDeleteTenant,
        resetPassword,
        _confirmReset,
    };

    // ── TOOLBAR BUTTONS ───────────────────────────────────────────────────────
    $('btn-add-apt')?.addEventListener('click', () => openModal(aptForm()));
    $('btn-add-ll')?.addEventListener('click',  () => openModal(landlordForm()));

    // ── INIT ──────────────────────────────────────────────────────────────────
    // Set admin name in header
    $('admin-name') && ($('admin-name').textContent = session.name);
    $('admin-initials') && ($('admin-initials').textContent = session.name.split(' ').map(w=>w[0]).join('').slice(0,2));

    switchTab('landlords');
    renderStats();

})();
