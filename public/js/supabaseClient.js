/**
 * Litaj Hardware POS — Supabase Client & Auth State Guard
 * Layer 04 (Auth & Permissions): PIN-based auth, role enforcement, session management
 * Layer 01 (Frontend Foundations): No secrets hardcoded — URL/key loaded from meta tags injected by server
 *
 * SECURITY NOTE: SUPABASE_ANON_KEY is the public-facing anon key (safe for client).
 * Service-role key is NEVER shipped to the client under any circumstances.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// ── Config loaded from <meta> tags rendered server-side ─────
// Server injects: <meta name="supa-url" content="..."> and <meta name="supa-key" content="...">
function getMeta(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    if (!el || !el.content) throw new Error(`Missing required meta tag: ${name}`);
    return el.content;
}

let supabaseUrl, supabaseKey;
try {
    supabaseUrl = getMeta('supa-url');
    supabaseKey = getMeta('supa-key');
} catch (e) {
    console.error('[Litaj POS] Supabase config meta tags missing. Cannot initialize client.', e.message);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Session State ────────────────────────────────────────────
export let currentUser = null;
const SESSION_KEY = 'litaj_pos_session';

// ── Auth — PIN Login ─────────────────────────────────────────
export async function login(username, pin) {
    if (!username || !pin) return { success: false, message: 'Username and PIN are required.' };
    // Sanitize inputs before DB query (Layer 03)
    const cleanUsername = username.trim().toLowerCase();
    const cleanPin      = pin.trim();

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, full_name')
            .eq('username', cleanUsername)
            .eq('pin', cleanPin)
            .maybeSingle();

        if (error)  return { success: false, message: 'Authentication service error. Try again.' };
        if (!data)  return { success: false, message: 'Invalid username or PIN code.' };

        currentUser = data;
        // Store non-sensitive session data only (Layer 04 — no sensitive fields persisted)
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            id:        data.id,
            username:  data.username,
            role:      data.role,
            full_name: data.full_name
        }));
        return { success: true, user: data };
    } catch (err) {
        console.error('[Auth Error]', err.message);
        return { success: false, message: 'Unexpected error. Check your connection.' };
    }
}

// ── Auth — Logout ────────────────────────────────────────────
export function logout() {
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    window.location.replace('/login.html');
}

// ── Session — Restore ─────────────────────────────────────────
export function checkSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed?.id || !parsed?.role) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }
        currentUser = parsed;
        return true;
    } catch {
        localStorage.removeItem(SESSION_KEY);
        return false;
    }
}

// ── Auth Guard — requireAuth() ────────────────────────────────
export function requireAuth(options = {}) {
    if (!checkSession()) {
        window.location.replace('/login.html');
        return false;
    }

    const applyPermissions = () => {
        // Render user badge
        const badge = document.getElementById('current-user-badge');
        if (badge && currentUser) {
            badge.textContent = `${currentUser.full_name} · ${currentUser.role.toUpperCase()}`;
        }

        // Toggle role-gated elements (Layer 04 — authorization check)
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
        document.querySelectorAll('.cashier-only').forEach(el => el.classList.toggle('hidden', isAdmin && !!options.hideFromAdmin));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPermissions);
    } else {
        applyPermissions();
    }

    // Global logout listener
    document.addEventListener('click', e => {
        if (e.target?.closest('#btn-logout')) logout();
    });

    return true;
}

// ── Utility — Format Ksh currency ────────────────────────────
export function formatKsh(amount) {
    return `Ksh ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Utility — Toast Notification ─────────────────────────────
export function showToast(message, type = 'success') {
    const colors = {
        success: 'bg-emerald-600',
        error:   'bg-red-600',
        warning: 'bg-amber-500',
        info:    'bg-orange-600'
    };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-2xl transition-all transform translate-y-0 ${colors[type] || colors.info}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3200);
}
