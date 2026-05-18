/**
 * receipt.js — P-rent Receipt / Invoice Page
 * Requires: auth-data.js
 *
 * Accessible by:
 *   tenant   — sees their own receipts (loaded from session)
 *   landlord — sees a tenant-selector dropdown
 *   superadmin — sees all tenants
 *
 * Data source:
 *   Payment history from localStorage key 'prent_tx_history'
 *   Tenant info from AUTH.getTenants()
 */

(() => {
    'use strict';

    const session = AUTH.requireRole('tenant', 'landlord', 'superadmin');
    if (!session) return;

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const fmt = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }) : '—';
    const months  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function genReceiptNum(tenantId, period) {
        const hash = (tenantId + period).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return 'REC-' + String(hash).padStart(6, '0');
    }

    // ── LOAD PAYMENT HISTORY ──────────────────────────────────────────────────
    function getHistory(tenantId) {
        // Each tenant has their own history key, or a shared one for demo
        const key  = `prent_tx_history_${tenantId}`;
        const shared = JSON.parse(localStorage.getItem('prent_tx_history') || '[]');
        const own    = JSON.parse(localStorage.getItem(key) || '[]');

        // Combine and filter to this tenant
        const all = [...own, ...shared];
        // De-dupe by id
        const seen = new Set();
        return all.filter(tx => {
            if (seen.has(tx.id)) return false;
            seen.add(tx.id);
            return true;
        }).sort((a,b) => new Date(b.date) - new Date(a.date));
    }

    // ── BUILD PERIODS (last 6 months) ─────────────────────────────────────────
    function buildPeriods() {
        const now = new Date();
        const periods = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            periods.push({
                label: `${months[d.getMonth()]} ${d.getFullYear()}`,
                value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
            });
        }
        return periods;
    }

    // ── POPULATE DROPDOWNS ────────────────────────────────────────────────────
    let currentTenantId = null;
    let currentPeriod   = null;

    function populateControls() {
        const periods = buildPeriods();

        // Period select
        const periodSel = $('period-select');
        if (periodSel) {
            periodSel.innerHTML = periods.map(p =>
                `<option value="${p.value}">${p.label}</option>`
            ).join('');
            currentPeriod = periods[0].value;
        }

        // Tenant select
        const tenantSel = $('tenant-select');
        const controlsBar = $('controls-bar');

        if (session.role === 'tenant') {
            // Tenant sees only themselves
            currentTenantId = session.id;
            if (controlsBar) controlsBar.style.display = 'none';
            // Back to dashboard
            const backBtn = $('back-btn');
            if (backBtn) backBtn.href = 'dashboard.html';
        } else {
            // Landlord / admin — show tenant dropdown
            if (backBtn) $('back-btn').href = 'landlord-dashboard.html';
            const tenants = getMyTenants();
            if (tenantSel) {
                tenantSel.innerHTML = tenants.length === 0
                    ? '<option value="">No tenants</option>'
                    : tenants.map(t => `<option value="${t.id}">${t.name} — Rm ${t.room}</option>`).join('');
                currentTenantId = tenants[0]?.id || null;
            }
        }

        // Wire events
        tenantSel?.addEventListener('change', e => { currentTenantId = e.target.value; renderReceipt(); });
        periodSel?.addEventListener('change', e => { currentPeriod = e.target.value;   renderReceipt(); });
    }

    function getMyTenants() {
        const all = AUTH.getTenants();
        if (session.role === 'superadmin') return all;
        return all.filter(t => t.apartment === session.apartment);
    }

    // ── RENDER RECEIPT ────────────────────────────────────────────────────────
    function renderReceipt() {
        if (!currentTenantId || !currentPeriod) return;

        const tenant  = AUTH.getTenants().find(t => t.id === currentTenantId);
        if (!tenant) { showEmpty(); return; }

        const apts    = AUTH.getApartments();
        const apt     = apts.find(a => a.id === tenant.apartment);
        const history = getHistory(currentTenantId);

        // Period label
        const [y, m] = currentPeriod.split('-');
        const periodLabel = `${months[parseInt(m)-1]} ${y}`;

        // Filter transactions to this period
        const periodTx = history.filter(tx => tx.date?.startsWith(currentPeriod) && tx.status === 'paid');

        const totalPaid = periodTx.reduce((s, tx) => s + (tx.amount || 0), 0);
        const totalDue  = (tenant.rent || 0) + (tenant.water || 0) + (tenant.other || 0);
        const balance   = totalDue - totalPaid;
        const isPaid    = balance <= 0;

        // Receipt number
        const recNum = genReceiptNum(currentTenantId, currentPeriod);
        $('receipt-num').textContent = recNum;

        // Status
        const statusEl = $('receipt-status');
        statusEl.className = `rh-status ${isPaid ? 'paid' : 'pending'}`;
        statusEl.textContent = isPaid ? '● Paid' : '● Balance Due';

        // Parties
        $('r-tenant-name').textContent    = tenant.name;
        $('r-tenant-detail').innerHTML    = `${tenant.phone}<br>Room ${tenant.room}${tenant.email ? '<br>'+tenant.email : ''}`;
        $('r-apt-name').textContent       = apt ? apt.name : tenant.apartment;
        $('r-apt-detail').innerHTML       = apt ? `${apt.location}<br>${apt.county}` : '—';

        // Meta
        const now = new Date();
        const dueDate = new Date(parseInt(y), parseInt(m)-1, 5); // 5th of month
        $('r-issue-date').textContent = fmtDate(now.toISOString().split('T')[0]);
        $('r-due-date').textContent   = fmtDate(dueDate.toISOString().split('T')[0]);
        $('r-room').textContent       = `Room ${tenant.room}`;
        $('r-movein').textContent     = fmtDate(tenant.moveIn);

        // Line items
        const lines = [];
        if (tenant.rent  > 0) lines.push({ desc:'Monthly Rent',    period: periodLabel, amount: tenant.rent  });
        if (tenant.water > 0) lines.push({ desc:'Water Bill',       period: periodLabel, amount: tenant.water });
        if (tenant.other > 0) lines.push({ desc:'Other Charges',    period: periodLabel, amount: tenant.other });

        $('line-items-body').innerHTML = lines.length === 0
            ? `<div class="li-row"><span class="desc" style="color:var(--muted)">No charges for this period.</span><span></span><span></span></div>`
            : lines.map(l => `
                <div class="li-row">
                    <span class="desc">${l.desc}</span>
                    <span class="period">${l.period}</span>
                    <span class="amount">${fmt(l.amount)}</span>
                </div>`).join('');

        // Totals
        $('totals-block').innerHTML = `
            <div class="total-row"><span>Subtotal</span><span>${fmt(totalDue)}</span></div>
            <div class="total-row"><span>Amount Paid</span><span style="color:var(--success)">${fmt(totalPaid)}</span></div>
            <div class="total-row grand"><span>${isPaid ? 'Total Paid' : 'Balance Due'}</span><span>${fmt(isPaid ? totalPaid : balance)}</span></div>`;

        // Payment history
        renderTxHistory(periodTx, history.slice(0, 10));
    }

    function renderTxHistory(periodTx, allRecent) {
        const el = $('tx-history-list');
        if (!el) return;

        if (allRecent.length === 0) {
            el.innerHTML = `<div class="empty-box">No payment history recorded yet.</div>`;
            return;
        }

        el.innerHTML = allRecent.map(tx => `
            <div class="tx-item">
                <div class="tx-left">
                    <div class="tx-desc">
                        ${tx.desc || 'Payment'}
                        <span class="method-badge ${tx.method || 'cash'}">${(tx.method||'cash').toUpperCase()}</span>
                    </div>
                    <div class="tx-sub">${fmtDate(tx.date)} · Ref: ${tx.ref || '—'}</div>
                </div>
                <div class="tx-right">
                    <div class="tx-amt" style="color:${tx.status==='paid'?'var(--success)':tx.status==='pending'?'var(--warning)':'var(--danger)'}">
                        ${fmt(tx.amount)}
                    </div>
                    <div class="tx-ref">${tx.status?.toUpperCase() || 'PAID'}</div>
                </div>
            </div>`).join('');
    }

    function showEmpty() {
        $('receipt-wrap').innerHTML = `<div class="empty-box" style="padding:4rem 2rem">Select a tenant to view their receipt.</div>`;
        $('tx-history-list').innerHTML = '';
    }

    // ── DOWNLOAD TXT RECEIPT ──────────────────────────────────────────────────
    window.Receipt = {
        download() {
            const tenant = AUTH.getTenants().find(t => t.id === currentTenantId);
            if (!tenant) return;

            const [y, m] = currentPeriod.split('-');
            const periodLabel = `${months[parseInt(m)-1]} ${y}`;
            const apt   = AUTH.getApartments().find(a => a.id === tenant.apartment);
            const today = new Date().toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' });
            const totalDue = (tenant.rent||0)+(tenant.water||0)+(tenant.other||0);
            const history  = getHistory(currentTenantId);
            const paid     = history.filter(tx=>tx.date?.startsWith(currentPeriod)&&tx.status==='paid').reduce((s,tx)=>s+tx.amount,0);
            const balance  = Math.max(0, totalDue - paid);
            const recNum   = genReceiptNum(currentTenantId, currentPeriod);

            const lines = [
                'P-RENT PAYMENT RECEIPT',
                '='.repeat(50),
                `Receipt No:   ${recNum}`,
                `Date:         ${today}`,
                `Period:       ${periodLabel}`,
                '',
                'TENANT',
                '-'.repeat(30),
                `Name:         ${tenant.name}`,
                `Phone:        ${tenant.phone}`,
                `Room:         ${tenant.room}`,
                `Move-in:      ${fmtDate(tenant.moveIn)}`,
                '',
                'PROPERTY',
                '-'.repeat(30),
                `Apartment:    ${apt ? apt.name : tenant.apartment}`,
                `Location:     ${apt ? apt.location : '—'}`,
                '',
                'CHARGES',
                '-'.repeat(30),
                `Rent:         ${fmt(tenant.rent)}`,
                `Water Bill:   ${fmt(tenant.water)}`,
                `Other:        ${fmt(tenant.other)}`,
                '-'.repeat(30),
                `Total Due:    ${fmt(totalDue)}`,
                `Amount Paid:  ${fmt(paid)}`,
                `Balance:      ${fmt(balance)}`,
                '',
                '='.repeat(50),
                'P-rent Apartment Management System',
                'support@prent.co.ke',
            ];

            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), {
                href:     url,
                download: `receipt-${tenant.name.replace(/\s+/g,'-')}-${currentPeriod}.txt`,
            });
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    // ── INIT ──────────────────────────────────────────────────────────────────
    // Check if a specific tenant was passed via sessionStorage (from landlord receipt button)
    const storedTenantId = sessionStorage.getItem('prent_receipt_tenant');

    populateControls();

    if (storedTenantId) {
        currentTenantId = storedTenantId;
        const sel = $('tenant-select');
        if (sel) sel.value = storedTenantId;
        sessionStorage.removeItem('prent_receipt_tenant');
    }

    // Set back button
    const backBtn = $('back-btn');
    if (backBtn) {
        backBtn.href = session.role === 'tenant' ? 'dashboard.html' : 'landlord-dashboard.html';
    }

    renderReceipt();

})();