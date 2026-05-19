/**
 * home.js — P-rent Homepage
 * Handles: apartment card rendering, animated counters, scroll reveals
 */

(() => {
    'use strict';

    // ── DATA ──────────────────────────────────────────────────────────────────
    // In production this would be fetched from an API / localStorage
    const APARTMENTS = [
        {
            id: 'victoria',
            name: 'Victoria Apartments',
            location: 'Mukuru Kwa Njenga, Embakasi South, Nairobi',
            county: 'Nairobi County',
            totalRooms: 10,
            availableRooms: 3,
            status: 'available',   // 'available' | 'full'
        },
        {
            id: 'whitehouse',
            name: 'White House Apartments',
            location: 'Kabarak, Nakuru',
            county: 'Nakuru County',
            totalRooms: 12,
            availableRooms: 5,
            status: 'available',
        },
    ];

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

    // ── RENDER APARTMENT CARDS ────────────────────────────────────────────────
    function renderApartments() {
        const container = $('home-apartment-list');
        if (!container) return;

        // Pull any real-time availability from localStorage (set by admin/dashboard)
        const stored = JSON.parse(localStorage.getItem('prent_apartments') || 'null');
        const data = stored || APARTMENTS;

        if (data.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:3rem;color:rgba(245,242,236,0.35);font-size:0.9rem;">
                    No apartments listed yet.
                </div>`;
            return;
        }

        container.innerHTML = data.map((apt, i) => {
            const isAvailable = apt.availableRooms > 0;
            const tagLabel    = isAvailable ? 'Available' : 'Fully Occupied';

            return `
            <article class="apartment-card" style="animation-delay:${i * 0.1}s" data-id="${apt.id}">
                <div class="card-tag">${tagLabel}</div>
                <h3>${apt.name}</h3>
                <div class="card-meta">
                    <p>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                        </svg>
                        ${apt.location}
                    </p>
                    <p class="rooms-badge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        </svg>
                        ${apt.availableRooms} of ${apt.totalRooms} rooms available
                    </p>
                </div>
                <div class="card-footer">
                    <span style="font-size:0.78rem;color:rgba(245,242,236,0.35);font-weight:300;">${apt.county}</span>
                    <button class="view-btn" data-id="${apt.id}">
                        View Details
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </article>`;
        }).join('');

        // Wire up view buttons
        qsa('.view-btn', container).forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                window.location.href = `apartments.html?id=${id}`;
            });
        });
    }

    // ── ANIMATED COUNTERS (hero stats) ────────────────────────────────────────
    function animateCounter(el, target, duration = 1200) {
        const isPercent = el.dataset.suffix === '%';
        const isPlus    = el.dataset.suffix === '+';
        const start     = performance.now();

        function step(now) {
            const elapsed  = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const value = Math.round(ease * target);
            el.textContent = value + (isPercent ? '%' : isPlus ? '+' : '');
            if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    function initCounters() {
        const stored = JSON.parse(localStorage.getItem('prent_apartments') || 'null');
        const data   = stored || APARTMENTS;

        const totalProps = data.length;
        const totalRooms = data.reduce((sum, a) => sum + a.availableRooms, 0);

        const propEl  = document.querySelector('.stat-item:nth-child(1) .stat-num');
        const roomEl  = document.querySelector('.stat-item:nth-child(2) .stat-num');
        const mgmtEl  = document.querySelector('.stat-item:nth-child(3) .stat-num');

        if (propEl) { propEl.dataset.suffix = ''; animateCounter(propEl, totalProps); }
        if (roomEl) { roomEl.dataset.suffix = '+'; animateCounter(roomEl, totalRooms); }
        if (mgmtEl) { mgmtEl.dataset.suffix = '%'; animateCounter(mgmtEl, 100, 1600); }
    }

    // ── SCROLL REVEAL ─────────────────────────────────────────────────────────
    function initScrollReveal() {
        const targets = qsa('.feature-item, .apartment-card, .about-left, .about-right');

        if (!('IntersectionObserver' in window)) {
            // Fallback: just show everything
            targets.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
            return;
        }

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity  = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        targets.forEach(el => {
            el.style.opacity   = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
            observer.observe(el);
        });
    }

    // ── ACTIVE NAV LINK ───────────────────────────────────────────────────────
    function setActiveNav() {
        const current = window.location.pathname.split('/').pop() || 'index.html';
        qsa('.nav-links a').forEach(a => {
            const href = a.getAttribute('href');
            a.classList.toggle('active', href === current);
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    function init() {
        renderApartments();
        initCounters();
        initScrollReveal();
        setActiveNav();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();


