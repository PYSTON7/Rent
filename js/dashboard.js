/**
 * dashboard.js — P-rent Tenant Dashboard
 * Requires: auth-data.js, notifications.js
 *
 * Features:
 *  - Session guard (redirects to login if not a tenant)
 *  - Full profile & balance population
 *  - Apartment photo display (reads photos saved by landlord)
 *  - Payment history with filter + search
 *  - M-Pesa STK Push simulation
 *  - Visa / Mastercard card payment simulation
 *  - Account statement download
 *  - Upcoming dues tracker
 *  - Notification bell with unread count
 *  - User dropdown + logout (navbar + sidebar logout section)
 */

(() => {
    'use strict';

    // ── GUARD ─────────────────────────────────────────────────────────────────
    const session = AUTH.requireRole('tenant');
    if (!session) return;

    AUTH.seed();
    if (typeof NOTIF !== 'undefined') NOTIF.seedDemo();

    // ── CONSTANTS ─────────────────────────────────────────────────────────────
    const HISTORY_KEY = 'prent_tx_history';

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
    const fmt = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
    const fmtDate = iso => !iso ? '—' : new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

    function genRef(prefix) {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
        let r = prefix;
        for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
        return r;
    }

    function todayISO() { return new Date().toISOString().split('T')[0]; }

    // ── STATE ─────────────────────────────────────────────────────────────────
    let tenant    = {};
    let history   = [];
    let balance   = {};
    let txFilter  = 'all';
    let txSearch  = '';
    let activeMethod = 'mpesa';

    // ── LOAD DATA ─────────────────────────────────────────────────────────────
    function loadData() {
        // Tenant profile — written by auth-data.js on login
        const stored = localStorage.getItem('prent_current_tenant');
        if (stored) {
            try { tenant = JSON.parse(stored); } catch (_) {}
        }
        // Fallback: find from tenants store
        if (!tenant || !tenant.id) {
            tenant = AUTH.getTenants().find(t => t.id === session.id) || {};
        }

        // Payment history
        const own    = JSON.parse(localStorage.getItem(`prent_tx_${tenant.id}`) || '[]');
        const shared = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const seen   = new Set();
        history = [...own, ...shared].filter(tx => {
            if (seen.has(tx.id)) return false;
            seen.add(tx.id);
            return true;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Seed demo history if none
        if (history.length === 0) {
            history = [
                { id:'TX001', date:'2026-05-01', desc:'Rent – May 2026',  method:'mpesa',      ref:'QJZ1234ABC', status:'paid',    amount: tenant.rent  || 10000 },
                { id:'TX002', date:'2026-05-03', desc:'Water – May',      method:'mpesa',      ref:'QJZ5678DEF', status:'paid',    amount: tenant.water || 850   },
                { id:'TX003', date:'2026-04-01', desc:'Rent – Apr 2026',  method:'visa',       ref:'VX-9982341', status:'paid',    amount: tenant.rent  || 10000 },
                { id:'TX004', date:'2026-04-04', desc:'Water – Apr',      method:'mastercard', ref:'MC-4412209', status:'paid',    amount: tenant.water || 720   },
                { id:'TX005', date:'2026-06-01', desc:'Rent – Jun 2026',  method:'mpesa',      ref:'—',          status:'pending', amount: tenant.rent  || 10000 },
            ];
            localStorage.setItem(`prent_tx_${tenant.id}`, JSON.stringify(history));
        }

        // Balance
        const paidThisMonth = calcPaidThisMonth();
        balance = {
            rent:  tenant.rent  || 0,
            water: tenant.water || 0,
            other: tenant.other || 0,
            paid:  paidThisMonth,
        };
    }

    function saveHistory() {
        localStorage.setItem(`prent_tx_${tenant.id}`, JSON.stringify(history));
    }

    function calcPaidThisMonth() {
        const ym = todayISO().slice(0, 7);
        return history
            .filter(tx => tx.status === 'paid' && tx.date.startsWith(ym))
            .reduce((s, tx) => s + tx.amount, 0);
    }

    // ── POPULATE HEADER / GREETING ────────────────────────────────────────────
    function populateHeader() {
        const initials = (tenant.name || 'TN').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const firstName = (tenant.name || 'Tenant').split(' ')[0];

        if ($('nav-avatar'))     $('nav-avatar').textContent     = initials;
        if ($('nav-name'))       $('nav-name').textContent       = firstName;
        if ($('greeting-name'))  $('greeting-name').textContent  = firstName;

        // User dropdown header
        if ($('ud-name')) $('ud-name').textContent = tenant.name || '—';
        const apt = AUTH.getApartments().find(a => a.id === tenant.apartment);
        if ($('ud-apt')) $('ud-apt').textContent = apt ? `${apt.name} · Room ${tenant.room}` : '';

        // Logout section
        if ($('ls-avatar')) $('ls-avatar').textContent = initials;
        if ($('ls-name'))   $('ls-name').textContent   = tenant.name || '—';
        if ($('ls-apt'))    $('ls-apt').textContent    = apt ? `${apt.name} · Room ${tenant.room}` : '';

        // Date
        const now = new Date();
        const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        if ($('dash-date')) $('dash-date').textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    }

    // ── POPULATE APARTMENT PHOTO + INFO ───────────────────────────────────────
    function populateApartmentCard() {
        const apts  = AUTH.getApartments();
        const apt   = apts.find(a => a.id === tenant.apartment);
        if (!apt) return;

        if ($('apt-name'))     $('apt-name').textContent     = apt.name;
        if ($('apt-location')) $('apt-location').textContent = apt.location;
        if ($('apt-room'))     $('apt-room').textContent     = `Room ${tenant.room}`;
        if ($('ip-apt'))       $('ip-apt').textContent       = apt.name;
        if ($('ip-room'))      $('ip-room').textContent      = `Room ${tenant.room}`;
        if ($('ip-phone'))     $('ip-phone').textContent     = tenant.phone || '—';
        if ($('ip-movein'))    $('ip-movein').textContent    = fmtDate(tenant.moveIn);

        // Photo — landlord stores photos under key `prent_apt_photos_${apt.id}`
        const photoWrap = $('apt-photo-wrap');
        if (!photoWrap) return;

        const photoData = getApartmentPhoto(apt.id);
        if (photoData) {
            photoWrap.innerHTML = `<img class="apt-photo" src="${photoData}" alt="${apt.name}" onerror="this.parentNode.innerHTML='<div class=apt-photo-placeholder><span>${apt.icon||'🏢'}</span></div>'"/>`;
        } else {
            photoWrap.innerHTML = `
                <div class="apt-photo-placeholder">
                    <span>${apt.icon || '🏢'}</span>
                </div>`;
        }
    }

    // Read photo saved by landlord
    function getApartmentPhoto(aptId) {
        try {
            const key  = `prent_apt_photos_${aptId}`;
            const data = JSON.parse(localStorage.getItem(key) || 'null');
            return data ? data.primary : null;
        } catch (_) { return null; }
    }

    // ── POPULATE BALANCE ──────────────────────────────────────────────────────
    function populateBalance() {
        const total = balance.rent + balance.water + balance.other;
        const due   = Math.max(0, total - balance.paid);
        const paidYTD = history.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0);

        // Stat cards
        if ($('sc-balance'))  $('sc-balance').textContent  = fmt(due);
        if ($('sc-paid'))     $('sc-paid').textContent     = fmt(paidYTD);
        if ($('sc-water'))    $('sc-water').textContent    = fmt(balance.water);

        const nextFirst = new Date();
        nextFirst.setDate(1);
        nextFirst.setMonth(nextFirst.getMonth() + 1);
        const mLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        if ($('sc-due-date')) $('sc-due-date').textContent = `${nextFirst.getDate()} ${mLabels[nextFirst.getMonth()]}`;

        // Balance card
        const bcAmt = $('bc-amount');
        if (bcAmt) {
            bcAmt.textContent = fmt(due);
            bcAmt.className   = 'bc-amount ' + (due === 0 ? 'clear' : 'owed');
        }
        if ($('bc-sub'))  $('bc-sub').textContent  = due === 0 ? "You're all clear! 🎉" : 'Outstanding this month';
        if ($('bc-rent')) $('bc-rent').textContent = fmt(balance.rent);
        if ($('bc-water'))$('bc-water').textContent= fmt(balance.water);
        if ($('bc-other'))$('bc-other').textContent= fmt(balance.other);
        if ($('bc-paid')) $('bc-paid').textContent = fmt(balance.paid);
        if ($('bc-due'))  $('bc-due').textContent  = fmt(due);

        // Payment summary
        if ($('ps-rent'))  $('ps-rent').textContent  = fmt(balance.rent);
        if ($('ps-water')) $('ps-water').textContent = fmt(balance.water);
        if ($('ps-other')) $('ps-other').textContent = fmt(balance.other);
        if ($('ps-total')) $('ps-total').textContent = fmt(due > 0 ? due : total);

        // Pre-fill amounts
        ['mpesa-amount','visa-amount','mc-amount'].forEach(id => {
            const el = $(id); if (el) el.value = due > 0 ? due : total;
        });
        if ($('mpesa-phone')) $('mpesa-phone').value = (tenant.phone || '').replace(/\s/g, '');
    }

    // ── UPCOMING DUES ─────────────────────────────────────────────────────────
    function populateDues() {
        const list = $('dues-list');
        if (!list) return;
        const now  = new Date();
        const ML   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const cur  = ML[now.getMonth()];
        const nxt  = ML[(now.getMonth() + 1) % 12];
        const yr   = now.getFullYear();

        const dues = [
            { name: `Rent – ${cur} ${yr}`,      date: `Due 1 ${cur}`,  amount: balance.rent,  cls: balance.paid >= balance.rent ? 'ok' : 'overdue' },
            { name: `Water – ${cur} ${yr}`,      date: `Due 5 ${cur}`,  amount: balance.water, cls: balance.paid >= balance.rent + balance.water ? 'ok' : 'soon' },
            { name: `Rent – ${nxt} ${yr}`,       date: `Due 1 ${nxt}`,  amount: balance.rent,  cls: 'ok' },
        ];

        list.innerHTML = dues.map(d => `
            <div class="due-item ${d.cls !== 'ok' ? d.cls : ''}">
                <div>
                    <div class="di-name">${d.name}</div>
                    <div class="di-date">${d.date}</div>
                </div>
                <div class="di-amt ${d.cls}">${fmt(d.amount)}</div>
            </div>`).join('');
    }

    // ── TRANSACTION TABLE ─────────────────────────────────────────────────────
    function renderHistory() {
        const tbody = $('tx-tbody');
        const empty = $('tx-empty');
        if (!tbody) return;

        const q = txSearch.toLowerCase();
        const filtered = history.filter(tx => {
            const mf = txFilter === 'all' || tx.status === txFilter;
            const ms = !q || tx.ref.toLowerCase().includes(q) || tx.desc.toLowerCase().includes(q) || String(tx.amount).includes(q);
            return mf && ms;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = filtered.map(tx => `
            <tr>
                <td style="white-space:nowrap;color:var(--muted)">${fmtDate(tx.date)}</td>
                <td style="font-weight:500;color:var(--paper)">${tx.desc}</td>
                <td><span class="method-badge ${tx.method || 'cash'}">${(tx.method || 'cash').charAt(0).toUpperCase() + (tx.method || 'cash').slice(1)}</span></td>
                <td><span class="tx-ref">${tx.ref}</span></td>
                <td><span class="tx-status ${tx.status}">${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}</span></td>
                <td class="tx-amount" style="font-weight:600;">${fmt(tx.amount)}</td>
            </tr>`).join('');
    }

    // ── TABS ──────────────────────────────────────────────────────────────────
    function initTabs() {
        qsa('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                qsa('.tab-btn').forEach(b => b.classList.remove('active'));
                qsa('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const pane = $('tab-' + btn.dataset.tab);
                if (pane) pane.classList.add('active');
                if (btn.dataset.tab === 'statement') renderStatement();
            });
        });

        qsa('.txf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                qsa('.txf-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                txFilter = btn.dataset.txf;
                renderHistory();
            });
        });

        const txSearchEl = $('tx-search');
        if (txSearchEl) txSearchEl.addEventListener('input', e => { txSearch = e.target.value.trim(); renderHistory(); });
    }

    // ── PAYMENT METHOD SWITCHER ───────────────────────────────────────────────
    function initMethodSwitcher() {
        qsa('.pay-card').forEach(card => {
            card.addEventListener('click', () => {
                qsa('.pay-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                activeMethod = card.dataset.method;
                qsa('.pay-fields').forEach(f => f.classList.remove('active'));
                const pf = $('fields-' + activeMethod);
                if (pf) pf.classList.add('active');
            });
        });
    }

    // ── TOAST / MODAL ─────────────────────────────────────────────────────────
    function showToast(msg, type = 'ok') {
        const t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = `toast show ${type}`;
        clearTimeout(t._t);
        t._t = setTimeout(() => t.className = 'toast', 3200);
    }

    function openModal(html) {
        $('modal-content').innerHTML = html;
        $('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        $('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── RECORD PAYMENT ────────────────────────────────────────────────────────
    function recordPayment({ method, amount, ref, desc, status }) {
        const tx = {
            id:     'TX' + Date.now(),
            date:   todayISO(),
            desc,
            method,
            ref,
            status,
            amount: Number(amount),
        };
        history.unshift(tx);
        saveHistory();

        if (status === 'paid') {
            balance.paid += Number(amount);
            // Update tenant record
            const tenants = AUTH.getTenants();
            const idx = tenants.findIndex(t => t.id === tenant.id);
            if (idx > -1) {
                tenants[idx].paidThisMonth = true;
                AUTH.saveTenants(tenants);
            }
            if (typeof NOTIF !== 'undefined') {
                NOTIF.onPaymentReceived({ tenantId: tenant.id, tenantName: tenant.name, amount, landlordId: tenant.landlordId });
            }
        }

        populateBalance();
        populateDues();
        renderHistory();
        return tx;
    }

    // ── CARD FORMATTERS ───────────────────────────────────────────────────────
    function fmtCard(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 16);
        e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    }
    function fmtExpiry(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
        e.target.value = v;
    }

    // ── MPESA STK PUSH (SIMULATION) ──────────────────────────────────────────
    function handleMpesa() {
        const phone  = ($('mpesa-phone')?.value || '').trim();
        const amount = $('mpesa-amount')?.value;
        const forVal = $('mpesa-for')?.value || 'rent';
        if (!phone || !/^(07|01)\d{8}$/.test(phone.replace(/\s/g, ''))) { showToast('Enter a valid phone number.', 'err'); return; }
        if (!amount || Number(amount) < 1) { showToast('Enter a valid amount.', 'err'); return; }

        const descs = { rent: 'Rent Payment', water: 'Water Bill', both: 'Rent + Water' };
        const desc  = descs[forVal] || 'Payment';

        openModal(`
            <h3>M-Pesa STK Push</h3>
            <p>A payment prompt has been sent to <strong style="color:var(--paper)">${phone}</strong></p>
            <div style="text-align:center;padding:0.5rem 0 1rem">
                <div class="stk-spinner"></div>
                <div style="font-size:0.82rem;color:var(--muted)">Waiting for PIN confirmation on your phone…<br><strong style="color:var(--gold-lt)">${fmt(amount)}</strong></div>
            </div>`);

        setTimeout(() => {
            const ok = Math.random() > 0.08;
            if (ok) {
                const ref = genRef('QJZ');
                recordPayment({ method:'mpesa', amount, ref, desc: `${desc} – ${new Date().toLocaleString('default',{month:'long',year:'numeric'})}`, status:'paid' });
                $('modal-content').innerHTML = `
                    <div class="modal-result">
                        <div class="mr-icon">✅</div>
                        <div class="mr-title">Payment Confirmed</div>
                        <div class="mr-sub">${fmt(amount)} received via M-Pesa</div>
                        <div class="mr-ref">${ref}</div>
                    </div>
                    <button class="modal-btn" onclick="Dash.closeModal()">Done</button>`;
                showToast('✓ M-Pesa payment confirmed!');
            } else {
                $('modal-content').innerHTML = `
                    <div class="modal-result">
                        <div class="mr-icon">❌</div>
                        <div class="mr-title">Payment Failed</div>
                        <div class="mr-sub">Request timed out or was cancelled.</div>
                    </div>
                    <button class="modal-btn" style="background:var(--danger);color:#fff" onclick="Dash.closeModal()">Close</button>`;
                showToast('M-Pesa failed. Try again.', 'err');
            }
        }, 4000);
    }

    // ── CARD PAYMENT (SIMULATION) ─────────────────────────────────────────────
    function handleCard(type) {
        const p = type === 'visa' ? 'visa' : 'mc';
        const name   = ($(p + '-name')?.value   || '').trim();
        const number = ($(p + '-number')?.value || '').replace(/\s/g, '');
        const expiry = ($(p + '-expiry')?.value  || '').trim();
        const cvv    = ($(p + '-cvv')?.value     || '').trim();
        const amount = $(p + '-amount')?.value;

        if (!name)                              { showToast('Enter cardholder name.', 'err');    return; }
        if (!/^\d{13,16}$/.test(number))        { showToast('Enter a valid card number.', 'err'); return; }
        if (!/^\d{2}\s*\/\s*\d{2,4}$/.test(expiry)){ showToast('Enter a valid expiry.', 'err');  return; }
        if (cvv.length < 3)                     { showToast('Enter a valid CVV.', 'err');         return; }
        if (!amount || Number(amount) < 1)      { showToast('Enter a valid amount.', 'err');      return; }

        openModal(`
            <h3>Processing ${type === 'visa' ? 'Visa' : 'Mastercard'}</h3>
            <p>Authorising your card ending ${number.slice(-4)}…</p>
            <div style="text-align:center;padding:0.5rem 0 1rem">
                <div class="stk-spinner"></div>
                <div style="font-size:0.82rem;color:var(--muted)">Please wait…</div>
            </div>`);

        setTimeout(() => {
            const ok  = Math.random() > 0.07;
            const ref = genRef(type === 'visa' ? 'VX-' : 'MC-');
            if (ok) {
                recordPayment({ method: type, amount, ref, desc: `Rent Payment – ${new Date().toLocaleString('default',{month:'long',year:'numeric'})}`, status:'paid' });
                $('modal-content').innerHTML = `
                    <div class="modal-result">
                        <div class="mr-icon">✅</div>
                        <div class="mr-title">Payment Approved</div>
                        <div class="mr-sub">${fmt(amount)} charged to ${type === 'visa' ? 'Visa' : 'Mastercard'} •••• ${number.slice(-4)}</div>
                        <div class="mr-ref">${ref}</div>
                    </div>
                    <button class="modal-btn" onclick="Dash.closeModal()">Done</button>`;
                showToast(`✓ ${type === 'visa' ? 'Visa' : 'Mastercard'} approved!`);
            } else {
                $('modal-content').innerHTML = `
                    <div class="modal-result">
                        <div class="mr-icon">❌</div>
                        <div class="mr-title">Card Declined</div>
                        <div class="mr-sub">Please check your card details and try again.</div>
                    </div>
                    <button class="modal-btn" style="background:var(--danger);color:#fff" onclick="Dash.closeModal()">Close</button>`;
                showToast('Card declined. Try again.', 'err');
            }
        }, 2800);
    }

    // ── STATEMENT ─────────────────────────────────────────────────────────────
    function renderStatement() {
        const apt   = AUTH.getApartments().find(a => a.id === tenant.apartment);
        const total = history.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
        const stmtHeader = $('stmt-header');
        const stmtBody   = $('stmt-body');
        if (stmtHeader) stmtHeader.textContent = `${tenant.name} · Room ${tenant.room}`;
        if (!stmtBody) return;

        stmtBody.innerHTML = `
            <div style="margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border)">
                <strong style="color:var(--paper)">${apt ? apt.name : '—'}</strong> · Room ${tenant.room}<br>
                Move-in: ${fmtDate(tenant.moveIn)} &nbsp;|&nbsp; Rent: ${fmt(tenant.rent)}<br>
                Generated: ${fmtDate(todayISO())}
            </div>
            ${[...history].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(tx=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.82rem;">
                <div>
                    <span style="color:var(--paper);font-weight:500">${tx.desc}</span>
                    <span style="margin-left:0.6rem;font-size:0.7rem;color:var(--muted)">${fmtDate(tx.date)} · ${tx.method} · ${tx.ref}</span>
                </div>
                <span style="font-weight:600;color:${tx.status==='paid'?'var(--success)':tx.status==='pending'?'var(--warning)':'var(--danger)'}">${fmt(tx.amount)}</span>
            </div>`).join('')}
            <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600;color:var(--paper)">
                <span>Total Paid</span><span style="color:var(--success)">${fmt(total)}</span>
            </div>`;
    }

    // Statement download
    window.Dash = window.Dash || {};
    window.Dash.downloadStatement = function () {
        const apt   = AUTH.getApartments().find(a => a.id === tenant.apartment);
        const total = history.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
        const rows  = [...history].sort((a,b)=>new Date(b.date)-new Date(a.date))
            .map(tx => `${fmtDate(tx.date).padEnd(16)} ${tx.desc.padEnd(30)} ${tx.method.padEnd(13)} ${tx.ref.padEnd(17)} ${tx.status.padEnd(9)} ${tx.amount.toLocaleString('en-KE')}`);
        const lines = [
            'P-RENT ACCOUNT STATEMENT', '='.repeat(96),
            `Tenant:    ${tenant.name}`, `Apartment: ${apt ? apt.name : '—'} – Room ${tenant.room}`,
            `Phone:     ${tenant.phone || '—'}`, `Generated: ${fmtDate(todayISO())}`, '',
            'DATE            DESCRIPTION                   METHOD        REF               STATUS    AMOUNT (KES)',
            '-'.repeat(96), ...rows, '-'.repeat(96),
            `${''.padEnd(82)} TOTAL PAID   ${total.toLocaleString('en-KE')}`, '',
            'P-rent Apartment Management System',
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `prent-statement-${todayISO()}.txt` }).click();
        URL.revokeObjectURL(url);
        showToast('Statement downloaded.');
    };

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    function renderNotifications() {
        if (typeof NOTIF === 'undefined') return;
        const list = $('notif-list');
        const dot  = $('notif-dot');
        if (!list) return;

        const unread = NOTIF.unreadCount(session);
        if (dot) dot.classList.toggle('show', unread > 0);
        list.innerHTML = NOTIF.renderList(session) || '<div class="np-empty">No notifications.</div>';

        qsa('.np-item[data-id]', list).forEach(el => {
            el.addEventListener('click', () => {
                NOTIF.markRead(el.dataset.id);
                el.classList.remove('unread');
                renderNotifications();
            });
        });
    }

    function initNotifications() {
        const btn   = $('notif-btn');
        const panel = $('notif-panel');
        if (!btn || !panel) return;

        btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
        });
        $('notif-clear')?.addEventListener('click', () => { NOTIF.markAllRead(session); renderNotifications(); });
        window.addEventListener('prent:notification', renderNotifications);
    }

    // ── USER DROPDOWN ─────────────────────────────────────────────────────────
    function initUserDropdown() {
        const pill     = $('user-pill');
        const dropdown = $('user-dropdown');
        if (!pill || !dropdown) return;

        pill.addEventListener('click', e => {
            e.stopPropagation();
            pill.classList.toggle('open');
            dropdown.classList.toggle('open');
        });
        document.addEventListener('click', () => {
            pill.classList.remove('open');
            dropdown.classList.remove('open');
        });
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────────
    function handleLogout() {
        AUTH.clearSession();
        window.location.replace('login.html');
    }

    function initLogout() {
        // Navbar dropdown logout
        $('ud-logout-btn')?.addEventListener('click', handleLogout);
        // Sidebar logout section
        $('logout-btn')?.addEventListener('click', handleLogout);
    }

    // ── MODAL CLOSE ───────────────────────────────────────────────────────────
    $('modal-close')?.addEventListener('click', closeModal);
    $('modal-overlay')?.addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    window.Dash.closeModal = closeModal;

    // ── PAYMENT BUTTONS ───────────────────────────────────────────────────────
    function initPaymentButtons() {
        $('btn-mpesa')?.addEventListener('click', handleMpesa);
        $('btn-visa')?.addEventListener('click',  () => handleCard('visa'));
        $('btn-mc')?.addEventListener('click',    () => handleCard('mastercard'));

        // Card formatters
        ['visa-number','mc-number'].forEach(id => $(id)?.addEventListener('input', fmtCard));
        ['visa-expiry','mc-expiry'].forEach(id => $(id)?.addEventListener('input', fmtExpiry));
        ['visa-cvv','mc-cvv'].forEach(id => $(id)?.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,3); }));
        $('mpesa-phone')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^\d+]/g,''); });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    loadData();
    populateHeader();
    populateApartmentCard();
    populateBalance();
    populateDues();
    renderHistory();
    renderNotifications();
    initTabs();
    initMethodSwitcher();
    initPaymentButtons();
    initUserDropdown();
    initNotifications();
    initLogout();

    // Reload apartment photo if updated by landlord in another tab
    window.addEventListener('storage', e => {
        if (e.key && e.key.startsWith('prent_apt_photos_')) populateApartmentCard();
    });

})();