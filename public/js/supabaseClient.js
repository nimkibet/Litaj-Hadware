import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';
export const supabase = createClient('https://sbpncxjddwontoemkuye.supabase.co', 'sb_publishable_86dCOSVSXe-IXIENSPG5Ow_JJOj5snI');
export let currentUser = null;

// Session TTL constants
export const SESSION_TTL_STANDARD_MS = 24 * 60 * 60 * 1000; // 1 Day (24 hours) default
export const SESSION_TTL_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days (1 week) with Remember Me

export async function login(username, pin, rememberMe = false) {
    const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('pin', pin).single();
    if (error || !data) return { success: false };
    
    const now = Date.now();
    const duration = rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_STANDARD_MS;
    const sessionPayload = {
        ...data,
        session_created_at: now,
        expires_at: now + duration,
        remember_me: !!rememberMe
    };

    currentUser = sessionPayload;
    localStorage.setItem('litaj_session', JSON.stringify(sessionPayload));
    return { success: true, user: sessionPayload };
}

export function logout(redirect = true) {
    currentUser = null;
    localStorage.removeItem('litaj_session');
    if (redirect) {
        window.location.href = '/login.html';
    }
}

export function checkSession() {
    const sessionStr = localStorage.getItem('litaj_session');
    if (!sessionStr) return false;
    try {
        const session = JSON.parse(sessionStr);
        if (!session || !session.id) {
            logout(false);
            return false;
        }

        // Validate token/session expiration timestamp
        if (session.expires_at) {
            if (Date.now() > session.expires_at) {
                console.warn('[Session] Token/Session has expired. Voiding local session.');
                logout(false);
                return false;
            }
        } else {
            // Legacy session backfill: 24h standard TTL
            session.session_created_at = Date.now();
            session.expires_at = Date.now() + SESSION_TTL_STANDARD_MS;
            session.remember_me = false;
            localStorage.setItem('litaj_session', JSON.stringify(session));
        }

        currentUser = session;
        return true;
    } catch (e) {
        logout(false);
        return false;
    }
}

export function requireAuth() {
    if (!checkSession()) {
        window.location.href = '/login.html?expired=1';
        return;
    }

    // Active heartbeat watchdog: checks session expiration every 60 seconds
    if (!window.__authWatchdogActive) {
        window.__authWatchdogActive = true;
        setInterval(() => {
            if (!checkSession()) {
                console.warn('[Session Watchdog] Session expired during usage. Redirecting to login.');
                window.location.href = '/login.html?expired=1';
            }
        }, 60000);
    }

    const unhide = () => {
        if (currentUser && currentUser.role === 'admin') {
            document.querySelectorAll('.admin-only').forEach(e => e.classList.remove('hidden'));
        }
    };
    unhide(); // Run immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', unhide);
    }
    setTimeout(unhide, 50); // Fallback for dynamic renders
    setTimeout(unhide, 200); // Fallback for dynamic renders
    
    // Universal mobile navigation menu & collapsible tile handler
    const setupNavEvents = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const menu = document.getElementById('mobile-menu');
        const chevron = document.getElementById('mobile-menu-chevron');
        
        if (btn && menu && !btn.dataset.bound) {
            btn.dataset.bound = 'true';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = menu.classList.contains('hidden');
                menu.classList.toggle('hidden');
                if (chevron) {
                    if (willOpen) chevron.classList.add('rotate-180');
                    else chevron.classList.remove('rotate-180');
                }
                if (willOpen) unhide();
            });
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target) && !menu.classList.contains('hidden')) {
                    menu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotate-180');
                }
            });
        }

        // Collapsible tile: Other Menus toggle
        const toggleOtherBtn = document.getElementById('toggle-other-menus-btn');
        const otherMenusPanel = document.getElementById('collapsible-other-menus');
        const chevronOther = document.getElementById('chevron-other-menus');
        if (toggleOtherBtn && otherMenusPanel && !toggleOtherBtn.dataset.bound) {
            toggleOtherBtn.dataset.bound = 'true';
            toggleOtherBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = otherMenusPanel.classList.contains('hidden');
                otherMenusPanel.classList.toggle('hidden');
                if (chevronOther) {
                    if (willOpen) chevronOther.classList.add('rotate-180');
                    else chevronOther.classList.remove('rotate-180');
                }
                if (willOpen) unhide();
            });
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupNavEvents);
    } else {
        setupNavEvents();
    }

    document.addEventListener('click', e => {
        if (e.target.closest('#btn-logout, #btn-logout-mobile, .action-logout')) {
            logout();
        }
    });
}
