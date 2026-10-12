/**
 * Litaj Hardware POS — Login Controller
 * Layer 01 (Frontend Foundations): Full input validation + graceful error states
 * Layer 04 (Auth): PIN auth delegated to supabaseClient.login()
 */

import { login, showToast } from './supabaseClient.js';

let pinBuffer = '';
const MAX_PIN = 4;

// ── Build 10-key numpad dynamically ──────────────────────────
const numpadContainer = document.querySelector('.grid.grid-cols-3');
const keyOrder = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];

numpadContainer.innerHTML = keyOrder.map(k => `
    <button
        class="key-btn h-14 rounded-xl font-bold text-xl transition-all
               ${k === '✓' ? 'bg-orange-600 text-white hover:bg-orange-700 border border-orange-700 shadow-md shadow-orange-200' :
                 k === '⌫' ? 'bg-red-50 border border-red-200 text-red-500 hover:bg-red-100' :
                 'bg-slate-50 border border-slate-200 text-slate-800 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700'}"
        data-key="${k}"
    >${k}</button>
`).join('');

// ── Update PIN dots visual state ─────────────────────────────
function updateDots() {
    for (let i = 1; i <= MAX_PIN; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot?.classList.toggle('filled', i <= pinBuffer.length);
    }
}

// ── Numpad key press handler ──────────────────────────────────
numpadContainer.addEventListener('click', async e => {
    const btn = e.target.closest('[data-key]');
    if (!btn) return;
    const key = btn.dataset.key;

    if (key === '⌫') {
        pinBuffer = pinBuffer.slice(0, -1);
        updateDots();
        return;
    }

    if (key === '✓') {
        await attemptLogin();
        return;
    }

    if (/^\d$/.test(key) && pinBuffer.length < MAX_PIN) {
        pinBuffer += key;
        updateDots();
        // Auto-submit when 4 digits entered
        if (pinBuffer.length === MAX_PIN) {
            await attemptLogin();
        }
    }
});

// ── Keyboard support ─────────────────────────────────────────
document.addEventListener('keydown', async e => {
    if (/^\d$/.test(e.key) && pinBuffer.length < MAX_PIN) {
        pinBuffer += e.key;
        updateDots();
        if (pinBuffer.length === MAX_PIN) await attemptLogin();
    } else if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        updateDots();
    } else if (e.key === 'Enter') {
        await attemptLogin();
    }
});

// ── Login attempt ─────────────────────────────────────────────
async function attemptLogin() {
    const username = document.getElementById('inp-username').value.trim();
    const errorEl  = document.getElementById('login-error');
    const loadEl   = document.getElementById('login-loading');

    // Validate inputs (Layer 01)
    errorEl.classList.add('hidden');
    if (!username) {
        errorEl.textContent = 'Please enter your username.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (pinBuffer.length < 4) {
        errorEl.textContent = 'Please enter your 4-digit PIN.';
        errorEl.classList.remove('hidden');
        return;
    }

    loadEl.classList.remove('hidden');

    const result = await login(username, pinBuffer);

    loadEl.classList.add('hidden');

    if (!result.success) {
        errorEl.textContent = result.message || 'Invalid credentials.';
        errorEl.classList.remove('hidden');
        // Reset PIN on failure
        pinBuffer = '';
        updateDots();
        return;
    }

    showToast(`Welcome, ${result.user.full_name}!`, 'success');
    setTimeout(() => {
        window.location.replace('/pos.html');
    }, 600);
}
