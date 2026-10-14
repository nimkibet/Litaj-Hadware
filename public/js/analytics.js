import { supabase, currentUser, requireAuth } from './supabaseClient.js';

// Enforce Auth and Administrator Boundaries
requireAuth();
if (currentUser && currentUser.role !== 'admin') {
    window.location.href = '/pos.html';
}

// --------------------------------------------------------------------
// Application State
// --------------------------------------------------------------------
let rawSalesRows = [];
let receiptGroupsList = [];
let debtIssuedReceipts = [];
let debtCollectionReceipts = [];
let groupedProductsMatrix = [];
let cashiersPerformanceList = [];
let lowStockList = [];
let storeSettings = {
    company_name: 'Litaj Hardware',
    phone_contact: '+254 700 000 000',
    location_address: 'Main Hardware Yard, Commercial Street',
    currency_symbol: 'Ksh',
    receipt_footer: 'Thank you for building with Litaj Hardware!'
};
let registeredUsers = [];

// Filter State
let selectedPeriod = 'today';
let selectedDateStart = '';
let selectedDateEnd = '';
let selectedCashier = 'all';
let productsSearchTerm = '';

// Chart.js Instances
let chartPaymentInstance = null;
let chartItemsInstance = null;
let chartCashiersInstance = null;

// --------------------------------------------------------------------
// UI Initialization & Navigation Setup
// --------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilterControls();
    initTabNavigation();
    loadDashboard();
});

function initNavigation() {
    // Show admin-only links for administrator users
    if (currentUser?.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuChevron = document.getElementById('mobile-menu-chevron');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            const isHidden = mobileMenu.classList.contains('hidden');
            if (isHidden) {
                mobileMenu.classList.remove('hidden');
                mobileMenuChevron?.classList.add('rotate-180');
            } else {
                mobileMenu.classList.add('hidden');
                mobileMenuChevron?.classList.remove('rotate-180');
            }
        });
    }

    // Collapsible Other Menus in Mobile Drawer
    const toggleOtherBtn = document.getElementById('toggle-other-menus-btn');
    const collapsibleOther = document.getElementById('collapsible-other-menus');
    const chevronOther = document.getElementById('chevron-other-menus');

    if (toggleOtherBtn && collapsibleOther) {
        toggleOtherBtn.addEventListener('click', () => {
            const isHidden = collapsibleOther.classList.contains('hidden');
            if (isHidden) {
                collapsibleOther.classList.remove('hidden');
                chevronOther?.classList.add('rotate-180');
            } else {
                collapsibleOther.classList.add('hidden');
                chevronOther?.classList.remove('rotate-180');
            }
        });
    }

    // Logout Handlers
    const handleLogout = async () => {
        if (!confirm('Are you sure you want to sign out of Litaj Hardware POS?')) return;
        localStorage.removeItem('lh_user');
        sessionStorage.clear();
        await supabase.auth.signOut().catch(() => {});
        window.location.href = '/index.html';
    };

    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-logout-mobile')?.addEventListener('click', handleLogout);
}

function initFilterControls() {
    const periodSelect = document.getElementById('ana-period');
    const customContainer = document.getElementById('ana-custom-dates-container');
    const dateInput = document.getElementById('ana-date');
    const dateInputEnd = document.getElementById('ana-date-end');
    const dateSeparator = document.getElementById('ana-date-separator');
    const cashierFilter = document.getElementById('ana-cashier-filter');
    const btnRefresh = document.getElementById('btn-refresh-analytics');
    const btnPdf = document.getElementById('btn-dl-report');
    const searchProducts = document.getElementById('input-search-products');

    // Default dates to today's local YYYY-MM-DD
    const todayStr = getLocalDateString(new Date());
    if (dateInput) dateInput.value = todayStr;
    if (dateInputEnd) dateInputEnd.value = todayStr;

    periodSelect?.addEventListener('change', () => {
        selectedPeriod = periodSelect.value;
        if (selectedPeriod === 'custom') {
            customContainer?.classList.remove('hidden');
            dateInput?.classList.remove('hidden');
            dateInputEnd?.classList.add('hidden');
            dateSeparator?.classList.add('hidden');
        } else if (selectedPeriod === 'custom-range') {
            customContainer?.classList.remove('hidden');
            dateInput?.classList.remove('hidden');
            dateInputEnd?.classList.remove('hidden');
            dateSeparator?.classList.remove('hidden');
        } else {
            customContainer?.classList.add('hidden');
        }
        loadDashboard();
    });

    dateInput?.addEventListener('change', () => {
        if (selectedPeriod === 'custom' || selectedPeriod === 'custom-range') {
            loadDashboard();
        }
    });

    dateInputEnd?.addEventListener('change', () => {
        if (selectedPeriod === 'custom-range') {
            loadDashboard();
        }
    });

    cashierFilter?.addEventListener('change', () => {
        selectedCashier = cashierFilter.value;
        loadDashboard();
    });

    btnRefresh?.addEventListener('click', () => {
        loadDashboard();
    });

    btnPdf?.addEventListener('click', () => {
        generateAnalyticsAuditPDF();
    });

    searchProducts?.addEventListener('input', (e) => {
        productsSearchTerm = (e.target.value || '').trim().toLowerCase();
        renderProductsMatrix();
    });
}

function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            // Reset tab styles
            tabBtns.forEach(b => {
                b.classList.remove('border-orange-600', 'bg-white', 'text-orange-600', 'shadow-sm', 'font-black');
                b.classList.add('border-transparent', 'text-slate-600', 'font-bold');
            });

            // Activate clicked tab
            btn.classList.add('border-orange-600', 'bg-white', 'text-orange-600', 'shadow-sm', 'font-black');
            btn.classList.remove('border-transparent', 'text-slate-600', 'font-bold');

            // Toggle panes
            tabPanes.forEach(pane => {
                if (pane.id === targetId) {
                    pane.classList.remove('hidden');
                } else {
                    pane.classList.add('hidden');
                }
            });
        });
    });
}

// --------------------------------------------------------------------
// Date Helper Functions
// --------------------------------------------------------------------
function getLocalDateString(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function computeDateFilterBounds() {
    const now = new Date();
    let startISO = null;
    let endISO = null;
    let label = 'Today';

    if (selectedPeriod === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        label = `Today (${getLocalDateString(now)})`;
    } else if (selectedPeriod === 'yesterday') {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
        const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        label = `Yesterday (${getLocalDateString(y)})`;
    } else if (selectedPeriod === 'week') {
        const w = new Date(now);
        w.setDate(w.getDate() - 6);
        const start = new Date(w.getFullYear(), w.getMonth(), w.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        label = `Last 7 Days (${getLocalDateString(w)} to ${getLocalDateString(now)})`;
    } else if (selectedPeriod === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
        label = `Month of ${monthName}`;
    } else if (selectedPeriod === 'custom') {
        const dateInput = document.getElementById('ana-date');
        const val = dateInput?.value || getLocalDateString(now);
        const parts = val.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d, 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        label = `Day: ${val}`;
    } else if (selectedPeriod === 'custom-range') {
        const d1Input = document.getElementById('ana-date');
        const d2Input = document.getElementById('ana-date-end');
        const v1 = d1Input?.value || getLocalDateString(now);
        const v2 = d2Input?.value || getLocalDateString(now);
        const p1 = v1.split('-');
        const p2 = v2.split('-');
        const start = new Date(parseInt(p1[0], 10), parseInt(p1[1], 10) - 1, parseInt(p1[2], 10), 0, 0, 0, 0);
        const end = new Date(parseInt(p2[0], 10), parseInt(p2[1], 10) - 1, parseInt(p2[2], 10), 23, 59, 59, 999);
        startISO = start.toISOString();
        endISO = end.toISOString();
        label = `Range: ${v1} to ${v2}`;
    } else if (selectedPeriod === 'all') {
        startISO = null;
        endISO = null;
        label = 'All Time History';
    }

    return { startISO, endISO, label };
}

// --------------------------------------------------------------------
// Main Dashboard Loader
// --------------------------------------------------------------------
async function loadDashboard() {
    try {
        const { startISO, endISO, label } = computeDateFilterBounds();

        // 1. Fetch Store Settings for Branding & Reports
        const { data: settingsData } = await supabase.from('settings').select('*');
        if (settingsData && settingsData.length > 0) {
            settingsData.forEach(s => {
                if (s.key && s.value !== undefined) storeSettings[s.key] = s.value;
            });
        }

        // 2. Fetch Users (Populate Cashier Filter if empty)
        const { data: usersData } = await supabase.from('users').select('id, username, full_name, role').order('username');
        if (usersData) {
            registeredUsers = usersData;
            populateCashierDropdown(usersData);
        }

        // 3. Fetch Low Stock Alerts (threshold <= 5)
        const { data: lowStockData } = await supabase
            .from('inventory')
            .select('id, name, category, stock_quantity, buying_price, selling_price, unit_of_measure')
            .lte('stock_quantity', 5)
            .order('stock_quantity', { ascending: true });
        lowStockList = lowStockData || [];

        // 4. Fetch Live Sales Records
        let query = supabase
            .from('sales_log')
            .select('*, inventory(id, name, category, unit_of_measure, buying_price, selling_price), users!sales_log_cashier_id_fkey(id, username, full_name), customers(id, name, phone)')
            .eq('is_voided', false)
            .order('timestamp', { ascending: false });

        if (startISO) query = query.gte('timestamp', startISO);
        if (endISO) query = query.lte('timestamp', endISO);
        if (selectedCashier && selectedCashier !== 'all') {
            query = query.eq('cashier_id', selectedCashier);
        }

        const { data: salesData, error: salesError } = await query;
        if (salesError) {
            console.error('[Analytics] Error fetching sales_log:', salesError);
            alert('Failed to load sales data: ' + salesError.message);
            return;
        }

        rawSalesRows = salesData || [];

        // Process and aggregate all metrics
        processAggregations();

        // Render Dashboard Components
        renderKPIScorecards();
        renderCharts();
        renderProductsMatrix();
        renderDebtAuditLedger();
        renderDebtRepaymentsLedger();
        renderCashierRoster();
        renderLowStockWatchlist();

    } catch (err) {
        console.error('[Analytics] Unexpected error loading dashboard:', err);
    }
}

function populateCashierDropdown(users) {
    const select = document.getElementById('ana-cashier-filter');
    if (!select || select.options.length > 1) return;

    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.full_name || u.username} (${u.role})`;
        select.appendChild(opt);
    });
}

// --------------------------------------------------------------------
// Data Aggregations & Math Engine
// --------------------------------------------------------------------
function processAggregations() {
    // 1. Group by receipt_no to reconstruct shopping carts and tenders
    const receiptMap = {};
    rawSalesRows.forEach(row => {
        const rNo = row.receipt_no || `ROW-${row.id}`;
        if (!receiptMap[rNo]) {
            receiptMap[rNo] = {
                receipt_no: rNo,
                timestamp: row.timestamp,
                status: row.status,
                payment_method: row.payment_method || 'Cash',
                notes: row.notes || '',
                customer: row.customers,
                cashier_id: row.cashier_id,
                cashier_username: row.users?.username || 'Staff',
                cashier_name: row.users?.full_name || row.users?.username || 'Staff',
                total_charged: 0,
                calculated_profit: 0,
                items: []
            };
        }
        receiptMap[rNo].items.push(row);
        receiptMap[rNo].total_charged += parseFloat(row.total_charged || 0);
        receiptMap[rNo].calculated_profit += parseFloat(row.calculated_profit || 0);
    });

    receiptGroupsList = Object.values(receiptMap).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Separate Debt Sales vs Debt Collections vs Standard Completed Sales
    debtIssuedReceipts = receiptGroupsList.filter(r => 
        r.status === 'debt' || (r.payment_method && r.payment_method.toLowerCase().includes('debt'))
    );

    debtCollectionReceipts = receiptGroupsList.filter(r => 
        r.status === 'debt_collection'
    );

    // 2. Group Products Sold Matrix (exclude debt collections as they are financial pay-downs)
    const productAggMap = {};
    rawSalesRows.forEach(row => {
        if (row.status === 'debt_collection') return;

        const itemId = row.item_id || row.inventory?.name || row.notes || 'Unknown Item';
        const itemName = row.inventory?.name || row.notes || 'Hardware Item';
        const category = row.inventory?.category || 'General';
        const unit = row.inventory?.unit_of_measure || 'pcs';
        const qty = parseFloat(row.calculated_qty || 1);
        const revenue = parseFloat(row.total_charged || 0);
        const profit = parseFloat(row.calculated_profit || 0);
        const buyingPrice = parseFloat(row.buying_price_at_sale || row.inventory?.buying_price || 0);
        const sellingPrice = parseFloat(row.inventory?.selling_price || (qty > 0 ? (revenue / qty) : 0));

        if (!productAggMap[itemId]) {
            productAggMap[itemId] = {
                item_id: itemId,
                name: itemName,
                category: category,
                unit: unit,
                units_sold: 0,
                total_revenue: 0,
                total_cogs: 0,
                total_profit: 0,
                unit_selling_price: sellingPrice,
                unit_buying_price: buyingPrice
            };
        }

        productAggMap[itemId].units_sold += qty;
        productAggMap[itemId].total_revenue += revenue;
        productAggMap[itemId].total_cogs += (qty * buyingPrice);
        productAggMap[itemId].total_profit += profit;
    });

    groupedProductsMatrix = Object.values(productAggMap).sort((a, b) => b.total_revenue - a.total_revenue);

    // 3. Cashier Performance Aggregations
    const cashierMap = {};
    receiptGroupsList.forEach(r => {
        const uId = r.cashier_id || 'unknown';
        const uName = r.cashier_name;
        const uUsername = r.cashier_username;

        if (!cashierMap[uId]) {
            cashierMap[uId] = {
                id: uId,
                name: uName,
                username: uUsername,
                tx_count: 0,
                cash_collected: 0,
                mpesa_collected: 0,
                debt_issued: 0,
                total_revenue: 0
            };
        }

        cashierMap[uId].tx_count++;

        if (r.status === 'debt' || (r.payment_method && r.payment_method.toLowerCase().includes('debt'))) {
            cashierMap[uId].debt_issued += r.total_charged;
            cashierMap[uId].total_revenue += r.total_charged;
        } else if (r.status === 'debt_collection') {
            if (isCashPayment(r.payment_method)) cashierMap[uId].cash_collected += r.total_charged;
            else if (isMpesaPayment(r.payment_method)) cashierMap[uId].mpesa_collected += r.total_charged;
            else cashierMap[uId].cash_collected += r.total_charged;
        } else {
            cashierMap[uId].total_revenue += r.total_charged;
            const splitMatch = (r.notes || '').match(/Cash:\s*([\d.]+)\s*\|\s*M-Pesa:\s*([\d.]+)/i);
            if (splitMatch) {
                const c = parseFloat(splitMatch[1]) || 0;
                const m = parseFloat(splitMatch[2]) || 0;
                cashierMap[uId].cash_collected += c;
                cashierMap[uId].mpesa_collected += m;
            } else {
                if (isCashPayment(r.payment_method)) cashierMap[uId].cash_collected += r.total_charged;
                else if (isMpesaPayment(r.payment_method)) cashierMap[uId].mpesa_collected += r.total_charged;
                else cashierMap[uId].cash_collected += r.total_charged;
            }
        }
    });

    cashiersPerformanceList = Object.values(cashierMap).sort((a, b) => b.total_revenue - a.total_revenue);
}

// --------------------------------------------------------------------
// UI Renderers: KPI Scorecards
// --------------------------------------------------------------------
function renderKPIScorecards() {
    let grossRevenue = 0;
    let grossProfit = 0;
    let cashInTill = 0;
    let mpesaVerified = 0;
    let debtIssued = 0;
    let debtCollected = 0;
    let totalUnitsSold = 0;

    receiptGroupsList.forEach(r => {
        if (r.status === 'debt' || (r.payment_method && r.payment_method.toLowerCase().includes('debt'))) {
            debtIssued += r.total_charged;
            grossRevenue += r.total_charged;
            grossProfit += r.calculated_profit;
        } else if (r.status === 'debt_collection') {
            debtCollected += r.total_charged;
            if (isCashPayment(r.payment_method)) cashInTill += r.total_charged;
            else if (isMpesaPayment(r.payment_method)) mpesaVerified += r.total_charged;
            else cashInTill += r.total_charged;
        } else {
            grossRevenue += r.total_charged;
            grossProfit += r.calculated_profit;

            const splitMatch = (r.notes || '').match(/Cash:\s*([\d.]+)\s*\|\s*M-Pesa:\s*([\d.]+)/i);
            if (splitMatch) {
                const c = parseFloat(splitMatch[1]) || 0;
                const m = parseFloat(splitMatch[2]) || 0;
                cashInTill += c;
                mpesaVerified += m;
            } else {
                if (isCashPayment(r.payment_method)) cashInTill += r.total_charged;
                else if (isMpesaPayment(r.payment_method)) mpesaVerified += r.total_charged;
                else cashInTill += r.total_charged;
            }
        }
    });

    groupedProductsMatrix.forEach(p => {
        totalUnitsSold += p.units_sold;
    });

    const marginPct = grossRevenue > 0 ? ((grossProfit / grossRevenue) * 100).toFixed(1) : '0.0';
    const totalTransactions = receiptGroupsList.length;
    const aov = totalTransactions > 0 ? (grossRevenue / totalTransactions) : 0;

    // Inject into KPI Cards
    document.getElementById('kpi-rev').textContent = `KSh ${grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-profit').textContent = `KSh ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-margin-pct').textContent = `Gross Margin: ${marginPct}%`;
    document.getElementById('kpi-cash').textContent = `KSh ${cashInTill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-mpesa').textContent = `KSh ${mpesaVerified.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-debt-issued').textContent = `KSh ${debtIssued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-debt-count').textContent = `${debtIssuedReceipts.length} credit order${debtIssuedReceipts.length === 1 ? '' : 's'}`;
    document.getElementById('kpi-debt-collected').textContent = `KSh ${debtCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Secondary Summary Strip
    document.getElementById('kpi-tx-count').textContent = totalTransactions.toLocaleString();
    document.getElementById('kpi-units-count').textContent = `${totalUnitsSold.toLocaleString()} units`;
    document.getElementById('kpi-aov').textContent = `KSh ${aov.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-low-stock-count').textContent = `${lowStockList.length} items`;

    // Tab Badges
    document.getElementById('badge-products-count').textContent = groupedProductsMatrix.length;
    document.getElementById('badge-debt-count').textContent = debtIssuedReceipts.length;
    document.getElementById('badge-repayments-count').textContent = debtCollectionReceipts.length;
    document.getElementById('badge-cashiers-count').textContent = cashiersPerformanceList.length;
    document.getElementById('badge-lowstock-count').textContent = lowStockList.length;

    // Header pills on tabs
    const debtIssuedPill = document.getElementById('debt-issued-summary-pill');
    if (debtIssuedPill) debtIssuedPill.textContent = `Total Credit: KSh ${debtIssued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const debtCollectedPill = document.getElementById('debt-collected-summary-pill');
    if (debtCollectedPill) debtCollectedPill.textContent = `Total Recovered: KSh ${debtCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --------------------------------------------------------------------
// UI Renderers: Charts
// --------------------------------------------------------------------
function renderCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('[Analytics] Chart.js library is not available');
        return;
    }

    // 1. Payment Methods Doughnut Chart
    let cashTotal = 0;
    let mpesaTotal = 0;
    let debtTotal = 0;

    receiptGroupsList.forEach(r => {
        if (r.status === 'debt' || (r.payment_method && r.payment_method.toLowerCase().includes('debt'))) {
            debtTotal += r.total_charged;
        } else if (r.status === 'debt_collection') {
            if (isCashPayment(r.payment_method)) cashTotal += r.total_charged;
            else if (isMpesaPayment(r.payment_method)) mpesaTotal += r.total_charged;
            else cashTotal += r.total_charged;
        } else {
            const splitMatch = (r.notes || '').match(/Cash:\s*([\d.]+)\s*\|\s*M-Pesa:\s*([\d.]+)/i);
            if (splitMatch) {
                cashTotal += parseFloat(splitMatch[1]) || 0;
                mpesaTotal += parseFloat(splitMatch[2]) || 0;
            } else {
                if (isCashPayment(r.payment_method)) cashTotal += r.total_charged;
                else if (isMpesaPayment(r.payment_method)) mpesaTotal += r.total_charged;
                else cashTotal += r.total_charged;
            }
        }
    });

    const paymentCanvas = document.getElementById('paymentChart');
    if (paymentCanvas) {
        if (chartPaymentInstance) chartPaymentInstance.destroy();
        chartPaymentInstance = new Chart(paymentCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Cash', 'M-Pesa', 'Store Credit'],
                datasets: [{
                    data: [cashTotal, mpesaTotal, debtTotal],
                    backgroundColor: ['#10b981', '#0284c7', '#ea580c'],
                    hoverBackgroundColor: ['#059669', '#0369a1', '#c2410c'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11, weight: 'bold' } } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.raw || 0;
                                return ` ${ctx.label}: KSh ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    // 2. Top Selling Products Bar Chart (Top 5)
    const top5Products = groupedProductsMatrix.slice(0, 5);
    const itemsCanvas = document.getElementById('itemsChart');
    if (itemsCanvas) {
        if (chartItemsInstance) chartItemsInstance.destroy();
        chartItemsInstance = new Chart(itemsCanvas, {
            type: 'bar',
            data: {
                labels: top5Products.map(p => p.name.length > 15 ? p.name.slice(0, 15) + '…' : p.name),
                datasets: [{
                    label: 'Revenue (KSh)',
                    data: top5Products.map(p => p.total_revenue),
                    backgroundColor: '#ea580c',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { ticks: { font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { font: { size: 10, weight: 'bold' } }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ` Revenue: KSh ${ctx.raw.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 3. Cashier Performance Bar Chart
    const cashiersCanvas = document.getElementById('cashierChart');
    if (cashiersCanvas) {
        if (chartCashiersInstance) chartCashiersInstance.destroy();
        chartCashiersInstance = new Chart(cashiersCanvas, {
            type: 'bar',
            data: {
                labels: cashiersPerformanceList.map(c => c.username),
                datasets: [
                    {
                        label: 'Cash',
                        data: cashiersPerformanceList.map(c => c.cash_collected),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    },
                    {
                        label: 'M-Pesa',
                        data: cashiersPerformanceList.map(c => c.mpesa_collected),
                        backgroundColor: '#0284c7',
                        borderRadius: 4
                    },
                    {
                        label: 'Credit',
                        data: cashiersPerformanceList.map(c => c.debt_issued),
                        backgroundColor: '#ea580c',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, ticks: { font: { size: 10, weight: 'bold' } }, grid: { display: false } },
                    y: { stacked: true, ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' } } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ` ${ctx.dataset.label}: KSh ${ctx.raw.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// --------------------------------------------------------------------
// UI Renderers: Products Sold Matrix
// --------------------------------------------------------------------
function renderProductsMatrix() {
    const tbody = document.getElementById('tbody-products-sold');
    const tfoot = document.getElementById('tfoot-products-sold');
    if (!tbody) return;

    let filtered = groupedProductsMatrix;
    if (productsSearchTerm) {
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(productsSearchTerm) || 
            p.category.toLowerCase().includes(productsSearchTerm)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400 font-semibold">No hardware products sold in this period.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let sumUnits = 0;
    let sumRev = 0;
    let sumCogs = 0;
    let sumProfit = 0;

    tbody.innerHTML = filtered.map(p => {
        sumUnits += p.units_sold;
        sumRev += p.total_revenue;
        sumCogs += p.total_cogs;
        sumProfit += p.total_profit;

        const margin = p.total_revenue > 0 ? ((p.total_profit / p.total_revenue) * 100).toFixed(1) : '0.0';
        const marginColor = parseFloat(margin) >= 20 ? 'text-emerald-700 bg-emerald-50' : parseFloat(margin) >= 10 ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-100';

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-3">
                    <span class="font-black text-slate-900 block">${escapeHtml(p.name)}</span>
                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Unit: ${escapeHtml(p.unit)}</span>
                </td>
                <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ${escapeHtml(p.category)}
                    </span>
                </td>
                <td class="py-3 px-3 text-center font-black text-slate-800">
                    ${p.units_sold.toLocaleString()}
                </td>
                <td class="py-3 px-3 text-right font-medium text-slate-600">
                    KSh ${p.unit_selling_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-medium text-slate-500">
                    KSh ${p.unit_buying_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-black text-slate-900">
                    KSh ${p.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-medium text-slate-500">
                    KSh ${p.total_cogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-black text-emerald-600">
                    KSh ${p.total_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-md text-xs font-black ${marginColor}">
                        ${margin}%
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    const overallMargin = sumRev > 0 ? ((sumProfit / sumRev) * 100).toFixed(1) : '0.0';

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td class="py-3 px-3 font-black text-slate-900 uppercase">Total Consolidated (${filtered.length} Items)</td>
                <td class="py-3 px-3"></td>
                <td class="py-3 px-3 text-center font-black text-slate-900">${sumUnits.toLocaleString()}</td>
                <td class="py-3 px-3"></td>
                <td class="py-3 px-3"></td>
                <td class="py-3 px-3 text-right font-black text-slate-900">KSh ${sumRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-right font-black text-slate-600">KSh ${sumCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-right font-black text-emerald-600">KSh ${sumProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-center font-black text-emerald-700 bg-emerald-50">${overallMargin}%</td>
            </tr>
        `;
    }
}

// --------------------------------------------------------------------
// UI Renderers: Debt Audit Ledger (Who took debt & What was it)
// --------------------------------------------------------------------
function renderDebtAuditLedger() {
    const tbody = document.getElementById('tbody-debt-audit');
    const tfoot = document.getElementById('tfoot-debt-audit');
    if (!tbody) return;

    if (debtIssuedReceipts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-semibold">No store credit or debt orders issued during this period.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let totalDebtIssued = 0;

    tbody.innerHTML = debtIssuedReceipts.map(r => {
        totalDebtIssued += r.total_charged;
        const dateStr = formatDateTime(r.timestamp);
        const debtorName = r.customer?.name || 'Walk-in / Unlinked Customer';
        const debtorPhone = r.customer?.phone ? `<a href="tel:${r.customer.phone}" class="text-[11px] text-orange-600 font-bold hover:underline block">${r.customer.phone}</a>` : '';

        // Format itemized products on debt
        const itemsHtml = r.items.map(item => {
            const name = item.inventory?.name || item.notes || 'Hardware Item';
            const qty = item.calculated_qty || 1;
            const unit = item.inventory?.unit_of_measure || 'pcs';
            const price = (item.total_charged / (qty || 1));
            const total = item.total_charged;
            return `
                <div class="flex items-center justify-between text-xs py-0.5 border-b border-slate-100 last:border-b-0">
                    <span class="font-bold text-slate-800">
                        • ${escapeHtml(name)} <span class="text-slate-500 font-normal">(${qty} ${unit} @ KSh ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                    </span>
                    <span class="font-black text-slate-700 ml-2">KSh ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
            `;
        }).join('');

        return `
            <tr class="hover:bg-orange-50/30 transition border-b border-slate-100">
                <td class="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                    ${dateStr}
                </td>
                <td class="py-3 px-3 font-mono font-black text-xs text-orange-600">
                    ${escapeHtml(r.receipt_no)}
                </td>
                <td class="py-3 px-3">
                    <span class="font-black text-slate-900 block">${escapeHtml(debtorName)}</span>
                    ${debtorPhone}
                </td>
                <td class="py-3 px-3 bg-slate-50/60 rounded-xl my-1 p-2 border border-slate-200/60">
                    ${itemsHtml}
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                        ${escapeHtml(r.cashier_username)}
                    </span>
                </td>
                <td class="py-3 px-3 text-right font-black text-orange-600 text-sm whitespace-nowrap">
                    KSh ${r.total_charged.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td colspan="5" class="py-3 px-3 font-black text-slate-900 uppercase">
                    Total Store Credit Issued (${debtIssuedReceipts.length} Transactions)
                </td>
                <td class="py-3 px-3 text-right font-black text-orange-600 text-base">
                    KSh ${totalDebtIssued.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
            </tr>
        `;
    }
}

// --------------------------------------------------------------------
// UI Renderers: Debt Repayments Collected
// --------------------------------------------------------------------
function renderDebtRepaymentsLedger() {
    const tbody = document.getElementById('tbody-repayments');
    const tfoot = document.getElementById('tfoot-repayments');
    if (!tbody) return;

    if (debtCollectionReceipts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-semibold">No debt repayments received in this period.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let totalRecovered = 0;

    tbody.innerHTML = debtCollectionReceipts.map(r => {
        totalRecovered += r.total_charged;
        const dateStr = formatDateTime(r.timestamp);
        const customerName = r.customer?.name || 'Customer Account';
        const customerPhone = r.customer?.phone || '';
        const method = r.payment_method || 'Cash';
        const methodBadge = method.toLowerCase().includes('cash')
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">💵 Cash</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">📱 M-Pesa</span>';

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                    ${dateStr}
                </td>
                <td class="py-3 px-3 font-mono font-black text-xs text-slate-700">
                    ${escapeHtml(r.receipt_no)}
                </td>
                <td class="py-3 px-3">
                    <span class="font-black text-slate-900 block">${escapeHtml(customerName)}</span>
                    <span class="text-[10px] text-slate-500">${escapeHtml(customerPhone)}</span>
                </td>
                <td class="py-3 px-3 text-center">
                    ${methodBadge}
                </td>
                <td class="py-3 px-3 text-slate-600 font-medium text-xs">
                    ${escapeHtml(r.notes || 'Customer debt pay-down')}
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                        ${escapeHtml(r.cashier_username)}
                    </span>
                </td>
                <td class="py-3 px-3 text-right font-black text-teal-600 text-sm whitespace-nowrap">
                    KSh ${r.total_charged.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td colspan="6" class="py-3 px-3 font-black text-slate-900 uppercase">
                    Total Debt Collections Received (${debtCollectionReceipts.length} Payments)
                </td>
                <td class="py-3 px-3 text-right font-black text-teal-600 text-base">
                    KSh ${totalRecovered.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
            </tr>
        `;
    }
}

// --------------------------------------------------------------------
// UI Renderers: Cashier Performance Roster
// --------------------------------------------------------------------
function renderCashierRoster() {
    const tbody = document.getElementById('tbody-cashiers');
    const tfoot = document.getElementById('tfoot-cashiers');
    if (!tbody) return;

    if (cashiersPerformanceList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-semibold">No cashier sales recorded during this period.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let grandCash = 0;
    let grandMpesa = 0;
    let grandDebt = 0;
    let grandRev = 0;
    let grandTx = 0;

    cashiersPerformanceList.forEach(c => {
        grandCash += c.cash_collected;
        grandMpesa += c.mpesa_collected;
        grandDebt += c.debt_issued;
        grandRev += c.total_revenue;
        grandTx += c.tx_count;
    });

    tbody.innerHTML = cashiersPerformanceList.map(c => {
        const share = grandRev > 0 ? ((c.total_revenue / grandRev) * 100).toFixed(1) : '0.0';

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-3">
                    <span class="font-black text-slate-900 block">${escapeHtml(c.name)}</span>
                    <span class="text-[10px] text-slate-400 font-bold uppercase">@${escapeHtml(c.username)}</span>
                </td>
                <td class="py-3 px-3 text-center font-black text-slate-800">
                    ${c.tx_count.toLocaleString()}
                </td>
                <td class="py-3 px-3 text-right font-medium text-emerald-700">
                    KSh ${c.cash_collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-medium text-sky-700">
                    KSh ${c.mpesa_collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-medium text-orange-600">
                    KSh ${c.debt_issued.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-black text-slate-900 text-sm">
                    KSh ${c.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="px-2 py-0.5 rounded font-black text-xs bg-slate-100 text-slate-800">
                        ${share}%
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td class="py-3 px-3 font-black text-slate-900 uppercase">Total Cashier Shift Balancing</td>
                <td class="py-3 px-3 text-center font-black text-slate-900">${grandTx.toLocaleString()}</td>
                <td class="py-3 px-3 text-right font-black text-emerald-700">KSh ${grandCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-right font-black text-sky-700">KSh ${grandMpesa.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-right font-black text-orange-600">KSh ${grandDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-right font-black text-slate-900">KSh ${grandRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-3 text-center font-black text-slate-900">100.0%</td>
            </tr>
        `;
    }
}

// --------------------------------------------------------------------
// UI Renderers: Low Stock Watchlist
// --------------------------------------------------------------------
function renderLowStockWatchlist() {
    const tbody = document.getElementById('tbody-lowstock');
    if (!tbody) return;

    if (lowStockList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-emerald-600 font-bold">All inventory stock levels are well above the replenishment threshold (all &gt; 5 units).</td></tr>`;
        return;
    }

    tbody.innerHTML = lowStockList.map(item => {
        const margin = (item.selling_price - item.buying_price);
        const marginPct = item.selling_price > 0 ? ((margin / item.selling_price) * 100).toFixed(1) : '0.0';

        return `
            <tr class="hover:bg-red-50/30 transition border-b border-slate-100">
                <td class="py-3 px-3 font-black text-slate-900">
                    ${escapeHtml(item.name)}
                </td>
                <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ${escapeHtml(item.category || 'General')}
                    </span>
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200">
                        ${item.stock_quantity} ${item.unit_of_measure || 'units'}
                    </span>
                </td>
                <td class="py-3 px-3 text-right font-medium text-slate-600">
                    KSh ${parseFloat(item.buying_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-right font-black text-slate-900">
                    KSh ${parseFloat(item.selling_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="py-3 px-3 text-center font-bold text-emerald-600 text-xs">
                    +KSh ${margin.toFixed(2)} (${marginPct}%)
                </td>
                <td class="py-3 px-3 text-center">
                    <a href="/restock.html" class="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition">
                        Order
                    </a>
                </td>
            </tr>
        `;
    }).join('');
}

// --------------------------------------------------------------------
// Upgraded Executive Financial Audit PDF Generator
// --------------------------------------------------------------------
function generateAnalyticsAuditPDF() {
    if (!window.jspdf) {
        return alert('PDF generation library is still loading. Please try again.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const { label: periodLabel } = computeDateFilterBounds();
    const storeName = (storeSettings.company_name || 'LITAJ HARDWARE').toUpperCase();
    const phone = storeSettings.phone_contact || '+254 700 000 000';
    const address = storeSettings.location_address || 'Main Hardware Yard, Commercial Street';
    const printedAt = new Date().toLocaleString();
    const auditorName = currentUser?.full_name || currentUser?.username || 'System Auditor';

    // 1. Header Banner (Slate-900 / Orange Accent)
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 32, 'F');

    doc.setFillColor(234, 88, 12); // orange-600 accent bar
    doc.rect(0, 31, 210, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(storeName, 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`BUILDING MATERIALS & CONSTRUCTION SUPPLIES • AUDIT & FINANCIAL REPORT`, 14, 19);
    doc.text(`Tel: ${phone} | Location: ${address}`, 14, 25);

    // Right-aligned report details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('EXECUTIVE SALES AUDIT', 196, 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240);
    doc.text(`Period: ${periodLabel}`, 196, 18, { align: 'right' });
    doc.text(`Audited By: ${auditorName}`, 196, 23, { align: 'right' });
    doc.text(`Printed: ${printedAt}`, 196, 28, { align: 'right' });

    // 2. Executive Financial Scorecard (AutoTable)
    let grossRev = 0;
    let grossProf = 0;
    let cashInTill = 0;
    let mpesaVerified = 0;
    let debtIssued = 0;
    let debtCollected = 0;
    let sumCOGS = 0;

    receiptGroupsList.forEach(r => {
        if (r.status === 'debt' || (r.payment_method && r.payment_method.toLowerCase().includes('debt'))) {
            debtIssued += r.total_charged;
            grossRev += r.total_charged;
            grossProf += r.calculated_profit;
        } else if (r.status === 'debt_collection') {
            debtCollected += r.total_charged;
            if (isCashPayment(r.payment_method)) cashInTill += r.total_charged;
            else if (isMpesaPayment(r.payment_method)) mpesaVerified += r.total_charged;
            else cashInTill += r.total_charged;
        } else {
            grossRev += r.total_charged;
            grossProf += r.calculated_profit;

            const splitMatch = (r.notes || '').match(/Cash:\s*([\d.]+)\s*\|\s*M-Pesa:\s*([\d.]+)/i);
            if (splitMatch) {
                cashInTill += parseFloat(splitMatch[1]) || 0;
                mpesaVerified += parseFloat(splitMatch[2]) || 0;
            } else {
                if (isCashPayment(r.payment_method)) cashInTill += r.total_charged;
                else if (isMpesaPayment(r.payment_method)) mpesaVerified += r.total_charged;
                else cashInTill += r.total_charged;
            }
        }
    });

    sumCOGS = grossRev - grossProf;
    const marginPct = grossRev > 0 ? ((grossProf / grossRev) * 100).toFixed(1) : '0.0';

    doc.autoTable({
        startY: 38,
        head: [['GROSS SALES REVENUE', 'COST OF GOODS (COGS)', 'GROSS STORE PROFIT', 'PROFIT MARGIN %']],
        body: [[
            `KSh ${grossRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${sumCOGS.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${grossProf.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `${marginPct}%`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        bodyStyles: { fontStyle: 'bold', fontSize: 9.5, halign: 'center', textColor: [15, 23, 42], cellPadding: 2.5 },
        margin: { left: 14, right: 14 }
    });

    let currentY = doc.lastAutoTable.finalY + 3;

    doc.autoTable({
        startY: currentY,
        head: [['CASH IN DRAWER', 'M-PESA VERIFIED', 'STORE DEBT ISSUED', 'DEBT REPAID (RECOVERED)']],
        body: [[
            `KSh ${cashInTill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${mpesaVerified.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${debtIssued.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${debtCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        bodyStyles: { fontStyle: 'bold', fontSize: 9.5, halign: 'center', textColor: [15, 23, 42], cellPadding: 2.5 },
        margin: { left: 14, right: 14 }
    });

    // 3. Section Title: Products Sold Breakdown
    currentY = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('1. CONSOLIDATED PRODUCTS SOLD MATRIX', 14, currentY);

    const productsTableData = groupedProductsMatrix.map(p => {
        const margin = p.total_revenue > 0 ? ((p.total_profit / p.total_revenue) * 100).toFixed(1) : '0.0';
        return [
            p.name,
            p.category,
            `${p.units_sold} ${p.unit}`,
            p.unit_selling_price.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            p.total_cogs.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            p.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            p.total_profit.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            `${margin}%`
        ];
    });

    let totalSoldUnits = 0;
    groupedProductsMatrix.forEach(p => totalSoldUnits += p.units_sold);

    const productsFootData = [[
        `Consolidated Total (${groupedProductsMatrix.length} Items)`,
        '',
        `${totalSoldUnits} units`,
        '',
        sumCOGS.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        grossRev.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        grossProf.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        `${marginPct}%`
    ]];

    doc.autoTable({
        startY: currentY + 3,
        head: [['Hardware Item', 'Category', 'Qty Sold', 'Unit Price', 'COGS (Cost)', 'Total Revenue', 'Gross Profit', 'Margin']],
        body: productsTableData.length > 0 ? productsTableData : [['No hardware sales recorded during this period.', '', '', '', '', '', '', '']],
        foot: productsTableData.length > 0 ? productsFootData : [],
        theme: 'striped',
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 32 },
            2: { cellWidth: 18, halign: 'center' },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 20, halign: 'right' },
            7: { cellWidth: 16, halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    // 4. Section Title: Store Debt Given Out - Detailed Itemized Audit Ledger (CRITICAL REQUIREMENT)
    currentY = doc.lastAutoTable.finalY + 9;

    // Check if new page is needed for debt section
    if (currentY > 230) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(234, 88, 12); // Orange
    doc.text('2. STORE DEBT ISSUED AUDIT (WHO TOOK CREDIT & WHAT PRODUCTS)', 14, currentY);

    const debtTableData = debtIssuedReceipts.map(r => {
        const dateStr = formatDateTime(r.timestamp);
        const debtor = `${r.customer?.name || 'Walk-in / Unlinked'}\n${r.customer?.phone || 'No phone'}`;

        // Itemized list of hardware products taken on debt
        const itemsStr = r.items.map(item => {
            const name = item.inventory?.name || item.notes || 'Hardware Item';
            const qty = item.calculated_qty || 1;
            const unit = item.inventory?.unit_of_measure || 'pcs';
            const price = (item.total_charged / (qty || 1));
            return `• ${name} (${qty} ${unit} @ KSh ${price.toLocaleString()}) = KSh ${item.total_charged.toLocaleString()}`;
        }).join('\n');

        return [
            dateStr,
            r.receipt_no,
            debtor,
            itemsStr,
            r.cashier_username,
            `KSh ${r.total_charged.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        ];
    });

    const debtFootData = [[
        `Total Store Debt Issued (${debtIssuedReceipts.length} Transactions)`,
        '',
        '',
        '',
        '',
        `KSh ${debtIssued.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]];

    doc.autoTable({
        startY: currentY + 3,
        head: [['Date / Time', 'Receipt #', 'Debtor (Customer)', 'Itemized Hardware Products Taken on Credit', 'Cashier', 'Debt Amount']],
        body: debtTableData.length > 0 ? debtTableData : [['No store credit or debt issued during this period.', '', '', '', '', 'KSh 0.00']],
        foot: debtTableData.length > 0 ? debtFootData : [],
        theme: 'grid',
        headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [254, 243, 199], textColor: [180, 83, 9], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 26, fontStyle: 'bold' },
            2: { cellWidth: 35 },
            3: { cellWidth: 65 },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    // 5. Section Title: Debt Collections & Recoveries
    currentY = doc.lastAutoTable.finalY + 9;
    if (currentY > 230) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('3. DEBT REPAYMENTS & SETTLEMENTS RECEIVED', 14, currentY);

    const repaymentsTableData = debtCollectionReceipts.map(r => {
        return [
            formatDateTime(r.timestamp),
            r.receipt_no,
            `${r.customer?.name || 'Customer'}\n${r.customer?.phone || ''}`,
            r.payment_method || 'Cash',
            r.notes || 'Debt repayment',
            r.cashier_username,
            `KSh ${r.total_charged.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        ];
    });

    const repaymentsFootData = [[
        `Total Debt Repayments Collected (${debtCollectionReceipts.length} Payments)`,
        '',
        '',
        '',
        '',
        '',
        `KSh ${debtCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]];

    doc.autoTable({
        startY: currentY + 3,
        head: [['Date / Time', 'Receipt #', 'Customer', 'Channel', 'Notes / Reference', 'Cashier', 'Amount Repaid']],
        body: repaymentsTableData.length > 0 ? repaymentsTableData : [['No debt repayments recorded during this period.', '', '', '', '', '', 'KSh 0.00']],
        foot: repaymentsTableData.length > 0 ? repaymentsFootData : [],
        theme: 'striped',
        headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [240, 253, 250], textColor: [13, 148, 136], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 26, fontStyle: 'bold' },
            2: { cellWidth: 35 },
            3: { cellWidth: 20, halign: 'center' },
            4: { cellWidth: 45 },
            5: { cellWidth: 20, halign: 'center' },
            6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    // 6. Section Title: Cashier Register Performance & Shift Balancing
    currentY = doc.lastAutoTable.finalY + 9;
    if (currentY > 230) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('4. CASHIER SHIFT RECONCILIATION & TILL BALANCING', 14, currentY);

    const cashiersTableData = cashiersPerformanceList.map(c => {
        const share = grossRev > 0 ? ((c.total_revenue / grossRev) * 100).toFixed(1) : '0.0';
        return [
            `${c.name} (@${c.username})`,
            c.tx_count.toString(),
            `KSh ${c.cash_collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${c.mpesa_collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${c.debt_issued.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `KSh ${c.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            `${share}%`
        ];
    });

    doc.autoTable({
        startY: currentY + 3,
        head: [['Cashier Staff', 'Transactions', 'Cash Handled', 'M-Pesa Handled', 'Credit Issued', 'Total Generated', 'Share']],
        body: cashiersTableData.length > 0 ? cashiersTableData : [['No cashier activity recorded during this period.', '', '', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 22, halign: 'center' },
            2: { cellWidth: 28, halign: 'right' },
            3: { cellWidth: 28, halign: 'right' },
            4: { cellWidth: 28, halign: 'right' },
            5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 14, halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    // 7. Formal Dual Sign-off Blocks
    currentY = doc.lastAutoTable.finalY + 14;
    if (currentY > 240) {
        doc.addPage();
        currentY = 25;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('5. AUDIT VERIFICATION & CERTIFICATION', 14, currentY);

    currentY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);

    // Box 1: Prepared by
    doc.rect(14, currentY, 86, 26);
    doc.setFont('helvetica', 'bold');
    doc.text('PREPARED BY (Cashier / Shift Lead):', 17, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${auditorName}`, 17, currentY + 12);
    doc.text('Signature: __________________________', 17, currentY + 18);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 17, currentY + 23);

    // Box 2: Approved by
    doc.rect(110, currentY, 86, 26);
    doc.setFont('helvetica', 'bold');
    doc.text('VERIFIED & APPROVED BY (Store Manager):', 113, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text('Name: _______________________________', 113, currentY + 12);
    doc.text('Signature: __________________________', 113, currentY + 18);
    doc.text('Date: _______________________________', 113, currentY + 23);

    // 8. Auto Page Numbering on All Pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
            `Page ${i} of ${pageCount}  •  Litaj Hardware Enterprise POS  •  Confidential Financial Audit`,
            105,
            290,
            { align: 'center' }
        );
    }

    // Save and download PDF
    const filenameDate = selectedPeriod === 'today' 
        ? getLocalDateString(new Date()) 
        : `${selectedPeriod}_${getLocalDateString(new Date())}`;
    doc.save(`Litaj_Hardware_Audit_Report_${filenameDate}.pdf`);
}

// --------------------------------------------------------------------
// Utility Helpers
// --------------------------------------------------------------------
function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        return d.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch {
        return isoStr;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isCashPayment(method) {
    return (method || '').toLowerCase().includes('cash');
}

function isMpesaPayment(method) {
    const m = (method || '').toLowerCase().replace(/[^a-z]/g, '');
    return m.includes('mpesa');
}

