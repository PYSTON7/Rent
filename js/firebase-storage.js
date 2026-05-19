// js/firebase-storage.js — P-rent Apartment Photo Storage
//
// Replaces the base64-in-localStorage approach in apt-photos.js
// Uploads images to Firebase Storage, stores URLs in Firestore
//
// Storage path: apartments/{aptId}/photos/{timestamp}_{filename}
// Firestore:    /apartments/{aptId}/photos subcollection
//               or /apartments/{aptId}.photos[] array

import {
    ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import {
    doc, updateDoc, getDoc, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { storage, db } from "./firebase-config.js";

const MAX_SIZE_MB = 5;
const MAX_PHOTOS  = 8;

// ── UPLOAD PHOTO ──────────────────────────────────────────────────────────────
/**
 * Upload a single photo for an apartment.
 * @param {string}   aptId      — apartment document ID
 * @param {File}     file       — image File object
 * @param {Function} onProgress — called with progress 0–100
 * @returns {string} downloadURL
 */
export async function uploadApartmentPhoto(aptId, file, onProgress) {
    if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are allowed.');
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
    }

    // Check current photo count
    const aptSnap = await getDoc(doc(db, 'apartments', aptId));
    const current = aptSnap.data()?.photos || [];
    if (current.length >= MAX_PHOTOS) {
        throw new Error(`Maximum ${MAX_PHOTOS} photos per apartment.`);
    }

    const filename  = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageRef = ref(storage, `apartments/${aptId}/photos/${filename}`);

    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            snapshot => {
                const pct = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
                if (onProgress) onProgress(pct);
            },
            reject,
            async () => {
                const url = await getDownloadURL(uploadTask.snapshot.ref);

                // Save URL to Firestore apartment doc
                await updateDoc(doc(db, 'apartments', aptId), {
                    photos: arrayUnion(url),
                    // Set as primary if first photo
                    ...(current.length === 0 ? { primaryPhoto: url } : {}),
                });

                resolve(url);
            }
        );
    });
}

// ── SET PRIMARY PHOTO ─────────────────────────────────────────────────────────
export async function setPrimaryPhoto(aptId, url) {
    await updateDoc(doc(db, 'apartments', aptId), { primaryPhoto: url });
}

// ── DELETE PHOTO ──────────────────────────────────────────────────────────────
export async function deleteApartmentPhoto(aptId, url) {
    // Delete from Storage
    try {
        const fileRef = ref(storage, url);
        await deleteObject(fileRef);
    } catch (err) {
        console.warn('Storage delete failed (file may already be gone):', err.message);
    }

    // Remove from Firestore array
    const aptRef  = doc(db, 'apartments', aptId);
    const aptSnap = await getDoc(aptRef);
    const data    = aptSnap.data();

    await updateDoc(aptRef, {
        photos: arrayRemove(url),
        // If deleted photo was primary, reassign to first remaining
        ...(data.primaryPhoto === url
            ? { primaryPhoto: (data.photos || []).filter(p => p !== url)[0] || null }
            : {}),
    });
}

// ── GET PHOTOS ────────────────────────────────────────────────────────────────
export async function getApartmentPhotos(aptId) {
    const snap = await getDoc(doc(db, 'apartments', aptId));
    const data = snap.data() || {};
    return {
        photos:       data.photos       || [],
        primaryPhoto: data.primaryPhoto || null,
    };
}