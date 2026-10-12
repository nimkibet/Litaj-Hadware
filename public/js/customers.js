import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();
if(currentUser.role !== 'admin') window.location.href = '/pos.html';

async function load() {
    const {data} = await supabase.from('customers').select('*').order('name');
    const tb = document.getElementById('cust-tbody'); tb.innerHTML = '';
    (data||[]).forEach(c => {
        const nameEscaped = c.name.replace(/'/g, "\\'");
        const phoneEscaped = (c.phone || '').replace(/'/g, "\\'");
        tb.innerHTML += `<tr class="hover:bg-slate-50"><td class="py-3 px-4 font-medium">${c.name}</td><td class="py-3 px-4">${c.phone||'-'}</td><td class="py-3 px-4 text-right font-bold text-red-600">${parseFloat(c.outstanding_debt||0).toFixed(2)}</td><td class="py-3 px-4 text-center whitespace-nowrap"><button class="bg-orange-50 hover:bg-orange-100 text-orange-600 px-3 py-1 rounded font-bold text-xs mr-2" onclick="editCust('${c.id}', '${nameEscaped}', '${phoneEscaped}', ${c.outstanding_debt||0})">Edit</button><button class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded font-bold text-xs" onclick="del('${c.id}', '${nameEscaped}')">Delete</button></td></tr>`;
    });
}

window.editCust = (id, name, phone, debt) => {
    const safeName = name.replace(/"/g, '&quot;');
    const safePhone = phone.replace(/"/g, '&quot;');
    showModal('Edit Customer', `
        <div class="space-y-3">
            <div><label class="block text-sm font-semibold mb-1">Name</label><input type="text" id="edit-c-name" class="w-full border rounded px-3 py-2" value="${safeName}"></div>
            <div><label class="block text-sm font-semibold mb-1">Phone</label><input type="text" id="edit-c-phone" class="w-full border rounded px-3 py-2" value="${safePhone}"></div>
            <div><label class="block text-sm font-semibold mb-1">Debt (Ksh)</label><input type="number" id="edit-c-debt" class="w-full border rounded px-3 py-2" value="${debt}" step="any"></div>
        </div>
    `, async (close) => {
        const newName = document.getElementById('edit-c-name').value;
        if(!newName) throw new Error("Name is required");
        await supabase.from('customers').update({
            name: newName,
            phone: document.getElementById('edit-c-phone').value,
            outstanding_debt: parseFloat(document.getElementById('edit-c-debt').value || 0)
        }).eq('id', id);
        close(); load();
    }, 'Save Changes');
};

window.del = (id, name) => {
    showModal('Delete Customer', `<p>Are you sure you want to delete <strong>${name.replace(/</g, '&lt;')}</strong>?</p>`, async (close) => {
        await supabase.from('customers').delete().eq('id',id);
        close(); load();
    }, 'Delete');
};

document.getElementById('btn-add-cust').addEventListener('click', () => {
    showModal('Add Customer', `
        <div class="space-y-3">
            <div><label class="block text-sm font-semibold mb-1">Name</label><input type="text" id="add-c-name" class="w-full border rounded px-3 py-2"></div>
            <div><label class="block text-sm font-semibold mb-1">Phone</label><input type="text" id="add-c-phone" class="w-full border rounded px-3 py-2"></div>
            <div><label class="block text-sm font-semibold mb-1">Debt (Ksh)</label><input type="number" id="add-c-debt" class="w-full border rounded px-3 py-2" value="0"></div>
        </div>
    `, async (close) => {
        const name = document.getElementById('add-c-name').value;
        if(!name) throw new Error("Name is required");
        await supabase.from('customers').insert([{name, phone: document.getElementById('add-c-phone').value, outstanding_debt: parseFloat(document.getElementById('add-c-debt').value||0)}]);
        close(); load();
    }, 'Save Customer');
});
load();
