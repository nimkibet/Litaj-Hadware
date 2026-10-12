import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();
if(currentUser.role !== 'admin') window.location.href = '/pos.html';

async function load() {
    const {data} = await supabase.from('users').select('*').order('username');
    const tb = document.getElementById('user-tbody'); tb.innerHTML = '';
    (data||[]).forEach(u => tb.innerHTML += `<tr class="hover:bg-slate-50"><td class="py-3 px-4 font-bold text-slate-800">${u.username}</td><td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded ${u.role==='admin'?'bg-purple-100 text-purple-800':'bg-slate-200 text-slate-800'}">${u.role.toUpperCase()}</span></td><td class="py-3 px-4 text-center"><button class="bg-orange-50 hover:bg-orange-100 text-orange-600 px-3 py-1 rounded font-bold text-xs" onclick="resetPin('${u.id}', '${u.username}')">Set PIN</button></td></tr>`);
}

window.resetPin = (id, name) => {
    showModal('Change PIN', `<p class="mb-3 text-sm">Set new 4-digit PIN for <strong>${name}</strong>:</p><input type="password" id="new-pin" maxlength="4" class="w-full border rounded px-3 py-2 text-center tracking-[1em] font-bold text-xl">`, async (close) => {
        const pin = document.getElementById('new-pin').value;
        if(pin.length !== 4) throw new Error("PIN must be exactly 4 digits");
        await supabase.from('users').update({pin}).eq('id',id);
        close(); load();
    }, 'Update PIN');
};

document.getElementById('btn-add-user').addEventListener('click', () => {
    showModal('Add User', `
        <div class="space-y-3">
            <div><label class="block text-sm font-semibold mb-1">Username</label><input type="text" id="add-u-name" class="w-full border rounded px-3 py-2"></div>
            <div><label class="block text-sm font-semibold mb-1">PIN (4 digits)</label><input type="password" maxlength="4" id="add-u-pin" class="w-full border rounded px-3 py-2"></div>
            <div><label class="block text-sm font-semibold mb-1">Role</label><select id="add-u-role" class="w-full border rounded px-3 py-2"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
        </div>
    `, async (close) => {
        const username = document.getElementById('add-u-name').value;
        const pin = document.getElementById('add-u-pin').value;
        if(!username || pin.length !== 4) throw new Error("Valid username and 4-digit PIN required");
        await supabase.from('users').insert([{username, pin, role: document.getElementById('add-u-role').value}]);
        close(); load();
    }, 'Create User');
});
load();
