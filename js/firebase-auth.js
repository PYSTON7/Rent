// js/firebase-auth.js — P-rent Firebase Authentication Layer
//
// This replaces the localStorage-based AUTH in auth-data.js.
// It uses Firebase Auth for login/logout/session and
// Firestore to store user profiles (landlords, tenants, apartments).
//
// ROLES:
//   superadmin → email + password, custom claim role:"superadmin"
//   landlord   → email + password, custom claim role:"landlord"
//   tenant     → phone + password (stored as email: phone@prent.internal)
//
// Firestore Collections:
//   /users/{uid}        — profile, role, apartment, room, rent etc.
//   /apartments/{id}    — apartment data
//   /tenants/{id}       — tenant billing data
//   /landlords/{id}     — landlord data
//   /transactions/{id}  — payment history
//   /notifications/{id} — in-app notifications

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    doc, getDoc, setDoc, updateDoc, collection,
    query, where, getDocs, addDoc, serverTimestamp, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// ── PHONE → EMAIL CONVERSION ──────────────────────────────────────────────────
// Firebase Auth requires email format. We convert phone to a fake email.
function phoneToEmail(phone) {
    const clean = phone.replace(/\s/g, '').replace(/^\+254/, '0');
    return `${clean}@prent.internal`;
}

// ── SIGN IN ───────────────────────────────────────────────────────────────────
/**
 * Login for all three roles.
 * @param {string} role        — 'tenant' | 'landlord' | 'superadmin'
 * @param {string} identifier  — phone (tenant) or email (landlord/admin)
 * @param {string} password
 * @param {string} apartment   — apartment ID (tenant + landlord only)
 * @returns {object}  session  — { role, name, id, apartment, ... }
 * @throws  Error with user-friendly message on failure
 */
export async function signIn({ role, identifier, password, apartment }) {

    // Convert phone to email for tenant login
    const email = role === 'tenant'
        ? phoneToEmail(identifier)
        : identifier;

    // Firebase sign-in
    let userCredential;
    try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        // Map Firebase error codes to human-readable messages
        const msgs = {
            'auth/user-not-found':    'No account found with these credentials.',
            'auth/wrong-password':    'Incorrect password. Please try again.',
            'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
            'auth/invalid-email':     'Invalid credentials format.',
            'auth/user-disabled':     'This account has been disabled.',
        };
        throw new Error(msgs[err.code] || 'Login failed. Please try again.');
    }

    const uid = userCredential.user.uid;

    // Fetch user profile from Firestore
    const profileSnap = await getDoc(doc(db, 'users', uid));
    if (!profileSnap.exists()) {
        await signOut(auth);
        throw new Error('Account profile not found. Contact your administrator.');
    }

    const profile = profileSnap.data();

    // Role check
    if (profile.role !== role) {
        await signOut(auth);
        throw new Error(`This account is registered as a ${profile.role}, not a ${role}.`);
    }

    // Apartment check for tenant + landlord
    if (role !== 'superadmin' && apartment && profile.apartment !== apartment) {
        await signOut(auth);
        throw new Error('Credentials not recognised for the selected apartment.');
    }

    // Pending tenant check
    if (role === 'tenant' && profile.status === 'pending') {
        await signOut(auth);
        return { error: 'pending', name: profile.name };
    }

    // Return session object
    return {
        uid,
        role:      profile.role,
        name:      profile.name,
        id:        uid,
        apartment: profile.apartment  || null,
        room:      profile.room       || null,
        phone:     profile.phone      || null,
        email:     profile.email      || null,
        status:    profile.status     || 'active',
        rent:      profile.rent       || 0,
        water:     profile.water      || 0,
        other:     profile.other      || 0,
        moveIn:    profile.moveIn     || null,
        landlordId:profile.landlordId || null,
    };
}

// ── SIGN OUT ──────────────────────────────────────────────────────────────────
export async function logOut() {
    await signOut(auth);
    sessionStorage.removeItem('prent_session');
}

// ── AUTH STATE OBSERVER ───────────────────────────────────────────────────────
// Call this once on page load to restore session
export function onSessionChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) { callback(null); return; }
        try {
            const snap = await getDoc(doc(db, 'users', user.uid));
            callback(snap.exists() ? { uid: user.uid, ...snap.data() } : null);
        } catch (_) {
            callback(null);
        }
    });
}

// ── PASSWORD RESET ────────────────────────────────────────────────────────────
export async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
}

// ── CREATE TENANT ACCOUNT (called by landlord via add-tenant) ─────────────────
export async function createTenantAccount({
    name, phone, email, password,
    apartment, room, rent, water, other,
    moveIn, landlordId,
}) {
    const tenantEmail = phoneToEmail(phone);

    // Create Firebase Auth account
    let userCredential;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, tenantEmail, password);
    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            throw new Error('A tenant with this phone number already exists.');
        }
        throw new Error('Failed to create account: ' + err.message);
    }

    const uid = userCredential.user.uid;
    await updateProfile(userCredential.user, { displayName: name });

    // Write profile to Firestore
    await setDoc(doc(db, 'users', uid), {
        uid, name, phone, email: email || '',
        role: 'tenant', status: 'active',
        apartment, room, rent, water: water || 0, other: other || 0,
        moveIn: moveIn || null, landlordId: landlordId || null,
        createdAt: serverTimestamp(),
    });

    // Update apartment room status
    await updateRoomStatus(apartment, room, 'occupied');

    return { uid, name, phone, apartment, room };
}

// ── CREATE LANDLORD ACCOUNT (called by superadmin via admin panel) ────────────
export async function createLandlordAccount({ name, phone, email, password, apartment }) {
    let userCredential;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            throw new Error('An account with this email already exists.');
        }
        throw new Error('Failed to create account: ' + err.message);
    }

    const uid = userCredential.user.uid;
    await updateProfile(userCredential.user, { displayName: name });

    await setDoc(doc(db, 'users', uid), {
        uid, name, phone, email,
        role: 'landlord', status: 'active',
        apartment, createdAt: serverTimestamp(),
    });

    return { uid, name, email, apartment };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function updateRoomStatus(aptId, roomNum, status) {
    const aptRef  = doc(db, 'apartments', aptId);
    const aptSnap = await getDoc(aptRef);
    if (!aptSnap.exists()) return;

    const aptData = aptSnap.data();
    const rooms   = (aptData.rooms || []).map(r =>
        r.number === roomNum ? { ...r, status } : r
    );
    const delta = status === 'occupied' ? -1 : 1;

    await updateDoc(aptRef, {
        rooms,
        availableRooms: Math.max(0, (aptData.availableRooms || 0) + delta),
    });
}

// ── FETCH HELPERS (Firestore reads) ───────────────────────────────────────────
export async function getApartments() {
    const snap = await getDocs(collection(db, 'apartments'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getApartmentById(id) {
    const snap = await getDoc(doc(db, 'apartments', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getTenantsByApartment(aptId) {
    const q    = query(collection(db, 'users'), where('apartment', '==', aptId), where('role', '==', 'tenant'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getLandlordByApartment(aptId) {
    const q    = query(collection(db, 'users'), where('apartment', '==', aptId), where('role', '==', 'landlord'));
    const snap = await getDocs(q);
    return snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
}

export async function getTransactions(tenantId, limitCount = 50) {
    const q    = query(
        collection(db, 'transactions'),
        where('tenantId', '==', tenantId),
        orderBy('date', 'desc'),
        limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTransaction(tx) {
    return addDoc(collection(db, 'transactions'), {
        ...tx,
        createdAt: serverTimestamp(),
    });
}

export async function updateTenantBalance(uid, { water, other }) {
    await updateDoc(doc(db, 'users', uid), { water, other });
}

export async function updateTenantStatus(uid, status) {
    await updateDoc(doc(db, 'users', uid), { status });
}