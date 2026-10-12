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
    
    document.addEventListener('click', e => {
        if (e.target.id === 'btn-logout') logout();
    });
}
