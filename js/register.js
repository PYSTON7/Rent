/**
 * register.js — P-rent Tenant Self-Registration
 *
 * Works with: auth-data.js (AUTH object)
 *
 * Flow:
 *   Step 1 — Personal info (name, phone, ID, email)
 *   Step 2 — Apartment & room selection with live preview
 *   Step 3 — Password creation with strength meter
 *   Step 4 — Review & submit
 *   Success — Credentials display + redirect to login
 *
 * Registration rules (matching the auth architecture):
 *   - Phone must be unique across all tenants
 *   - Apartment must exist in the auth store
 *   - Room must be vacant in the selected apartment
 *   - Password min 6 chars
 *   - Terms must be accepted
 *   - Landlord assigned to that apartment is auto-linked
 *   - On success: tenant written to AUTH.saveTenants()
 *     and the room status is flipped to 'occupied'
 */

(() => {
    'use strict';

    // ── GUARD: already logged in ──────────────────────────────────────────────
    if (AUTH.getSession()) {
        AUTH.redirectAfterLogin(AUTH.getSession());
    }

    AUTH.seed();

    // ── STATE ─────────────────────────────────────────────────────────────────
    let currentStep = 1;
    const TOTAL_STEPS = 4;

    const formData = {
        firstname: '', lastname: '', phone: '',
        idnumber: '', email: '',
        apartment: '', room: '', movein: '',
        password: '',
    };

    // ── DOM ───────────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    const stepMeta = [
        null, // 1-indexed
        { title: 'Personal Information',  sub: 'Tell us about yourself.'                 },
        { title: 'Apartment & Room',      sub: 'Select your property and room number.'    },
        { title: 'Set Your Password',     sub: 'Keep it secure — min. 6 characters.'      },
        { title: 'Review & Confirm',      sub: 'Check your details before submitting.'    },
    ];

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function showToast(msg, type = 'ok') {
        const t = $('toast');
        t.textContent = msg;
        t.className = `toast show ${type}`;
        clearTimeout(t._t);
        t._t = setTimeout(() => t.className = 'toast', 3200);
    }

    function showErr(id, show = true) {
        const el = $(id);
        if (el) el.classList.toggle('show', show);
    }

    function clearAllErrors() {
        document.querySelectorAll('.field-err').forEach(e => e.classList.remove('show'));
        document.querySelectorAll('.field input, .field select').forEach(e => {
            e.classList.remove('invalid', 'valid');
        });
    }

    function markField(id, state) { // state: 'valid' | 'invalid' | ''
        const el = $(id);
        if (!el) return;
        el.classList.remove('valid', 'invalid');
        if (state) el.classList.add(state);
        el.addEventListener('input', () => el.classList.remove('valid','invalid'), { once: true });
    }

    function normalisePhone(raw) {
        let p = raw.replace(/[\s\-\(\)]/g, '');
        if (p.startsWith('+254')) p = '0' + p.slice(4);
        if (p.startsWith('254'))  p = '0' + p.slice(3);
        // The phone-wrap prefix is +254 so input value is the suffix (7xx or 1xx)
        if (/^[71]\d{8}$/.test(p)) p = '0' + p;
        return p;
    }

    function isValidPhone(p) { return /^(07|01)\d{8}$/.test(p); }

    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' });
    }

    function genId(prefix) {
        return prefix + Math.random().toString(36).slice(2,7).toUpperCase();
    }

    // ── PROGRESS & STEP SWITCHER ──────────────────────────────────────────────
    function goToStep(n) {
        currentStep = n;

        // Progress bar
        $('progress-fill').style.width = (n / TOTAL_STEPS * 100) + '%';

        // Header
        $('sh-step').textContent  = `Step ${n} of ${TOTAL_STEPS}`;
        $('sh-title').textContent = stepMeta[n].title;
        $('sh-sub').textContent   = stepMeta[n].sub;

        // Panes
        document.querySelectorAll('.step-pane').forEach((p, i) => {
            p.classList.toggle('active', i + 1 === n);
        });

        // Left panel step tracker
        document.querySelectorAll('#steps-tracker .step').forEach(s => {
            const sn = parseInt(s.dataset.step);
            s.classList.remove('current', 'done');
            if (sn === n)   s.classList.add('current');
            if (sn < n)     s.classList.add('done');
            // Tick done steps
            if (sn < n) s.querySelector('.step-num').textContent = '✓';
            else         s.querySelector('.step-num').textContent = sn;
        });

        clearAllErrors();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── APARTMENT DROPDOWN ────────────────────────────────────────────────────
    function populateApartments() {
        const sel = $('f-apartment');
        const apts = AUTH.getApartments();
        sel.innerHTML = '<option value="">— Choose your apartment —</option>' +
            apts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }

    function updateApartmentPreview(aptId) {
        const preview   = $('apt-preview');
        const roomsSel  = $('f-room');
        const apts = AUTH.getApartments();
        const apt  = apts.find(a => a.id === aptId);

        if (!apt) {
            preview.classList.remove('show');
            roomsSel.innerHTML = '<option value="">— Select a room —</option>';
            return;
        }

        // Preview
        preview.classList.add('show');
        $('ap-name').textContent = apt.name;
        $('ap-location').innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${apt.location}`;
        $('ap-rooms').innerHTML   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> ${apt.availableRooms} rooms free`;
        $('ap-rent').innerHTML    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ${apt.rentRange || 'KES —'} / month`;

        const noRooms = apt.availableRooms === 0;
        $('ap-rooms-warn').classList.toggle('show', noRooms);

        // Room dropdown — only vacant rooms
        const vacant = (apt.rooms || []).filter(r => r.status === 'vacant');
        roomsSel.innerHTML = '<option value="">— Select a room —</option>' +
            vacant.map(r => `<option value="${r.number}">Room ${r.number}</option>`).join('');

        if (vacant.length === 0) {
            roomsSel.innerHTML = '<option value="">No vacant rooms</option>';
        }
    }

    $('f-apartment').addEventListener('change', e => {
        updateApartmentPreview(e.target.value);
    });

    // ── PASSWORD STRENGTH ─────────────────────────────────────────────────────
    function measureStrength(pw) {
        let score = 0;
        if (pw.length >= 6)  score++;
        if (pw.length >= 10) score++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
        if (/\d/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        return Math.min(score, 4);
    }

    function updateStrengthBar(pw) {
        const wrap  = $('pw-strength');
        if (!pw) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';

        const score = measureStrength(pw);
        const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        const cls    = ['', 'weak', 'fair', 'fair', 'strong'];

        [$('seg1'),$('seg2'),$('seg3'),$('seg4')].forEach((seg, i) => {
            seg.className = 'pw-seg';
            if (i < score) seg.classList.add(cls[score]);
        });

        const lbl = $('pw-strength-label');
        lbl.textContent = labels[score];
        lbl.className   = `pw-strength-label ${cls[score]}`;
    }

    $('f-password').addEventListener('input', e => updateStrengthBar(e.target.value));

    // ── PASSWORD TOGGLE ───────────────────────────────────────────────────────
    document.querySelectorAll('.pw-eye').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp  = $(btn.dataset.target);
            if (!inp) return;
            const show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.innerHTML = show
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        });
    });

    // ── SET DEFAULT MOVE-IN DATE ──────────────────────────────────────────────
    $('f-movein').min = new Date().toISOString().split('T')[0];
    $('f-movein').value = new Date().toISOString().split('T')[0];

    // ── STEP VALIDATION ───────────────────────────────────────────────────────
    function validateStep1() {
        const fn    = $('f-firstname').value.trim();
        const ln    = $('f-lastname').value.trim();
        const rawPh = $('f-phone').value.trim();
        const phone = normalisePhone(rawPh);
        const email = $('f-email').value.trim();

        let ok = true;

        if (!fn) { showErr('err-firstname'); markField('f-firstname','invalid'); ok = false; }
        else markField('f-firstname','valid');

        if (!ln) { showErr('err-lastname'); markField('f-lastname','invalid'); ok = false; }
        else markField('f-lastname','valid');

        if (!isValidPhone(phone)) { showErr('err-phone'); markField('f-phone','invalid'); ok = false; }
        else {
            // Check duplicate
            const exists = AUTH.getTenants().some(t => t.phone === phone);
            if (exists) {
                showErr('err-phone');
                $('err-phone').textContent = 'This phone number is already registered.';
                markField('f-phone','invalid'); ok = false;
            } else {
                $('err-phone').textContent = 'Enter a valid Kenyan phone number.';
                markField('f-phone','valid');
            }
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showErr('err-email'); markField('f-email','invalid'); ok = false;
        } else if (email) { markField('f-email','valid'); }

        if (ok) {
            formData.firstname = fn;
            formData.lastname  = ln;
            formData.phone     = phone;
            formData.idnumber  = $('f-idnumber').value.trim();
            formData.email     = email;
        }

        return ok;
    }

    function validateStep2() {
        const apt  = $('f-apartment').value;
        const room = $('f-room').value;
        const movein = $('f-movein').value;
        let ok = true;

        if (!apt)    { showErr('err-apartment'); markField('f-apartment','invalid'); ok = false; }
        else markField('f-apartment','valid');

        if (!room)   { showErr('err-room'); markField('f-room','invalid'); ok = false; }
        else markField('f-room','valid');

        if (!movein) { showErr('err-movein'); markField('f-movein','invalid'); ok = false; }
        else markField('f-movein','valid');

        if (ok) {
            formData.apartment = apt;
            formData.room      = room;
            formData.movein    = movein;
        }

        return ok;
    }

    function validateStep3() {
        const pw  = $('f-password').value;
        const pw2 = $('f-confirm').value;
        const terms = $('f-terms').checked;
        let ok = true;

        if (!pw || pw.length < 6) {
            showErr('err-password'); markField('f-password','invalid'); ok = false;
        } else markField('f-password','valid');

        if (pw !== pw2 || !pw2) {
            showErr('err-confirm'); markField('f-confirm','invalid'); ok = false;
        } else if (pw.length >= 6) markField('f-confirm','valid');

        if (!terms) { showErr('err-terms'); ok = false; }

        if (ok) formData.password = pw;

        return ok;
    }

    // ── REVIEW PANEL ─────────────────────────────────────────────────────────
    function populateReview() {
        const apts = AUTH.getApartments();
        const apt  = apts.find(a => a.id === formData.apartment);

        $('rv-name').textContent   = `${formData.firstname} ${formData.lastname}`;
        $('rv-phone').textContent  = formData.phone;
        $('rv-id').textContent     = formData.idnumber  || '—';
        $('rv-email').textContent  = formData.email     || '—';
        $('rv-apt').textContent    = apt ? apt.name     : formData.apartment;
        $('rv-room').textContent   = 'Room ' + formData.room;
        $('rv-movein').textContent = fmtDate(formData.movein);
    }

    // ── SUBMIT ────────────────────────────────────────────────────────────────
    function submitRegistration() {
        const btn = $('btn-4-submit');
        btn.classList.add('loading');
        $('submit-label').textContent = 'Creating account…';

        setTimeout(() => {
            try {
                const tenants = AUTH.getTenants();
                const apts    = AUTH.getApartments();

                // Find landlord for this apartment
                const landlords  = AUTH.getLandlords();
                const landlord   = landlords.find(l => l.apartment === formData.apartment);
                const landlordId = landlord ? landlord.id : null;

                // Find the apartment to get rent info
                const apt = apts.find(a => a.id === formData.apartment);

                // Build new tenant
                const newTenant = {
                    id:         genId('TN'),
                    name:       `${formData.firstname} ${formData.lastname}`,
                    phone:      formData.phone,
                    email:      formData.email     || '',
                    idnumber:   formData.idnumber  || '',
                    password:   formData.password,
                    apartment:  formData.apartment,
                    room:       formData.room,
                    rent:       apt ? parseInt(apt.rentRange?.replace(/[^0-9]/g,'').slice(0,5)) || 8000 : 8000,
                    water:      0,
                    other:      0,
                    moveIn:     formData.movein,
                    role:       'tenant',
                    landlordId: landlordId,
                    status:     'pending', // landlord can approve
                };

                tenants.push(newTenant);
                AUTH.saveTenants(tenants);

                // Mark room as occupied
                if (apt && apt.rooms) {
                    const roomIdx = apt.rooms.findIndex(r => r.number === formData.room);
                    if (roomIdx > -1) {
                        apt.rooms[roomIdx].status = 'occupied';
                        apt.availableRooms = Math.max(0, apt.availableRooms - 1);
                        const updatedApts = apts.map(a => a.id === apt.id ? apt : a);
                        AUTH.saveApartments(updatedApts);
                    }
                }

                showSuccess(newTenant, apt);

            } catch (err) {
                console.error(err);
                btn.classList.remove('loading');
                $('submit-label').textContent = 'Create Account';
                showToast('Something went wrong. Please try again.', 'err');
            }
        }, 1200);
    }

    // ── SUCCESS SCREEN ────────────────────────────────────────────────────────
    function showSuccess(tenant, apt) {
        // Hide all panes + header
        document.querySelectorAll('.step-pane').forEach(p => p.style.display = 'none');
        $('step-header').style.display = 'none';
        $('progress-fill').style.width = '100%';

        // Update left panel — all done
        document.querySelectorAll('#steps-tracker .step').forEach(s => {
            s.classList.remove('current');
            s.classList.add('done');
            s.querySelector('.step-num').textContent = '✓';
        });

        // Populate success details
        $('cred-phone').textContent = tenant.phone;
        $('cred-apt').textContent   = apt ? apt.name : tenant.apartment;
        $('cred-room').textContent  = 'Room ' + tenant.room;

        $('success-wrap').classList.add('show');
        showToast('✓ Account created successfully!');
    }

    // ── BUTTON WIRING ─────────────────────────────────────────────────────────
    // Step 1 Next
    $('btn-1-next').addEventListener('click', () => {
        if (validateStep1()) goToStep(2);
        else shakeBtn('btn-1-next');
    });

    // Step 2
    $('btn-2-back').addEventListener('click', () => goToStep(1));
    $('btn-2-next').addEventListener('click', () => {
        if (validateStep2()) goToStep(3);
        else shakeBtn('btn-2-next');
    });

    // Step 3
    $('btn-3-back').addEventListener('click', () => goToStep(2));
    $('btn-3-next').addEventListener('click', () => {
        if (validateStep3()) {
            populateReview();
            goToStep(4);
        } else {
            shakeBtn('btn-3-next');
        }
    });

    // Step 4
    $('btn-4-back').addEventListener('click', () => goToStep(3));
    $('btn-4-submit').addEventListener('click', submitRegistration);

    // ── SHAKE ANIMATION ───────────────────────────────────────────────────────
    function shakeBtn(id) {
        const btn = $(id);
        btn.style.animation = 'none';
        requestAnimationFrame(() => { btn.style.animation = 'shake 0.4s ease'; });
    }

    // ── CLEAR ERRORS ON INPUT ─────────────────────────────────────────────────
    document.querySelectorAll('.field input, .field select').forEach(el => {
        el.addEventListener('input',  () => el.classList.remove('invalid'));
        el.addEventListener('change', () => el.classList.remove('invalid'));
    });

    // ── INIT ──────────────────────────────────────────────────────────────────
    populateApartments();
    goToStep(1);

})();