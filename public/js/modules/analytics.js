import { supabase } from '../supabaseClient.js';

export async function initAnalytics() {
    const container = document.getElementById('analytics-view');
    
    container.innerHTML = `
        <div class="max-w-7xl mx-auto h-full flex flex-col space-y-4">
            <!-- Header -->
            <div class="bg-white p-5 rounded-xl shadow flex justify-between items-center border border-slate-200">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800">Analytics Dashboard</h1>
                    <p class="text-slate-500 text-sm">Business performance at a glance</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-700">Period:</span>
                    <select id="ana-period" class="bg-slate-100 border border-slate-300 rounded px-4 py-2 font-semibold">
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="month">This Month</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-white p-5 rounded-xl shadow text-center border border-slate-200">
                    <div class="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Transactions</div>
                    <div id="kpi-tx" class="text-4xl font-black text-slate-800">0</div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow text-center border border-slate-200">
                    <div class="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Total Revenue</div>
                    <div id="kpi-rev" class="text-3xl font-black text-emerald-600">Ksh 0.00</div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow text-center border border-slate-200">
                    <div class="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Low Stock Alerts</div>
                    <div id="kpi-stock" class="text-4xl font-black text-red-500">0</div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow text-center border border-slate-200">
                    <div class="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Net Profit</div>
                    <div id="kpi-profit" class="text-3xl font-black text-orange-600">Ksh 0.00</div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[300px]">
                <div class="bg-white p-5 rounded-xl shadow border border-slate-200 flex flex-col">
                    <h2 class="text-lg font-bold text-slate-800">Top Selling Items</h2>
                    <p class="text-xs text-slate-400 mb-4">By quantity sold in period</p>
                    <div class="flex-1 overflow-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-slate-500">
                                <tr>
                                    <th class="py-2 px-3 font-semibold">Item</th>
                                    <th class="py-2 px-3 font-semibold text-right">Qty</th>
                                    <th class="py-2 px-3 font-semibold text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody id="top-items-tbody" class="divide-y divide-slate-100">
                                <tr><td colspan="3" class="text-center py-4">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl shadow border border-slate-200 flex flex-col">
                    <h2 class="text-lg font-bold text-slate-800">Payment Methods</h2>
                    <p class="text-xs text-slate-400 mb-4">Breakdown of how customers paid</p>
                    <div class="flex-1 flex items-center justify-center gap-8">
                        <div class="text-center">
                            <div class="text-sm font-bold text-slate-500 mb-1">M-Pesa</div>
                            <div id="pay-mpesa" class="text-2xl font-bold text-emerald-600">0%</div>
                            <div id="pay-mpesa-val" class="text-xs text-slate-400">Ksh 0</div>
                        </div>
                        <div class="h-16 w-px bg-slate-200"></div>
                        <div class="text-center">
                            <div class="text-sm font-bold text-slate-500 mb-1">Cash</div>
                            <div id="pay-cash" class="text-2xl font-bold text-orange-600">0%</div>
                            <div id="pay-cash-val" class="text-xs text-slate-400">Ksh 0</div>
                        </div>
                        <div class="h-16 w-px bg-slate-200"></div>
                        <div class="text-center">
                            <div class="text-sm font-bold text-slate-500 mb-1">Debt / Tab</div>
                            <div id="pay-debt" class="text-2xl font-bold text-red-500">0%</div>
                            <div id="pay-debt-val" class="text-xs text-slate-400">Ksh 0</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('ana-period').addEventListener('change', loadAnalytics);
    await loadAnalytics();
}

async function loadAnalytics() {
    const period = document.getElementById('ana-period').value;
    
    let dateFilter = '';
    const d = new Date();
    
    if (period === 'today') {
        dateFilter = d.toISOString().split('T')[0];
    } else if (period === 'yesterday') {
        d.setDate(d.getDate() - 1);
        dateFilter = d.toISOString().split('T')[0];
    } else if (period === 'month') {
        dateFilter = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // Fetch Sales
    let salesQuery = supabase.from('sales_log').select('*, inventory(name)').eq('is_voided', false);
    if (dateFilter) {
        if (period === 'month') {
            salesQuery = salesQuery.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
        } else {
            salesQuery = salesQuery.gte('timestamp', `${dateFilter}T00:00:00Z`).lt('timestamp', `${dateFilter}T23:59:59Z`);
        }
    }
    const { data: sales } = await salesQuery;

    let txCount = 0;
    let rev = 0;
    let profit = 0;
    
    let mpesa = 0, cash = 0, debt = 0;
    const itemMap = {};

    (sales || []).forEach(s => {
        txCount++;
        rev += s.total_charged;
        profit += s.calculated_profit;

        if (s.payment_method === 'M-Pesa') mpesa += s.total_charged;
        else if (s.payment_method === 'Cash') cash += s.total_charged;
        else debt += s.total_charged;

        const name = s.inventory?.name || 'Unknown';
        if(!itemMap[name]) itemMap[name] = { qty: 0, rev: 0 };
        itemMap[name].qty += s.calculated_qty;
        itemMap[name].rev += s.total_charged;
    });

    document.getElementById('kpi-tx').textContent = txCount;
    document.getElementById('kpi-rev').textContent = `Ksh ${rev.toFixed(2)}`;
    document.getElementById('kpi-profit').textContent = `Ksh ${profit.toFixed(2)}`;

    // Low Stock
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).lt('stock_quantity', 5).eq('is_service', false);
    document.getElementById('kpi-stock').textContent = count || 0;

    // Payment splits
    if (rev > 0) {
        document.getElementById('pay-mpesa').textContent = Math.round((mpesa / rev) * 100) + '%';
        document.getElementById('pay-cash').textContent = Math.round((cash / rev) * 100) + '%';
        document.getElementById('pay-debt').textContent = Math.round((debt / rev) * 100) + '%';
    } else {
        document.getElementById('pay-mpesa').textContent = '0%';
        document.getElementById('pay-cash').textContent = '0%';
        document.getElementById('pay-debt').textContent = '0%';
    }
    document.getElementById('pay-mpesa-val').textContent = `Ksh ${mpesa.toFixed(0)}`;
    document.getElementById('pay-cash-val').textContent = `Ksh ${cash.toFixed(0)}`;
    document.getElementById('pay-debt-val').textContent = `Ksh ${debt.toFixed(0)}`;

    // Top Items Table
    const topItems = Object.entries(itemMap).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const tbody = document.getElementById('top-items-tbody');
    tbody.innerHTML = '';
    if (topItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4">No sales in period</td></tr>';
    } else {
        topItems.forEach(i => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-50">
                    <td class="py-2 px-3 font-medium text-slate-700">${i.name}</td>
                    <td class="py-2 px-3 text-right">${i.qty}</td>
                    <td class="py-2 px-3 text-right font-bold text-slate-800">${i.rev.toFixed(2)}</td>
                </tr>
            `;
        });
    }
}
