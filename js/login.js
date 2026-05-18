/**
 * login.js — P-rent Login Handler  v2
 * Requires: auth-data.js loaded first
 *
 * Changes vs v1:
 *  - Every DOM reference is guarded (no null crashes)
 *  - Handles AUTH.authenticate returning { error:'pending' }
 *  - Redirect guard: if already logged in, uses replace() to avoid loop
 *  - Submit wired with a fallback selector if id="submit-btn" is absent
 *  - IIFE uses function() not arrow so early return works cleanly
 */

(function () {
    'use strict';

    // ── Safety net ────────────────────────────────────────────────────────────
    if (typeof AUTH === 'undefined') {
        console.error('P-rent: auth-data.js must load before login.js');
        return;
    }

    // ── Already logged in → go home, don't stay on login page ─────────────────
    const existing = AUTH.getSession();
    if (existing) {
        AUTH.redirectAfterLogin(existing);
        return; // halt this script while redirect is processing
    }

    AUTH.seed();

    // ── STATE ─────────────────────────────────────────────────────────────────
    let currentRole = 'tenant';

    // ── SAFE DOM GETTER ───────────────────────────────────────────────────────
    const el = id => document.getElementById(id);

    // ── DOM REFS ──────────────────────────────────────────────────────────────
    const formTitle  = el('form-title');
    const formSub    = el('form-sub');
    const errorMsg   = el('error-msg');
    let   submitBtn  = el('submit-btn');

    // Fallback: find any submit-like button if the id is different
    if (!submitBtn) {
        submitBtn = document.querySelector('button[type="submit"]')
                 || document.querySelector('.submit-btn')
                 || document.querySelector('.login-btn');
    }

    const sections = {
        tenant:     el('section-tenant'),
        landlord:   el('section-landlord'),
        superadmin: el('section-superadmin'),
    };

    const tenantAptSel   = el('t-apartment');
    const landlordAptSel = el('l-apartment');

    // ── ROLE META ─────────────────────────────────────────────────────────────
    const ROLE_META = {
        tenant:     { title: 'Tenant Login',       sub: 'Enter your registered phone number and password.'         },
        landlord:   { title: 'Landlord Login',      sub: 'Sign in with your phone or email to manage your apartment.' },
        superadmin: { title: 'Administrator Login', sub: 'Platform owner access only.'                             },
    };

    // ── APARTMENT DROPDOWNS ───────────────────────────────────────────────────
    function populateAptDropdowns() {
        const apts = AUTH.getApartments();
        const ph   = '<option value="">— Select your apartment —</option>';
        const opts = apts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        if (tenantAptSel)   tenantAptSel.innerHTML   = ph + opts;
        if (landlordAptSel) landlordAptSel.innerHTML = ph + opts;
    }

    // ── SWITCH ROLE ───────────────────────────────────────────────────────────
    function switchRole(role) {
        currentRole = role;

        // Tabs
        document.querySelectorAll('.rtab').forEach(t =>
            t.classList.toggle('active', t.dataset.role === role)
        );
        // Left panel cards
        document.querySelectorAll('.role-card').forEach(c =>
            c.classList.toggle('active', c.dataset.sync === role)
        );
        // Sections
        Object.entries(sections).forEach(([r, secEl]) => {
            if (secEl) secEl.style.display = r === role ? 'block' : 'none';
        });
        // Heading
        const meta = ROLE_META[role] || {};
        if (formTitle) formTitle.textContent = meta.title || '';
        if (formSub)   formSub.textContent   = meta.sub   || '';

        clearError();
        clearFieldErrors();
    }

    // ── WIRE TABS & CARDS ─────────────────────────────────────────────────────
    document.querySelectorAll('.rtab').forEach(tab =>
        tab.addEventListener('click', () => switchRole(tab.dataset.role))
    );
    document.querySelectorAll('.role-card').forEach(card =>
        card.addEventListener('click', () => switchRole(card.dataset.sync))
    );

    // ── PASSWORD TOGGLE ───────────────────────────────────────────────────────
    document.querySelectorAll('.pw-eye').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = el(btn.dataset.target);
            if (!inp) return;
            const show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.innerHTML = show
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        });
    });

    // ── SHAKE ANIMATION ───────────────────────────────────────────────────────
    const shakeCSS = document.createElement('style');
    shakeCSS.textContent = `@keyframes prentShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`;
    document.head.appendChild(shakeCSS);

    // ── ERROR HELPERS ─────────────────────────────────────────────────────────
    function showError(msg) {
        if (errorMsg) { errorMsg.textContent = msg; errorMsg.classList.add('show'); }
        if (submitBtn) {
            submitBtn.style.animation = 'none';
            requestAnimationFrame(() => { submitBtn.style.animation = 'prentShake 0.4s ease'; });
        }
    }

    function clearError() {
        if (errorMsg) { errorMsg.textContent = ''; errorMsg.classList.remove('show'); }
    }

    function markField(id, isError) {
        const f = el(id);
        if (!f) return;
        f.classList.toggle('err', isError);
        if (isError) f.addEventListener('input', () => f.classList.remove('err'), { once: true });
    }

    function clearFieldErrors() {
        document.querySelectorAll('.field input, .field select').forEach(f => f.classList.remove('err'));
    }

    // ── LOADING STATE ─────────────────────────────────────────────────────────
    function setLoading(on) {
        if (!submitBtn) return;
        submitBtn.disabled = on;
        submitBtn.classList.toggle('loading', on);
        submitBtn.innerHTML = on ? '<span class="spin"></span>Verifying…' : 'Sign In';
    }

    // ── PHONE UTILS ───────────────────────────────────────────────────────────
    function normalisePhone(raw) {
        let p = (raw || '').replace(/[\s\-\(\)]/g, '');
        if (p.startsWith('+254')) p = '0' + p.slice(4);
        if (p.startsWith('254'))  p = '0' + p.slice(3);
        return p;
    }

    function isValidPhone(p) { return /^(07|01)\d{8}$/.test(p); }

    // ── BUILD PAYLOAD ─────────────────────────────────────────────────────────
    function getPayload() {
        clearError();
        clearFieldErrors();

        if (currentRole === 'tenant') {
            const phone     = normalisePhone(el('t-phone')?.value || '');
            const apartment = el('t-apartment')?.value || '';
            const password  = el('t-password')?.value  || '';
            let valid = true;
            if (!isValidPhone(phone)) { markField('t-phone',     true); valid = false; }
            if (!apartment)           { markField('t-apartment',  true); valid = false; }
            if (!password)            { markField('t-password',   true); valid = false; }
            if (!valid) { showError('Please fill in all fields correctly.'); return null; }
            return { role: 'tenant', identifier: phone, password, apartment };
        }

        if (currentRole === 'landlord') {
            const identifier = (el('l-identifier')?.value || '').trim();
            const apartment  = el('l-apartment')?.value  || '';
            const password   = el('l-password')?.value   || '';
            let valid = true;
            if (!identifier) { markField('l-identifier', true); valid = false; }
            if (!apartment)  { markField('l-apartment',  true); valid = false; }
            if (!password)   { markField('l-password',   true); valid = false; }
            if (!valid) { showError('Please fill in all fields correctly.'); return null; }
            const normId = identifier.includes('@') ? identifier : normalisePhone(identifier);
            return { role: 'landlord', identifier: normId, password, apartment };
        }

        if (currentRole === 'superadmin') {
            const username = (el('sa-username')?.value || '').trim();
            const password = el('sa-password')?.value || '';
            let valid = true;
            if (!username) { markField('sa-username', true); valid = false; }
            if (!password) { markField('sa-password', true); valid = false; }
            if (!valid) { showError('Please enter your admin credentials.'); return null; }
            return { role: 'superadmin', identifier: username, password, apartment: null };
        }

        return null;
    }

    // ── SUBMIT ────────────────────────────────────────────────────────────────
    function handleSubmit(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();

        const payload = getPayload();
        if (!payload) return;

        setLoading(true);

        // Brief delay so loading state is visible (also prevents double-submit)
        setTimeout(() => {
            const result = AUTH.authenticate(payload);

            // ── Pending tenant ─────────────────────────────────────────────
            if (result && result.error === 'pending') {
                setLoading(false);
                showError(`Hi ${result.name} — your account is awaiting landlord approval. Please check back soon.`);
                return;
            }

            // ── Wrong credentials ──────────────────────────────────────────
            if (!result) {
                setLoading(false);
                const msgs = {
                    tenant:     'Phone number, apartment, or password is incorrect.',
                    landlord:   'Credentials not recognised for the selected apartment.',
                    superadmin: 'Invalid admin username or password.',
                };
                showError(msgs[currentRole] || 'Login failed. Please try again.');
                markField({ tenant:'t-password', landlord:'l-password', superadmin:'sa-password' }[currentRole], true);
                return;
            }

            // ── Success ────────────────────────────────────────────────────
            AUTH.redirectAfterLogin(result);

        }, 500);
    }

    // ── WIRE EVENTS ───────────────────────────────────────────────────────────
    if (submitBtn) {
        submitBtn.addEventListener('click', handleSubmit);
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSubmit(e);
    });

    document.querySelectorAll('.field input, .field select').forEach(f => {
        f.addEventListener('input',  clearError);
        f.addEventListener('change', clearError);
    });

    // Phone blur normalise
    const tPhone = el('t-phone');
    if (tPhone) {
        tPhone.addEventListener('blur', () => {
            if (tPhone.value) tPhone.value = normalisePhone(tPhone.value);
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    populateAptDropdowns();
    switchRole('tenant');

}());
