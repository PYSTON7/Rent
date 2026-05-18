/**
 * apartments.js — P-rent Apartments Page
 * Handles: data management, card rendering, search/filter, detail modal
 */

(() => {
    'use strict';

    // ── DATA ──────────────────────────────────────────────────────────────────
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
            description: 'A well-maintained block of self-contained units in the heart of Embakasi South. Close to major transport routes and local amenities.',
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
            id: 'whitehouse',
            name: 'White House Apartments',
            location: 'Kabarak, Nakuru',
            county: 'Nakuru County',
            icon: '🏠',
            totalRooms: 12,
            availableRooms: 5,
            rentRange: 'KES 6,000 – 9,500',
            description: 'Spacious units in a quiet residential neighbourhood near Kabarak University. Ideal for students and working professionals.',
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

    // ── STATE ─────────────────────────────────────────────────────────────────
    let activeFilter  = 'all';
    let searchTerm    = '';
    let apartments    = [];

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qs  = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

    function getData() {
        // Prefer live localStorage data (synced from dashboard / admin)
        const stored = JSON.parse(localStorage.getItem('prent_apartments') || 'null');
        return stored || APARTMENTS;
    }

    function getFiltered() {
        return apartments.filter(apt => {
            const matchesFilter =
                activeFilter === 'all' ||
                (activeFilter === 'available' && apt.availableRooms > 0) ||
                (activeFilter === 'full'      && apt.availableRooms === 0);

            const matchesSearch =
                apt.name.toLowerCase().includes(searchTerm) ||
                apt.location.toLowerCase().includes(searchTerm) ||
                apt.county.toLowerCase().includes(searchTerm);

            return matchesFilter && matchesSearch;
        });
    }

    function occupancyPct(apt) {
        const occupied = apt.totalRooms - apt.availableRooms;
        return Math.round((occupied / apt.totalRooms) * 100);
    }

    // ── RENDER CARDS ──────────────────────────────────────────────────────────
    function renderCards() {
        const grid    = $('apartments-grid');
        const counter = $('count-display');
        const data    = getFiltered();

        counter.textContent = data.length;

        if (data.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🏘️</div>
                    <p>No apartments match your search.</p>
                </div>`;
            return;
        }

        grid.innerHTML = data.map((apt, i) => {
            const isAvailable = apt.availableRooms > 0;
            const pct         = occupancyPct(apt);
            const initial     = apt.name.charAt(0);

            return `
            <article class="apt-card" data-id="${apt.id}" style="animation-delay:${i * 0.08}s" tabindex="0" role="button" aria-label="View ${apt.name}">
                <div class="card-visual">
                    <span class="big-initial">${initial}</span>
                    <span class="apt-icon">${apt.icon}</span>
                    <span class="status-badge ${isAvailable ? 'available' : 'full'}">
                        ${isAvailable ? 'Available' : 'Fully Occupied'}
                    </span>
                </div>

                <div class="card-body">
                    <h3>${apt.name}</h3>
                    <div class="meta">
                        <p>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            ${apt.location}
                        </p>
                        <p>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="7" width="20" height="14" rx="2"/>
                                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                            </svg>
                            ${apt.rentRange} / month
                        </p>
                    </div>

                    <div class="room-bar">
                        <div class="room-bar-top">
                            <span>Occupancy</span>
                            <strong>${pct}% (${apt.totalRooms - apt.availableRooms}/${apt.totalRooms})</strong>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%"></div>
                        </div>
                    </div>
                </div>

                <div class="card-footer">
                    <span class="rooms-pill">
                        ${apt.availableRooms} room${apt.availableRooms !== 1 ? 's' : ''} free
                    </span>
                    <button class="view-btn" data-id="${apt.id}">
                        View Details
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </article>`;
        }).join('');

        // Wire click — card or button
        qsa('.apt-card', grid).forEach(card => {
            card.addEventListener('click', e => {
                openModal(card.dataset.id);
            });
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') openModal(card.dataset.id);
            });
        });
    }

    // ── MODAL ─────────────────────────────────────────────────────────────────
    function openModal(id) {
        const apt = apartments.find(a => a.id === id);
        if (!apt) return;

        const isAvailable = apt.availableRooms > 0;
        const pct         = occupancyPct(apt);

        $('modal-initial').textContent = apt.name.charAt(0);

        $('modal-body').innerHTML = `
            <span class="modal-badge ${isAvailable ? 'available' : 'full'}">
                ${isAvailable ? 'Available' : 'Fully Occupied'}
            </span>
            <h2>${apt.name}</h2>

            <div class="modal-grid">
                <div class="modal-stat">
                    <div class="s-label">Available Rooms</div>
                    <div class="s-value">${apt.availableRooms}</div>
                    <div class="s-sub">of ${apt.totalRooms} total</div>
                </div>
                <div class="modal-stat">
                    <div class="s-label">Occupancy</div>
                    <div class="s-value">${pct}%</div>
                    <div class="s-sub">${apt.totalRooms - apt.availableRooms} tenants</div>
                </div>
                <div class="modal-stat">
                    <div class="s-label">Rent Range</div>
                    <div class="s-value" style="font-size:1rem;line-height:1.4">${apt.rentRange}</div>
                    <div class="s-sub">per month</div>
                </div>
                <div class="modal-stat">
                    <div class="s-label">Location</div>
                    <div class="s-value" style="font-size:0.95rem;line-height:1.4">${apt.county}</div>
                    <div class="s-sub">${apt.location.split(',')[0]}</div>
                </div>
            </div>

            <p style="font-size:0.875rem;color:rgba(245,242,236,0.5);font-weight:300;line-height:1.8;margin-bottom:1.5rem;">
                ${apt.description}
            </p>

            <div class="modal-section-title">Amenities</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.75rem;">
                ${apt.amenities.map(a => `
                    <span style="font-size:0.78rem;font-weight:500;color:var(--gold-lt);background:rgba(184,134,11,0.1);border:1px solid rgba(184,134,11,0.2);padding:0.25rem 0.65rem;border-radius:4px;">${a}</span>
                `).join('')}
            </div>

            <div class="modal-section-title">Room Status</div>
            <div class="rooms-list">
                ${apt.rooms.map(r => `
                    <div class="room-row">
                        <span class="rn">Room ${r.number}</span>
                        <span class="rs ${r.status}">${r.status === 'vacant' ? 'Vacant' : 'Occupied'}</span>
                    </div>
                `).join('')}
            </div>

            <div class="modal-actions">
                <button class="btn-primary" onclick="window.location.href='add-tenant.html'">
                    Add Tenant to This Apartment
                </button>
                <button class="btn-ghost" id="modal-close-inner">Close</button>
            </div>
        `;

        // Re-apply badge classes (they're in modal-body content)
        const badge = qs('.modal-badge', $('modal-body'));
        if (badge) {
            badge.style.cssText = isAvailable
                ? 'background:rgba(110,202,160,0.15);color:#6ecaa0;border:1px solid rgba(110,202,160,0.25);'
                : 'background:rgba(192,57,43,0.15);color:#e07070;border:1px solid rgba(192,57,43,0.25);';
        }

        $('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';

        $('modal-close-inner').addEventListener('click', closeModal);
    }

    function closeModal() {
        $('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── FILTER & SEARCH ───────────────────────────────────────────────────────
    function initToolbar() {
        // Filter buttons
        qsa('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                qsa('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                renderCards();
            });
        });

        // Search
        $('search-input').addEventListener('input', e => {
            searchTerm = e.target.value.trim().toLowerCase();
            renderCards();
        });
    }

    // ── URL PARAM — deep link to a specific apartment ──────────────────────
    function handleDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const id     = params.get('id');
        if (id) {
            // slight delay so cards are rendered first
            setTimeout(() => openModal(id), 300);
        }
    }

    // ── MODAL CLOSE HANDLERS ──────────────────────────────────────────────────
    function initModalClose() {
        $('modal-close').addEventListener('click', closeModal);
        $('modal-overlay').addEventListener('click', e => {
            if (e.target === $('modal-overlay')) closeModal();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeModal();
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    function init() {
        apartments = getData();
        renderCards();
        initToolbar();
        initModalClose();
        handleDeepLink();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
