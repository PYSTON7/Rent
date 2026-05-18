/**
 * auth-data.js — P-rent Authoritative Credential Store  v2
 *
 * FIXES vs v1:
 *  - redirectAfterLogin uses location.replace() — no back-button login loop
 *  - requireRole uses replace() — no loop on protected pages
 *  - authenticate returns { error:'pending' } for unnapproved tenants
 *  - getSession is try/catch safe
 *  - clearSession also removes landlord session key
 *  - seed() is safely idempotent
 */

const AUTH = (() => {
    'use strict';

    const K = {
        LANDLORDS:  'prent_landlords',
        TENANTS:    'prent_tenants',
        SESSION:    'prent_session',
        APARTMENTS: 'prent_apartments',
    };

    // ── SUPERADMIN — never stored in localStorage ─────────────────────────────
    // *** Change username + password before going live ***
    const SUPERADMIN = {
        role:     'superadmin',
        username: 'admin',
        password: 'Prent@2026!',
        name:     'Platform Admin',
    };

    // ── SEED DATA ─────────────────────────────────────────────────────────────
    const SEED_APARTMENTS = [
        {
            id: 'victoria', name: 'Victoria Apartments',
            location: 'Mukuru Kwa Njenga, Embakasi South, Nairobi',
            county: 'Nairobi County', icon: '🏢',
            totalRooms: 10, availableRooms: 3,
            rentRange: 'KES 8,000 – 12,000',
            description: 'A well-maintained block of self-contained units in Embakasi South.',
            amenities: ['Water supply', 'Security', 'Garbage collection', 'Parking'],
            rooms: [
                { number: '101', status: 'occupied' },
                { number: '102', status: 'occupied' },
                { number: '103', status: 'vacant'   },
                { number: '104', status: 'occupied' },
                { number: '105', status: 'vacant'   },
                { number: '106', status: 'occupied' },
                { number: '107', status: 'occupied' },
                { number: '108', status: 'vacant'   },
                { number: '109', status: 'occupied' },
                { number: '110', status: 'occupied' },
            ],
        },
        {
            id: 'whitehouse', name: 'White House Apartments',
            location: 'Kabarak, Nakuru',
            county: 'Nakuru County', icon: '🏠',
            totalRooms: 12, availableRooms: 5,
            rentRange: 'KES 6,000 – 9,500',
            description: 'Spacious units near Kabarak University.',
            amenities: ['Borehole water', '24hr security', 'Compound lighting', 'Garbage collection'],
            rooms: [
                { number: 'A1', status: 'occupied' },
                { number: 'A2', status: 'vacant'   },
                { number: 'A3', status: 'occupied' },
                { number: 'A4', status: 'vacant'   },
                { number: 'B1', status: 'occupied' },
                { number: 'B2', status: 'occupied' },
                { number: 'B3', status: 'vacant'   },
                { number: 'B4', status: 'occupied' },
                { number: 'C1', status: 'vacant'   },
                { number: 'C2', status: 'occupied' },
                { number: 'C3', status: 'occupied' },
                { number: 'C4', status: 'vacant'   },
            ],
        },
    ];

    const SEED_LANDLORDS = [
        {
            id: 'LL001', name: 'Peter Kamau',
            phone: '0722000001', email: 'peter@prent.co.ke',
            password: 'landlord123', apartment: 'victoria', role: 'landlord',
        },
        {
            id: 'LL002', name: 'Grace Wanjiku',
            phone: '0733000002', email: 'grace@prent.co.ke',
            password: 'landlord456', apartment: 'whitehouse', role: 'landlord',
        },
    ];

    const SEED_TENANTS = [
        {
            id: 'TN001', name: 'Jane Mwangi',
            phone: '0712345678', email: 'jane@example.com',
            password: 'jane1234', apartment: 'victoria', room: '103',
            rent: 10000, water: 850, other: 0,
            moveIn: '2025-03-01', role: 'tenant', status: 'active', landlordId: 'LL001',
        },
        {
            id: 'TN002', name: 'James Otieno',
            phone: '0723456789', email: '',
            password: 'james1234', apartment: 'victoria', room: '105',
            rent: 9500, water: 720, other: 0,
            moveIn: '2025-06-15', role: 'tenant', status: 'active', landlordId: 'LL001',
        },
        {
            id: 'TN003', name: 'Amina Hassan',
            phone: '0734567890', email: '',
            password: 'amina1234', apartment: 'whitehouse', room: 'A2',
            rent: 7500, water: 600, other: 0,
            moveIn: '2025-09-01', role: 'tenant', status: 'active', landlordId: 'LL002',
        },
    ];

    // ── SEED (idempotent — safe to call many times) ───────────────────────────
    function seed() {
        if (!localStorage.getItem(K.APARTMENTS)) {
            localStorage.setItem(K.APARTMENTS, JSON.stringify(SEED_APARTMENTS));
        }
        if (!localStorage.getItem(K.LANDLORDS)) {
            localStorage.setItem(K.LANDLORDS, JSON.stringify(SEED_LANDLORDS));
        }
        if (!localStorage.getItem(K.TENANTS)) {
            localStorage.setItem(K.TENANTS, JSON.stringify(SEED_TENANTS));
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────
    function getLandlords()       { return JSON.parse(localStorage.getItem(K.LANDLORDS)  || '[]'); }
    function getTenants()         { return JSON.parse(localStorage.getItem(K.TENANTS)    || '[]'); }
    function getApartments()      { return JSON.parse(localStorage.getItem(K.APARTMENTS) || '[]'); }
    function saveLandlords(list)  { localStorage.setItem(K.LANDLORDS,  JSON.stringify(list)); }
    function saveTenants(list)    { localStorage.setItem(K.TENANTS,    JSON.stringify(list)); }
    function saveApartments(list) { localStorage.setItem(K.APARTMENTS, JSON.stringify(list)); }

    // ── AUTHENTICATE ──────────────────────────────────────────────────────────
    /**
     * @returns session object   — success
     *          { error:'pending', name } — tenant not yet approved
     *          null             — wrong credentials
     */
    function authenticate({ role, identifier, password, apartment }) {

        // 1 ── Superadmin (hard-coded, never in storage)
        if (role === 'superadmin') {
            if (identifier === SUPERADMIN.username && password === SUPERADMIN.password) {
                return { role: 'superadmin', name: SUPERADMIN.name, id: 'SA' };
            }
            return null;
        }

        // 2 ── Landlord
        if (role === 'landlord') {
            const clean = (identifier || '').replace(/\s/g, '');
            const found = getLandlords().find(l =>
                (l.phone === clean || l.email === identifier) &&
                l.password === password &&
                l.apartment === apartment
            );
            if (!found) return null;
            return {
                role: 'landlord', name: found.name,
                id: found.id, apartment: found.apartment, phone: found.phone,
            };
        }

        // 3 ── Tenant
        if (role === 'tenant') {
            const clean = (identifier || '').replace(/\s/g, '');
            const found = getTenants().find(t =>
                t.phone === clean &&
                t.password === password &&
                t.apartment === apartment
            );
            if (!found) return null;

            // Pending tenants cannot log in yet
            if (found.status === 'pending') {
                return { error: 'pending', name: found.name };
            }

            return {
                role: 'tenant', name: found.name, id: found.id,
                apartment: found.apartment, room: found.room,
                rent: found.rent, water: found.water, other: found.other,
                moveIn: found.moveIn, phone: found.phone, status: found.status,
            };
        }

        return null;
    }

    // ── SESSION ───────────────────────────────────────────────────────────────
    function saveSession(session) {
        localStorage.setItem(K.SESSION, JSON.stringify(session));
    }

    function getSession() {
        try {
            const raw = localStorage.getItem(K.SESSION);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            localStorage.removeItem(K.SESSION);
            return null;
        }
    }

    function clearSession() {
        localStorage.removeItem(K.SESSION);
        localStorage.removeItem('prent_current_tenant');
        localStorage.removeItem('prent_landlord_session');
    }

    // ── REDIRECT AFTER LOGIN ──────────────────────────────────────────────────
    // Uses replace() so the back button doesn't loop to login
    function redirectAfterLogin(session) {
        saveSession(session);

        if (session.role === 'superadmin') {
            window.location.replace('admin.html');

        } else if (session.role === 'landlord') {
            localStorage.setItem('prent_landlord_session', JSON.stringify(session));
            window.location.replace('landlord-dashboard.html');

        } else {
            // Write full tenant profile so dashboard.js doesn't need to re-fetch
            const tenant = getTenants().find(t => t.id === session.id);
            if (tenant) localStorage.setItem('prent_current_tenant', JSON.stringify(tenant));
            window.location.replace('dashboard.html');
        }
    }

    // ── ROUTE GUARD ───────────────────────────────────────────────────────────
    // Call at the top of every protected page.
    // Returns session or null (and navigates away when unauthorised).
    function requireRole(...allowedRoles) {
        const session = getSession();

        if (!session) {
            window.location.replace('login.html');
            return null;
        }

        if (!allowedRoles.includes(session.role)) {
            // Send each role to its own home page
            const homes = {
                superadmin: 'admin.html',
                landlord:   'landlord-dashboard.html',
                tenant:     'dashboard.html',
            };
            window.location.replace(homes[session.role] || 'login.html');
            return null;
        }

        return session;
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────────
    return {
        seed,
        authenticate,
        saveSession,
        getSession,
        clearSession,
        redirectAfterLogin,
        requireRole,
        getLandlords,
        getTenants,
        getApartments,
        saveLandlords,
        saveTenants,
        saveApartments,
    };

})();
