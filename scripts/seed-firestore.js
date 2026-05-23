// scripts/seed-firestore.js — P-rent Firestore Seed Script
//
// Run ONCE to populate Firestore with initial apartments, landlords, tenants.
// Landlord/tenant accounts are created in Firebase Auth AND Firestore simultaneously.
//
// Run with: node scripts/seed-firestore.js
//
// REQUIRES: .env with Firebase credentials
//           npm install firebase-admin dotenv
'use strict';

const dotenv = require('dotenv');
dotenv.config();

// 1. Load the environment variables right at the start
require('dotenv').config(); 

// 2. Import the Firebase Admin SDK pieces
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// 3. Initialize the Firebase app using your env variables
admin.initializeApp({
    credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
});

// 4. Safely grab your Firestore database instance
const db = getFirestore();

// ... the rest of your seeding data and logic goes here ...
// 1. Initialize the app ONCE with your service account credentials
admin.initializeApp({
    credential: admin.credential.cert(require('/home/pystontriplep/rent/server/serviceAccountKey.json'))
});

// 2. Initialize your services correctly
const db = getFirestore('prent'); 
const auth = admin.auth();

// --- YOUR SEEDING LOGIC CONTINUES BELOW HERE ---

const db   = admin.firestore();

db.settings({ databaseId: 'prent' });
db.settings({ databaseId: 'default' });
const auth = admin.auth();

// ── SEED DATA ─────────────────────────────────────────────────────────────────
const APARTMENTS = [
    {
        id: 'victoria',
        name: 'Victoria Apartments',
        location: 'Mukuru Kwa Njenga, Embakasi South, Nairobi',
        county: 'Nairobi County',
        icon: '🏢',
        totalRooms: 10,
        availableRooms: 3,
        rentRange: 'KES 8,000 – 12,000',
        description: 'A well-maintained block of self-contained units in Embakasi South.',
        amenities: ['Water supply', 'Security', 'Garbage collection', 'Parking'],
        photos: [],
        primaryPhoto: null,
        rooms: [
            { number:'101', status:'occupied' }, { number:'102', status:'occupied' },
            { number:'103', status:'vacant'   }, { number:'104', status:'occupied' },
            { number:'105', status:'vacant'   }, { number:'106', status:'occupied' },
            { number:'107', status:'occupied' }, { number:'108', status:'vacant'   },
            { number:'109', status:'occupied' }, { number:'110', status:'occupied' },
        ],
    },
    {
        id: 'whitehouse',
        name: 'White House Apartments',
        location: 'Kabarak, Nakuru',
        county: 'Nakuru County',
        icon: '🏠',
        totalRooms: 12,
        availableRooms: 5,
        rentRange: 'KES 6,000 – 9,500',
        description: 'Spacious units near Kabarak University.',
        amenities: ['Borehole water', '24hr security', 'Compound lighting', 'Garbage collection'],
        photos: [],
        primaryPhoto: null,
        rooms: [
            { number:'A1', status:'occupied' }, { number:'A2', status:'vacant'   },
            { number:'A3', status:'occupied' }, { number:'A4', status:'vacant'   },
            { number:'B1', status:'occupied' }, { number:'B2', status:'occupied' },
            { number:'B3', status:'vacant'   }, { number:'B4', status:'occupied' },
            { number:'C1', status:'vacant'   }, { number:'C2', status:'occupied' },
            { number:'C3', status:'occupied' }, { number:'C4', status:'vacant'   },
        ],
    },
];

const LANDLORDS = [
    {
        email: 'peter@prent.co.ke',
        password: 'Landlord@123',
        profile: {
            name: 'Peter Kamau',
            phone: '0722000001',
            role: 'landlord',
            apartment: 'victoria',
            status: 'active',
        },
    },
    {
        email: 'grace@prent.co.ke',
        password: 'Landlord@456',
        profile: {
            name: 'Grace Wanjiku',
            phone: '0733000002',
            role: 'landlord',
            apartment: 'whitehouse',
            status: 'active',
        },
    },
];

const TENANTS = [
    {
        phone: '0712345678',
        password: 'Jane@1234',
        profile: {
            name: 'Jane Mwangi',
            email: 'jane@example.com',
            phone: '0712345678',
            role: 'tenant',
            status: 'active',
            apartment: 'victoria',
            room: '103',
            rent: 10000,
            water: 850,
            other: 0,
            moveIn: '2025-03-01',
            landlordId: null,  // filled in after landlord creation
        },
    },
    {
        phone: '0723456789',
        password: 'James@1234',
        profile: {
            name: 'James Otieno',
            email: '',
            phone: '0723456789',
            role: 'tenant',
            status: 'active',
            apartment: 'victoria',
            room: '105',
            rent: 9500,
            water: 720,
            other: 0,
            moveIn: '2025-06-15',
            landlordId: null,
        },
    },
    {
        phone: '0734567890',
        password: 'Amina@1234',
        profile: {
            name: 'Amina Hassan',
            email: '',
            phone: '0734567890',
            role: 'tenant',
            status: 'active',
            apartment: 'whitehouse',
            room: 'A2',
            rent: 7500,
            water: 600,
            other: 0,
            moveIn: '2025-09-01',
            landlordId: null,
        },
    },
];

// ── SEED FUNCTIONS ────────────────────────────────────────────────────────────
async function seedApartments() {
    console.log('\n📍 Seeding apartments...');
    for (const apt of APARTMENTS) {
        const { id, ...data } = apt;
        await db.collection('apartments').doc(id).set(data, { merge: true });
        console.log(`  ✓ ${apt.name}`);
    }
}

async function seedLandlords() {
    console.log('\n🔑 Seeding landlords...');
    const landlordUids = {};
    for (const ll of LANDLORDS) {
        try {
            // Create or get Firebase Auth user
            let user;
            try {
                user = await auth.getUserByEmail(ll.email);
                console.log(`  ↩ ${ll.profile.name} already exists`);
            } catch (_) {
                user = await auth.createUser({
                    email:         ll.email,
                    password:      ll.password,
                    displayName:   ll.profile.name,
                    emailVerified: true,
                });
                console.log(`  ✓ ${ll.profile.name} created`);
            }
            // Write profile to Firestore
            await db.collection('users').doc(user.uid).set({
                ...ll.profile,
                email: ll.email,
                uid: user.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            landlordUids[ll.profile.apartment] = user.uid;
        } catch (err) {
            console.error(`  ✗ ${ll.profile.name}:`, err.message);
        }
    }
    return landlordUids;
}

async function seedTenants(landlordUids) {
    console.log('\n👥 Seeding tenants...');
    for (const tn of TENANTS) {
        const email = `${tn.phone.replace(/\s/g,'')}@prent.internal`;
        try {
            let user;
            try {
                user = await auth.getUserByEmail(email);
                console.log(`  ↩ ${tn.profile.name} already exists`);
            } catch (_) {
                user = await auth.createUser({
                    email,
                    password:    tn.password,
                    displayName: tn.profile.name,
                });
                console.log(`  ✓ ${tn.profile.name} created`);
            }
            const landlordId = landlordUids[tn.profile.apartment] || null;
            await db.collection('users').doc(user.uid).set({
                ...tn.profile,
                landlordId,
                uid: user.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        } catch (err) {
            console.error(`  ✗ ${tn.profile.name}:`, err.message);
        }
    }
}

async function createSuperAdmin() {
    console.log('\n⚙️  Creating superadmin...');
    const email    = 'admin@prent.co.ke';
    const password = 'PrentAdmin@2026';
    try {
        let user;
        try {
            user = await auth.getUserByEmail(email);
            console.log('  ↩ Superadmin already exists');
        } catch (_) {
            user = await auth.createUser({ email, password, displayName: 'Platform Admin', emailVerified: true });
            console.log('  ✓ Superadmin created');
        }
        await db.collection('users').doc(user.uid).set({
            uid: user.uid, name: 'Platform Admin',
            email, role: 'superadmin', status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`  📧 Login: ${email}  🔑 Password: ${password}`);
    } catch (err) {
        console.error('  ✗ Superadmin:', err.message);
    }
}

// ── RUN ───────────────────────────────────────────────────────────────────────
(async () => {
    try {
        await seedApartments();
        const landlordUids = await seedLandlords();
        await seedTenants(landlordUids);
        await createSuperAdmin();
        console.log('\n✅ Firestore seeding complete!\n');
    } catch (err) {
        console.error('\n❌ Seeding failed:', err.message);
    } finally {
        process.exit(0);
    }
})();
