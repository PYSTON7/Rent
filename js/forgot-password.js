/**
 * forgot-password.js — P-rent Password Recovery
 *
 * Flow:
 *   Step 1 → User picks Email or SMS, enters contact details
 *   Step 2 → OTP sent (simulated), user enters 6-digit code
 *   Step 3 → User sets new password
 *   Step 4 → Success screen
 *
 * Production wiring (replace simulate functions):
 *   Email OTP → SendGrid / Nodemailer via your backend
 *     POST /api/auth/otp/send  { method:'email', contact, role }
 *   SMS OTP   → Africa's Talking or Twilio via your backend
 *     POST /api/auth/otp/send  { method:'sms', contact, role }
 *   Verify    → POST /api/auth/otp/verify  { contact, otp }
 *   Reset     → POST /api/auth/password/reset { contact, newPassword, token }
 *
 * localStorage mode (current):
 *   Finds tenant/landlord by email or phone, updates password directly.
 *   OTP is generated client-side and logged to console for testing.
 */

(function () {
    'use strict';

    // ── DOM HELPERS ───────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    function show(id) { const el = $(id); if (el) el.style.display = ''; }
    function hide(id) { const el = $(id); if (el) el.style.display = 'none'; }
    function setErr(id, msg) {
        const el = $(id);
        if (!el) return;
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }
    function clearErr(id) { setErr(id, ''); }

    // ── STATE ─────────────────────────────────────────────────────────────────
    let currentMethod  = 'email';   // 'email' | 'sms'
    let currentStep    = 1;
    let generatedOTP   = '';        // 6-digit code
    let otpContact     = '';        // email or phone used for recovery
    let recoveryRole   = 'tenant';  // role detected from contact
    let resendTimer    = null;
    let foundUser      = null;      // matched user object

    // ── OPEN / CLOSE MODAL ────────────────────────────────────────────────────
    function openForgotModal(role) {
        recoveryRole = role || 'tenant';
        resetModal();
        const overlay = $('fp-overlay');
        if (overlay) {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeForgotModal() {
        const overlay = $('fp-overlay');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
        clearResendTimer();
    }

    function resetModal() {
        goToStep(1);
        clearErr('fp-email-err');
        clearErr('fp-phone-err');
        clearErr('fp-step1-err');
        clearErr('fp-otp-err');
        clearErr('fp-new-pw-err');
        clearErr('fp-confirm-pw-err');

        const emailInput = $('fp-email-input');
        const phoneInput = $('fp-phone-input');
        const newPw      = $('fp-new-pw');
        const confirmPw  = $('fp-confirm-pw');

        if (emailInput) emailInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (newPw)      newPw.value      = '';
        if (confirmPw)  confirmPw.value  = '';

        clearOtpBoxes();
        switchMethod('email');
    }

    // ── STEP NAVIGATION ───────────────────────────────────────────────────────
    function goToStep(n) {
        currentStep = n;
        for (let i = 1; i <= 4; i++) {
            const el = $('fp-step-' + i);
            if (el) el.classList.toggle('active', i === n);
        }
        // Focus first relevant input
        setTimeout(() => {
            if (n === 1) $('fp-email-input')?.focus();
            if (n === 2) $('otp-1')?.focus();
            if (n === 3) $('fp-new-pw')?.focus();
        }, 100);
    }

    // ── METHOD SWITCHER (Email / SMS) ─────────────────────────────────────────
    function switchMethod(method) {
        currentMethod = method;

        $('fp-method-email')?.classList.toggle('selected', method === 'email');
        $('fp-method-sms')?.classList.toggle('selected',   method === 'sms');

        if (method === 'email') {
            show('fp-email-fields');
            hide('fp-sms-fields');
        } else {
            hide('fp-email-fields');
            show('fp-sms-fields');
        }

        clearErr('fp-email-err');
        clearErr('fp-phone-err');
        clearErr('fp-step1-err');
    }

    $('fp-method-email')?.addEventListener('click', () => switchMethod('email'));
    $('fp-method-sms')?.addEventListener('click',   () => switchMethod('sms'));

    // ── OTP GENERATION ────────────────────────────────────────────────────────
    function generateOTP() {
        // 6-digit numeric code
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    // ── FIND USER BY CONTACT ──────────────────────────────────────────────────
    function findUserByContact(contact, method) {
        if (typeof AUTH === 'undefined') return null;

        const tenants   = AUTH.getTenants()   || [];
        const landlords = AUTH.getLandlords() || [];

        if (method === 'email') {
            const clean = contact.trim().toLowerCase();
            return (
                tenants.find(t   => (t.email || '').toLowerCase() === clean) ||
                landlords.find(l => (l.email || '').toLowerCase() === clean) ||
                null
            );
        }

        if (method === 'sms') {
            const clean = normalisePhone(contact);
            return (
                tenants.find(t   => normalisePhone(t.phone || '') === clean) ||
                landlords.find(l => normalisePhone(l.phone || '') === clean) ||
                null
            );
        }

        return null;
    }

    function normalisePhone(raw) {
        let p = (raw || '').replace(/[\s\-\(\)]/g, '');
        if (p.startsWith('+254')) p = '0' + p.slice(4);
        if (p.startsWith('254'))  p = '0' + p.slice(3);
        return p;
    }

    // ── SIMULATE SENDING OTP ──────────────────────────────────────────────────
    /**
     * Production: POST to your backend:
     *   /api/auth/otp/send  { method, contact, otp (backend generates + sends) }
     * The OTP should be generated SERVER-SIDE and sent via:
     *   Email → SendGrid (npm install @sendgrid/mail)
     *   SMS   → Africa's Talking (npm install africastalking)
     *         → Twilio (npm install twilio)
     */
    async function simulateSendOTP(method, contact, otp) {
        return new Promise(resolve => {
            setTimeout(() => {
                // In development: log OTP to console so you can test
                console.log(
                    `%c[P-rent OTP] Code for ${contact}: ${otp}`,
                    'background:#b8860b;color:#0b0c0a;padding:4px 8px;border-radius:4px;font-weight:bold'
                );
                resolve({ success: true });
            }, 1000);
        });
    }

    // ── STEP 1: SEND OTP ──────────────────────────────────────────────────────
    async function handleSendOTP() {
        clearErr('fp-email-err');
        clearErr('fp-phone-err');
        clearErr('fp-step1-err');

        const btn = $('fp-send-otp-btn');

        // Validate input
        let contact = '';
        if (currentMethod === 'email') {
            contact = ($('fp-email-input')?.value || '').trim();
            if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
                setErr('fp-email-err', 'Enter a valid email address.');
                $('fp-email-input')?.classList.add('err');
                return;
            }
        } else {
            contact = ($('fp-phone-input')?.value || '').trim();
            const clean = normalisePhone(contact);
            if (!clean || !/^(07|01)\d{8}$/.test(clean)) {
                setErr('fp-phone-err', 'Enter a valid 10-digit Kenyan phone number.');
                $('fp-phone-input')?.classList.add('err');
                return;
            }
            contact = clean;
        }

        // Find user
        const user = findUserByContact(contact, currentMethod);
        if (!user) {
            const msg = currentMethod === 'email'
                ? 'No account found with this email address.'
                : 'No account found with this phone number.';
            setErr('fp-step1-err', msg);
            return;
        }

        foundUser    = user;
        otpContact   = contact;
        recoveryRole = user.role || recoveryRole;

        // Generate + send OTP
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

        generatedOTP = generateOTP();
        const result = await simulateSendOTP(currentMethod, contact, generatedOTP);

        if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }

        if (!result.success) {
            setErr('fp-step1-err', 'Failed to send OTP. Please try again.');
            return;
        }

        // Update step 2 subtitle
        const sub = $('fp-otp-sub');
        if (sub) {
            sub.textContent = currentMethod === 'email'
                ? `We sent a 6-digit code to ${maskEmail(contact)}`
                : `We sent a 6-digit code via SMS to ${maskPhone(contact)}`;
        }

        goToStep(2);
        startResendTimer();
    }

    // ── MASK HELPERS ──────────────────────────────────────────────────────────
    function maskEmail(email) {
        const [local, domain] = email.split('@');
        const visible = local.slice(0, 2);
        return `${visible}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
    }

    function maskPhone(phone) {
        return phone.slice(0, 4) + '***' + phone.slice(-3);
    }

    // ── OTP INPUT — auto-advance, backspace, paste ────────────────────────────
    function initOtpBoxes() {
        const boxes = [1,2,3,4,5,6].map(i => $('otp-' + i));

        boxes.forEach((box, idx) => {
            if (!box) return;

            box.addEventListener('input', e => {
                const val = e.target.value.replace(/\D/g, '');
                e.target.value = val.slice(-1); // keep only last digit
                e.target.classList.toggle('filled', !!val);

                if (val && idx < 5) boxes[idx + 1]?.focus();
                clearErr('fp-otp-err');
            });

            box.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                    boxes[idx - 1]?.focus();
                }
                if (e.key === 'ArrowLeft'  && idx > 0) boxes[idx - 1]?.focus();
                if (e.key === 'ArrowRight' && idx < 5) boxes[idx + 1]?.focus();
            });

            // Allow paste of full 6-digit code
            box.addEventListener('paste', e => {
                e.preventDefault();
                const pasted = (e.clipboardData || window.clipboardData)
                    .getData('text').replace(/\D/g, '').slice(0, 6);
                pasted.split('').forEach((char, i) => {
                    if (boxes[i]) {
                        boxes[i].value = char;
                        boxes[i].classList.add('filled');
                    }
                });
                boxes[Math.min(pasted.length, 5)]?.focus();
                clearErr('fp-otp-err');
            });
        });
    }

    function clearOtpBoxes() {
        [1,2,3,4,5,6].forEach(i => {
            const box = $('otp-' + i);
            if (box) { box.value = ''; box.classList.remove('filled','error'); }
        });
    }

    function getOtpValue() {
        return [1,2,3,4,5,6].map(i => $('otp-' + i)?.value || '').join('');
    }

    function markOtpError() {
        [1,2,3,4,5,6].forEach(i => {
            const box = $('otp-' + i);
            if (box) {
                box.classList.add('error');
                box.classList.remove('filled');
                // Shake animation
                box.style.animation = 'none';
                requestAnimationFrame(() => { box.style.animation = 'prentShake 0.4s ease'; });
            }
        });
    }

    // ── RESEND TIMER ──────────────────────────────────────────────────────────
    function startResendTimer(seconds = 60) {
        clearResendTimer();
        let remaining = seconds;

        const timerEl  = $('resend-timer');
        const countEl  = $('resend-count');
        const resendBtn = $('resend-btn');

        if (timerEl)   timerEl.style.display  = 'inline';
        if (resendBtn) resendBtn.style.display = 'none';

        resendTimer = setInterval(() => {
            remaining--;
            if (countEl) countEl.textContent = remaining;

            if (remaining <= 0) {
                clearResendTimer();
                if (timerEl)   timerEl.style.display  = 'none';
                if (resendBtn) { resendBtn.style.display = 'inline'; resendBtn.disabled = false; }
            }
        }, 1000);
    }

    function clearResendTimer() {
        if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    }

    // ── STEP 2: VERIFY OTP ────────────────────────────────────────────────────
    function handleVerifyOTP() {
        clearErr('fp-otp-err');
        const entered = getOtpValue();

        if (entered.length < 6) {
            setErr('fp-otp-err', 'Please enter all 6 digits.');
            return;
        }

        if (entered !== generatedOTP) {
            markOtpError();
            setErr('fp-otp-err', 'Incorrect OTP. Please try again.');
            setTimeout(() => {
                [1,2,3,4,5,6].forEach(i => $('otp-'+i)?.classList.remove('error'));
            }, 1500);
            return;
        }

        // OTP valid
        clearResendTimer();
        goToStep(3);
    }

    // ── RESEND OTP ────────────────────────────────────────────────────────────
    async function handleResendOTP() {
        const btn = $('resend-btn');
        if (btn) btn.disabled = true;

        generatedOTP = generateOTP();
        clearOtpBoxes();
        clearErr('fp-otp-err');

        await simulateSendOTP(currentMethod, otpContact, generatedOTP);
        startResendTimer(60);
    }

    // ── STEP 3: RESET PASSWORD ────────────────────────────────────────────────
    function handleResetPassword() {
        clearErr('fp-new-pw-err');
        clearErr('fp-confirm-pw-err');

        const newPw     = ($('fp-new-pw')?.value      || '').trim();
        const confirmPw = ($('fp-confirm-pw')?.value  || '').trim();
        const btn       = $('fp-reset-btn');

        let valid = true;

        if (!newPw || newPw.length < 6) {
            setErr('fp-new-pw-err', 'Password must be at least 6 characters.');
            $('fp-new-pw')?.classList.add('err');
            valid = false;
        }

        if (newPw !== confirmPw) {
            setErr('fp-confirm-pw-err', 'Passwords do not match.');
            $('fp-confirm-pw')?.classList.add('err');
            valid = false;
        }

        if (!valid) return;

        // Show loading state
        if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

        setTimeout(() => {
            // ── Update password in localStorage ──────────────────────────────
            /**
             * Production: POST /api/auth/password/reset
             *   { contact: otpContact, newPassword: newPw, role: recoveryRole }
             * Backend verifies the OTP token server-side then updates the DB.
             */
            if (typeof AUTH !== 'undefined' && foundUser) {
                const isTenant   = foundUser.role === 'tenant' || !foundUser.role;
                const isLandlord = foundUser.role === 'landlord';

                if (isTenant) {
                    const tenants = AUTH.getTenants();
                    const idx     = tenants.findIndex(t => t.id === foundUser.id);
                    if (idx > -1) {
                        tenants[idx].password = newPw;
                        AUTH.saveTenants(tenants);
                    }
                } else if (isLandlord) {
                    const landlords = AUTH.getLandlords();
                    const idx       = landlords.findIndex(l => l.id === foundUser.id);
                    if (idx > -1) {
                        landlords[idx].password = newPw;
                        AUTH.saveLandlords(landlords);
                    }
                }
            }

            if (btn) { btn.disabled = false; btn.textContent = 'Reset Password'; }
            goToStep(4);

        }, 800);
    }

    // ── WIRE ALL BUTTONS ──────────────────────────────────────────────────────
    function wireButtons() {
        // Open modal buttons (on login form)
        $('forgot-tenant-btn')?.addEventListener('click',   () => openForgotModal('tenant'));
        $('forgot-landlord-btn')?.addEventListener('click', () => openForgotModal('landlord'));

        // Close
        $('fp-close-btn')?.addEventListener('click', closeForgotModal);
        $('fp-overlay')?.addEventListener('click', e => {
            if (e.target === $('fp-overlay')) closeForgotModal();
        });

        // Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && $('fp-overlay')?.classList.contains('open')) {
                closeForgotModal();
            }
        });

        // Step 1 — Send OTP
        $('fp-send-otp-btn')?.addEventListener('click', handleSendOTP);

        // Step 2 — Back
        $('fp-back-to-1')?.addEventListener('click', () => {
            clearResendTimer();
            goToStep(1);
        });

        // Step 2 — Verify OTP
        $('fp-verify-otp-btn')?.addEventListener('click', handleVerifyOTP);

        // Step 2 — Resend
        $('resend-btn')?.addEventListener('click', handleResendOTP);

        // Step 3 — Reset password
        $('fp-reset-btn')?.addEventListener('click', handleResetPassword);

        // Step 4 — Done (close modal)
        $('fp-done-btn')?.addEventListener('click', closeForgotModal);

        // Clear field errors on input
        $('fp-email-input')?.addEventListener('input', () => {
            clearErr('fp-email-err');
            clearErr('fp-step1-err');
            $('fp-email-input').classList.remove('err');
        });
        $('fp-phone-input')?.addEventListener('input', () => {
            clearErr('fp-phone-err');
            clearErr('fp-step1-err');
            $('fp-phone-input').classList.remove('err');
        });
        $('fp-new-pw')?.addEventListener('input', () => {
            clearErr('fp-new-pw-err');
            $('fp-new-pw').classList.remove('err');
        });
        $('fp-confirm-pw')?.addEventListener('input', () => {
            clearErr('fp-confirm-pw-err');
            $('fp-confirm-pw').classList.remove('err');
        });

        // Enter key in Step 1 fields
        $('fp-email-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSendOTP(); });
        $('fp-phone-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSendOTP(); });

        // Enter key in Step 3 fields
        $('fp-new-pw')?.addEventListener('keydown',     e => { if (e.key === 'Enter') handleResetPassword(); });
        $('fp-confirm-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleResetPassword(); });

        // Auto-submit OTP when all 6 boxes are filled
        $('otp-6')?.addEventListener('input', () => {
            const code = getOtpValue();
            if (code.length === 6) {
                setTimeout(handleVerifyOTP, 200);
            }
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            wireButtons();
            initOtpBoxes();
        });
    } else {
        wireButtons();
        initOtpBoxes();
    }

    // ── EXPOSE for external calls (optional) ──────────────────────────────────
    window.ForgotPassword = { open: openForgotModal, close: closeForgotModal };

}());