/**
 * Litaj Hardware POS — Customers & Debt Controller
 */

import { supabase, requireAuth, currentUser, formatKsh, showToast } from './supabaseClient.js';

requireAuth();

let customerList   = [];
let editingCustId  = null;
let payingCustomer = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomers();
    bindModalHandlers();
    bindFormSubmit();
    bindPaymentModal();
    bindSearch();
});

async function loadCustomers() {
    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');
    if (error) { showToast('Failed to load customers', 'error'); return; }
    customerList = data || [];
    renderStats();
    renderTable(customerList);
}

function renderStats() {
    const totalDebt   = customerList.reduce((s, c) => s + Number(c.outstanding_debt), 0);
    const debtors     = customerList.filter(c => Number(c.outstanding_debt) > 0).length;
    const totalEl     = document.getElementById('stat-total-debt');
    const custEl      = document.getElementById('stat-customers');
    const debtorsEl   = document.getElementById('stat-debtors');
    if (totalEl)   totalEl.textContent   = formatKsh(totalDebt);
    if (custEl)    custEl.textContent    = customerList.length;
    if (debtorsEl) debtorsEl.textContent = debtors;
}

function renderTable(items) {
    const tbody = document.getElementById('customer-table-body');
    if (!tbody) return;
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-slate-400">No customers found.</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(c => {
        const debt    = Number(c.outstanding_debt);
        const hasDebt = debt > 0;
        return `
            <tr class="border-b border-slate-50 hover:bg-orange-50/30 transition-colors">
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-800">${c.name}</div>
                    ${c.address ? `<div class="text-xs text-slate-400">${c.address}</div>` : ''}
                </td>
                <td class="py-3 px-4 text-slate-600 text-sm">${c.phone || '—'}</td>
                <td class="py-3 px-4 text-right">
                    <span class="font-mono font-black text-sm ${hasDebt ? 'text-orange-700' : 'text-emerald-600'}">
                        ${hasDebt ? formatKsh(debt) : '✓ Clear'}
                    </span>
                </td>
                <td class="py-3 px-4 text-center flex items-center justify-center gap-2">
                    <button data-id="${c.id}" class="btn-edit-cust px-2.5 py-1 text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg transition-colors">Edit</button>
                    ${hasDebt ? `<button data-id="${c.id}" class="btn-pay-debt px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors">Pay</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-cust').forEach(btn =>
        btn.addEventListener('click', () => openCustomerModal(btn.dataset.id))
    );
    tbody.querySelectorAll('.btn-pay-debt').forEach(btn =>
        btn.addEventListener('click', () => openPaymentModal(btn.dataset.id))
    );
}

function bindSearch() {
    document.getElementById('cust-search')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        renderTable(q ? customerList.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) : customerList);
    });
}

function openCustomerModal(id = null) {
    editingCustId = id;
    document.getElementById('form-customer').reset();
    document.getElementById('cust-form-error').classList.add('hidden');
    if (id) {
        const c = customerList.find(x => x.id === id);
        if (c) {
            document.getElementById('cust-name').value    = c.name;
            document.getElementById('cust-phone').value   = c.phone || '';
            document.getElementById('cust-address').value = c.address || '';
        }
        document.getElementById('modal-cust-title').textContent = 'Edit Customer';
    } else {
        document.getElementById('modal-cust-title').textContent = 'Add Customer';
    }
    document.getElementById('modal-customer').classList.remove('hidden');
}

function bindModalHandlers() {
    document.getElementById('btn-add-customer')?.addEventListener('click', () => openCustomerModal());
    document.getElementById('btn-close-cust-modal')?.addEventListener('click', () =>
        document.getElementById('modal-customer').classList.add('hidden')
    );
}

function bindFormSubmit() {
    document.getElementById('form-customer')?.addEventListener('submit', async e => {
        e.preventDefault();
        const errEl = document.getElementById('cust-form-error');
        const btn   = document.getElementById('btn-save-customer');
        errEl.classList.add('hidden');
        const name = document.getElementById('cust-name').value.trim();
        if (!name) { errEl.textContent = 'Customer name is required.'; errEl.classList.remove('hidden'); return; }
        btn.disabled = true; btn.textContent = 'Saving...';
        const payload = {
            name,
            phone:   document.getElementById('cust-phone').value.trim() || null,
            address: document.getElementById('cust-address').value.trim() || null
        };
        try {
            const op = editingCustId
                ? supabase.from('customers').update(payload).eq('id', editingCustId)
                : supabase.from('customers').insert([payload]);
            const { error } = await op;
            if (error) throw error;
            showToast(editingCustId ? 'Customer updated!' : 'Customer added!', 'success');
            document.getElementById('modal-customer').classList.add('hidden');
            await loadCustomers();
        } catch (err) {
            errEl.textContent = err.message; errEl.classList.remove('hidden');
        } finally {
            btn.disabled = false; btn.textContent = 'Save Customer';
        }
    });
}

function openPaymentModal(customerId) {
    payingCustomer = customerList.find(c => c.id === customerId);
    if (!payingCustomer) return;
    document.getElementById('pay-cust-name').textContent = payingCustomer.name;
    document.getElementById('pay-cust-debt').textContent = formatKsh(payingCustomer.outstanding_debt);
    document.getElementById('inp-pay-amount').value = '';
    document.getElementById('modal-payment').classList.remove('hidden');
}

function bindPaymentModal() {
    document.getElementById('btn-close-pay-modal')?.addEventListener('click', () =>
        document.getElementById('modal-payment').classList.add('hidden')
    );
    document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('inp-pay-amount').value);
        const method = document.getElementById('sel-pay-method').value;
        if (!amount || amount <= 0 || !payingCustomer) { showToast('Enter a valid payment amount', 'warning'); return; }
        const { error } = await supabase.from('debt_payments').insert([{
            customer_id:   payingCustomer.id,
            amount,
            payment_method: method,
            recorded_by:   currentUser?.id || null
        }]);
        if (error) { showToast('Payment failed: ' + error.message, 'error'); return; }
        showToast(`Payment of ${formatKsh(amount)} recorded!`, 'success');
        document.getElementById('modal-payment').classList.add('hidden');
        await loadCustomers();
    });
}
