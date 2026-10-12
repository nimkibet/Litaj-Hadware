import { supabase, currentUser } from '../supabaseClient.js';

export async function initAdmin() {
    const container = document.getElementById('admin-view');
    
    container.innerHTML = `
        <div class="flex flex-col h-full">
            <!-- Admin Header -->
            <div class="bg-slate-900 text-white shadow-md z-10">
                <div class="max-w-7xl mx-auto flex">
                    <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                        <div class="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Gross Sales</div>
                        <div id="hdr-gross" class="text-2xl font-bold">Ksh 0.00</div>
                    </div>
                    <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                        <div class="text-xs font-bold text-red-400 mb-1 uppercase tracking-wider">Expenses</div>
                        <div id="hdr-expenses" class="text-2xl font-bold text-red-400">Ksh 0.00</div>
                    </div>
                    <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                        <div class="text-xs font-bold text-emerald-400 mb-1 uppercase tracking-wider">Net Profit</div>
                        <div id="hdr-net" class="text-2xl font-bold text-emerald-400">Ksh 0.00</div>
                    </div>
                    <div class="py-4 px-6 flex items-center gap-3">
                        <span class="text-sm font-semibold text-slate-400">Period:</span>
                        <select id="admin-period" class="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-500">
                            <option value="today">Today</option>
                            <option value="month">This Month</option>
                        </select>
                    </div>
                </div>
                
                <!-- Admin Tabs -->
                <div class="bg-slate-100 border-b border-slate-200">
                    <div class="max-w-7xl mx-auto flex overflow-x-auto">
                        <button class="admin-tab active bg-white border-t-2 border-orange-600 text-orange-700 px-6 py-3 text-sm font-bold flex items-center gap-2" data-target="tab-inventory">📦 Inventory</button>
                        <button class="admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent" data-target="tab-customers">👥 Customers</button>
                        <button class="admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent" data-target="tab-users">👤 Users</button>
                        <button class="admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent" data-target="tab-resources">🗃️ Resources</button>
                        <button class="admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent" data-target="tab-voids">🚫 Voided Sales</button>
                        <button class="admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent" data-target="tab-mec">📅 Month-End Close</button>
                    </div>
                </div>
            </div>

            <!-- Tab Contents -->
            <div class="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
                
                <!-- Resources Tab -->
                <div id="tab-resources" class="tab-content hidden space-y-6">
                    <h2 class="text-xl font-bold text-slate-800">Resource & Asset Management</h2>
                    
                    <div class="bg-white rounded-xl shadow border border-slate-200 p-5">
                        <div class="flex border-b border-slate-200 mb-5">
                            <button class="px-4 py-2 border-b-2 border-orange-600 text-orange-700 font-bold">General Resources</button>
                            <button class="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-50">Amortized (Kyocera)</button>
                            <button class="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-50">Maintenance Log</button>
                        </div>
                        
                        <div class="grid grid-cols-12 gap-4 items-end mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div class="col-span-3">
                                <label class="block text-sm font-semibold text-slate-700 mb-1">Search / Item</label>
                                <input type="text" id="res-name" class="w-full border border-slate-300 rounded px-3 py-2" placeholder="e.g. A4 Paper Ream">
                            </div>
                            <div class="col-span-2">
                                <label class="block text-sm font-semibold text-slate-700 mb-1">Units</label>
                                <input type="number" id="res-units" class="w-full border border-slate-300 rounded px-3 py-2" value="1">
                            </div>
                            <div class="col-span-2">
                                <label class="block text-sm font-semibold text-slate-700 mb-1">Cost (Ksh)</label>
                                <input type="number" id="res-cost" class="w-full border border-slate-300 rounded px-3 py-2" placeholder="0">
                            </div>
                            <div class="col-span-3">
                                <label class="block text-sm font-semibold text-slate-700 mb-1">Notes</label>
                                <input type="text" id="res-notes" class="w-full border border-slate-300 rounded px-3 py-2" placeholder="Optional">
                            </div>
                            <div class="col-span-2">
                                <button id="btn-open-res" class="w-full bg-orange-600 text-white font-bold py-2 rounded hover:bg-orange-700">Open Resource</button>
                            </div>
                        </div>
                        
                        <h3 class="font-bold text-slate-700 mb-3">Currently Active Resources</h3>
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-100 text-slate-600">
                                <tr>
                                    <th class="py-2 px-3 border-b">Item</th>
                                    <th class="py-2 px-3 border-b text-right">Cost (Ksh)</th>
                                    <th class="py-2 px-3 border-b">Opened At</th>
                                    <th class="py-2 px-3 border-b">Opened By</th>
                                    <th class="py-2 px-3 border-b text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="resources-tbody" class="divide-y divide-slate-100">
                                <tr><td colspan="5" class="text-center py-4 text-slate-500">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Month End Close Tab -->
                <div id="tab-mec" class="tab-content hidden space-y-6">
                    
                    <!-- Fixed Overheads -->
                    <div class="bg-white rounded-xl shadow border border-red-200 border-l-4 border-l-red-500 p-5">
                        <h3 class="font-bold text-red-700 flex items-center gap-2 mb-4">
                            <span class="bg-red-100 text-red-800 rounded-full w-6 h-6 flex items-center justify-center text-xs">②</span>
                            Fixed Overheads (This Month)
                        </h3>
                        <div class="flex gap-4 items-end">
                            <div class="flex-1">
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Rent (Ksh)</label>
                                <input type="number" id="ov-rent" class="w-full border border-slate-300 rounded px-3 py-2" value="0">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Electricity (Ksh)</label>
                                <input type="number" id="ov-elec" class="w-full border border-slate-300 rounded px-3 py-2" value="0">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Wi-Fi / Internet (Ksh)</label>
                                <input type="number" id="ov-wifi" class="w-full border border-slate-300 rounded px-3 py-2" value="0">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Other (Ksh)</label>
                                <input type="number" id="ov-other" class="w-full border border-slate-300 rounded px-3 py-2" value="0">
                            </div>
                            <div>
                                <button id="btn-save-overheads" class="bg-orange-600 text-white font-bold px-6 py-2 rounded hover:bg-orange-700 shadow">Save Overheads</button>
                            </div>
                        </div>
                    </div>

                    <!-- Daily Shift Wages -->
                    <div class="bg-white rounded-xl shadow border border-amber-200 border-l-4 border-l-amber-500 p-5">
                        <h3 class="font-bold text-amber-700 flex items-center gap-2 mb-2">
                            <span class="bg-amber-100 text-amber-800 rounded-full w-6 h-6 flex items-center justify-center text-xs">③</span>
                            Daily Shift Wages
                        </h3>
                        <p class="text-xs text-slate-500 mb-4">Review attendance and assign wages per day. Only days in the selected month are shown.</p>
                        
                        <table class="w-full text-left border-collapse text-sm mb-4">
                            <thead class="bg-slate-100 text-slate-600">
                                <tr>
                                    <th class="py-2 px-3 border-b">Date</th>
                                    <th class="py-2 px-3 border-b">Staff</th>
                                    <th class="py-2 px-3 border-b text-right">Sales Made</th>
                                    <th class="py-2 px-3 border-b text-right">Wage (Ksh)</th>
                                    <th class="py-2 px-3 border-b text-center">Set Wage</th>
                                </tr>
                            </thead>
                            <tbody id="wages-tbody" class="divide-y divide-slate-100">
                                <tr><td colspan="5" class="text-center py-4 text-slate-500">Loading wages...</td></tr>
                            </tbody>
                        </table>
                        <div class="font-bold text-slate-800 text-right">Total Wages: <span id="lbl-total-wages" class="text-amber-600">Ksh 0.00</span></div>
                    </div>
                </div>
                
                <!-- Inventory Tab placeholder -->
                <div id="tab-inventory" class="tab-content hidden">
                    <p class="text-slate-500">Inventory logic goes here.</p>
                </div>
            </div>
        </div>
    `;

    bindAdminEvents();
    
    // Load default tab
    document.querySelector('.admin-tab[data-target="tab-resources"]').click();
    
    // Initial data fetch
    await refreshHeaderTotals();
    await loadResources();
}

function bindAdminEvents() {
    // Tab switching
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Reset styles
            document.querySelectorAll('.admin-tab').forEach(t => {
                t.className = "admin-tab text-slate-600 hover:bg-slate-50 px-6 py-3 text-sm font-semibold flex items-center gap-2 border-t-2 border-transparent";
            });
            // Set active
            e.currentTarget.className = "admin-tab active bg-white border-t-2 border-orange-600 text-orange-700 px-6 py-3 text-sm font-bold flex items-center gap-2";
            
            // Hide all contents
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            // Show target
            document.getElementById(e.currentTarget.dataset.target).classList.remove('hidden');
            
            // Lazy load tab data
            if (e.currentTarget.dataset.target === 'tab-mec') loadMonthEnd();
        });
    });

    document.getElementById('admin-period').addEventListener('change', refreshHeaderTotals);
    document.getElementById('btn-open-res').addEventListener('click', openResource);
    document.getElementById('btn-save-overheads').addEventListener('click', saveOverheads);
}

// ==========================================
// DATA LOADING & MATH LOGIC
// ==========================================

async function refreshHeaderTotals() {
    const period = document.getElementById('admin-period').value; // 'today' or 'month'
    let dateFilter = new Date().toISOString().split('T')[0]; // Today
    
    if (period === 'month') {
        const d = new Date();
        dateFilter = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM prefix
    }

    // Fetch Sales
    let salesQuery = supabase.from('sales_log').select('*').eq('is_voided', false);
    if (period === 'today') {
        salesQuery = salesQuery.gte('timestamp', `${dateFilter}T00:00:00Z`);
    } else {
        salesQuery = salesQuery.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    }

    const { data: sales } = await salesQuery;
    let gross = 0;
    let kyoPages = 0;
    
    (sales || []).forEach(s => {
        gross += s.total_charged;
        kyoPages += (s.kyocera_pages || 0);
    });

    // Fetch Overheads (if month)
    let totalOverhead = 0;
    if (period === 'month') {
        const { data: ov } = await supabase.from('overhead_entries').select('*').eq('period', dateFilter).single();
        if (ov) {
            totalOverhead = parseFloat(ov.rent) + parseFloat(ov.electricity) + parseFloat(ov.wifi_internet) + parseFloat(ov.other_fixed);
            // Populate form
            document.getElementById('ov-rent').value = ov.rent;
            document.getElementById('ov-elec').value = ov.electricity;
            document.getElementById('ov-wifi').value = ov.wifi_internet;
            document.getElementById('ov-other').value = ov.other_fixed;
        }
    }

    // Fetch Wages (if month)
    let totalWages = 0;
    if (period === 'month') {
        const { data: w } = await supabase.from('attendance_log').select('*').like('work_date', `${dateFilter}%`);
        (w || []).forEach(wage => totalWages += parseFloat(wage.wage_assigned || 0));
    }

    // Update Header
    document.getElementById('hdr-gross').textContent = `Ksh ${gross.toFixed(2)}`;
    
    const expenses = totalOverhead + totalWages + (kyoPages * 2.5); // Example Kyocera paper/toner fixed amort
    document.getElementById('hdr-expenses').textContent = `Ksh ${expenses.toFixed(2)}`;
    
    const net = gross - expenses;
    document.getElementById('hdr-net').textContent = `Ksh ${net.toFixed(2)}`;
}

// --- RESOURCES ---
async function loadResources() {
    const { data, error } = await supabase.from('resources').select('*, users(username)').eq('status', 'active').order('opened_at', { ascending: false });
    const tbody = document.getElementById('resources-tbody');
    
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-500">No active resources found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.forEach(r => {
        const date = new Date(r.opened_at).toLocaleDateString();
        const user = r.users ? r.users.username : 'System';
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="py-2 px-3"><strong>${r.name}</strong> <span class="text-xs text-slate-500">(${r.units} units)</span><br><span class="text-xs text-slate-400">${r.notes || ''}</span></td>
                <td class="py-2 px-3 text-right font-medium text-red-600">${parseFloat(r.cost).toFixed(2)}</td>
                <td class="py-2 px-3 text-slate-600">${date}</td>
                <td class="py-2 px-3 text-slate-600">${user}</td>
                <td class="py-2 px-3 text-center"><button onclick="exhaustResource('${r.id}')" class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded">Exhaust</button></td>
            </tr>
        `;
    });
}

window.exhaustResource = async function(id) {
    if(confirm("Mark this resource as exhausted/finished?")) {
        await supabase.from('resources').update({status: 'exhausted'}).eq('id', id);
        loadResources();
    }
}

async function openResource() {
    const name = document.getElementById('res-name').value;
    const units = document.getElementById('res-units').value;
    const cost = document.getElementById('res-cost').value;
    const notes = document.getElementById('res-notes').value;
    
    if(!name || !cost) return alert("Item name and cost are required.");
    
    await supabase.from('resources').insert([{
        name, units: parseInt(units), cost: parseFloat(cost), notes, opened_by: currentUser.id
    }]);
    
    document.getElementById('res-name').value = '';
    document.getElementById('res-cost').value = '';
    document.getElementById('res-notes').value = '';
    loadResources();
}

// --- MONTH END ---
async function loadMonthEnd() {
    const d = new Date();
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    // Overheads are auto-loaded by refreshHeaderTotals if period is 'month'
    
    // Load distinct cashier shifts from sales log
    const { data: sales } = await supabase.from('sales_log').select('cashier_id, timestamp, users(username)').gte('timestamp', `${period}-01T00:00:00Z`);
    
    const shifts = {};
    (sales || []).forEach(s => {
        const date = s.timestamp.split('T')[0];
        const key = `${date}_${s.cashier_id}`;
        if(!shifts[key]) shifts[key] = { date, userId: s.cashier_id, user: s.users?.username, salesCount: 0 };
        shifts[key].salesCount++;
    });

    const { data: wages } = await supabase.from('attendance_log').select('*').like('work_date', `${period}%`);
    const wageMap = {};
    let totalWages = 0;
    (wages || []).forEach(w => {
        wageMap[`${w.work_date}_${w.user_id}`] = w.wage_assigned;
        totalWages += parseFloat(w.wage_assigned);
    });

    const tbody = document.getElementById('wages-tbody');
    tbody.innerHTML = '';
    
    Object.values(shifts).sort((a,b) => b.date.localeCompare(a.date)).forEach(shift => {
        const key = `${shift.date}_${shift.userId}`;
        const wage = wageMap[key] || 0;
        
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2 px-3">${shift.date}</td>
                <td class="py-2 px-3 font-medium">${shift.user}</td>
                <td class="py-2 px-3 text-right">${shift.salesCount}</td>
                <td class="py-2 px-3 text-right font-bold ${wage > 0 ? 'text-amber-600' : 'text-slate-400'}">${parseFloat(wage).toFixed(2)}</td>
                <td class="py-2 px-3 text-center">
                    <button onclick="setWage('${shift.userId}', '${shift.date}', '${shift.user}', ${wage})" class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1 rounded font-semibold">Assign</button>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('lbl-total-wages').textContent = `Ksh ${totalWages.toFixed(2)}`;
}

window.setWage = async function(userId, date, username, currentWage) {
    const val = prompt(`Set wage for ${username} on ${date} (Ksh):`, currentWage);
    if (val !== null && !isNaN(val)) {
        const { error } = await supabase.from('attendance_log').upsert({
            user_id: userId,
            work_date: date,
            wage_assigned: parseFloat(val)
        }, { onConflict: 'user_id, work_date' });
        
        if(!error) loadMonthEnd();
    }
}

async function saveOverheads() {
    const d = new Date();
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    const rent = parseFloat(document.getElementById('ov-rent').value || 0);
    const elec = parseFloat(document.getElementById('ov-elec').value || 0);
    const wifi = parseFloat(document.getElementById('ov-wifi').value || 0);
    const other = parseFloat(document.getElementById('ov-other').value || 0);
    
    await supabase.from('overhead_entries').upsert({
        period, rent, electricity: elec, wifi_internet: wifi, other_fixed: other, entered_by: currentUser.id
    }, { onConflict: 'period' });
    
    alert("Overheads saved for " + period);
    refreshHeaderTotals();
}
