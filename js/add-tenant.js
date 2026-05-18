/**
 * add-tenant.js — P-rent Add Tenant Page
 *
 * Works with: auth-data.js (AUTH object must be loaded first)
 *
 * Access rules:
 *   - Landlord: can only add tenants to their own apartment
 *   - Superadmin: can add tenants to any apartment
 *   - Tenants: redirected away
 *
 * Features:
 *   - Session-aware: auto-fills apartment for landlords
 *   - Live apartment → room dropdown (vacant rooms only)
 *   - Duplicate phone check
 *   - Password auto-generate option
 *   - Tenant card rendering with search + filter
 *   - Delete tenant (frees the room back)
 *   - Edit tenant (name, phone, rent, water, other)
 *   - Stats bar (total, occupied, vacant, revenue)
 *   - localStorage-persisted via AUTH
 */

(() => {
    'use strict';

    // ── GUARD ─────────────────────────────────────────────────────────────────
    const session = AUTH.requireRole('landlord', 'superadmin');
    if (!session) return;

    AUTH.seed();

    // ── STATE ─────────────────────────────────────────────────────────────────
    let searchTerm   = '';
    let filterStatus = 'all'; // 'all' | 'active' | 'pending'
    let editingId    = null;  // tenant id being edited

    // ── DOM ───────────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qs  = (s, r = document) => r.querySelector(s);
    const qsa = (s, r = document) => [...r.querySelectorAll(s)];

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function showToast(msg, type = 'success') {
        const t = $('toast');
        t.textContent = msg;
        t.className = `toast show ${type}`;
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.className = 'toast', 3200);
    }

    function fmt(n) {
        return 'KES ' + Number(n || 0).toLocaleString('en-KE');
    }

    function initials(name) {
        return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-KE', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function genId(prefix) {
        return prefix + Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function genPassword() {
        const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#!';
        let pw = '';
        for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
        return pw;
    }

    function normalisePhone(raw) {
        let p = raw.replace(/[\s\-\(\)]/g, '');
        if (p.startsWith('+254')) p = '0' + p.slice(4);
        if (p.startsWith('254'))  p = '0' + p.slice(3);
        return p;
    }

    function isValidPhone(p) {
        return /^(07|01)\d{8}$/.test(p);
    }

    // ── LANDLORD / ADMIN CONTEXT ──────────────────────────────────────────────
    const isAdmin      = session.role === 'superadmin';
    const myApartment  = isAdmin ? null : session.apartment;

    // Update header greeting
    if ($('session-name')) $('session-name').textContent = session.name;
    if ($('session-role')) $('session-role').textContent = isAdmin ? 'Super Admin' : 'Landlord';
    if ($('session-avatar')) {
        $('session-avatar').textContent = session.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    }

    // ── APARTMENT DROPDOWN ────────────────────────────────────────────────────
    function populateApartmentDropdown() {
        const sel  = $('form-apartment');
        if (!sel) return;
        const apts = AUTH.getApartments();

        if (isAdmin) {
            // Admin sees all apartments
            sel.innerHTML = '<option value="">— Select apartment —</option>' +
                apts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
            sel.disabled = false;
        } else {
            // Landlord sees only their apartment, pre-selected
            const apt = apts.find(a => a.id === myApartment);
            sel.innerHTML = apt
                ? `<option value="${apt.id}">${apt.name}</option>`
                : '<option value="">No apartment assigned</option>';
            sel.value    = myApartment || '';
            sel.disabled = true; // landlord cannot change apartment
            // Trigger room population immediately
            updateRoomDropdown(myApartment);
        }
    }

    // ── ROOM DROPDOWN ─────────────────────────────────────────────────────────
    function updateRoomDropdown(aptId, preserveValue = null) {
        const roomSel = $('form-room');
        if (!roomSel) return;

        if (!aptId) {
            roomSel.innerHTML = '<option value="">— Select apartment first —</option>';
            return;
        }

        const apts = AUTH.getApartments();
        const apt  = apts.find(a => a.id === aptId);
        if (!apt || !apt.rooms) {
            roomSel.innerHTML = '<option value="">No rooms configured</option>';
            return;
        }

        const vacant = apt.rooms.filter(r => r.status === 'vacant');

        if (vacant.length === 0) {
            roomSel.innerHTML = '<option value="">No vacant rooms available</option>';
            return;
        }

        roomSel.innerHTML = '<option value="">— Select room —</option>' +
            vacant.map(r => `<option value="${r.number}" ${r.number === preserveValue ? 'selected':''}>${r.number}</option>`).join('');
    }

    if ($('form-apartment')) {
        $('form-apartment').addEventListener('change', e => {
            updateRoomDropdown(e.target.value);
            clearErrors();
        });
    }

    // ── FORM ERROR HELPERS ────────────────────────────────────────────────────
    function setFieldError(inputId, errId, msg) {
        const inp = $(inputId);
        const err = $(errId);
        if (!inp || !err) return;
        err.textContent = msg;
        if (msg) {
            inp.classList.add('error-state');
            err.classList.add('show');
        } else {
            inp.classList.remove('error-state');
            err.classList.remove('show');
        }
    }

    function clearErrors() {
        qsa('.field-error').forEach(e => { e.classList.remove('show'); e.textContent = ''; });
        qsa('.form-input').forEach(e => e.classList.remove('error-state'));
        $('form-global-error') && ($('form-global-error').textContent = '');
    }

    // Clear error on input
    qsa('.form-input').forEach(inp => {
        inp.addEventListener('input', () => {
            inp.classList.remove('error-state');
        });
    });

    // ── VALIDATE FORM ─────────────────────────────────────────────────────────
    function validateForm() {
        clearErrors();
        let valid = true;

        const name       = $('form-name')?.value.trim()         || '';
        const rawPhone   = $('form-phone')?.value.trim()        || '';
        const phone      = normalisePhone(rawPhone);
        const aptId      = $('form-apartment')?.value           || '';
        const room       = $('form-room')?.value                || '';
        const rent       = parseFloat($('form-rent')?.value)    || 0;
        const password   = $('form-password')?.value            || '';
        const movein     = $('form-movein')?.value              || '';

        if (!name) {
            setFieldError('form-name', 'err-name', 'Tenant name is required.');
            valid = false;
        }

        if (!isValidPhone(phone)) {
            setFieldError('form-phone', 'err-phone', 'Enter a valid 10-digit Kenyan number.');
            valid = false;
        } else {
            // Duplicate check — skip when editing same tenant
            const tenants = AUTH.getTenants();
            const dup = tenants.find(t => t.phone === phone && t.id !== editingId);
            if (dup) {
                setFieldError('form-phone', 'err-phone', 'This phone number is already registered.');
                valid = false;
            }
        }

        if (!aptId) {
            setFieldError('form-apartment', 'err-apartment', 'Select an apartment.');
            valid = false;
        }

        if (!room) {
            setFieldError('form-room', 'err-room', 'Select a room.');
            valid = false;
        }

        if (!rent || rent <= 0) {
            setFieldError('form-rent', 'err-rent', 'Enter a valid rent amount.');
            valid = false;
        }

        if (!password || password.length < 4) {
            setFieldError('form-password', 'err-password', 'Password must be at least 4 characters.');
            valid = false;
        }

        if (!movein) {
            setFieldError('form-movein', 'err-movein', 'Select a move-in date.');
            valid = false;
        }

        return valid ? { name, phone, aptId, room, rent, password, movein } : null;
    }

    // ── ADD TENANT ────────────────────────────────────────────────────────────
    function handleSubmit(e) {
        e.preventDefault();
        if (editingId) { handleUpdate(); return; }

        const data = validateForm();
        if (!data) return;

        const tenants = AUTH.getTenants();
        const apts    = AUTH.getApartments();

        const newTenant = {
            id:         genId('TN'),
            name:       data.name,
            phone:      data.phone,
            email:      $('form-email')?.value.trim() || '',
            password:   data.password,
            apartment:  data.aptId,
            room:       data.room,
            rent:       data.rent,
            water:      parseFloat($('form-water')?.value) || 0,
            other:      parseFloat($('form-other')?.value) || 0,
            moveIn:     data.movein,
            role:       'tenant',
            status:     'active',
            landlordId: isAdmin ? null : session.id,
            addedBy:    session.id,
        };

        // Mark room occupied
        const apt = apts.find(a => a.id === data.aptId);
        if (apt?.rooms) {
            const ri = apt.rooms.findIndex(r => r.number === data.room);
            if (ri > -1) {
                apt.rooms[ri].status = 'occupied';
                apt.availableRooms = Math.max(0, apt.availableRooms - 1);
                AUTH.saveApartments(apts.map(a => a.id === apt.id ? apt : a));
            }
        }

        tenants.push(newTenant);
        AUTH.saveTenants(tenants);

        resetForm();
        renderTenantList();
        renderStats();
        showToast(`✓ ${newTenant.name} added successfully`);
    }

    // ── EDIT TENANT ───────────────────────────────────────────────────────────
    function startEdit(id) {
        const tenant = AUTH.getTenants().find(t => t.id === id);
        if (!tenant) return;

        editingId = id;

        // Scroll to form
        $('tenant-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Pre-fill
        if ($('form-name'))      $('form-name').value      = tenant.name;
        if ($('form-phone'))     $('form-phone').value     = tenant.phone;
        if ($('form-email'))     $('form-email').value     = tenant.email || '';
        if ($('form-rent'))      $('form-rent').value      = tenant.rent;
        if ($('form-water'))     $('form-water').value     = tenant.water;
        if ($('form-other'))     $('form-other').value     = tenant.other;
        if ($('form-movein'))    $('form-movein').value    = tenant.moveIn;
        if ($('form-password'))  $('form-password').value = tenant.password;

        // Apartment (read-only during edit)
        if ($('form-apartment')) {
            $('form-apartment').value    = tenant.apartment;
            $('form-apartment').disabled = true;
        }
        // Room — show current room (occupied) + vacant rooms
        updateRoomDropdownForEdit(tenant.apartment, tenant.room);

        // Update form UI
        if ($('submit-btn'))    $('submit-btn').textContent   = 'Save Changes';
        if ($('form-title'))    $('form-title').textContent   = 'Edit Tenant';
        if ($('cancel-edit-btn')) $('cancel-edit-btn').style.display = 'inline-flex';

        clearErrors();
    }

    function updateRoomDropdownForEdit(aptId, currentRoom) {
        const roomSel = $('form-room');
        if (!roomSel) return;
        const apts = AUTH.getApartments();
        const apt  = apts.find(a => a.id === aptId);
        if (!apt?.rooms) return;

        // Include current room even if occupied
        const eligible = apt.rooms.filter(r => r.status === 'vacant' || r.number === currentRoom);
        roomSel.innerHTML = eligible.map(r =>
            `<option value="${r.number}" ${r.number === currentRoom ? 'selected':''}>
                ${r.number}${r.number === currentRoom ? ' (current)' : ''}
            </option>`
        ).join('');
    }

    function handleUpdate() {
        const data = validateForm();
        if (!data) return;

        const tenants = AUTH.getTenants();
        const apts    = AUTH.getApartments();
        const idx     = tenants.findIndex(t => t.id === editingId);
        if (idx === -1) { cancelEdit(); return; }

        const old = tenants[idx];

        // If room changed, update old room → vacant, new room → occupied
        if (old.room !== data.room || old.apartment !== data.aptId) {
            const oldApt = apts.find(a => a.id === old.apartment);
            if (oldApt?.rooms) {
                const ri = oldApt.rooms.findIndex(r => r.number === old.room);
                if (ri > -1) { oldApt.rooms[ri].status = 'vacant'; oldApt.availableRooms++; }
            }
            const newApt = apts.find(a => a.id === data.aptId);
            if (newApt?.rooms) {
                const ri = newApt.rooms.findIndex(r => r.number === data.room);
                if (ri > -1) { newApt.rooms[ri].status = 'occupied'; newApt.availableRooms = Math.max(0, newApt.availableRooms - 1); }
            }
            AUTH.saveApartments(apts.map(a => {
                if (a.id === old.apartment) return oldApt;
                if (a.id === data.aptId)   return newApt;
                return a;
            }));
        }

        tenants[idx] = {
            ...old,
            name:      data.name,
            phone:     data.phone,
            email:     $('form-email')?.value.trim() || old.email,
            password:  data.password,
            apartment: data.aptId,
            room:      data.room,
            rent:      data.rent,
            water:     parseFloat($('form-water')?.value) || 0,
            other:     parseFloat($('form-other')?.value) || 0,
            moveIn:    data.movein,
        };

        AUTH.saveTenants(tenants);
        cancelEdit();
        renderTenantList();
        renderStats();
        showToast(`✓ ${tenants[idx].name} updated`);
    }

    function cancelEdit() {
        editingId = null;
        resetForm();
        if ($('submit-btn'))     $('submit-btn').textContent    = 'Add Tenant';
        if ($('form-title'))     $('form-title').textContent    = 'Tenant Details';
        if ($('cancel-edit-btn'))$('cancel-edit-btn').style.display = 'none';
        if ($('form-apartment')) $('form-apartment').disabled   = !isAdmin;
        populateApartmentDropdown();
        clearErrors();
    }

    // ── DELETE TENANT ─────────────────────────────────────────────────────────
    function deleteTenant(id) {
        const tenants = AUTH.getTenants();
        const tenant  = tenants.find(t => t.id === id);
        if (!tenant) return;

        // Show inline confirm on the card instead of browser confirm()
        const card = document.querySelector(`.tenant-card[data-id="${id}"]`);
        if (!card) return;

        const existing = card.querySelector('.delete-confirm');
        if (existing) { existing.remove(); return; }

        const confirm = document.createElement('div');
        confirm.className = 'delete-confirm';
        confirm.innerHTML = `
            <span>Remove ${tenant.name.split(' ')[0]}?</span>
            <button class="dc-yes" data-id="${id}">Yes, Remove</button>
            <button class="dc-no">Cancel</button>`;

        card.appendChild(confirm);

        confirm.querySelector('.dc-yes').addEventListener('click', () => {
            // Free the room
            const apts = AUTH.getApartments();
            const apt  = apts.find(a => a.id === tenant.apartment);
            if (apt?.rooms) {
                const ri = apt.rooms.findIndex(r => r.number === tenant.room);
                if (ri > -1) { apt.rooms[ri].status = 'vacant'; apt.availableRooms++; }
                AUTH.saveApartments(apts.map(a => a.id === apt.id ? apt : a));
            }

            AUTH.saveTenants(tenants.filter(t => t.id !== id));
            renderTenantList();
            renderStats();
            showToast(`${tenant.name} removed.`);
        });

        confirm.querySelector('.dc-no').addEventListener('click', () => confirm.remove());
    }

    // ── GENERATE PASSWORD ─────────────────────────────────────────────────────
    if ($('gen-password-btn')) {
        $('gen-password-btn').addEventListener('click', () => {
            const pw = genPassword();
            if ($('form-password')) {
                $('form-password').value = pw;
                $('form-password').type  = 'text';
                setTimeout(() => { if ($('form-password')) $('form-password').type = 'password'; }, 2500);
                showToast(`Password set: ${pw} (visible for 2.5s)`);
            }
        });
    }

    // ── RESET FORM ────────────────────────────────────────────────────────────
    function resetForm() {
        const form = $('tenant-form');
        if (!form) return;
        form.reset();
        if (!isAdmin && myApartment) {
            if ($('form-apartment')) {
                $('form-apartment').value    = myApartment;
                $('form-apartment').disabled = true;
            }
            updateRoomDropdown(myApartment);
        }
        clearErrors();
    }

    // ── RENDER STATS ──────────────────────────────────────────────────────────
    function renderStats() {
        const tenants = getMyTenants();
        const apts    = AUTH.getApartments();

        // For landlord, only their apartment; for admin, all
        const myApts = isAdmin ? apts : apts.filter(a => a.id === myApartment);
        const totalRooms    = myApts.reduce((s, a) => s + a.totalRooms, 0);
        const occupiedRooms = myApts.reduce((s, a) => s + (a.totalRooms - a.availableRooms), 0);
        const vacantRooms   = myApts.reduce((s, a) => s + a.availableRooms, 0);
        const monthlyRev    = tenants.filter(t => t.status !== 'deleted')
                                     .reduce((s, t) => s + (t.rent || 0), 0);

        animateCount('stat-total',    totalRooms);
        animateCount('stat-occupied', occupiedRooms);
        animateCount('stat-vacant',   vacantRooms);
        animateCount('stat-tenants',  tenants.length);
        if ($('stat-revenue')) $('stat-revenue').textContent = fmt(monthlyRev);
    }

    function animateCount(id, target, ms = 900) {
        const el = $(id);
        if (!el) return;
        const start = performance.now();
        const run = now => {
            const p    = Math.min((now - start) / ms, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(ease * target);
            if (p < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
    }

    // ── GET TENANTS (scoped to landlord or all) ───────────────────────────────
    function getMyTenants() {
        const all = AUTH.getTenants();
        if (isAdmin) return all;
        return all.filter(t => t.apartment === myApartment);
    }

    // ── RENDER TENANT CARDS ───────────────────────────────────────────────────
    function renderTenantList() {
        const container = $('tenant-list');
        const counter   = $('tenant-count');
        if (!container) return;

        const apts = AUTH.getApartments();
        let tenants = getMyTenants();

        // Apply search
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            tenants = tenants.filter(t =>
                t.name.toLowerCase().includes(q)     ||
                t.phone.includes(q)                  ||
                t.room.toLowerCase().includes(q)     ||
                (t.apartment && apts.find(a => a.id === t.apartment)?.name.toLowerCase().includes(q))
            );
        }

        // Apply status filter
        if (filterStatus !== 'all') {
            tenants = tenants.filter(t => (t.status || 'active') === filterStatus);
        }

        if (counter) counter.textContent = `${tenants.length} tenant${tenants.length !== 1 ? 's' : ''}`;

        if (tenants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="es-icon">🏠</div>
                    <p>${searchTerm ? 'No tenants match your search.' : 'No tenants registered yet. Use the form to add one.'}</p>
                </div>`;
            return;
        }

        container.innerHTML = tenants.map((t, i) => {
            const apt       = apts.find(a => a.id === t.apartment);
            const aptName   = apt ? apt.name : t.apartment;
            const statusCls = t.status === 'pending' ? 'pending' : 'active';
            const statusLbl = t.status === 'pending' ? 'Pending' : 'Active';

            return `
            <div class="tenant-card" data-id="${t.id}" style="animation-delay:${i * 0.05}s">
                <div class="tc-left">
                    <div class="tc-avatar">${initials(t.name)}</div>
                    <div class="tc-info">
                        <div class="tc-name">${t.name}</div>
                        <div class="tc-meta">
                            <span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1 19.79 19.79 0 0 1 1.61 4.5 2 2 0 0 1 3.6 2.32h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.9a16 16 0 0 0 6.08 6.08l.95-.95a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 17z"/></svg>
                                ${t.phone}
                            </span>
                            <span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                                ${aptName}
                            </span>
                            <span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>
                                Room ${t.room}
                            </span>
                            <span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                                Move-in: ${fmtDate(t.moveIn)}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="tc-right">
                    <div class="tc-rent">
                        <div class="tr-amount">${fmt(t.rent)}</div>
                        <div class="tr-label">/ month</div>
                    </div>
                    <div class="tc-badges">
                        <span class="status-badge ${statusCls}">${statusLbl}</span>
                    </div>
                    <div class="tc-actions">
                        <button class="ta-btn edit-btn" data-id="${t.id}" title="Edit tenant">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="ta-btn delete-btn" data-id="${t.id}" title="Remove tenant">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Wire card buttons
        qsa('.edit-btn',   container).forEach(btn => btn.addEventListener('click', () => startEdit(btn.dataset.id)));
        qsa('.delete-btn', container).forEach(btn => btn.addEventListener('click', () => deleteTenant(btn.dataset.id)));
    }

    // ── SEARCH & FILTER ───────────────────────────────────────────────────────
    if ($('search-input')) {
        $('search-input').addEventListener('input', e => {
            searchTerm = e.target.value.trim();
            renderTenantList();
        });
    }

    qsa('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            qsa('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterStatus = btn.dataset.filter;
            renderTenantList();
        });
    });

    // ── PASSWORD VISIBILITY ───────────────────────────────────────────────────
    if ($('toggle-pw-btn')) {
        $('toggle-pw-btn').addEventListener('click', () => {
            const inp  = $('form-password');
            const show = inp.type === 'password';
            inp.type   = show ? 'text' : 'password';
            $('toggle-pw-btn').innerHTML = show
                ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        });
    }

    // ── FORM SUBMIT ───────────────────────────────────────────────────────────
    if ($('tenant-form')) {
        $('tenant-form').addEventListener('submit', handleSubmit);
    }

    // Cancel edit button
    if ($('cancel-edit-btn')) {
        $('cancel-edit-btn').addEventListener('click', cancelEdit);
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────────
    if ($('logout-btn')) {
        $('logout-btn').addEventListener('click', () => {
            AUTH.clearSession();
            window.location.href = 'login.html';
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    function init() {
        populateApartmentDropdown();
        renderTenantList();
        renderStats();

        // Set today as default move-in
        if ($('form-movein')) {
            $('form-movein').value = new Date().toISOString().split('T')[0];
        }
    }

    init();

})();