import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';
export const supabase = createClient('https://sbpncxjddwontoemkuye.supabase.co', 'sb_publishable_86dCOSVSXe-IXIENSPG5Ow_JJOj5snI');
export let currentUser = null;
export async function login(username, pin) {
    const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('pin', pin).single();
    if (error || !data) return { success: false };
    currentUser = data; localStorage.setItem('litaj_session', JSON.stringify(data));
    return { success: true, user: data };
}
export function logout() { currentUser = null; localStorage.removeItem('litaj_session'); window.location.href = '/login.html'; }
export function checkSession() {
    const session = localStorage.getItem('litaj_session');
    if (session) { currentUser = JSON.parse(session); return true; }
    return false;
}
export function requireAuth() {
    if (!checkSession()) {
        window.location.href = '/login.html';
        return;
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
