// server/index.js — P-rent Backend API Server
// Stack: Node.js + Express + MongoDB (Mongoose) + Firebase Admin SDK
//
// WHAT THIS HANDLES:
//   - M-Pesa STK Push via Safaricom Daraja API
//   - Card payments via Flutterwave
//   - MongoDB storage for transactions + audit logs
//   - Firebase Admin for server-side auth verification
//   - REST endpoints consumed by the frontend
//
// INSTALL DEPENDENCIES:
//   npm init -y
//   npm install express mongoose cors dotenv axios firebase-admin
//   npm install --save-dev nodemon
//
// ENVIRONMENT VARIABLES (.env):
//   PORT=5000
//   MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/prent
//   FIREBASE_PROJECT_ID=your-project-id
//   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
//   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
//   MPESA_CONSUMER_KEY=your_daraja_consumer_key
//   MPESA_CONSUMER_SECRET=your_daraja_consumer_secret
//   MPESA_SHORTCODE=174379
//   MPESA_PASSKEY=your_lipa_na_mpesa_passkey
//   MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback
//   FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxxx
//   JWT_SECRET=your_jwt_secret_here
//   NODE_ENV=development

'use strict';

const express        = require('express');
const mongoose       = require('mongoose');
const cors           = require('cors');
const dotenv         = require('dotenv');
const axios          = require('axios');
const admin          = require('firebase-admin');

dotenv.config();

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://your-prent-domain.netlify.app',   // update after deployment
    ],
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── FIREBASE ADMIN ────────────────────────────────────────────────────────────
admin.initializeApp({
    credential: admin.credential.cert({
        projectId:    process.env.FIREBASE_PROJECT_ID,
        privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
    }),
});

// ── MONGODB CONNECTION ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("u2705 MongoDB connected"))
.catch(err => { console.error("u274c MongoDB error:", err.message); process.exit(1); });
.then(() => console.log('✅ MongoDB connected'))
.catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

// ── MONGOOSE SCHEMAS ──────────────────────────────────────────────────────────

// Transaction (payment record)
const transactionSchema = new mongoose.Schema({
    tenantId:    { type: String, required: true, index: true },
    tenantName:  { type: String },
    apartmentId: { type: String, required: true, index: true },
    landlordId:  { type: String },
    amount:      { type: Number, required: true },
    method:      { type: String, enum: ['mpesa','visa','mastercard','cash'], required: true },
    status:      { type: String, enum: ['paid','pending','failed'], default: 'pending' },
    description: { type: String },
    reference:   { type: String, unique: true, sparse: true },
    mpesaRef:    { type: String },       // M-Pesa transaction ID
    checkoutId:  { type: String },       // STK push checkout request ID
    period:      { type: String },       // e.g. "2026-06"
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

// Notification
const notificationSchema = new mongoose.Schema({
    targetId:   { type: String, required: true, index: true },
    targetRole: { type: String, enum: ['tenant','landlord','superadmin','all'] },
    type:       { type: String },
    title:      { type: String },
    message:    { type: String },
    read:       { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
});

// Audit log
const auditSchema = new mongoose.Schema({
    actor:     { type: String },
    action:    { type: String },
    target:    { type: String },
    details:   { type: mongoose.Schema.Types.Mixed },
    ip:        { type: String },
    createdAt: { type: Date, default: Date.now },
});

const Transaction  = mongoose.model('Transaction',  transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const AuditLog     = mongoose.model('AuditLog',     auditSchema);

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
// Verifies Firebase ID token sent in Authorization: Bearer <token> header
async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided.' });
    }
    try {
        const decoded  = await admin.auth().verifyIdToken(header.slice(7));
        req.user       = decoded;
        req.uid        = decoded.uid;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

// Role check middleware factory
function requireRole(...roles) {
    return async (req, res, next) => {
        const snap = await admin.firestore().collection('users').doc(req.uid).get();
        if (!snap.exists) return res.status(403).json({ error: 'User profile not found.' });
        req.profile = snap.data();
        if (!roles.includes(req.profile.role)) {
            return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}.` });
        }
        next();
    };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function genRef(prefix) {
    return prefix + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── MPESA DARAJA INTEGRATION ──────────────────────────────────────────────────
let mpesaToken     = null;
let mpesaTokenExp  = 0;

async function getMpesaToken() {
    if (mpesaToken && Date.now() < mpesaTokenExp) return mpesaToken;

    const creds    = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get(
        'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        // Production: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        { headers: { Authorization: `Basic ${creds}` } }
    );
    mpesaToken    = response.data.access_token;
    mpesaTokenExp = Date.now() + (response.data.expires_in - 60) * 1000;
    return mpesaToken;
}

// POST /api/mpesa/stk-push
app.post('/api/mpesa/stk-push', requireAuth, async (req, res) => {
    const { phone, amount, tenantId, apartmentId, description } = req.body;

    if (!phone || !amount || !tenantId) {
        return res.status(400).json({ error: 'phone, amount and tenantId are required.' });
    }

    const cleanPhone = phone.replace(/\s/g, '').replace(/^\+?254/, '254').replace(/^0/, '254');
    const timestamp  = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const passkey    = process.env.MPESA_PASSKEY;
    const shortcode  = process.env.MPESA_SHORTCODE;
    const password   = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    try {
        const token    = await getMpesaToken();
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            // Production: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
            {
                BusinessShortCode: shortcode,
                Password:          password,
                Timestamp:         timestamp,
                TransactionType:   'CustomerPayBillOnline',
                Amount:            Math.round(amount),
                PartyA:            cleanPhone,
                PartyB:            shortcode,
                PhoneNumber:       cleanPhone,
                CallBackURL:       process.env.MPESA_CALLBACK_URL,
                AccountReference:  `PRENT-${tenantId.slice(-6).toUpperCase()}`,
                TransactionDesc:   description || 'Rent Payment',
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const checkoutId = response.data.CheckoutRequestID;

        // Save pending transaction to MongoDB
        const tx = await Transaction.create({
            tenantId,
            apartmentId,
            landlordId: req.profile?.landlordId || null,
            amount:     Number(amount),
            method:     'mpesa',
            status:     'pending',
            description: description || 'Rent Payment',
            checkoutId,
            reference:  genRef('STK-'),
            period:     new Date().toISOString().slice(0, 7),
        });

        res.json({
            success:     true,
            checkoutId,
            transactionId: tx._id,
            message:     'STK push sent. Awaiting customer PIN.',
        });

    } catch (err) {
        console.error('M-Pesa STK error:', err.response?.data || err.message);
        res.status(500).json({ error: 'M-Pesa request failed. Please try again.' });
    }
});

// POST /api/mpesa/callback  — Safaricom calls this after customer responds
app.post('/api/mpesa/callback', async (req, res) => {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.json({ ResultCode: 0 });

    const resultCode  = callback.ResultCode;
    const checkoutId  = callback.CheckoutRequestID;
    const mpesaRef    = callback.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

    const status = resultCode === 0 ? 'paid' : 'failed';

    try {
        const tx = await Transaction.findOneAndUpdate(
            { checkoutId },
            { status, mpesaRef, updatedAt: new Date() },
            { new: true }
        );

        if (tx && status === 'paid') {
            // Create notification in MongoDB
            await Notification.create({
                targetId:   tx.tenantId,
                targetRole: 'tenant',
                type:       'payment',
                title:      'Payment Confirmed',
                message:    `Your payment of KES ${tx.amount.toLocaleString('en-KE')} was received. Ref: ${mpesaRef}`,
            });
            // Also notify landlord
            if (tx.landlordId) {
                await Notification.create({
                    targetId:   tx.landlordId,
                    targetRole: 'landlord',
                    type:       'payment',
                    title:      'Payment Received',
                    message:    `Tenant paid KES ${tx.amount.toLocaleString('en-KE')} via M-Pesa. Ref: ${mpesaRef}`,
                });
            }
        }
    } catch (err) {
        console.error('Callback processing error:', err.message);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// GET /api/mpesa/status/:checkoutId — poll payment status
app.get('/api/mpesa/status/:checkoutId', requireAuth, async (req, res) => {
    const tx = await Transaction.findOne({ checkoutId: req.params.checkoutId });
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ status: tx.status, reference: tx.mpesaRef, amount: tx.amount });
});

// ── FLUTTERWAVE CARD PAYMENT ──────────────────────────────────────────────────
// POST /api/card/charge
app.post('/api/card/charge', requireAuth, async (req, res) => {
    const {
        cardNumber, cvv, expiryMonth, expiryYear,
        cardholderName, amount, tenantId, apartmentId, description,
    } = req.body;

    if (!cardNumber || !cvv || !expiryMonth || !expiryYear || !amount) {
        return res.status(400).json({ error: 'All card fields and amount are required.' });
    }

    try {
        const response = await axios.post(
            'https://api.flutterwave.com/v3/charges?type=card',
            {
                card_number:    cardNumber.replace(/\s/g, ''),
                cvv,
                expiry_month:   expiryMonth,
                expiry_year:    expiryYear,
                currency:       'KES',
                amount:         Number(amount),
                fullname:       cardholderName,
                email:          req.profile?.email || `${tenantId}@prent.internal`,
                tx_ref:         genRef('FLW-'),
                redirect_url:   'https://your-prent-domain.netlify.app/payment-complete.html',
            },
            { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
        );

        const flwData = response.data;
        const success = flwData.status === 'success';
        const ref     = flwData.data?.flw_ref || genRef('FLW-');

        const tx = await Transaction.create({
            tenantId,
            apartmentId,
            amount:      Number(amount),
            method:      'visa',         // or mastercard — detect from card number
            status:      success ? 'paid' : 'failed',
            description: description || 'Card Payment',
            reference:   ref,
            period:      new Date().toISOString().slice(0, 7),
        });

        if (success) {
            await Notification.create({
                targetId:   tenantId,
                targetRole: 'tenant',
                type:       'payment',
                title:      'Card Payment Confirmed',
                message:    `KES ${Number(amount).toLocaleString('en-KE')} charged to your card. Ref: ${ref}`,
            });
        }

        res.json({ success, reference: ref, transactionId: tx._id });

    } catch (err) {
        console.error('Card charge error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Card payment failed. Please try again.' });
    }
});

// ── TRANSACTIONS API ──────────────────────────────────────────────────────────
// GET /api/transactions?tenantId=xxx&limit=50
app.get('/api/transactions', requireAuth, async (req, res) => {
    const { tenantId, apartmentId, limit: lim = 50 } = req.query;
    const filter = {};
    if (tenantId)    filter.tenantId    = tenantId;
    if (apartmentId) filter.apartmentId = apartmentId;

    const txs = await Transaction.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(lim));
    res.json(txs);
});

// ── NOTIFICATIONS API ─────────────────────────────────────────────────────────
// GET /api/notifications/:userId
app.get('/api/notifications/:userId', requireAuth, async (req, res) => {
    const notifs = await Notification.find({
        $or: [
            { targetId: req.params.userId },
            { targetRole: req.profile?.role },
            { targetRole: 'all' },
        ],
    }).sort({ createdAt: -1 }).limit(30);
    res.json(notifs);
});

// PATCH /api/notifications/:id/read
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
});

// PATCH /api/notifications/read-all/:userId
app.patch('/api/notifications/read-all/:userId', requireAuth, async (req, res) => {
    await Notification.updateMany({ targetId: req.params.userId }, { read: true });
    res.json({ success: true });
});

// ── WATER BILL API ────────────────────────────────────────────────────────────
// PATCH /api/tenants/:uid/water
app.patch('/api/tenants/:uid/water', requireAuth, requireRole('landlord','superadmin'), async (req, res) => {
    const { water, other } = req.body;
    try {
        await admin.firestore().collection('users').doc(req.params.uid).update({
            water: Number(water || 0),
            other: Number(other || 0),
        });
        // Notify tenant
        await Notification.create({
            targetId:   req.params.uid,
            targetRole: 'tenant',
            type:       'water_set',
            title:      'Water Bill Updated',
            message:    `Your water bill has been set to KES ${Number(water).toLocaleString('en-KE')} this month.`,
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status:   'ok',
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("u2705 MongoDB connected"))
.catch(err => { console.error("u274c MongoDB error:", err.message); process.exit(1); });
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 P-rent API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;