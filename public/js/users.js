import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';

requireAuth();
if (currentUser && currentUser.role !== 'admin') {
    window.location.href = '/pos.html';
}

// Global Module State
let usersList = [];
let allSalesData = [];
let activeUser = null;
let activeUserRange = 'today'; // 'today', 'yesterday', 'week', 'month', 'all', 'custom'
let activeUserCustomDates = { from: '', to: '' };
let activeUserTransactions = [];

let storeSettings = {
    company_name: 'Litaj Hardware',
    tagline: 'Building & Construction Materials',
    phone_contact: '+254 700 000 000',
    location_address: 'Main Hardware Yard, Commercial Street',
    receipt_footer: 'Thank you for choosing Litaj Hardware! Goods once sold are not returnable without valid receipt.'
};

async function loadStoreSettings() {
    try {
        const { data } = await supabase.from('settings').select('*');
        if (data && data.length > 0) {
            data.forEach(s => {
                if (s.key && s.value) storeSettings[s.key] = s.value;
            });
        }
    } catch (e) {
        console.warn('Could not load store settings:', e.message);
    }
}

// ====================================================================
// 1. DATA LOADING & KPI AGGREGATIONS
// ====================================================================
async function loadUsers() {
    const tbody = document.getElementById('user-tbody');
    try {
        const { data: users, error: userErr } = await supabase
            .from('users')
            .select('*')
            .order('username');

        if (userErr) throw userErr;
        usersList = users || [];

        // Fetch sales log to compute staff sales volumes
        const { data: sales, error: salesErr } = await supabase
            .from('sales_log')
            .select('id, receipt_no, total_charged, calculated_qty, calculated_profit, cashier_id, payment_method, is_voided, timestamp');

        if (!salesErr && sales) {
            allSalesData = sales;
        }

        renderKPICards();
        renderUsersTable();

    } catch (err) {
        console.error('Error loading users:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold">Failed to load staff accounts: ${err.message}</td></tr>`;
        }
    }
}

function computeUserSales(userId) {
    let totalSales = 0;
    let receiptsCount = new Set();

    allSalesData.forEach(s => {
        if (s.cashier_id === userId && !s.is_voided) {
            totalSales += parseFloat(s.total_charged || 0);
            if (s.receipt_no) receiptsCount.add(s.receipt_no);
        }
    });

    return {
        totalSales,
        transactionsCount: receiptsCount.size
    };
}

function renderKPICards() {
    const kpiTotalUsers = document.getElementById('kpi-total-users');
    const kpiCashiersCount = document.getElementById('kpi-cashiers-count');
    const kpiAdminsCount = document.getElementById('kpi-admins-count');
    const kpiTotalStaffSales = document.getElementById('kpi-total-staff-sales');

    let cashiers = 0;
    let admins = 0;
    let totalSalesVolume = 0;

    usersList.forEach(u => {
        if (u.role === 'admin') admins++;
        else cashiers++;
    });

    allSalesData.forEach(s => {
        if (!s.is_voided) {
            totalSalesVolume += parseFloat(s.total_charged || 0);
        }
    });

    if (kpiTotalUsers) kpiTotalUsers.textContent = usersList.length;
    if (kpiCashiersCount) kpiCashiersCount.textContent = cashiers;
    if (kpiAdminsCount) kpiAdminsCount.textContent = admins;
    if (kpiTotalStaffSales) kpiTotalStaffSales.textContent = `KSh ${totalSalesVolume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// ====================================================================
// 2. SEARCH, FILTER & TABLE RENDERING
// ====================================================================
function renderUsersTable() {
    const tbody = document.getElementById('user-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const filterRole = document.getElementById('user-filter-role')?.value || 'all';

    let list = usersList.filter(u => {
        const matchSearch = !searchTerm || 
            (u.username && u.username.toLowerCase().includes(searchTerm)) || 
            (u.full_name && u.full_name.toLowerCase().includes(searchTerm));

        let matchRole = true;
        if (filterRole === 'admin') matchRole = u.role === 'admin';
        else if (filterRole === 'cashier') matchRole = u.role === 'cashier';

        return matchSearch && matchRole;
    });

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-400">
                    <div class="text-3xl mb-1">🔍</div>
                    <div class="font-bold text-slate-700">No staff accounts found</div>
                    <div class="text-xs text-slate-400 mt-1">${searchTerm ? `No matches for "${searchTerm}"` : 'Add your first cashier to get started'}</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => {
        const { totalSales, transactionsCount } = computeUserSales(u.id);
        const isAdmin = u.role === 'admin';
        const roleBadge = isAdmin
            ? `<span class="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-100 text-purple-800">ADMINISTRATOR</span>`
            : `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">CASHIER</span>`;

        const isSelf = currentUser && currentUser.id === u.id;
        const nameSafe = (u.full_name || u.username).replace(/'/g, "\\'");
        const usernameSafe = u.username.replace(/'/g, "\\'");

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} font-black text-sm flex items-center justify-center flex-shrink-0">
                            ${u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-black text-slate-900 text-base leading-snug flex items-center gap-1.5">
                                <span>${u.full_name || u.username}</span>
                                ${isSelf ? '<span class="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">You</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-500 font-mono">@${u.username}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4">
                    ${roleBadge}
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-600">
                        <span>••••</span>
                        <span class="text-[10px] text-slate-400 font-normal">(${u.pin ? '4-digit' : 'None'})</span>
                    </div>
                </td>
                <td class="py-3.5 px-4 text-right">
                    <div class="font-black text-slate-900 text-sm sm:text-base">KSh ${totalSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-[11px] text-slate-500 font-medium">${transactionsCount} sale${transactionsCount === 1 ? '' : 's'}</div>
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        <button class="btn-user-activity px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm" data-id="${u.id}">
                            <span>📊</span> Sales Report
                        </button>
                        <button class="btn-set-pin px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-name="${usernameSafe}">
                            🔑 PIN
                        </button>
                        <button class="btn-edit-role px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-role="${u.role}" data-name="${nameSafe}">
                            ✏️ Role
                        </button>
                        ${!isSelf ? `
                            <button class="btn-del-user px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-name="${nameSafe}" title="Delete user">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach Event Listeners
    tbody.querySelectorAll('.btn-user-activity').forEach(btn => {
        btn.addEventListener('click', () => openUserActivity(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-set-pin').forEach(btn => {
        btn.addEventListener('click', () => setPinModal(btn.dataset.id, btn.dataset.name));
    });

    tbody.querySelectorAll('.btn-edit-role').forEach(btn => {
        btn.addEventListener('click', () => editRoleModal(btn.dataset.id, btn.dataset.name, btn.dataset.role));
    });

    tbody.querySelectorAll('.btn-del-user').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id, btn.dataset.name));
    });
}

// Search inputs
const userSearchInput = document.getElementById('user-search');
const btnClearUserSearch = document.getElementById('btn-clear-user-search');

userSearchInput?.addEventListener('input', () => {
    if (btnClearUserSearch) {
        btnClearUserSearch.classList.toggle('hidden', !userSearchInput.value.trim());
    }
    renderUsersTable();
});

btnClearUserSearch?.addEventListener('click', () => {
    userSearchInput.value = '';
    btnClearUserSearch.classList.add('hidden');
    userSearchInput.focus();
    renderUsersTable();
});

document.getElementById('user-filter-role')?.addEventListener('change', renderUsersTable);

// ====================================================================
// 3. USER SALES ACTIVITY & AUDIT MODAL
// ====================================================================
async function openUserActivity(userId) {
    activeUser = usersList.find(u => u.id === userId);
    if (!activeUser) return;

    const modal = document.getElementById('modal-user-activity');
    const nameLabel = document.getElementById('report-user-name');
    const roleBadge = document.getElementById('report-user-role-badge');
    const metaLabel = document.getElementById('report-user-meta');

    if (nameLabel) nameLabel.textContent = `${activeUser.full_name || activeUser.username} (@${activeUser.username})`;
    if (metaLabel) metaLabel.textContent = `Staff ID: #${activeUser.id.slice(0, 8)} • Role: ${activeUser.role.toUpperCase()}`;

    if (roleBadge) {
        roleBadge.textContent = activeUser.role.toUpperCase();
        roleBadge.className = activeUser.role === 'admin' 
            ? "px-2.5 py-0.5 rounded-md text-xs font-black bg-purple-100 text-purple-800" 
            : "px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800";
    }

    // Default to 'today' preset
    activeUserRange = 'today';
    document.querySelectorAll('.user-preset-btn').forEach(btn => {
        btn.className = btn.dataset.range === 'today'
            ? "user-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-600 bg-orange-50 text-orange-700 transition"
            : "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    const container = document.getElementById('user-transactions-container');
    if (container) {
        container.innerHTML = '<div class="py-12 text-center text-slate-400 font-semibold text-sm">Loading cashier transaction ledger...</div>';
    }

    modal?.classList.remove('hidden');

    try {
        // Query sales handled by this cashier
        const { data, error } = await supabase
            .from('sales_log')
            .select('id, receipt_no, total_charged, calculated_qty, calculated_profit, buying_price_at_sale, payment_method, amount_tendered, change_given, notes, status, timestamp, is_voided, inventory(id, name, category, selling_price), customers(id, name, phone)')
            .eq('cashier_id', userId)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        activeUserTransactions = data || [];

        renderUserActivityDetails();

    } catch (err) {
        console.error('Failed to load user transactions:', err);
        if (container) {
            container.innerHTML = `<div class="p-6 text-center text-red-500 font-bold">Failed to load sales log: ${err.message}</div>`;
        }
    }
}

// Preset range buttons inside user modal
document.querySelectorAll('.user-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.user-preset-btn').forEach(b => {
            b.className = "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
        });
        btn.className = "user-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-600 bg-orange-50 text-orange-700 transition";

        activeUserRange = btn.dataset.range;
        renderUserActivityDetails();
    });
});

document.getElementById('btn-user-apply-dates')?.addEventListener('click', () => {
    const fromVal = document.getElementById('user-from-date')?.value;
    const toVal = document.getElementById('user-to-date')?.value;

    if (!fromVal || !toVal) return alert('Please specify both From and To dates.');
    if (fromVal > toVal) return alert('From date cannot be after To date.');

    activeUserRange = 'custom';
    activeUserCustomDates = { from: fromVal, to: toVal };

    document.querySelectorAll('.user-preset-btn').forEach(b => {
        b.className = "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    renderUserActivityDetails();
});

function filterUserSalesByRange(sales) {
    if (activeUserRange === 'all') return sales;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return sales.filter(s => {
        const saleDateStr = new Date(s.timestamp).toISOString().split('T')[0];

        if (activeUserRange === 'today') {
            return saleDateStr === todayStr;
        } else if (activeUserRange === 'yesterday') {
            const yest = new Date();
            yest.setDate(now.getDate() - 1);
            return saleDateStr === yest.toISOString().split('T')[0];
        } else if (activeUserRange === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return new Date(s.timestamp) >= weekAgo;
        } else if (activeUserRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            return saleDateStr >= startOfMonth;
        } else if (activeUserRange === 'custom') {
            return saleDateStr >= activeUserCustomDates.from && saleDateStr <= activeUserCustomDates.to;
        }
        return true;
    });
}

function renderUserActivityDetails() {
    const container = document.getElementById('user-transactions-container');
    const filtered = filterUserSalesByRange(activeUserTransactions);

    // Group items sharing receipt_no
    const receiptGroups = {};
    filtered.forEach(row => {
        const rNo = row.receipt_no || `ROW-${row.id}`;
        if (!receiptGroups[rNo]) {
            receiptGroups[rNo] = {
                receipt_no: rNo,
                timestamp: row.timestamp,
                payment_method: row.payment_method,
                status: row.status,
                is_voided: row.is_voided,
                notes: row.notes,
                customer: row.customers?.name || 'Walk-in Client',
                items: [],
                total_charged: 0,
                total_profit: 0
            };
        }
        receiptGroups[rNo].items.push(row);
        receiptGroups[rNo].total_charged += parseFloat(row.total_charged || 0);
        receiptGroups[rNo].total_profit += parseFloat(row.calculated_profit || 0);
    });

    const receiptsList = Object.values(receiptGroups).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Compute Performance KPIs for period
    let grossSales = 0;
    let cashCollected = 0;
    let mpesaCollected = 0;
    let debtIssued = 0;
    let grossProfit = 0;

    receiptsList.forEach(r => {
        if (!r.is_voided) {
            grossSales += r.total_charged;
            grossProfit += r.total_profit;

            const m = (r.payment_method || '').toLowerCase();
            // Handle split breakdown if present
            if (r.notes && r.notes.includes('Cash:') && r.notes.includes('M-Pesa:')) {
                const matchCash = r.notes.match(/Cash:\s*([\d.]+)/);
                const matchMpesa = r.notes.match(/M-Pesa:\s*([\d.]+)/);
                const splitC = matchCash ? parseFloat(matchCash[1]) : 0;
                const splitM = matchMpesa ? parseFloat(matchMpesa[1]) : 0;
                cashCollected += splitC;
                mpesaCollected += splitM;
            } else if (m.includes('cash')) {
                cashCollected += r.total_charged;
            } else if (m.includes('m-pesa') || m.includes('mpesa')) {
                mpesaCollected += r.total_charged;
            } else if (m.includes('debt') || m.includes('credit')) {
                debtIssued += r.total_charged;
            }
        }
    });

    document.getElementById('user-kpi-sales').textContent = `KSh ${grossSales.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-cash').textContent = `KSh ${cashCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-mpesa').textContent = `KSh ${mpesaCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-debt').textContent = `KSh ${debtIssued.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-count').textContent = receiptsList.length;
    document.getElementById('user-kpi-profit').textContent = `KSh ${grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-trans-count').textContent = `${receiptsList.length} transactions in period`;

    if (!container) return;

    if (receiptsList.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <div class="text-3xl mb-1">📋</div>
                <div class="font-bold text-slate-700">No sales transactions found for this period</div>
                <div class="text-xs text-slate-400 mt-1">Select a wider date range or "All Time"</div>
            </div>`;
        return;
    }

    container.innerHTML = receiptsList.map(r => {
        const dateStr = new Date(r.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let statusBadge = '';
        if (r.is_voided) {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700">VOIDED</span>';
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">${r.payment_method}</span>`;
        }

        const itemsSummary = r.items.map(i => `${i.inventory?.name || i.notes || 'Hardware Item'} (x${i.calculated_qty})`).join(', ');

        return `
            <div class="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-2.5 transition ${r.is_voided ? 'opacity-60 bg-slate-50' : ''}">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">#${r.receipt_no}</span>
                        ${statusBadge}
                        <span class="text-xs text-slate-400 font-medium">${dateStr} • ${timeStr}</span>
                        <span class="text-xs text-slate-600 font-semibold">• Client: ${r.customer}</span>
                    </div>
                    <div class="flex items-center gap-2 justify-between sm:justify-end">
                        <div class="text-right">
                            <span class="text-xs text-slate-400 font-medium mr-1">Amount:</span>
                            <span class="text-base font-black ${r.is_voided ? 'line-through text-slate-400' : 'text-slate-900'}">
                                KSh ${r.total_charged.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                        </div>
                        <button class="btn-user-print-receipt px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition" data-receipt="${r.receipt_no}">
                            🖨️ Receipt
                        </button>
                    </div>
                </div>

                <!-- Products Summary -->
                <div class="text-xs text-slate-600 font-medium truncate">
                    <strong class="text-slate-700">Items:</strong> ${itemsSummary}
                </div>

                ${r.notes ? `
                    <div class="text-[11px] text-slate-400 italic">
                        Notes: ${r.notes}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Attach Receipt Print Handlers
    container.querySelectorAll('.btn-user-print-receipt').forEach(btn => {
        btn.addEventListener('click', () => {
            const rNo = btn.dataset.receipt;
            const group = receiptGroups[rNo];
            if (group) printSingleUserReceiptPDF(group, activeUser);
        });
    });
}

// Modal Close Handlers
document.getElementById('btn-close-user-modal')?.addEventListener('click', () => {
    document.getElementById('modal-user-activity')?.classList.add('hidden');
});
document.getElementById('btn-close-user-bottom')?.addEventListener('click', () => {
    document.getElementById('modal-user-activity')?.classList.add('hidden');
});

// ====================================================================
// 4. GENERATE FORMAL STAFF SALES REPORT (PDF)
// ====================================================================
document.getElementById('btn-download-user-pdf')?.addEventListener('click', generateUserSalesReportPDF);

function generateUserSalesReportPDF() {
    if (!activeUser || !window.jspdf) {
        return alert('PDF generation library not loaded or no user selected.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const filtered = filterUserSalesByRange(activeUserTransactions);

    // Group items by receipt_no
    const receiptGroups = {};
    filtered.forEach(row => {
        const rNo = row.receipt_no || `ROW-${row.id}`;
        if (!receiptGroups[rNo]) {
            receiptGroups[rNo] = {
                receipt_no: rNo,
                timestamp: row.timestamp,
                payment_method: row.payment_method,
                status: row.status,
                is_voided: row.is_voided,
                notes: row.notes,
                customer: row.customers?.name || 'Walk-in Client',
                items: [],
                total_charged: 0,
                total_profit: 0
            };
        }
        receiptGroups[rNo].items.push(row);
        receiptGroups[rNo].total_charged += parseFloat(row.total_charged || 0);
        receiptGroups[rNo].total_profit += parseFloat(row.calculated_profit || 0);
    });

    const receiptsList = Object.values(receiptGroups).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Store Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(234, 88, 12);
    doc.text(storeSettings.company_name || "LITAJ HARDWARE", 14, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(storeSettings.tagline || "Building & Construction Materials", 14, 20);
    doc.text(`Tel: ${storeSettings.phone_contact || '+254 700 000 000'} | Location: ${storeSettings.location_address || 'Main Yard'}`, 14, 24);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 28, 196, 28);

    // Report Title & Staff Details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("CASHIER SALES & RECONCILIATION REPORT", 14, 35);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("STAFF OPERATOR DETAILS:", 14, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${activeUser.full_name || activeUser.username}`, 14, 47);
    doc.text(`Username: @${activeUser.username}`, 14, 52);
    doc.text(`Role: ${activeUser.role.toUpperCase()}`, 14, 57);

    // Range & Date
    let rangeLabel = "Today";
    if (activeUserRange === 'yesterday') rangeLabel = "Yesterday";
    else if (activeUserRange === 'week') rangeLabel = "Last 7 Days";
    else if (activeUserRange === 'month') rangeLabel = "Current Month";
    else if (activeUserRange === 'all') rangeLabel = "All Time";
    else if (activeUserRange === 'custom') rangeLabel = `${activeUserCustomDates.from} to ${activeUserCustomDates.to}`;

    doc.setFont("helvetica", "bold");
    doc.text("REPORTING PERIOD:", 120, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${rangeLabel}`, 120, 47);
    doc.text(`Date Generated: ${new Date().toLocaleString()}`, 120, 52);

    // Financial KPI Summary Box
    let grossSales = 0;
    let cashCollected = 0;
    let mpesaCollected = 0;
    let debtIssued = 0;
    let grossProfit = 0;

    receiptsList.forEach(r => {
        if (!r.is_voided) {
            grossSales += r.total_charged;
            grossProfit += r.total_profit;

            const m = (r.payment_method || '').toLowerCase();
            if (r.notes && r.notes.includes('Cash:') && r.notes.includes('M-Pesa:')) {
                const matchCash = r.notes.match(/Cash:\s*([\d.]+)/);
                const matchMpesa = r.notes.match(/M-Pesa:\s*([\d.]+)/);
                const splitC = matchCash ? parseFloat(matchCash[1]) : 0;
                const splitM = matchMpesa ? parseFloat(matchMpesa[1]) : 0;
                cashCollected += splitC;
                mpesaCollected += splitM;
            } else if (m.includes('cash')) {
                cashCollected += r.total_charged;
            } else if (m.includes('m-pesa') || m.includes('mpesa')) {
                mpesaCollected += r.total_charged;
            } else if (m.includes('debt') || m.includes('credit')) {
                debtIssued += r.total_charged;
            }
        }
    });

    doc.autoTable({
        startY: 62,
        head: [['Gross Sales', 'Cash Drawer', 'M-Pesa Collections', 'Credit / Debt', 'Sales Count', 'Est. Profit']],
        body: [[
            `KSh ${grossSales.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${cashCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${mpesaCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${debtIssued.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            receiptsList.length.toString(),
            `KSh ${grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8.5, fontStyle: 'bold', halign: 'center', cellPadding: 2.5 },
        margin: { left: 14, right: 14 }
    });

    // Detailed Chronological Table
    const tableData = receiptsList.map(r => {
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(r.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
        const itemsList = r.items.map(i => `${i.inventory?.name || i.notes || 'Item'} (x${i.calculated_qty})`).join(', ');

        return [
            `${dateStr} ${timeStr}`,
            r.receipt_no,
            itemsList,
            r.customer,
            r.payment_method,
            r.is_voided ? 'VOIDED' : r.total_charged.toFixed(2),
            r.is_voided ? 'Voided' : 'Completed'
        ];
    });

    doc.autoTable({
        startY: (doc.lastAutoTable?.finalY || 80) + 6,
        head: [['Date/Time', 'Receipt #', 'Items Sold & Quantities', 'Customer', 'Method', 'Total (KSh)', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 24, fontStyle: 'bold' },
            2: { cellWidth: 64 },
            3: { cellWidth: 26 },
            4: { cellWidth: 16 },
            5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 14, halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    const finalY = (doc.lastAutoTable?.finalY || 220) + 12;

    // Shift Sign-off Signatures
    if (finalY < 265) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Cashier Sign-off: ___________________________", 14, finalY);
        doc.text("Manager / Auditor Verification: ___________________________", 110, finalY);
        doc.text("Official electronic staff reconciliation generated by Litaj Hardware POS.", 14, finalY + 7);
    }

    const safeUsername = activeUser.username.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Sales_Report_${safeUsername}_${Date.now()}.pdf`);
}

// Single User Receipt PDF Generator
function printSingleUserReceiptPDF(receiptGroup, cashier) {
    if (!window.jspdf) return alert('jsPDF not loaded');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200]
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(storeSettings.company_name || "LITAJ HARDWARE", 40, 10, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(storeSettings.tagline || "Building & Construction Materials", 40, 14, { align: "center" });
    doc.text(`Tel: ${storeSettings.phone_contact || '+254 700 000 000'}`, 40, 18, { align: "center" });
    doc.text("--------------------------------------------------", 40, 22, { align: "center" });

    doc.text(`Receipt: ${receiptGroup.receipt_no}`, 4, 27);
    doc.text(`Date: ${new Date(receiptGroup.timestamp).toLocaleString()}`, 4, 31);
    doc.text(`Cashier: ${cashier ? (cashier.full_name || cashier.username) : 'Staff'}`, 4, 35);
    doc.text(`Customer: ${receiptGroup.customer}`, 4, 39);

    doc.text("--------------------------------------------------", 40, 43, { align: "center" });

    const tableData = receiptGroup.items.map(i => [
        i.inventory?.name || i.notes || 'Hardware Item',
        (i.calculated_qty || 1).toString(),
        parseFloat(i.total_charged || 0).toFixed(0)
    ]);

    doc.autoTable({
        startY: 45,
        head: [['Item', 'Qty', 'Total']],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 8, halign: 'center' },
            2: { cellWidth: 18, halign: 'right' }
        },
        margin: { left: 4, right: 4 }
    });

    const finalY = (doc.lastAutoTable?.finalY || 60) + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`TOTAL: KSh ${receiptGroup.total_charged.toLocaleString()}`, 76, finalY + 4, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Payment: ${receiptGroup.payment_method}`, 4, finalY + 9);
    doc.text(`Status: ${receiptGroup.status.toUpperCase()}`, 4, finalY + 13);

    doc.setFontSize(7);
    doc.text("--------------------------------------------------", 40, finalY + 18, { align: "center" });
    doc.text("Thank you for your business!", 40, finalY + 22, { align: "center" });

    doc.save(`Receipt_${receiptGroup.receipt_no}.pdf`);
}

// ====================================================================
// 5. USER PIN, ROLE & ACCOUNT MANAGEMENT
// ====================================================================
function setPinModal(id, username) {
    showModal('Set Security PIN', `
        <div class="space-y-3 text-center">
            <p class="text-xs text-slate-600">Enter a new 4-digit security PIN for cashier <strong>@${username}</strong>:</p>
            <input type="password" id="new-pin-input" maxlength="4" class="w-48 mx-auto border-2 border-slate-300 rounded-xl px-4 py-3 text-center tracking-[1em] font-black text-2xl text-slate-900 focus:outline-none focus:border-orange-500 shadow-sm" placeholder="••••">
            <p class="text-[11px] text-slate-400">PIN must be strictly 4 numeric digits.</p>
        </div>
    `, async (close) => {
        const pin = document.getElementById('new-pin-input').value.trim();
        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            throw new Error("PIN must be exactly 4 numeric digits (0-9)");
        }

        const { error } = await supabase.from('users').update({ pin }).eq('id', id);
        if (error) throw error;
        close();
        alert(`PIN updated successfully for @${username}`);
        await loadUsers();
    }, 'Update PIN');

    setTimeout(() => document.getElementById('new-pin-input')?.focus(), 150);
}

function editRoleModal(id, name, currentRole) {
    showModal('Update Staff Role', `
        <div class="space-y-3.5">
            <p class="text-xs text-slate-600">Change permissions and access role for <strong>${name}</strong>:</p>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Select Role</label>
                <select id="edit-role-select" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-orange-500">
                    <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier (POS & Sales)</option>
                    <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrator (Full Access)</option>
                </select>
            </div>
        </div>
    `, async (close) => {
        const role = document.getElementById('edit-role-select').value;
        const { error } = await supabase.from('users').update({ role }).eq('id', id);
        if (error) throw error;
        close();
        await loadUsers();
    }, 'Save Role');
}

document.getElementById('btn-add-user')?.addEventListener('click', () => {
    showModal('Add New Staff Account', `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Username (Login Handle)</label>
                <input type="text" id="add-u-username" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 font-bold text-sm text-slate-800 focus:outline-none focus:border-orange-500" placeholder="e.g. sarah">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Full Name</label>
                <input type="text" id="add-u-fullname" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 font-semibold text-sm text-slate-800 focus:outline-none focus:border-orange-500" placeholder="e.g. Sarah Wambui">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">4-Digit Security PIN</label>
                <input type="password" maxlength="4" id="add-u-pin" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 font-black text-center tracking-[0.5em] text-lg text-slate-800 focus:outline-none focus:border-orange-500" placeholder="••••">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Role & Permissions</label>
                <select id="add-u-role" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 font-bold text-sm text-slate-800 focus:outline-none focus:border-orange-500">
                    <option value="cashier">Cashier (POS Register & Sales)</option>
                    <option value="admin">Administrator (Full System Control)</option>
                </select>
            </div>
        </div>
    `, async (close) => {
        const username = document.getElementById('add-u-username').value.trim().toLowerCase();
        const full_name = document.getElementById('add-u-fullname').value.trim();
        const pin = document.getElementById('add-u-pin').value.trim();
        const role = document.getElementById('add-u-role').value;

        if (!username) throw new Error("Username is required");
        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            throw new Error("Valid 4-digit numeric PIN is required");
        }

        const { error } = await supabase.from('users').insert([{
            username,
            full_name: full_name || username,
            pin,
            role
        }]);

        if (error) throw error;
        close();
        await loadUsers();
    }, 'Create User');
});

function deleteUser(id, name) {
    if (currentUser && currentUser.id === id) {
        return alert("You cannot delete your own logged-in administrator account.");
    }

    showModal('Deactivate / Delete Staff Account', `
        <p class="text-sm text-slate-600">Are you sure you want to remove staff account <strong>${name}</strong>? Their historical sales records will remain preserved in the ledger.</p>
    `, async (close) => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;
        close();
        await loadUsers();
    }, 'Delete Account');
}

// Initial Load
loadStoreSettings();
loadUsers();
