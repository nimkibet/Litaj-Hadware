import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if (currentUser && currentUser.role !== 'admin') window.location.href = '/pos.html';

let currentSalesData = [];
let currentResources = [];
let currentOverheads = [];
let currentDailyExpenses = [];
let currentAttendanceWages = [];
let currentTotalExpenses = 0;
let currentLowStock = [];
let lowStockExpanded = false;
let periodStr = 'today';

let userChartInstance = null;
let methodChartInstance = null;
let itemsChartInstance = null;

async function load() {
    periodStr = document.getElementById('ana-period').value;
    const dateInput = document.getElementById('ana-date');
    const dateInputEnd = document.getElementById('ana-date-end');
    const dateSeparator = document.getElementById('ana-date-separator');
    
    if (periodStr === 'custom' || periodStr === 'custom-range') {
        dateInput.classList.remove('hidden');
        if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        if (periodStr === 'custom-range') {
            dateInputEnd.classList.remove('hidden');
            dateSeparator.classList.remove('hidden');
            if (!dateInputEnd.value) {
                dateInputEnd.value = new Date().toISOString().split('T')[0];
            }
        } else {
            dateInputEnd.classList.add('hidden');
            dateSeparator.classList.add('hidden');
        }
    } else {
        dateInput.classList.add('hidden');
        if(dateInputEnd) dateInputEnd.classList.add('hidden');
        if(dateSeparator) dateSeparator.classList.add('hidden');
    }

    const d = (periodStr === 'custom' || periodStr === 'custom-range') && dateInput.value ? new Date(dateInput.value) : new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let dateFilter = periodStr === 'month' ? ym : d.toISOString().split('T')[0];
    
    let nextDateStr;
    if (periodStr === 'custom-range' && dateInputEnd && dateInputEnd.value) {
        let endDate = new Date(dateInputEnd.value);
        endDate.setDate(endDate.getDate() + 1);
        nextDateStr = endDate.toISOString().split('T')[0];
    } else {
        let nextDate = new Date(d);
        nextDate.setDate(nextDate.getDate() + 1);
        nextDateStr = nextDate.toISOString().split('T')[0];
    }

    // 1. Fetch Sales
    let q = supabase.from('sales_log').select('*, inventory(name), users!sales_log_cashier_id_fkey(username)').eq('is_voided', false);
    if (periodStr === 'month') {
        q = q.gte('timestamp', `${dateFilter}-01T00:00:00Z`).lt('timestamp', `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, '0')}-01T00:00:00Z`); // Very rough next month, ideally just do basic like original
    } else {
        q = q.gte('timestamp', `${dateFilter}T00:00:00Z`).lt('timestamp', `${nextDateStr}T00:00:00Z`);
    }

    // 2. Fetch Opened Resources
    let resQ = supabase.from('resources').select('name, cost, status');
    if (periodStr === 'month') resQ = resQ.gte('opened_at', `${dateFilter}-01T00:00:00Z`);
    else resQ = resQ.gte('opened_at', `${dateFilter}T00:00:00Z`).lt('opened_at', `${nextDateStr}T00:00:00Z`);

    // 3. Fetch Fixed Overheads
    let ovQ = supabase.from('overhead_entries').select('rent, electricity, wifi_internet, other_fixed');
    if (periodStr === 'month') ovQ = ovQ.eq('period', ym);
    else ovQ = ovQ.gte('created_at', `${dateFilter}T00:00:00Z`).lt('created_at', `${nextDateStr}T00:00:00Z`);

    // 4. Fetch Daily Expenses
    let expQ = supabase.from('expenses').select('description, amount');
    if (periodStr === 'month') expQ = expQ.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else expQ = expQ.gte('timestamp', `${dateFilter}T00:00:00Z`).lt('timestamp', `${nextDateStr}T00:00:00Z`);

    // 5. Fetch Attendance Wages
    let attQ = supabase.from('attendance_log').select('wage_assigned, users(username)');
    if (periodStr === 'month') attQ = attQ.like('work_date', `${ym}%`);
    else if (periodStr === 'custom-range') attQ = attQ.gte('work_date', dateFilter).lt('work_date', nextDateStr);
    else attQ = attQ.eq('work_date', dateFilter);

    const [ {data: s}, {data: resData}, {data: ovData}, {data: expData}, {data: attData}, {data: lowStockData} ] = await Promise.all([
        q, resQ, ovQ, expQ, attQ,
        supabase.from('inventory').select('name, stock_quantity, selling_price').lte('stock_quantity', 5).order('stock_quantity', { ascending: true })
    ]);
    
    currentLowStock = lowStockData || [];
    renderLowStock();
    
    currentSalesData = s || [];
    currentResources = resData || [];
    currentOverheads = ovData || [];
    currentDailyExpenses = expData || [];
    currentAttendanceWages = attData || [];

    const includeBulk = document.getElementById('chk-include-bulk').checked;

    // Calculate Expenses
    currentTotalExpenses = 0;
    
    // Always include daily POS expenses
    currentDailyExpenses.forEach(e => currentTotalExpenses += (e.amount || 0));

    // Attendance wages are also always included as fixed expenses
    currentAttendanceWages.forEach(w => currentTotalExpenses += (w.wage_assigned || 0));

    if (includeBulk) {
        currentResources.forEach(r => currentTotalExpenses += (r.cost || 0));
        currentOverheads.forEach(o => {
            currentTotalExpenses += (o.rent || 0) + (o.electricity || 0) + (o.wifi_internet || 0) + (o.other_fixed || 0);
        });
    }

    document.getElementById('kpi-tx').innerText = currentSalesData.length;
    let rev = 0, grossProf = 0, debtIssued = 0, debtCollected = 0;
    
    const items = {};
    const userRevenue = {};
    const methodRevenue = { cash: 0, mpesa: 0 };

    currentSalesData.forEach(x => {
        if (x.status === 'debt_collection') {
            debtCollected += x.total_charged;
            // Only add to Cash or M-Pesa totals
            if (x.payment_method === 'cash') methodRevenue.cash += x.total_charged;
            else if (x.payment_method === 'mpesa') methodRevenue.mpesa += x.total_charged;
            return; // Skip revenue, profit, items, users
        }

        if (x.status === 'debt') {
            debtIssued += x.total_charged;
        }

        rev += x.total_charged;
        grossProf += x.calculated_profit;
        
        const n = x.inventory?.name || 'Unknown';
        if (!items[n]) items[n] = 0;
        items[n] += x.calculated_qty;

        const user = x.users?.username || 'Unknown';
        if (!userRevenue[user]) userRevenue[user] = 0;
        userRevenue[user] += x.total_charged;
        
        if (x.status !== 'debt') {
            if (x.payment_method === 'cash') methodRevenue.cash += x.total_charged;
            else if (x.payment_method === 'mpesa') methodRevenue.mpesa += x.total_charged;
        }
    });

    const netProfit = grossProf - currentTotalExpenses;

    document.getElementById('kpi-rev').innerText = `Ksh ${rev.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('kpi-exp').innerText = `Ksh ${currentTotalExpenses.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('kpi-profit').innerText = `Ksh ${netProfit.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    
    if (document.getElementById('kpi-debt-issued')) document.getElementById('kpi-debt-issued').innerText = `Ksh ${debtIssued.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    if (document.getElementById('kpi-debt-collected')) document.getElementById('kpi-debt-collected').innerText = `Ksh ${debtCollected.toLocaleString(undefined, {maximumFractionDigits:0})}`;

    // Net Profit Math UI Breakdown
    let uiWages = 0, uiOtherExp = 0, uiResources = 0, uiFixed = 0;
    let uiDeductions = [];

    currentDailyExpenses.forEach(e => {
        const desc = e.description || 'Other';
        if (desc.toLowerCase().includes('wage')) uiWages += (e.amount || 0);
        else uiOtherExp += (e.amount || 0);
        uiDeductions.push({ item: desc, cost: (e.amount || 0) });
    });

    currentAttendanceWages.forEach(w => {
        const wageAmt = w.wage_assigned || 0;
        uiWages += wageAmt;
        const name = w.users?.username || 'User';
        uiDeductions.push({ item: `[Shift Wage] ${name}`, cost: wageAmt });
    });

    if (includeBulk) {
        currentResources.forEach(r => {
            const cost = r.cost || 0;
            uiResources += cost;
            uiDeductions.push({ item: `[Opened] ${r.name || 'Resource'}`, cost });
        });
        currentOverheads.forEach(o => {
            if (o.rent) { uiFixed += o.rent; uiDeductions.push({ item: '[Fixed] Rent', cost: o.rent }); }
            if (o.electricity) { uiFixed += o.electricity; uiDeductions.push({ item: '[Fixed] Electricity', cost: o.electricity }); }
            if (o.wifi_internet) { uiFixed += o.wifi_internet; uiDeductions.push({ item: '[Fixed] WiFi', cost: o.wifi_internet }); }
            if (o.other_fixed) { uiFixed += o.other_fixed; uiDeductions.push({ item: '[Fixed] Other', cost: o.other_fixed }); }
        });
    }

    document.getElementById('math-gross').innerText = `Ksh ${grossProf.toLocaleString()}`;
    document.getElementById('math-wages').innerText = `Ksh ${uiWages.toLocaleString()}`;
    document.getElementById('math-fixed').innerText = `Ksh ${uiFixed.toLocaleString()}`;
    document.getElementById('math-resources').innerText = `Ksh ${uiResources.toLocaleString()}`;
    document.getElementById('math-other').innerText = `Ksh ${uiOtherExp.toLocaleString()}`;
    document.getElementById('math-net').innerText = `Ksh ${netProfit.toLocaleString()}`;

    const dTbody = document.getElementById('deductions-tbody');
    if (uiDeductions.length > 0) {
        dTbody.innerHTML = uiDeductions.sort((a,b) => b.cost - a.cost).map(d => `
            <tr>
                <td class="py-2 px-3">${d.item}</td>
                <td class="py-2 px-3 text-right font-semibold text-slate-800">Ksh ${d.cost.toLocaleString()}</td>
            </tr>
        `).join('');
    } else {
        dTbody.innerHTML = `<tr><td colspan="2" class="py-2 px-3 text-center text-slate-400">No deductions for this period</td></tr>`;
    }

    // Update User Leaderboard Table
    const sortedUsers = Object.entries(userRevenue).sort((a, b) => b[1] - a[1]);
    const utb = document.getElementById('user-tbody');
    utb.innerHTML = '';
    sortedUsers.forEach(u => {
        utb.innerHTML += `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="py-2 px-3 font-medium text-slate-700 capitalize">${u[0]}</td><td class="py-2 px-3 text-right font-bold text-slate-600">Ksh ${u[1].toLocaleString(undefined, {maximumFractionDigits:0})}</td></tr>`;
    });

    // Update Charts
    updateCharts(userRevenue, methodRevenue, items);
}

function updateCharts(userRevenue, methodRevenue, items) {
    const sortedItems = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    const userCtx = document.getElementById('userChart');
    if (userChartInstance) userChartInstance.destroy();
    userChartInstance = new Chart(userCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(userRevenue).map(n => n.charAt(0).toUpperCase() + n.slice(1)),
            datasets: [{
                label: 'Revenue (Ksh)',
                data: Object.values(userRevenue),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const methodCtx = document.getElementById('methodChart');
    if (methodChartInstance) methodChartInstance.destroy();
    methodChartInstance = new Chart(methodCtx, {
        type: 'doughnut',
        data: {
            labels: ['M-Pesa', 'Cash'],
            datasets: [{
                data: [methodRevenue.mpesa, methodRevenue.cash],
                backgroundColor: ['#10b981', '#3b82f6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const itemsCtx = document.getElementById('itemsChart');
    if (itemsChartInstance) itemsChartInstance.destroy();
    itemsChartInstance = new Chart(itemsCtx, {
        type: 'bar',
        data: {
            labels: sortedItems.map(i => i[0].length > 15 ? i[0].substring(0, 15) + '...' : i[0]),
            datasets: [{
                label: 'Units Sold',
                data: sortedItems.map(i => i[1]),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        },
        options: { 
            indexAxis: 'y',
            responsive: true, 
            maintainAspectRatio: false 
        }
    });
}

window.toggleLowStock = () => {
    lowStockExpanded = !lowStockExpanded;
    renderLowStock();
};

function renderLowStock() {
    const lsTbody = document.getElementById('low-stock-tbody');
    if (!currentLowStock || currentLowStock.length === 0) {
        lsTbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-500 text-sm">All products are sufficiently stocked.</td></tr>`;
        return;
    }

    const limit = lowStockExpanded ? currentLowStock.length : 5;
    const toShow = currentLowStock.slice(0, limit);

    let html = toShow.map(i => `
        <tr>
            <td class="py-2 px-3 font-semibold text-slate-800">${i.name}</td>
            <td class="py-2 px-3 text-center"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold text-xs">${i.stock_quantity}</span></td>
            <td class="py-2 px-3 text-right">Ksh ${i.selling_price}</td>
        </tr>
    `).join('');

    if (currentLowStock.length > 5) {
        html += `
        <tr>
            <td colspan="3" class="py-2 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onclick="toggleLowStock()">
                <button class="text-orange-600 font-bold text-sm w-full outline-none">
                    ${lowStockExpanded ? 'Show Less' : `Show All (${currentLowStock.length})`}
                </button>
            </td>
        </tr>
        `;
    }
    lsTbody.innerHTML = html;
}

document.getElementById('ana-period').addEventListener('change', load);
document.getElementById('ana-date').addEventListener('change', load);
document.getElementById('ana-date-end').addEventListener('change', load);
document.getElementById('chk-include-bulk').addEventListener('change', load);

document.getElementById('btn-dl-report').addEventListener('click', () => {
    if (currentSalesData.length === 0) return alert('No data to generate report.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Litaj Hardware POS", 14, 20);
    
    const dateInput = document.getElementById('ana-date');
    const dateInputEnd = document.getElementById('ana-date-end');
    let dateSubtitle = "";
    if (periodStr === 'today') {
        dateSubtitle = `Info for ${new Date().toISOString().split('T')[0]}`;
    } else if (periodStr === 'custom') {
        dateSubtitle = `Info for ${dateInput.value || new Date().toISOString().split('T')[0]}`;
    } else if (periodStr === 'month') {
        const d2 = new Date();
        const startOfMonth = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-01`;
        dateSubtitle = `Info from ${startOfMonth} to ${d2.toISOString().split('T')[0]}`;
    } else if (periodStr === 'custom-range') {
        const d1 = dateInput.value || new Date().toISOString().split('T')[0];
        const d2 = dateInputEnd.value || new Date().toISOString().split('T')[0];
        dateSubtitle = `Info from ${d1} to ${d2}`;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(dateSubtitle, 196, 20, { align: "right" });
    
    let rev = 0, grossProf = 0, pdfDebtIssued = 0, pdfDebtCollected = 0;
    const userTotals = {};
    const methodTotals = { cash: 0, mpesa: 0 };
    const itemAgg = {};

    currentSalesData.forEach(x => { 
        if (x.status === 'debt_collection') {
            pdfDebtCollected += x.total_charged;
            if (x.payment_method === 'cash') methodTotals.cash += x.total_charged;
            else if (x.payment_method === 'mpesa') methodTotals.mpesa += x.total_charged;
            return;
        }

        if (x.status === 'debt') {
            pdfDebtIssued += x.total_charged;
        }

        rev += x.total_charged; 
        grossProf += x.calculated_profit;
        
        const username = x.users?.username || 'System';
        userTotals[username] = (userTotals[username] || 0) + x.total_charged;
        
        if (x.status !== 'debt') {
            if (x.payment_method === 'cash') methodTotals.cash += x.total_charged;
            else if (x.payment_method === 'mpesa') methodTotals.mpesa += x.total_charged;
        }
        
        const itemName = x.inventory?.name || 'Unknown';
        if (!itemAgg[itemName]) itemAgg[itemName] = { qty: 0, revenue: 0, method: new Set(), users: new Set() };
        itemAgg[itemName].qty += x.calculated_qty;
        itemAgg[itemName].revenue += x.total_charged;
        itemAgg[itemName].method.add(x.payment_method);
        itemAgg[itemName].users.add(username);
    });
    
    let wTotal = 0;
    let dTotal = 0;
    let expAgg = {};
    let pdfTotalExpenses = 0;
    
    currentDailyExpenses.forEach(e => {
        const desc = e.description || 'Other';
        expAgg[desc] = (expAgg[desc] || 0) + (e.amount || 0);
        if (desc.toLowerCase().includes('wage')) wTotal += (e.amount || 0);
        else dTotal += (e.amount || 0);
        pdfTotalExpenses += (e.amount || 0);
    });

    currentAttendanceWages.forEach(w => {
        const amt = w.wage_assigned || 0;
        const desc = `[Shift Wage] ${w.users?.username || 'User'}`;
        expAgg[desc] = (expAgg[desc] || 0) + amt;
        wTotal += amt;
        pdfTotalExpenses += amt;
    });

    let rTotal = 0;
    let resAgg = {};
    // Always include in PDF report for accurate monthly/daily profit
    currentResources.forEach(r => {
        const name = r.name || 'Resource';
        resAgg[name] = (resAgg[name] || 0) + (r.cost || 0);
        rTotal += (r.cost || 0);
        pdfTotalExpenses += (r.cost || 0);
    });

    let fTotal = 0;
    let fixedList = [];
    currentOverheads.forEach(o => {
        if (o.rent) { fixedList.push(`Rent: Ksh ${o.rent.toLocaleString()}`); fTotal += o.rent; pdfTotalExpenses += o.rent; }
        if (o.electricity) { fixedList.push(`Elec: Ksh ${o.electricity.toLocaleString()}`); fTotal += o.electricity; pdfTotalExpenses += o.electricity; }
        if (o.wifi_internet) { fixedList.push(`WiFi: Ksh ${o.wifi_internet.toLocaleString()}`); fTotal += o.wifi_internet; pdfTotalExpenses += o.wifi_internet; }
        if (o.other_fixed) { fixedList.push(`Other Fixed: Ksh ${o.other_fixed.toLocaleString()}`); fTotal += o.other_fixed; pdfTotalExpenses += o.other_fixed; }
    });

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Summary", 14, 45);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Left column
    doc.text(`Gross Revenue: Ksh ${rev.toLocaleString()}`, 14, 55);
    doc.text(`Gross Profit: Ksh ${grossProf.toLocaleString()}`, 14, 62);
    doc.text(`Debt Issued: Ksh ${pdfDebtIssued.toLocaleString()}`, 14, 69);
    doc.text(`Debt Collected: Ksh ${pdfDebtCollected.toLocaleString()}`, 14, 76);
    
    // Middle column
    const userSummary = Object.entries(userTotals).map(u => `${u[0]}: Ksh ${u[1].toLocaleString()}`).join('  |  ');
    doc.text(`Cashiers: ${userSummary}`, 85, 55);
    doc.text(`Cash: Ksh ${methodTotals.cash.toLocaleString()}`, 85, 62);
    doc.text(`M-Pesa: Ksh ${methodTotals.mpesa.toLocaleString()}`, 85, 69);
    
    const tableData = Object.entries(itemAgg).sort((a,b) => b[1].revenue - a[1].revenue).map(entry => [
        entry[0],
        entry[1].qty,
        `Ksh ${entry[1].revenue.toLocaleString()}`,
        Array.from(entry[1].method).join('/'),
        Array.from(entry[1].users).join(', ')
    ]);
    
    doc.autoTable({
        startY: 80,
        head: [['Item / Service', 'Total Qty', 'Total Revenue', 'Payment Modes', 'Cashiers']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [234, 88, 12] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { font: 'helvetica', fontSize: 9 },
        margin: { top: 35 }
    });

    let currentY = doc.lastAutoTable.finalY + 15;
    
    // The "Hard Truth" Math & Expenses Section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Net Profit & Expense Breakdown", 14, currentY);
    currentY += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Gross Profit: Ksh ${grossProf.toLocaleString()}`, 14, currentY);
    currentY += 6;
    if (wTotal > 0) { doc.text(`- Wages: Ksh ${wTotal.toLocaleString()}`, 14, currentY); currentY += 6; }
    if (fTotal > 0) { doc.text(`- Fixed Bills: Ksh ${fTotal.toLocaleString()}`, 14, currentY); currentY += 6; }
    if (rTotal > 0) { doc.text(`- Opened Resources: Ksh ${rTotal.toLocaleString()}`, 14, currentY); currentY += 6; }
    if (dTotal > 0) { doc.text(`- Other Expenses: Ksh ${dTotal.toLocaleString()}`, 14, currentY); currentY += 6; }
    
    currentY += 2;
    doc.setFont("helvetica", "bold");
    doc.text(`NET PROFIT: Ksh ${(grossProf - pdfTotalExpenses).toLocaleString()}`, 14, currentY);
    currentY += 10;
    
    if (Object.keys(expAgg).length > 0 || Object.keys(resAgg).length > 0 || fixedList.length > 0) {
        doc.setFontSize(10);
        doc.text("Detailed Deductions:", 14, currentY);
        currentY += 6;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        Object.entries(expAgg).forEach(([desc, amt]) => {
            doc.text(`- ${desc}: Ksh ${amt.toLocaleString()}`, 14, currentY);
            currentY += 5;
        });
        Object.entries(resAgg).forEach(([name, cost]) => {
            doc.text(`- [Opened] ${name}: Ksh ${cost.toLocaleString()}`, 14, currentY);
            currentY += 5;
        });
        fixedList.forEach(item => {
            doc.text(`- [Fixed] ${item}`, 14, currentY);
            currentY += 5;
        });
    }
    
    const finalY = currentY > (doc.lastAutoTable.finalY + 15) ? currentY : (doc.lastAutoTable.finalY || 80);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated by Litaj Hardware System on ${new Date().toLocaleString()}`, 14, finalY + 15);
    
    const filename = periodStr === 'today' ? `Daily_Report_${new Date().toISOString().split('T')[0]}.pdf` : `Report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
});

load();
