/**
 * Litaj Hardware POS — Admin Dashboard Controller
 * Handles executive financials, expenses tracking, staff accounts, and store settings.
 */

import { supabase, requireAuth, currentUser, formatKsh, showToast } from './supabaseClient.js';

// Verify authentication and role
requireAuth();

if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'manager') {
    alert('Access restricted. Admin credentials required.');
    window.location.replace('/pos.html');
}

let expensesList = [];
let staffList = [];

document.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    bindModals();
    bindForms();
    await refreshAll();

    document.getElementById('filter-period')?.addEventListener('change', loadFinancialMetrics);
    document.getElementById('btn-refresh-admin')?.addEventListener('click', refreshAll);
});

async function refreshAll() {
    await Promise.all([
        loadFinancialMetrics(),
        loadExpenses(),
        loadStaff(),
        loadSettings()
    ]);
}

// ── Tab Navigation ──────────────────────────────────────────
function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('border-b-2', 'border-orange-600', 'text-orange-600');
                b.classList.add('text-slate-500');
            });
            btn.classList.add('border-b-2', 'border-orange-600', 'text-orange-600');
            btn.classList.remove('text-slate-500');

            document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
            const targetId = btn.dataset.tab;
            document.getElementById(targetId)?.classList.remove('hidden');
        });
    });
}

// ── Financial Metrics ───────────────────────────────────────
async function loadFinancialMetrics() {
    const period = document.getElementById('filter-period')?.value || 'month';
    const now = new Date();
    let startDate = null;

    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (period === 'week') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        startDate = lastWeek.toISOString();
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    // Query sales
    let salesQuery = supabase
        .from('sales_log')
        .select('total_charged, calculated_profit, is_voided')
        .eq('is_voided', false);

    if (startDate) {
        salesQuery = salesQuery.gte('created_at', startDate);
    }

    // Query expenses
    let expQuery = supabase
        .from('expenses')
        .select('amount');

    if (startDate) {
        expQuery = expQuery.gte('created_at', startDate);
    }

    const [salesRes, expRes] = await Promise.all([salesQuery, expQuery]);

    const sales = salesRes.data || [];
    const expenses = expRes.data || [];

    const grossRevenue = sales.reduce((sum, s) => sum + Number(s.total_charged), 0);
    const grossMargin = sales.reduce((sum, s) => sum + Number(s.calculated_profit), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const netProfit = grossMargin - totalExpenses;

    document.getElementById('stat-revenue').textContent = formatKsh(grossRevenue);
    document.getElementById('stat-sales-count').textContent = sales.length;
    document.getElementById('stat-margin').textContent = formatKsh(grossMargin);
    document.getElementById('stat-expenses').textContent = formatKsh(totalExpenses);
    document.getElementById('stat-expenses-count').textContent = expenses.length;

    const netEl = document.getElementById('stat-net-profit');
    if (netEl) {
        netEl.textContent = formatKsh(netProfit);
        netEl.className = `text-2xl font-black ${netProfit >= 0 ? 'text-white' : 'text-amber-200'}`;
    }
}

// ── Operating Expenses ──────────────────────────────────────
async function loadExpenses() {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

    expensesList = data || [];
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    if (!expensesList.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400 text-sm">No expenses recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = expensesList.map(exp => `
        <tr class="border-b border-slate-50 hover:bg-orange-50/20">
            <td class="py-3 px-4 text-xs text-slate-500 font-mono">${new Date(exp.created_at).toLocaleDateString()}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">${exp.category}</span></td>
            <td class="py-3 px-4 font-semibold text-slate-800">${exp.description}</td>
            <td class="py-3 px-4 text-right font-mono font-bold text-red-600">${formatKsh(exp.amount)}</td>
        </tr>
    `).join('');
}

// ── Staff Management ─────────────────────────────────────────
async function loadStaff() {
    const { data } = await supabase
        .from('users')
        .select('id, username, full_name, role, pin, created_at')
        .order('full_name');

    staffList = data || [];
    const tbody = document.getElementById('staff-table-body');
    if (!tbody) return;

    tbody.innerHTML = staffList.map(u => `
        <tr class="border-b border-slate-50 hover:bg-orange-50/20">
            <td class="py-3 px-4 font-bold text-slate-800">${u.full_name}</td>
            <td class="py-3 px-4 font-mono text-slate-600 text-xs">${u.username}</td>
            <td class="py-3 px-4"><span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'}">${u.role}</span></td>
            <td class="py-3 px-4 text-center font-mono text-xs text-slate-400">••••</td>
            <td class="py-3 px-4 text-center">
                ${u.username !== 'admin' ? `<button data-id="${u.id}" class="text-xs text-red-500 hover:text-red-700 font-bold btn-del-user">Delete</button>` : '<span class="text-xs text-slate-300">Protected</span>'}
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-del-user').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id));
    });
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to remove this staff user?')) return;
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) { showToast('Cannot delete user: ' + error.message, 'error'); return; }
    showToast('Staff user removed.', 'success');
    await loadStaff();
}

// ── Store Settings ───────────────────────────────────────────
async function loadSettings() {
    const { data } = await supabase.from('settings').select('*');
    if (!data) return;

    const map = {};
    data.forEach(s => map[s.key] = s.value);

    if (map.company_name) document.getElementById('set-company').value = map.company_name;
    if (map.phone_contact) document.getElementById('set-phone').value = map.phone_contact;
    if (map.currency_symbol) document.getElementById('set-currency').value = map.currency_symbol;
    if (map.location_address) document.getElementById('set-address').value = map.location_address;
    if (map.receipt_footer) document.getElementById('set-footer').value = map.receipt_footer;
}

// ── Forms & Modals ───────────────────────────────────────────
function bindModals() {
    // Expense modal
    document.getElementById('btn-add-expense')?.addEventListener('click', () => {
        document.getElementById('form-expense').reset();
        document.getElementById('modal-expense').classList.remove('hidden');
    });
    document.getElementById('btn-close-expense-modal')?.addEventListener('click', () => {
        document.getElementById('modal-expense').classList.add('hidden');
    });

    // User modal
    document.getElementById('btn-add-user')?.addEventListener('click', () => {
        document.getElementById('form-user').reset();
        document.getElementById('modal-user').classList.remove('hidden');
    });
    document.getElementById('btn-close-user-modal')?.addEventListener('click', () => {
        document.getElementById('modal-user').classList.add('hidden');
    });
}

function bindForms() {
    // Expense submission
    document.getElementById('form-expense')?.addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            category: document.getElementById('exp-category').value,
            description: document.getElementById('exp-desc').value.trim(),
            amount: parseFloat(document.getElementById('exp-amount').value),
            recorded_by: currentUser?.id || null
        };

        const { error } = await supabase.from('expenses').insert([payload]);
        if (error) { showToast('Error saving expense: ' + error.message, 'error'); return; }

        showToast('Expense recorded!', 'success');
        document.getElementById('modal-expense').classList.add('hidden');
        await refreshAll();
    });

    // User submission
    document.getElementById('form-user')?.addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            full_name: document.getElementById('usr-fullname').value.trim(),
            username: document.getElementById('usr-username').value.trim().toLowerCase(),
            role: document.getElementById('usr-role').value,
            pin: document.getElementById('usr-pin').value.trim()
        };

        const { error } = await supabase.from('users').insert([payload]);
        if (error) { showToast('Error adding user: ' + error.message, 'error'); return; }

        showToast('Staff user added!', 'success');
        document.getElementById('modal-user').classList.add('hidden');
        await loadStaff();
    });

    // Settings save
    document.getElementById('form-settings')?.addEventListener('submit', async e => {
        e.preventDefault();
        const updates = [
            { key: 'company_name', value: document.getElementById('set-company').value.trim() },
            { key: 'phone_contact', value: document.getElementById('set-phone').value.trim() },
            { key: 'currency_symbol', value: document.getElementById('set-currency').value.trim() },
            { key: 'location_address', value: document.getElementById('set-address').value.trim() },
            { key: 'receipt_footer', value: document.getElementById('set-footer').value.trim() }
        ];

        for (const item of updates) {
            await supabase.from('settings').upsert(item);
        }

        showToast('Store settings saved successfully!', 'success');
    });
}
