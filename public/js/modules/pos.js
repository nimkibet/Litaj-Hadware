import { supabase, currentUser } from '../supabaseClient.js';

let inventory = [];
let customers = [];
let todaysSales = [];

export async function initPOS() {
    const container = document.getElementById('pos-view');
    
    // Inject POS HTML matching the Java Desktop layout
    container.innerHTML = `
        <div class="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-full pb-4">
            <!-- LEFT COLUMN: Entry Forms -->
            <div class="w-full lg:w-5/12 flex flex-col gap-4">
                
                <!-- Quick Add Card -->
                <div class="bg-white rounded-xl shadow border border-gray-200 p-5">
                    <h2 class="text-lg font-bold text-gray-800 mb-3">Quick Add</h2>
                    
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Service</label>
                    <div class="grid grid-cols-3 gap-2 mb-4">
                        <button class="quick-srv-btn bg-orange-600 text-white py-2 rounded text-sm font-medium hover:bg-orange-700" data-name="Print / Copy">Print / Copy</button>
                        <button class="quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200" data-name="Typesetting">Typesetting</button>
                        <button class="quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200" data-name="Binding Service">Binding</button>
                    </div>

                    <label class="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                    <div class="flex gap-2 mb-4">
                        <button id="quick-pay-mpesa" class="flex-1 bg-emerald-700 text-white py-2 rounded font-medium hover:bg-emerald-800 flex items-center justify-center gap-2">
                            <span>📱</span> M-Pesa
                        </button>
                        <button id="quick-pay-cash" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300 flex items-center justify-center gap-2">
                            <span>💵</span> Cash
                        </button>
                    </div>

                    <div class="flex gap-2">
                        <input type="number" id="quick-amount" class="flex-1 border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-orange-500 font-bold text-lg" placeholder="Amount (Ksh)">
                        <button id="quick-log-btn" class="bg-orange-600 text-white px-4 py-2 rounded font-bold hover:bg-orange-700 flex items-center gap-2">
                            ✓ Log Quick Sale
                        </button>
                    </div>
                </div>

                <!-- Main Sale Form -->
                <div class="bg-white rounded-xl shadow border border-gray-200 p-5 flex-1 overflow-y-auto">
                    <h2 class="text-lg font-bold text-gray-800 mb-4">Main Sale Form</h2>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Select Service / Item</label>
                            <select id="pos-item-search" class="w-full border border-gray-300 rounded px-3 py-2">
                                <option value="">Loading Inventory...</option>
                            </select>
                        </div>
                        
                        <!-- Kyocera Dynamic Fields (Hidden by default) -->
                        <div id="kyocera-fields" class="hidden p-3 bg-orange-50 border border-orange-100 rounded-lg space-y-2">
                            <h3 class="text-xs font-bold text-orange-800 uppercase tracking-wider">Kyocera / A3 Print Details</h3>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600">Pages Printed</label>
                                    <input type="number" id="kyo-pages" class="w-full border border-gray-300 rounded px-2 py-1 mt-1" value="1">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600">Cost per Page</label>
                                    <input type="number" id="kyo-cost-pp" class="w-full border border-gray-300 rounded px-2 py-1 mt-1" value="2.5">
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">Quantity</label>
                                <div class="flex">
                                    <button id="qty-minus" class="bg-gray-200 px-3 py-2 rounded-l border border-gray-300 hover:bg-gray-300">-</button>
                                    <input type="number" id="pos-qty" class="w-full text-center border-y border-gray-300 py-2 font-bold" value="1">
                                    <button id="qty-plus" class="bg-gray-200 px-3 py-2 rounded-r border border-gray-300 hover:bg-gray-300">+</button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-orange-600 mb-1">Total Amount (Ksh) — Editable</label>
                                <input type="number" id="pos-total" class="w-full border border-orange-300 rounded px-3 py-2 font-bold text-lg bg-orange-50 text-orange-900" placeholder="e.g. 200">
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Customer (Tab/Debt)</label>
                            <select id="pos-customer" class="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50">
                                <option value="">Walk-in (No Customer)</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Payment Method</label>
                            <div class="flex gap-2">
                                <button id="main-pay-mpesa" class="flex-1 bg-emerald-700 text-white py-2 rounded font-medium hover:bg-emerald-800">M-Pesa</button>
                                <button id="main-pay-cash" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300">Cash</button>
                                <button id="main-pay-debt" class="flex-1 bg-red-100 text-red-700 py-2 rounded font-medium hover:bg-red-200 hidden">Tab/Debt</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: Ledgers -->
            <div class="w-full lg:w-7/12 flex flex-col gap-4">
                
                <!-- Financial Ledger Header -->
                <div class="bg-white rounded-xl shadow border border-gray-200 p-4">
                    <div class="flex justify-between items-center mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Financial Ledger</h2>
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-gray-600">Period:</span>
                            <select id="ledger-period" class="border border-gray-300 rounded px-2 py-1 bg-gray-50 text-sm">
                                <option value="today">Today</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-6 border-t pt-3">
                        <div class="text-sm"><span class="font-bold text-emerald-700">M-Pesa:</span> <span id="lbl-mpesa" class="font-medium">Ksh 0.00</span></div>
                        <div class="text-sm"><span class="font-bold text-orange-600">Cash:</span> <span id="lbl-cash" class="font-medium">Ksh 0.00</span></div>
                        <div class="text-sm"><span class="font-bold text-red-600">Debt:</span> <span id="lbl-debt" class="font-medium">Ksh 0.00</span></div>
                    </div>
                </div>

                <!-- Sales Ledger Table -->
                <div class="bg-white rounded-xl shadow border border-gray-200 flex-1 flex flex-col overflow-hidden">
                    <div class="p-4 border-b bg-gray-50">
                        <h2 class="text-lg font-bold text-gray-800">Sales Ledger</h2>
                    </div>
                    <div class="flex-1 overflow-auto">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-gray-100 sticky top-0 shadow-sm text-sm text-gray-600">
                                <tr>
                                    <th class="py-3 px-4 font-semibold border-b">Time</th>
                                    <th class="py-3 px-4 font-semibold border-b">Item/Service</th>
                                    <th class="py-3 px-4 font-semibold border-b text-center">Qty</th>
                                    <th class="py-3 px-4 font-semibold border-b text-right">Sales (Ksh)</th>
                                    <th class="py-3 px-4 font-semibold border-b text-right">Method</th>
                                </tr>
                            </thead>
                            <tbody id="sales-tbody" class="text-sm divide-y divide-gray-100">
                                <tr><td colspan="5" class="text-center py-8 text-gray-500">Loading ledger...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadData();
    bindEvents();
}

let activeQuickService = "Print / Copy";
let activeQuickPay = "M-Pesa";
let activeMainPay = "M-Pesa";

async function loadData() {
    // Parallel loading for speed
    const [invRes, custRes, salesRes] = await Promise.all([
        supabase.from('inventory').select('*').order('name'),
        supabase.from('customers').select('*').order('name'),
        fetchTodaysSales()
    ]);

    if(invRes.data) inventory = invRes.data;
    if(custRes.data) customers = custRes.data;

    // Populate dropdowns
    const itemSelect = document.getElementById('pos-item-search');
    itemSelect.innerHTML = '<option value="">-- Select Item/Service --</option>';
    inventory.forEach(i => {
        itemSelect.innerHTML += `<option value="${i.id}" data-price="${i.selling_price}">${i.name} (Ksh ${i.selling_price})</option>`;
    });

    const custSelect = document.getElementById('pos-customer');
    custSelect.innerHTML = '<option value="">Walk-in (No Customer)</option>';
    customers.forEach(c => {
        custSelect.innerHTML += `<option value="${c.id}">${c.name} ${c.outstanding_debt > 0 ? `(Debt: ${c.outstanding_debt})` : ''}</option>`;
    });

    renderLedger();
}

async function fetchTodaysSales() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
        .from('sales_log')
        .select('*, inventory(name)')
        .gte('timestamp', `${today}T00:00:00Z`)
        .eq('is_voided', false)
        .order('timestamp', { ascending: false });
    
    if(data) todaysSales = data;
}

function renderLedger() {
    const tbody = document.getElementById('sales-tbody');
    let mpesa = 0, cash = 0, debt = 0;

    if (todaysSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No content in table</td></tr>';
    } else {
        tbody.innerHTML = '';
        todaysSales.forEach(sale => {
            const time = new Date(sale.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const itemName = sale.inventory ? sale.inventory.name : 'Unknown Service';
            
            if(sale.payment_method === 'M-Pesa') mpesa += sale.total_charged;
            else if(sale.payment_method === 'Cash') cash += sale.total_charged;
            else debt += sale.total_charged;

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 text-gray-500">${time}</td>
                    <td class="py-2 px-4 font-medium text-gray-800">${itemName}</td>
                    <td class="py-2 px-4 text-center">${sale.calculated_qty}</td>
                    <td class="py-2 px-4 text-right font-bold">${sale.total_charged.toFixed(2)}</td>
                    <td class="py-2 px-4 text-right"><span class="text-xs px-2 py-1 rounded ${sale.payment_method==='M-Pesa'?'bg-emerald-100 text-emerald-800':'bg-gray-200 text-gray-800'}">${sale.payment_method}</span></td>
                </tr>
            `;
        });
    }

    document.getElementById('lbl-mpesa').textContent = `Ksh ${mpesa.toFixed(2)}`;
    document.getElementById('lbl-cash').textContent = `Ksh ${cash.toFixed(2)}`;
    document.getElementById('lbl-debt').textContent = `Ksh ${debt.toFixed(2)}`;
}

function bindEvents() {
    // Quick Add Service Selection
    document.querySelectorAll('.quick-srv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.quick-srv-btn').forEach(b => {
                b.classList.remove('bg-orange-600', 'text-white');
                b.classList.add('bg-gray-100', 'text-gray-700');
            });
            e.target.classList.remove('bg-gray-100', 'text-gray-700');
            e.target.classList.add('bg-orange-600', 'text-white');
            activeQuickService = e.target.dataset.name;
        });
    });

    // Quick Add Payment Selection
    document.getElementById('quick-pay-mpesa').addEventListener('click', (e) => setQuickPay('M-Pesa'));
    document.getElementById('quick-pay-cash').addEventListener('click', (e) => setQuickPay('Cash'));

    function setQuickPay(method) {
        activeQuickPay = method;
        const mpesa = document.getElementById('quick-pay-mpesa');
        const cash = document.getElementById('quick-pay-cash');
        
        mpesa.className = method === 'M-Pesa' 
            ? "flex-1 bg-emerald-700 text-white py-2 rounded font-medium hover:bg-emerald-800 flex items-center justify-center gap-2"
            : "flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300 flex items-center justify-center gap-2";
            
        cash.className = method === 'Cash'
            ? "flex-1 bg-orange-600 text-white py-2 rounded font-medium hover:bg-orange-700 flex items-center justify-center gap-2"
            : "flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300 flex items-center justify-center gap-2";
    }

    // Main Sale Form Logistics
    const itemSelect = document.getElementById('pos-item-search');
    const qtyInput = document.getElementById('pos-qty');
    const totalInput = document.getElementById('pos-total');
    const kyoFields = document.getElementById('kyocera-fields');

    itemSelect.addEventListener('change', () => {
        const option = itemSelect.options[itemSelect.selectedIndex];
        if(!option.value) {
            totalInput.value = '';
            kyoFields.classList.add('hidden');
            return;
        }
        
        const price = parseFloat(option.dataset.price || 0);
        const qty = parseFloat(qtyInput.value || 1);
        totalInput.value = price * qty;
        
        // Kyocera Logic
        const text = option.text.toLowerCase();
        if (text.includes('kyocera') || text.includes('a3')) {
            kyoFields.classList.remove('hidden');
        } else {
            kyoFields.classList.add('hidden');
        }
    });

    document.getElementById('qty-plus').addEventListener('click', () => {
        qtyInput.value = parseInt(qtyInput.value) + 1;
        itemSelect.dispatchEvent(new Event('change'));
    });
    
    document.getElementById('qty-minus').addEventListener('click', () => {
        if(parseInt(qtyInput.value) > 1) {
            qtyInput.value = parseInt(qtyInput.value) - 1;
            itemSelect.dispatchEvent(new Event('change'));
        }
    });
    
    qtyInput.addEventListener('input', () => itemSelect.dispatchEvent(new Event('change')));

    // Main Form Payment Selection
    document.getElementById('main-pay-mpesa').addEventListener('click', () => setMainPay('M-Pesa'));
    document.getElementById('main-pay-cash').addEventListener('click', () => setMainPay('Cash'));

    function setMainPay(method) {
        activeMainPay = method;
        const mpesa = document.getElementById('main-pay-mpesa');
        const cash = document.getElementById('main-pay-cash');
        
        mpesa.className = method === 'M-Pesa' ? "flex-1 bg-emerald-700 text-white py-2 rounded font-medium" : "flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300";
        cash.className = method === 'Cash' ? "flex-1 bg-orange-600 text-white py-2 rounded font-medium" : "flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300";
        
        processMainSale(); // Auto-submit when clicking payment in main form (matching desktop UX)
    }

    // Quick Sale Submission
    document.getElementById('quick-log-btn').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('quick-amount').value);
        if(!amount || amount <= 0) return alert("Enter valid amount");
        
        // Find or create service in inventory
        let item = inventory.find(i => i.name === activeQuickService);
        if (!item) {
            const {data} = await supabase.from('inventory').insert([{name: activeQuickService, type: 'variable', selling_price: 0, is_service: true}]).select().single();
            item = data;
            inventory.push(data);
        }

        await recordSale(item.id, amount, 1, item.buying_price || 0, activeQuickPay, null, 0);
        
        document.getElementById('quick-amount').value = '';
    });
}

async function processMainSale() {
    const itemSelect = document.getElementById('pos-item-search');
    const itemId = itemSelect.value;
    const amount = parseFloat(document.getElementById('pos-total').value);
    const qty = parseFloat(document.getElementById('pos-qty').value);
    const customerId = document.getElementById('pos-customer').value || null;
    
    if(!itemId) return alert("Select an item first");
    if(!amount || amount <= 0) return alert("Enter valid total amount");
    
    const item = inventory.find(i => i.id == itemId);
    let kyoceraPages = 0;
    let buyingCost = item.buying_price || 0;
    
    // Kyocera COGS deduction logic
    if(!document.getElementById('kyocera-fields').classList.contains('hidden')) {
        kyoceraPages = parseInt(document.getElementById('kyo-pages').value || 1);
        const costPP = parseFloat(document.getElementById('kyo-cost-pp').value || 2.5);
        buyingCost = kyoceraPages * costPP; // Deduct the amortized paper/toner cost
    }
    
    await recordSale(itemId, amount, qty, buyingCost, activeMainPay, customerId, kyoceraPages);
    
    // Reset form
    itemSelect.value = '';
    document.getElementById('pos-total').value = '';
    document.getElementById('pos-qty').value = '1';
    document.getElementById('kyocera-fields').classList.add('hidden');
}

async function recordSale(itemId, total, qty, buyingCost, method, customerId, kyoPages) {
    const profit = total - (buyingCost * qty);
    
    const payload = {
        item_id: itemId,
        total_charged: total,
        calculated_qty: qty,
        calculated_profit: profit,
        cashier_id: currentUser.id,
        payment_method: method,
        kyocera_pages: kyoPages
    };
    if (customerId) payload.customer_id = customerId;

    const { error } = await supabase.from('sales_log').insert([payload]);
    
    if (error) {
        console.error(error);
        alert("Failed to log sale");
    } else {
        // Refresh ledger
        await fetchTodaysSales();
        renderLedger();
    }
}
