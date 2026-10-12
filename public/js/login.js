import { login, checkSession, supabase } from './supabaseClient.js';
if (checkSession()) window.location.href = '/pos.html';

let loginUser = ''; 
let currentPin = '';

async function loadUsers() {
    try {
        if (!navigator.onLine) throw new Error('Offline');
        const { data, error } = await supabase.from('users').select('id, username, role, pin').order('role');
        if (error) throw error;
        localStorage.setItem('litaj_users_cache', JSON.stringify(data));
        renderUsers(data);
    } catch (err) {
        const cached = localStorage.getItem('litaj_users_cache');
        if (cached) {
            renderUsers(JSON.parse(cached));
            document.getElementById('user-selector').insertAdjacentHTML('beforebegin', '<div class="text-xs text-center text-orange-500 mb-2 font-semibold">Offline Mode - Using Cached Users</div>');
        } else {
            document.getElementById('user-selector').innerHTML = '<div class="text-sm text-red-500 w-full text-center py-2">Offline & no cached users</div>';
        }
    }
}

function renderUsers(data) {
    const selector = document.getElementById('user-selector');
    selector.innerHTML = '';
    
    data.forEach((u, idx) => {
        if(idx === 0) loginUser = u.username;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.user = u.username;
        btn.className = idx === 0 
            ? "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-orange-600 shadow-sm"
            : "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
        
        const icon = u.role === 'admin' ? '🛡️' : '👤';
        btn.innerHTML = `${icon} <span class="capitalize">${u.username}</span>`;
        
        btn.addEventListener('click', (e) => {
            loginUser = e.currentTarget.dataset.user;
            document.querySelectorAll('.user-btn').forEach(b => b.className = "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900");
            e.currentTarget.className = "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-orange-600 shadow-sm";
        });
        selector.appendChild(btn);
    });
}

function updatePin() {
    document.querySelectorAll('.pin-dot').forEach((dot, idx) => {
        if (idx < currentPin.length) dot.classList.replace('border-slate-300', 'bg-orange-600');
        else { dot.classList.remove('bg-orange-600'); dot.classList.add('border-slate-300'); }
    });
}

document.querySelectorAll('.keypad-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const val = e.currentTarget.dataset.val; document.getElementById('login-error').classList.add('hidden');
    if (val === 'clear') currentPin = '';
    else if (val === 'back') currentPin = currentPin.slice(0, -1);
    else if (currentPin.length < 4) currentPin += val;
    updatePin();
}));

document.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) { currentPin += e.key; updatePin(); }
    else if (e.key === 'Backspace') { currentPin = currentPin.slice(0, -1); updatePin(); }
    else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') { currentPin = ''; updatePin(); }
    else if (e.key === 'Enter') processLogin();
});

document.getElementById('btn-login-submit').addEventListener('click', processLogin);

async function processLogin() {
    if (!loginUser) return alert('Please select a user');
    if (currentPin.length < 4) return alert('Enter 4 digit PIN');
    
    // Disable inputs while logging in
    document.getElementById('login-error').classList.add('hidden');
    
    if (!navigator.onLine) {
        // Offline PIN verification using cached user data
        const cachedStr = localStorage.getItem('litaj_users_cache');
        if (cachedStr) {
            const users = JSON.parse(cachedStr);
            const user = users.find(u => u.username === loginUser);
            if (user && user.pin === currentPin) {
                // Manually set session
                localStorage.setItem('litaj_session', JSON.stringify(user));
                window.location.href = '/pos.html';
                return;
            }
        }
        document.getElementById('login-error').classList.remove('hidden'); 
        currentPin = ''; 
        updatePin(); 
        return;
    }

    const res = await login(loginUser, currentPin);
    if (res.success) window.location.href = '/pos.html';
    else { 
        document.getElementById('login-error').classList.remove('hidden'); 
        currentPin = ''; 
        updatePin(); 
    }
}

// Init
loadUsers();
