/**
 * js/login-firebase.js — P-rent Firebase Login Handler
 * type="module" ES module — replaces the inline <script> in login.html
 *
 * Imports Firebase signIn from firebase-auth.js.
 * Falls back to localStorage AUTH if Firebase is not configured yet.
 *
 * All HTML IDs used:
 *   Tabs:        .rtab[data-role]  .role-card[data-sync]
 *   Sections:    #section-tenant   #section-landlord   #section-superadmin
 *   Tenant:      #t-phone  #t-apartment  #t-password
 *   Landlord:    #l-identifier  #l-apartment  #l-password
 *   Admin:       #sa-username  #sa-password
 *   Shared:      #form-title  #form-sub  #error-msg  #submit-btn
 *   Eye toggles: .pw-eye[data-target]
 */

// ── FIREBASE IMPORT ───────────────────────────────────────────────────────────
// If firebase-auth.js is not set up yet, we fall back to localStorage AUTH.
// Remove the try/catch block once Firebase is fully configured.
let firebaseSignIn = null;

try {
    const mod = await import('./firebase-auth.js');
    firebaseSignIn = mod.signIn;
    console.log('[P-rent] Using Firebase authentication');
} catch (_) {
    console.warn('[P-rent] Firebase not configured — falling back to localStorage auth');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function goTo(page) {
    const base = window.location.pathname.substring(
        0, window.location.pathname.lastIndexOf('/') + 1
    );
    window.location.replace(base + page);
}

function redirectFor(role) {
    const map = {
        superadmin: 'admin.html',
        landlord:   'landlord-dashboard.html',
        tenant:     'dashboard.html',
    };
    return map[role] || 'login.html';
}

// ── ALREADY LOGGED IN? ────────────────────────────────────────────────────────
// Check both sessionStorage (Firebase flow) and localStorage (legacy flow)
const storedSession =
    JSON.parse(sessionStorage.getItem('prent_session') || 'null') ||
    (typeof AUTH !== 'undefined' ? AUTH.getSession() : null);

if (storedSession) {
    goTo(redirectFor(storedSession.role));
    throw new Error('Redirecting — stop script execution'); // halt module
}

// Seed localStorage data (no-op in Firebase mode)
if (typeof AUTH !== 'undefined') AUTH.seed();

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentRole = 'tenant';

// ── APARTMENT DROPDOWNS ───────────────────────────────────────────────────────
function populateApts() {
    // Get apartments from localStorage (seeded) or Firebase cache
    let apts = [];
    if (typeof AUTH !== 'undefined') {
        apts = AUTH.getApartments();
    }

    const ph   = '<option value="">— Select apartment —</option>';
    const opts = apts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const tSel = $('t-apartment');
    const lSel = $('l-apartment');
    if (tSel) tSel.innerHTML = ph + opts;
    if (lSel) lSel.innerHTML = ph + opts;
}

// ── ROLE META ─────────────────────────────────────────────────────────────────
const ROLE_META = {
    tenant:     { title: 'Tenant Login',       sub: 'Enter your registered phone number and password.'         },
    landlord:   { title: 'Landlord Login',      sub: 'Sign in with your phone or email to manage your apartment.' },
    superadmin: { title: 'Administrator Login', sub: 'Platform owner access only.'                             },
};

// ── SWITCH ROLE ───────────────────────────────────────────────────────────────
function switchRole(role) {
    currentRole = role;

    document.querySelectorAll('.rtab').forEach(t =>
        t.classList.toggle('active', t.dataset.role === role)
    );
    document.querySelectorAll('.role-card').forEach(c =>
        c.classList.toggle('active', c.dataset.sync === role)
    );

    ['tenant', 'landlord', 'superadmin'].forEach(r => {
        const s = $('section-' + r);
        if (s) s.style.display = r === role ? 'block' : 'none';
    });

    const meta = ROLE_META[role] || {};
    const titleEl = $('form-title');
    const subEl   = $('form-sub');
    if (titleEl) titleEl.textContent = meta.title || '';
    if (subEl)   subEl.textContent   = meta.sub   || '';

    clearError();
}

// Wire role tabs
document.querySelectorAll('.rtab').forEach(tab =>
    tab.addEventListener('click', () => switchRole(tab.dataset.role))
);
document.querySelectorAll('.role-card').forEach(card =>
    card.addEventListener('click', () => switchRole(card.dataset.sync))
);

// ── PASSWORD EYE TOGGLE ───────────────────────────────────────────────────────
document.querySelectorAll('.pw-eye').forEach(btn => {
    btn.addEventListener('click', () => {
        const inp = $(btn.dataset.target);
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = show
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                   <line x1="1" y1="1" x2="23" y2="23"/>
               </svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                   <circle cx="12" cy="12" r="3"/>
               </svg>`;
    });
});

// ── ERROR HELPERS ─────────────────────────────────────────────────────────────
function showError(msg) {
    const e   = $('error-msg');
    const btn = $('submit-btn');
    if (e) { e.textContent = msg; e.classList.add('show'); }
    if (btn) {
        btn.style.animation = 'none';
        requestAnimationFrame(() => { btn.style.animation = 'prentShake 0.4s ease'; });
    }
}

function clearError() {
    const e = $('error-msg');
    if (e) { e.textContent = ''; e.classList.remove('show'); }
}

function markErr(id, on) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('err', on);
    if (on) el.addEventListener('input', () => el.classList.remove('err'), { once: true });
}

// Clear errors on input
['t-phone','t-apartment','t-password',
 'l-identifier','l-apartment','l-password',
 'sa-username','sa-password'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', clearError);
});

// ── PHONE NORMALISE ───────────────────────────────────────────────────────────
function normPhone(raw) {
    let p = (raw || '').replace(/[\s\-\(\)]/g, '');
    if (p.startsWith('+254')) p = '0' + p.slice(4);
    if (p.startsWith('254'))  p = '0' + p.slice(3);
    return p;
}

function validPhone(p) { return /^(07|01)\d{8}$/.test(p); }

const tPhone = $('t-phone');
if (tPhone) {
    tPhone.addEventListener('blur', () => {
        if (tPhone.value) tPhone.value = normPhone(tPhone.value);
    });
}

// ── LOADING STATE ─────────────────────────────────────────────────────────────
function setLoading(on) {
    const btn = $('submit-btn');
    if (!btn) return;
    btn.disabled  = on;
    btn.innerHTML = on
        ? '<span class="spin"></span>Verifying…'
        : 'Sign In';
}

// ── BUILD PAYLOAD ─────────────────────────────────────────────────────────────
function getPayload() {
    clearError();

    // Clear all error classes
    ['t-phone','t-apartment','t-password',
     'l-identifier','l-apartment','l-password',
     'sa-username','sa-password'].forEach(id => {
        const el = $(id);
        if (el) el.classList.remove('err');
    });

    if (currentRole === 'tenant') {
        const phone = normPhone($('t-phone')?.value || '');
        const apt   = $('t-apartment')?.value || '';
        const pw    = $('t-password')?.value  || '';
        let ok = true;
        if (!validPhone(phone)) { markErr('t-phone',    true); ok = false; }
        if (!apt)               { markErr('t-apartment', true); ok = false; }
        if (!pw)                { markErr('t-password',  true); ok = false; }
        if (!ok) { showError('Please fill in all fields correctly.'); return null; }
        return { role: 'tenant', identifier: phone, password: pw, apartment: apt };
    }

    if (currentRole === 'landlord') {
        const id2  = ($('l-identifier')?.value || '').trim();
        const apt2 = $('l-apartment')?.value  || '';
        const pw2  = $('l-password')?.value   || '';
        let ok = true;
        if (!id2)  { markErr('l-identifier', true); ok = false; }
        if (!apt2) { markErr('l-apartment',  true); ok = false; }
        if (!pw2)  { markErr('l-password',   true); ok = false; }
        if (!ok) { showError('Please fill in all fields correctly.'); return null; }
        const normId = id2.includes('@') ? id2 : normPhone(id2);
        return { role: 'landlord', identifier: normId, password: pw2, apartment: apt2 };
    }

    if (currentRole === 'superadmin') {
        const user = ($('sa-username')?.value || '').trim();
        const pw3  = $('sa-password')?.value  || '';
        let ok = true;
        if (!user) { markErr('sa-username', true); ok = false; }
        if (!pw3)  { markErr('sa-password', true); ok = false; }
        if (!ok) { showError('Please enter your admin credentials.'); return null; }
        return { role: 'superadmin', identifier: user, password: pw3, apartment: null };
    }

    return null;
}

// ── MAIN SUBMIT HANDLER ───────────────────────────────────────────────────────
async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const payload = getPayload();
    if (!payload) return;

    setLoading(true);

    try {
        let session;

        if (firebaseSignIn) {
            // ── FIREBASE PATH ─────────────────────────────────────────────────
            session = await firebaseSignIn(payload);

        } else {
            // ── LOCALSTORAGE FALLBACK ─────────────────────────────────────────
            // Simulate async to keep the same code path
            await new Promise(resolve => setTimeout(resolve, 400));
            if (typeof AUTH === 'undefined') throw new Error('Authentication system failed to load.');
            session = AUTH.authenticate(payload);
        }

        // ── Pending tenant ────────────────────────────────────────────────────
        if (session && session.error === 'pending') {
            setLoading(false);
            showError(`Hi ${session.name} — your account is awaiting landlord approval. Please check back soon.`);
            return;
        }

        // ── Wrong credentials ─────────────────────────────────────────────────
        if (!session) {
            setLoading(false);
            const msgs = {
                tenant:     'Phone number, apartment, or password is incorrect.',
                landlord:   'Credentials not recognised for the selected apartment.',
                superadmin: 'Invalid admin username or password.',
            };
            showError(msgs[currentRole] || 'Login failed. Please try again.');
            const pwIds = { tenant:'t-password', landlord:'l-password', superadmin:'sa-password' };
            markErr(pwIds[currentRole], true);
            return;
        }

        // ── Success ───────────────────────────────────────────────────────────
        // Save session in sessionStorage (Firebase) AND localStorage (legacy)
        sessionStorage.setItem('prent_session', JSON.stringify(session));
        if (typeof AUTH !== 'undefined') {
            AUTH.saveSession(session);
            // Write full tenant profile for dashboard.js
            if (session.role === 'tenant') {
                const tenant = AUTH.getTenants().find(t => t.id === session.id);
                if (tenant) localStorage.setItem('prent_current_tenant', JSON.stringify(tenant));
            }
            if (session.role === 'landlord') {
                localStorage.setItem('prent_landlord_session', JSON.stringify(session));
            }
        }

        goTo(redirectFor(session.role));

    } catch (err) {
        setLoading(false);
        // Firebase throws Error objects with user-friendly messages (from firebase-auth.js)
        showError(err.message || 'Login failed. Please try again.');
        console.error('[P-rent login]', err);
    }
}

// ── WIRE EVENTS ───────────────────────────────────────────────────────────────
const submitBtn = $('submit-btn');
if (submitBtn) submitBtn.addEventListener('click', handleSubmit);

document.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSubmit(e);
});

// ── INIT ──────────────────────────────────────────────────────────────────────
populateApts();
switchRole('tenant');