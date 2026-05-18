/**
 * notifications.js — P-rent Notification System
 *
 * Central store for in-app notifications.
 * Used by: landlord-dashboard.js, dashboard.js, add-tenant.js
 *
 * Notification types:
 *   'rent_due'      — tenant rent is due soon / overdue
 *   'payment'       — payment received
 *   'new_tenant'    — new self-registered tenant pending approval
 *   'water_set'     — landlord set water bill
 *   'approved'      — registration approved
 *   'rejected'      — registration rejected
 *   'reminder'      — general reminder
 *
 * Storage:
 *   localStorage key: 'prent_notifications'
 *   Each notification: { id, type, title, message, timestamp, read, targetRole, targetId }
 *   targetRole: 'tenant' | 'landlord' | 'all'
 *   targetId:   tenant/landlord id (null = broadcast to role)
 */
const NOTIF = (() => {
    'use strict';
 
    const KEY = 'prent_notifications';

    // ── Icons per type ────────────────────────────────────────────────────────
    const ICONS = {
        rent_due:   { emoji: '📅', bg: 'rgba(224,160,80,0.15)'  },
        payment:    { emoji: '✅', bg: 'rgba(94,189,142,0.15)'  },
        new_tenant: { emoji: '👤', bg: 'rgba(112,168,224,0.15)' },
        water_set:  { emoji: '💧', bg: 'rgba(112,168,224,0.15)' },
        approved:   { emoji: '🎉', bg: 'rgba(94,189,142,0.15)'  },
        rejected:   { emoji: '❌', bg: 'rgba(224,112,112,0.15)' },
        reminder:   { emoji: '🔔', bg: 'rgba(184,134,11,0.15)'  },
        system:     { emoji: 'ℹ️', bg: 'rgba(255,255,255,0.08)'  },
    };

    // ── CRUD ──────────────────────────────────────────────────────────────────
    function getAll() {
        return JSON.parse(localStorage.getItem(KEY) || '[]');
    }

    function saveAll(list) {
        // Keep max 100 notifications
        const trimmed = list.slice(0, 100);
        localStorage.setItem(KEY, JSON.stringify(trimmed));
    }

    /**
     * Add a notification
     * @param {object} opts
     *   type, title, message, targetRole, targetId (optional)
     */
    function add({ type = 'system', title, message, targetRole = 'all', targetId = null }) {
        const notifs = getAll();
        notifs.unshift({
            id:         'N' + Date.now() + Math.random().toString(36).slice(2, 5),
            type,
            title,
            message,
            targetRole,
            targetId,
            timestamp:  new Date().toISOString(),
            read:       false,
        });
        saveAll(notifs);
        // Dispatch event so any open panel can re-render
        window.dispatchEvent(new CustomEvent('prent:notification', { detail: { type, title } }));
    }

    /**
     * Get notifications for a specific session
     * @param {object} session — { role, id }
     */
    function forSession(session) {
        if (!session) return [];
        return getAll().filter(n =>
            n.targetRole === 'all' ||
            n.targetRole === session.role ||
            (n.targetId && n.targetId === session.id)
        );
    }

    function markRead(id) {
        const list = getAll().map(n => n.id === id ? { ...n, read: true } : n);
        saveAll(list);
    }

    function markAllRead(session) {
        const list = getAll().map(n => {
            const mine = n.targetRole === 'all' || n.targetRole === session?.role || n.targetId === session?.id;
            return mine ? { ...n, read: true } : n;
        });
        saveAll(list);
    }

    function unreadCount(session) {
        return forSession(session).filter(n => !n.read).length;
    }

    function getIcon(type) {
        return ICONS[type] || ICONS.system;
    }

    function fmtTime(iso) {
        const d   = new Date(iso);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60)   return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400)return Math.floor(diff / 3600) + 'h ago';
        return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    }

    // ── BUILT-IN TRIGGERS ─────────────────────────────────────────────────────

    /** Call when a tenant payment is confirmed */
    function onPaymentReceived({ tenantId, tenantName, amount, landlordId }) {
        add({
            type:       'payment',
            title:      'Payment Received',
            message:    `${tenantName} paid KES ${Number(amount).toLocaleString('en-KE')}`,
            targetRole: 'landlord',
            targetId:   landlordId,
        });
        add({
            type:       'payment',
            title:      'Payment Confirmed',
            message:    `Your payment of KES ${Number(amount).toLocaleString('en-KE')} was received.`,
            targetRole: 'tenant',
            targetId:   tenantId,
        });
    }

    /** Call when landlord sets a water bill */
    function onWaterBillSet({ tenantId, tenantName, amount }) {
        add({
            type:       'water_set',
            title:      'Water Bill Updated',
            message:    `Your water bill has been set to KES ${Number(amount).toLocaleString('en-KE')} this month.`,
            targetRole: 'tenant',
            targetId:   tenantId,
        });
    }

    /** Call when a new self-registered tenant is pending */
    function onNewPendingTenant({ landlordId, tenantName, apartment }) {
        add({
            type:       'new_tenant',
            title:      'New Tenant Pending',
            message:    `${tenantName} registered for ${apartment} and needs approval.`,
            targetRole: 'landlord',
            targetId:   landlordId,
        });
    }

    /** Call when landlord approves a tenant */
    function onTenantApproved({ tenantId, tenantName }) {
        add({
            type:       'approved',
            title:      'Registration Approved',
            message:    `Welcome, ${tenantName}! Your account has been approved. You can now log in.`,
            targetRole: 'tenant',
            targetId:   tenantId,
        });
    }

    /** Call when landlord rejects a tenant */
    function onTenantRejected({ tenantId, tenantName }) {
        add({
            type:       'rejected',
            title:      'Registration Not Approved',
            message:    `Sorry, ${tenantName}. Your registration was not approved. Contact your landlord.`,
            targetRole: 'tenant',
            targetId:   tenantId,
        });
    }

    /** Generate rent-due reminders for all tenants in an apartment */
    function sendRentReminders(tenants) {
        const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        tenants.forEach(t => {
            add({
                type:       'rent_due',
                title:      'Rent Reminder',
                message:    `Your rent of KES ${Number(t.rent).toLocaleString('en-KE')} is due for ${month}. Please pay promptly.`,
                targetRole: 'tenant',
                targetId:   t.id,
            });
        });
    }

    // ── RENDER HELPER (for notification panel HTML) ───────────────────────────
    function renderList(session, maxItems = 20) {
        const items = forSession(session).slice(0, maxItems);
        if (items.length === 0) {
            return `<div class="np-empty">No notifications yet.</div>`;
        }
        return items.map(n => {
            const icon = getIcon(n.type);
            return `
            <div class="np-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                <div class="np-icon" style="background:${icon.bg}">${icon.emoji}</div>
                <div class="np-text">
                    <div class="nt-title">${n.title}</div>
                    <div class="nt-sub">${n.message}</div>
                    <div class="nt-sub" style="margin-top:0.2rem;opacity:0.6">${fmtTime(n.timestamp)}</div>
                </div>
            </div>`;
        }).join('');
    }

    // ── SEED DEMO NOTIFICATIONS ───────────────────────────────────────────────
    function seedDemo() {
        if (getAll().length > 0) return; // already seeded
        const demo = [
            { type:'payment',    title:'Payment Received',     message:'Jane Mwangi paid KES 10,000 for May rent.',             targetRole:'landlord', targetId:'LL001', timestamp: new Date(Date.now()-3600000).toISOString(),  read:false },
            { type:'new_tenant', title:'New Tenant Pending',   message:'James Otieno registered for Victoria Apartments.',       targetRole:'landlord', targetId:'LL001', timestamp: new Date(Date.now()-7200000).toISOString(),  read:false },
            { type:'water_set',  title:'Water Bill Updated',   message:'Your water bill is KES 850 for June.',                  targetRole:'tenant',   targetId:'TN001', timestamp: new Date(Date.now()-86400000).toISOString(), read:false },
            { type:'rent_due',   title:'Rent Reminder',        message:'Your June rent of KES 10,000 is due on 1 June.',         targetRole:'tenant',   targetId:'TN001', timestamp: new Date(Date.now()-172800000).toISOString(),read:true  },
            { type:'approved',   title:'Registration Approved',message:'Welcome! Your account has been approved.',               targetRole:'tenant',   targetId:'TN002', timestamp: new Date(Date.now()-259200000).toISOString(),read:true  },
        ].map((n,i) => ({ ...n, id: 'ND' + i }));
        saveAll(demo);
    }

    return {
        getAll, forSession, add, markRead, markAllRead,
        unreadCount, getIcon, fmtTime, renderList,
        seedDemo,
        onPaymentReceived, onWaterBillSet, onNewPendingTenant,
        onTenantApproved, onTenantRejected, sendRentReminders,
    };

})();