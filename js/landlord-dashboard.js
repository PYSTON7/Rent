/**
 * landlord-dashboard.js — P-rent Landlord Dashboard
 * Requires: auth-data.js, notifications.js
 *
 * Features:
 *  - Tenant list with search/filter
 *  - Pending approval queue (approve / reject)
 *  - Room occupancy map
 *  - Water bill entry per tenant + bulk setter
 *  - Revenue summary card
 *  - Notification panel
 *  - Rent reminder broadcast
 */

(() => {
    'use strict';

    const session = AUTH.requireRole('landlord', 'superadmin');
    if (!session) return;

    AUTH.seed();
    NOTIF.seedDemo();

    // ── CONTEXT ───────────────────────────────────────────────────────────────
    const isAdmin     = session.role === 'superadmin';
    const myAptId     = isAdmin ? null : session.apartment;

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qsa = (s, r = document) => [...r.querySelectorAll(s)];
    const fmt = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' }) : '—';

    function showToast(msg, type = 'success') {
        const t = $('toast');
        t.textContent = msg;
        t.className = `toast show ${type}`;
        clearTimeout(t._t);
        t._t = setTimeout(() => t.className = 'toast', 3200);
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

    function getMyTenants() {
        const all = AUTH.getTenants();
        return isAdmin ? all : all.filter(t => t.apartment === myAptId);
    }

    function getMyApt() {
        return AUTH.getApartments().find(a => a.id === (isAdmin ? AUTH.getApartments()[0]?.id : myAptId));
    }

    // ── HEADER ────────────────────────────────────────────────────────────────
    function populateHeader() {
        const initials = session.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
        $('nav-avatar').textContent = initials;
        $('nav-name').textContent   = session.name.split(' ')[0];
        $('ll-name').textContent    = session.name.split(' ')[0];

        const now = new Date();
        const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        $('dash-date').textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

        const apt = getMyApt();
        $('apt-chip').textContent = apt ? `🏢 ${apt.name}` : '🏢 All Properties';
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    function renderStats() {
        const tenants = getMyTenants();
        const apt     = getMyApt();

        const active  = tenants.filter(t => t.status === 'active' || !t.status);
        const pending = tenants.filter(t => t.status === 'pending');
        const revenue = active.reduce((s, t) => s + (t.rent || 0), 0);

        // Simulate: tenant is 'overdue' if status is active and no payment this month
        // In production you'd check the tx history; here we use a flag
        const overdue = active.filter(t => t.overdue).length;
        const paidCount = active.filter(t => t.paidThisMonth).length;

        const totalRooms = apt ? apt.totalRooms    : 0;
        const vacantRooms= apt ? apt.availableRooms: 0;
        const occupied   = totalRooms - vacantRooms;
        const pct        = totalRooms > 0 ? Math.round(occupied / totalRooms * 100) : 0;

        $('st-revenue').textContent  = fmt(revenue);
        $('st-paid').textContent     = paidCount;
        $('st-overdue').textContent  = overdue;
        $('st-occupancy').textContent= pct + '%';
        $('st-occ-sub').textContent  = `${occupied} of ${totalRooms} rooms filled`;
        $('st-pending').textContent  = pending.length;

        // Summary card
        if ($('rc-apt-name')) $('rc-apt-name').textContent = apt ? apt.name : 'All Apartments';
        if ($('rc-revenue'))  $('rc-revenue').textContent  = fmt(revenue);
        if ($('rc-total'))    $('rc-total').textContent    = totalRooms;
        if ($('rc-occupied')) $('rc-occupied').textContent = occupied;
        if ($('rc-vacant'))   $('rc-vacant').textContent   = vacantRooms;
        if ($('rc-pending'))  $('rc-pending').textContent  = pending.length;

        if ($('pending-badge')) $('pending-badge').textContent = pending.length;
    }

    // ── TENANT TABLE ──────────────────────────────────────────────────────────
    let tenantSearch = '';
    let tenantFilter = 'all';

    function renderTenantTable() {
        const tbody = $('tenant-tbody');
        if (!tbody) return;

        let tenants = getMyTenants().filter(t => t.status !== 'pending');
        const q = tenantSearch.toLowerCase();
        if (q) tenants = tenants.filter(t => t.name.toLowerCase().includes(q) || t.phone.includes(q) || t.room.toLowerCase().includes(q));
        if (tenantFilter === 'active')  tenants = tenants.filter(t => !t.overdue);
        if (tenantFilter === 'overdue') tenants = tenants.filter(t => t.overdue);

        if (tenants.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No tenants found.</td></tr>`;
            return;
        }

        tbody.innerHTML = tenants.map(t => {
            const statusCls = t.overdue ? 'overdue' : (t.paidThisMonth ? 'active' : '');
            const statusLbl = t.overdue ? 'Overdue' : (t.paidThisMonth ? 'Paid' : 'Active');
            const total = (t.rent || 0) + (t.water || 0) + (t.other || 0);
            return `
            <tr>
                <td>
                    <div style="font-weight:500;color:var(--paper)">${t.name}</div>
                    <div style="font-size:0.72rem;color:var(--muted)">${t.phone}</div>
                </td>
                <td><span class="badge">${t.room}</span></td>
                <td>${fmt(t.rent)}</td>
                <td>${fmt(t.water)}</td>
                <td><span class="badge ${statusCls}">${statusLbl}</span></td>
                <td>
                    <div class="tbl-actions">
                        <button class="tbl-btn water" onclick="LandlordDash.openWaterModal('${t.id}')">💧 Water</button>
                        <button class="tbl-btn receipt" onclick="LandlordDash.viewReceipt('${t.id}')">Receipt</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    $('tenant-search')?.addEventListener('input', e => { tenantSearch = e.target.value; renderTenantTable(); });
    qsa('[data-tf]').forEach(btn => btn.addEventListener('click', () => {
        qsa('[data-tf]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tenantFilter = btn.dataset.tf;
        renderTenantTable();
    }));

    // ── PENDING APPROVALS ─────────────────────────────────────────────────────
    function renderPending() {
        const pending = getMyTenants().filter(t => t.status === 'pending');
        const apts    = AUTH.getApartments();

        // Full tab
        const fullEl = $('pending-list');
        // Sidebar panel
        const sideEl = $('pending-sidebar');

        const buildItem = (t) => {
            const apt = apts.find(a => a.id === t.apartment);
            return `
            <div class="pending-item" id="pi-${t.id}">
                <div class="pi-name">${t.name}</div>
                <div class="pi-meta">📞 ${t.phone} &nbsp;·&nbsp; Room ${t.room} &nbsp;·&nbsp; ${apt ? apt.name : t.apartment} &nbsp;·&nbsp; ${fmtDate(t.moveIn)}</div>
                <div class="pi-btns">
                    <button class="pi-approve" onclick="LandlordDash.approveTenant('${t.id}')">✓ Approve</button>
                    <button class="pi-reject"  onclick="LandlordDash.rejectTenant('${t.id}')">✕ Reject</button>
                </div>
            </div>`;
        };

        if (fullEl) {
            fullEl.innerHTML = pending.length === 0
                ? `<div class="no-pending">No pending approvals.</div>`
                : pending.map(buildItem).join('');
        }

        if (sideEl) {
            sideEl.innerHTML = pending.length === 0
                ? `<div class="no-pending">All caught up! ✓</div>`
                : pending.slice(0, 3).map(buildItem).join('');
        }
    }

    function approveTenant(id) {
        const tenants = AUTH.getTenants();
        const idx     = tenants.findIndex(t => t.id === id);
        if (idx === -1) return;
        const tenant = tenants[idx];
        tenants[idx].status = 'active';
        AUTH.saveTenants(tenants);

        NOTIF.onTenantApproved({ tenantId: id, tenantName: tenant.name });
        document.getElementById('pi-' + id)?.remove();
        renderAll();
        showToast(`✓ ${tenant.name} approved.`);
    }

    function rejectTenant(id) {
        const tenants = AUTH.getTenants();
        const tenant  = tenants.find(t => t.id === id);
        if (!tenant) return;

        openModal(`
            <h3>Reject Registration</h3>
            <p>Remove ${tenant.name}'s pending registration? This frees their room.</p>
            <div class="mbtn-row">
                <button class="mprimary" style="background:linear-gradient(135deg,#c0392b,#922b21);color:#fff"
                    onclick="LandlordDash._confirmReject('${id}')">Yes, Reject</button>
                <button class="mghost" onclick="LandlordDash.closeModal()">Cancel</button>
            </div>`);
    }

    function _confirmReject(id) {
        const tenants = AUTH.getTenants();
        const tenant  = tenants.find(t => t.id === id);
        if (!tenant) { closeModal(); return; }

        // Free the room
        const apts = AUTH.getApartments();
        const apt  = apts.find(a => a.id === tenant.apartment);
        if (apt?.rooms) {
            const ri = apt.rooms.findIndex(r => r.number === tenant.room);
            if (ri > -1) { apt.rooms[ri].status = 'vacant'; apt.availableRooms++; }
            AUTH.saveApartments(apts.map(a => a.id === apt.id ? apt : a));
        }

        AUTH.saveTenants(tenants.filter(t => t.id !== id));
        NOTIF.onTenantRejected({ tenantId: id, tenantName: tenant.name });
        closeModal();
        renderAll();
        showToast(`${tenant.name} rejected.`, 'error');
    }

    // ── ROOM MAP ──────────────────────────────────────────────────────────────
    function renderRoomMap() {
        const grid = $('room-grid');
        if (!grid) return;

        const apt = getMyApt();
        if (!apt?.rooms) { grid.innerHTML = `<p style="color:var(--muted2);font-size:0.83rem">No room data configured.</p>`; return; }

        const tenants = getMyTenants();

        grid.innerHTML = apt.rooms.map(r => {
            const tenant = tenants.find(t => t.room === r.number && (t.status === 'active' || !t.status));
            const cls    = r.status === 'vacant' ? 'vacant' : 'occupied';
            const lbl    = r.status === 'vacant' ? 'Vacant' : 'Occupied';
            return `
            <div class="room-cell ${cls}" onclick="LandlordDash.roomDetail('${r.number}')"
                title="${tenant ? tenant.name : 'Vacant'}">
                <div class="rc-num">${r.number}</div>
                <div class="rc-status">${lbl}</div>
                ${tenant ? `<div style="font-size:0.6rem;color:var(--muted);margin-top:0.15rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:68px">${tenant.name.split(' ')[0]}</div>` : ''}
            </div>`;
        }).join('');
    }

    function roomDetail(roomNum) {
        const apt     = getMyApt();
        const room    = apt?.rooms?.find(r => r.number === roomNum);
        const tenants = getMyTenants();
        const tenant  = tenants.find(t => t.room === roomNum && (t.status === 'active' || !t.status));

        if (!room) return;

        openModal(room.status === 'vacant'
            ? `<h3>Room ${roomNum}</h3><p style="color:var(--success)">✓ This room is vacant and available.</p>
               <div class="mbtn-row"><a href="add-tenant.html" class="mprimary" style="text-align:center;text-decoration:none">Add Tenant to This Room</a><button class="mghost" onclick="LandlordDash.closeModal()">Close</button></div>`
            : `<h3>Room ${roomNum}</h3>
               <p style="color:var(--muted)">Occupied by ${tenant?.name || 'Unknown'}</p>
               ${tenant ? `
               <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:1rem;margin-bottom:1.25rem;display:flex;flex-direction:column;gap:0.45rem;font-size:0.83rem;">
                   <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Name</span><span>${tenant.name}</span></div>
                   <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Phone</span><span>${tenant.phone}</span></div>
                   <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Monthly Rent</span><span style="color:var(--gold-lt)">${fmt(tenant.rent)}</span></div>
                   <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Water Bill</span><span>${fmt(tenant.water)}</span></div>
                   <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Move-in</span><span>${fmtDate(tenant.moveIn)}</span></div>
               </div>` : ''}
               <div class="mbtn-row">
                   ${tenant ? `<button class="mprimary" onclick="LandlordDash.openWaterModal('${tenant?.id}');LandlordDash.closeModal()">Set Water Bill</button>` : ''}
                   <button class="mghost" onclick="LandlordDash.closeModal()">Close</button>
               </div>`
        );
    }

    // ── WATER BILLS ───────────────────────────────────────────────────────────
    function renderWaterTable() {
        const tbody = $('water-tbody');
        if (!tbody) return;

        const tenants = getMyTenants().filter(t => t.status === 'active' || !t.status);

        if (tenants.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No active tenants.</td></tr>`;
            return;
        }

        tbody.innerHTML = tenants.map(t => `
            <tr>
                <td><strong style="color:var(--paper)">${t.name}</strong></td>
                <td><span class="badge">${t.room}</span></td>
                <td id="wt-water-${t.id}" style="color:var(--info)">${fmt(t.water)}</td>
                <td>${fmt(t.rent)}</td>
                <td style="font-weight:500">${fmt((t.rent||0)+(t.water||0)+(t.other||0))}</td>
                <td>
                    <button class="tbl-btn water" onclick="LandlordDash.openWaterModal('${t.id}')">Edit</button>
                </td>
            </tr>`).join('');
    }

    function openWaterModal(tenantId) {
        const tenants = AUTH.getTenants();
        const t = tenants.find(x => x.id === tenantId);
        if (!t) return;

        openModal(`
            <h3>💧 Water Bill</h3>
            <p>Set the water bill for <strong style="color:var(--paper)">${t.name}</strong> — Room ${t.room}</p>
            <div class="mfield">
                <label>Water Bill Amount (KES)</label>
                <input type="number" id="wm-amount" value="${t.water || ''}" placeholder="e.g. 850" min="0"/>
            </div>
            <div class="mfield">
                <label>Other Charges (KES)</label>
                <input type="number" id="wm-other" value="${t.other || ''}" placeholder="e.g. 0" min="0"/>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:0.85rem 1rem;margin-bottom:0.5rem;font-size:0.82rem;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem"><span style="color:var(--muted)">Rent</span><span>${fmt(t.rent)}</span></div>
                <div style="display:flex;justify-content:space-between;padding-top:0.4rem;border-top:1px solid rgba(255,255,255,0.07);font-weight:600"><span style="color:var(--paper)">New Total</span><span id="wm-total" style="color:var(--gold-lt)">${fmt((t.rent||0)+(t.water||0)+(t.other||0))}</span></div>
            </div>
            <div class="mbtn-row">
                <button class="mprimary" onclick="LandlordDash._saveWater('${t.id}')">Save Water Bill</button>
                <button class="mghost"   onclick="LandlordDash.closeModal()">Cancel</button>
            </div>`);

        // Live total
        const update = () => {
            const w = parseFloat($('wm-amount')?.value) || 0;
            const o = parseFloat($('wm-other')?.value)  || 0;
            if ($('wm-total')) $('wm-total').textContent = fmt((t.rent||0) + w + o);
        };
        $('wm-amount')?.addEventListener('input', update);
        $('wm-other')?.addEventListener('input',  update);
    }

    function _saveWater(tenantId) {
        const water = parseFloat($('wm-amount')?.value) || 0;
        const other = parseFloat($('wm-other')?.value)  || 0;
        if (water < 0 || other < 0) { showToast('Amounts cannot be negative.', 'error'); return; }

        const tenants = AUTH.getTenants();
        const idx = tenants.findIndex(t => t.id === tenantId);
        if (idx === -1) { closeModal(); return; }

        const old = tenants[idx];
        tenants[idx] = { ...old, water, other };
        AUTH.saveTenants(tenants);

        NOTIF.onWaterBillSet({ tenantId, tenantName: old.name, amount: water });
        closeModal();
        renderAll();
        showToast(`💧 Water bill updated for ${old.name}.`);
    }

    function openBulkWater() {
        const tenants = getMyTenants().filter(t => t.status === 'active' || !t.status);
        if (tenants.length === 0) { showToast('No active tenants.', 'error'); return; }

        openModal(`
            <h3>💧 Bulk Water Bills</h3>
            <p>Set the same water bill for all active tenants at once.</p>
            <div class="mfield">
                <label>Water Bill Amount (KES) — applied to all</label>
                <input type="number" id="bulk-water-amount" placeholder="e.g. 850" min="0"/>
            </div>
            <div class="mbtn-row">
                <button class="mprimary" onclick="LandlordDash._saveBulkWater()">Apply to All Tenants</button>
                <button class="mghost" onclick="LandlordDash.closeModal()">Cancel</button>
            </div>`);
    }

    function _saveBulkWater() {
        const amount = parseFloat($('bulk-water-amount')?.value);
        if (isNaN(amount) || amount < 0) { showToast('Enter a valid amount.', 'error'); return; }

        const tenants = AUTH.getTenants();
        const myIds   = new Set(getMyTenants().filter(t => t.status === 'active' || !t.status).map(t => t.id));

        let count = 0;
        tenants.forEach((t, i) => {
            if (myIds.has(t.id)) {
                tenants[i].water = amount;
                NOTIF.onWaterBillSet({ tenantId: t.id, tenantName: t.name, amount });
                count++;
            }
        });

        AUTH.saveTenants(tenants);
        closeModal();
        renderAll();
        showToast(`💧 Water bill of ${fmt(amount)} set for ${count} tenants.`);
    }

    // ── RENT REMINDERS ────────────────────────────────────────────────────────
    function sendRentReminders() {
        const active = getMyTenants().filter(t => t.status === 'active' || !t.status);
        if (active.length === 0) { showToast('No active tenants.', 'error'); return; }
        NOTIF.sendRentReminders(active);
        showToast(`🔔 Rent reminders sent to ${active.length} tenants.`);
        renderNotifications();
    }

    // ── RECEIPTS ──────────────────────────────────────────────────────────────
    function viewReceipt(tenantId) {
        const tenant = AUTH.getTenants().find(t => t.id === tenantId);
        if (!tenant) return;
        // Store tenant id and navigate to receipt page
        sessionStorage.setItem('prent_receipt_tenant', tenantId);
        window.location.href = 'receipt.html';
    }

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    function renderNotifications() {
        const panel  = $('notif-list');
        const dot    = $('notif-dot');
        if (!panel) return;

        const unread = NOTIF.unreadCount(session);
        if (dot) dot.classList.toggle('show', unread > 0);
        panel.innerHTML = NOTIF.renderList(session);

        // Mark read on click
        panel.querySelectorAll('.np-item[data-id]').forEach(el => {
            el.addEventListener('click', () => {
                NOTIF.markRead(el.dataset.id);
                el.classList.remove('unread');
                renderNotifications();
            });
        });
    }

    $('notif-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        $('notif-panel')?.classList.toggle('open');
    });

    document.addEventListener('click', e => {
        if (!$('notif-panel')?.contains(e.target) && e.target !== $('notif-btn')) {
            $('notif-panel')?.classList.remove('open');
        }
    });

    $('notif-clear')?.addEventListener('click', () => {
        NOTIF.markAllRead(session);
        renderNotifications();
    });

    window.addEventListener('prent:notification', () => renderNotifications());

    // ── TABS ──────────────────────────────────────────────────────────────────
    qsa('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            qsa('.tab-btn').forEach(b => b.classList.remove('active'));
            qsa('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('pane-' + btn.dataset.tab)?.classList.add('active');
        });
    });

    // ── MODAL CLOSE ───────────────────────────────────────────────────────────
    $('modal-close')?.addEventListener('click', closeModal);
    $('modal-overlay')?.addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

   // ── LOGOUT ────────────────────────────────────────────────────────────────
// ── LOGOUT SYSTEM ──────────────────────────────────────────────────────────

function initLogout() {
    // Event delegation handling the class name instead of an ID
    document.addEventListener('click', function(e) {
        const logoutBtn = e.target.closest('.logout-btn'); // Changed '#' to '.'
        
        if (logoutBtn) {
            e.preventDefault();
            doLogout();
        }
    });
}

function doLogout() {
    console.log("Logout initiated...");
    
    // Safeguard against AUTH object errors
    try {
        if (typeof AUTH !== 'undefined' && typeof AUTH.clearSession === 'function') {
            AUTH.clearSession();
        } else {
            console.warn("AUTH.clearSession not found. Clearing standard storage.");
            localStorage.clear();
            sessionStorage.clear();
        }
    } catch (err) {
        console.error("Error during session clearance:", err);
    }

    // Force redirect to login page
    window.location.replace('login.html');
}

// Ensure the code runs even if script tags are misplaced
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogout);
} else {
    initLogout();
}


    // ── BULK WATER BUTTON ─────────────────────────────────────────────────────
    $('bulk-water-btn')?.addEventListener('click', openBulkWater);

    // ── APARTMENT PHOTOS ──────────────────────────────────────────────────────
    function openAptPhotos() {
        if (typeof AptPhotos === 'undefined') {
            showToast('Photo manager not loaded. Add apt-photos.js to the page.', 'error');
            return;
        }
        const apt = getMyApt();
        if (!apt) { showToast('No apartment found.', 'error'); return; }
        AptPhotos.openPhotoModal(apt.id, apt.name, document.body);
    }

    // Inject a "Manage Photos" button into the panel head after render
    function injectPhotoButton() {
        if (document.getElementById('manage-photos-btn')) return;
        const panelHead = document.querySelector('.panel-head');
        if (!panelHead) return;

        const btn = document.createElement('button');
        btn.id = 'manage-photos-btn';
        btn.innerHTML = '📸 Apartment Photos';
        btn.style.cssText = [
            'display:inline-flex', 'align-items:center', 'gap:0.4rem',
            'padding:0.45rem 0.95rem',
            'background:rgba(184,134,11,0.12)',
            'border:1px solid rgba(184,134,11,0.25)',
            'border-radius:7px', 'color:var(--gold-lt)',
            'font-family:var(--ff-s)', 'font-size:0.78rem', 'font-weight:500',
            'cursor:pointer', 'transition:all 0.25s ease',
        ].join(';');
        btn.addEventListener('mouseover', () => { btn.style.background = 'var(--gold)'; btn.style.color = '#0b0c0a'; });
        btn.addEventListener('mouseout',  () => { btn.style.background = 'rgba(184,134,11,0.12)'; btn.style.color = 'var(--gold-lt)'; });
        btn.addEventListener('click', openAptPhotos);
        panelHead.appendChild(btn);
    }

    // ── RENDER ALL ────────────────────────────────────────────────────────────
    function renderAll() {
        renderStats();
        renderTenantTable();
        renderPending();
        renderRoomMap();
        renderWaterTable();
        renderNotifications();
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────────
    window.LandlordDash = {
        closeModal,
        approveTenant,
        rejectTenant,
        _confirmReject,
        openWaterModal,
        _saveWater,
        openBulkWater,
        _saveBulkWater,
        roomDetail,
        viewReceipt,
        sendRentReminders,
        openAptPhotos,
    };

    // ── INIT ──────────────────────────────────────────────────────────────────
    populateHeader();
    renderAll();
    injectPhotoButton();
    initLogout();  // must come AFTER renderAll so DOM is ready

})();