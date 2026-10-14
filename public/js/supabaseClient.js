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
    
    // Universal mobile navigation menu toggle
    const setupNavEvents = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const menu = document.getElementById('mobile-menu');
        if (btn && menu && !btn.dataset.bound) {
            btn.dataset.bound = 'true';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target) && !menu.classList.contains('hidden')) {
                    menu.classList.add('hidden');
                }
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
