import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();
if (currentUser.role !== 'admin') window.location.href = '/pos.html';

let inventoryItems = [];

async function load() {
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const periodStr = document.getElementById('admin-period').value;
    let dateFilter = periodStr === 'month' ? ym : d.toISOString().split('T')[0];
    
    // Header Totals
    let sQuery = supabase.from('sales_log').select('*').eq('is_voided', false);
    if(periodStr === 'month') sQuery = sQuery.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else sQuery = sQuery.gte('timestamp', `${dateFilter}T00:00:00Z`);
    
    const {data:s} = await sQuery;
    let gr=0, kyo=0; (s||[]).forEach(x=> { gr += x.total_charged; kyo += (x.kyocera_pages||0); });
    document.getElementById('hdr-gross').innerText = `Ksh ${gr.toFixed(2)}`;
    
    // Fetch Overheads
    const {data:o} = await supabase.from('overhead_entries').select('*').eq('period', ym).maybeSingle();
    let ovTotal = 0;
    if(o) { 
        ovTotal = o.rent + o.electricity + o.wifi_internet + o.other_fixed;
        document.getElementById('ov-rent').value = o.rent; 
        document.getElementById('ov-elec').value = o.electricity;
        document.getElementById('ov-wifi').value = o.wifi_internet;
        document.getElementById('ov-other').value = o.other_fixed;
    }
    
    // Fetch Wages
    const {data:w} = await supabase.from('attendance_log').select('*').like('work_date', `${ym}%`);
    let wageTotal = 0; (w||[]).forEach(x => wageTotal += parseFloat(x.wage_assigned||0));

    const expenses = ovTotal + wageTotal + (kyo * 2.5);
    document.getElementById('hdr-expenses').innerText = `Ksh ${expenses.toFixed(2)}`;
    document.getElementById('hdr-net').innerText = `Ksh ${(gr - expenses).toFixed(2)}`;

    // Resources Tab (Active)
    const {data:r} = await supabase.from('resources').select('*').eq('status','active');
    const rt = document.getElementById('res-tbody'); rt.innerHTML = '';
    (r||[]).forEach(x=> {
        rt.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-2 px-3 font-medium">${x.name} <span class="text-xs text-slate-400">(${x.units}x)</span></td><td class="py-2 px-3 text-right font-bold text-red-600">${x.cost.toFixed(2)}</td><td class="py-2 px-3 text-slate-500">${new Date(x.opened_at).toLocaleDateString()}</td><td class="py-2 px-3 text-center"><button onclick="exhaust('${x.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded text-xs font-bold">Exhaust</button></td></tr>`;
    });

        // Populate Inventory Data
    const {data:inv} = await supabase.from('inventory').select('*').eq('is_service', false).order('name');
    inventoryItems = inv || [];

    // Wages Tab
    const {data: ws} = await supabase.from('sales_log').select('cashier_id, timestamp, users(username)').gte('timestamp', `${ym}-01T00:00:00Z`);
    const shifts = {};
    (ws||[]).forEach(x => {
        const date = x.timestamp.split('T')[0];
        const key = `${date}_${x.cashier_id}`;
        if(!shifts[key]) shifts[key] = { date, userId: x.cashier_id, user: x.users?.username, count: 0 };
        shifts[key].count++;
    });
    const wageMap = {}; 
    (w||[]).forEach(x => {
        wageMap[`${x.work_date}_${x.user_id}`] = x.wage_assigned;
        const key = `${x.work_date}_${x.user_id}`;
        if (!shifts[key]) {
            shifts[key] = { date: x.work_date, userId: x.user_id, user: 'Unknown (Logged)', count: 0 };
            // Optional: We can fetch the username if we query it, but attendance_log doesn't have a join on users yet.
            // Let's just do a basic fallback or we can query users separately.
        }
    });

    // Let's try to map user IDs to names just in case
    const {data: allUsers} = await supabase.from('users').select('id, username');
    const userDict = {};
    (allUsers||[]).forEach(u => userDict[u.id] = u.username);
    Object.values(shifts).forEach(sh => {
        if (sh.user === 'Unknown (Logged)' || !sh.user) {
            sh.user = userDict[sh.userId] || 'Unknown';
        }
    });

    const wt = document.getElementById('wage-tbody'); wt.innerHTML = '';
    Object.values(shifts).sort((a,b)=>b.date.localeCompare(a.date)).forEach(sh => {
        const wage = wageMap[`${sh.date}_${sh.userId}`] || 0;
        wt.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-2 px-3">${sh.date}</td><td class="py-2 px-3 font-medium">${sh.user}</td><td class="py-2 px-3 text-right font-bold text-amber-600">${parseFloat(wage).toFixed(2)}</td><td class="py-2 px-3 text-center"><button onclick="openWageModal('${sh.userId}', '${sh.date}', '${sh.user}', ${wage})" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1 rounded font-bold text-xs">Set Wage</button></td></tr>`;
    });
}

function calcResCost() {
    const id = document.getElementById('res-item-id').value;
    const qty = parseInt(document.getElementById('res-qty').value || 1);
    const item = inventoryItems.find(i => i.id === id);
    if(item) {
        document.getElementById('res-cost').value = item.buying_price * qty;
    } else {
        document.getElementById('res-cost').value = '';
    }
}

document.getElementById('res-item-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resDiv = document.getElementById('res-search-results');
    document.getElementById('res-item-id').value = '';
    document.getElementById('res-cost').value = '';
    
    if(!term) {
        resDiv.classList.add('hidden');
        return;
    }
    
    const matches = inventoryItems.filter(i => i.name.toLowerCase().includes(term));
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-2 text-sm text-gray-500">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => `<div class="p-2 text-sm cursor-pointer hover:bg-orange-50 border-b" onclick="selectResItem('${i.id}', '${i.name.replace(/'/g, "\\'")}')"><div class="font-bold">${i.name}</div><div class="text-xs text-gray-500">Stock: ${i.stock_quantity} | BP: ${i.buying_price}</div></div>`).join('');
    }
    resDiv.classList.remove('hidden');
});

window.selectResItem = (id, name) => {
    document.getElementById('res-item-id').value = id;
    document.getElementById('res-item-search').value = name;
    document.getElementById('res-search-results').classList.add('hidden');
    calcResCost();
};

document.addEventListener('click', (e) => {
    if(!e.target.closest('#res-item-search') && !e.target.closest('#res-search-results')) {
        const res = document.getElementById('res-search-results');
        if(res) res.classList.add('hidden');
    }
});

document.getElementById('res-qty').addEventListener('input', calcResCost);

document.getElementById('admin-period').addEventListener('change', load);

document.getElementById('btn-open-res').addEventListener('click', async () => {
    const itemId = document.getElementById('res-item-id').value;
    const qty = parseInt(document.getElementById('res-qty').value || 1);
    const item = inventoryItems.find(i => i.id === itemId);
    
    if(!item || qty < 1) return alert('Select a valid item and quantity.');
    
    const cost = item.buying_price * qty;
    const name = item.name;

    showModal('Open Resource', `
        <p>Open <strong>${qty}x ${name}</strong> for use?</p>
        <p class="text-sm text-slate-500 mt-2">This will log <strong>Ksh ${cost}</strong> in expenses and deduct <strong>${qty}</strong> from inventory stock.</p>
    `, async (close) => {
        // 1. Insert into resources
        await supabase.from('resources').insert([{name, units: qty, cost, opened_by: currentUser.id}]);
        // 2. Deduct from inventory
        await supabase.from('inventory').update({stock_quantity: item.stock_quantity - qty}).eq('id', item.id);
        
        document.getElementById('res-item-search').value = '';
        document.getElementById('res-qty').value = 1;
        document.getElementById('res-cost').value = '';
        close();
        load();
    }, 'Confirm & Open');
});

document.getElementById('btn-save-ov').addEventListener('click', async () => {
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rent = parseFloat(document.getElementById('ov-rent').value||0);
    const elec = parseFloat(document.getElementById('ov-elec').value||0);
    const wifi = parseFloat(document.getElementById('ov-wifi').value||0);
    const other = parseFloat(document.getElementById('ov-other').value||0);
    await supabase.from('overhead_entries').upsert({period: ym, rent, electricity: elec, wifi_internet: wifi, other_fixed: other, entered_by: currentUser.id}, {onConflict: 'period'});
    showModal('Success', '<p class="text-emerald-600 font-medium">Overheads saved for this month.</p>', (close) => close(), 'OK');
    load();
});

window.exhaust = (id) => {
    showModal('Exhaust Resource', '<p class="text-slate-600">Mark this resource as fully used?</p>', async (close) => {
        await supabase.from('resources').update({status:'exhausted'}).eq('id',id);
        close(); load();
    }, 'Mark Exhausted');
};

window.openWageModal = (userId, date, username, currentWage) => {
    showModal(
        `Set Wage for ${username}`, 
        `
        <div class="mb-2 text-sm text-slate-500">Date: <strong>${date}</strong></div>
        <label class="block text-sm font-semibold mb-1">Daily Wage (Ksh)</label>
        <input type="number" id="modal-wage-input" class="w-full border border-slate-300 rounded-lg px-4 py-2 font-bold text-lg" value="${currentWage}">
        `,
        async (close) => {
            const val = parseFloat(document.getElementById('modal-wage-input').value || 0);
            await supabase.from('attendance_log').upsert({user_id: userId, work_date: date, wage_assigned: val}, {onConflict: 'user_id, work_date'});
            close(); load();
        },
        'Save Wage'
    );
};

load();





