import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { insertSaleWithOfflineSupport, syncOfflineSales, insertExpenseWithOfflineSupport, syncOfflineExpenses } from './offlineQueue.js';
requireAuth();
let inventory = [], customers = [], todaysSales = [];

window.setQuickPayUI = function(method) {
    quickPay = method;
    const btnM = document.getElementById('quick-pay-mpesa');
    const btnC = document.getElementById('quick-pay-cash');
    if (quickPay === 'M-Pesa') {
        btnM.className = 'flex-1 bg-orange-700 text-white py-2 rounded font-medium shadow transition';
        btnC.className = 'flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium transition';
    } else {
        btnC.className = 'flex-1 bg-orange-600 text-white py-2 rounded font-medium shadow transition';
        btnM.className = 'flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium transition';
    }
};

let activeQuick = "Print / Copy", quickPay = "M-Pesa", mainPay = "M-Pesa";


let activeBindingGroup = null;
let bindingGroups = [];
let linkedBindingResources = [];
let showTapeButton = false;
let activeBindingItem = null;

async function loadBindingSettings() {
    try {
        if (!navigator.onLine) throw new Error('Offline');
        const { data: rows } = await supabase.from('settings').select('key, value')
            .in('key', ['binding_groups', 'binding_linked_resources', 'binding_show_tape', 'quick_add_order']);
        if (rows) localStorage.setItem('litaj_settings_cache', JSON.stringify(rows));
        applySettingsRows(rows || []);
    } catch (e) {
        const cached = localStorage.getItem('litaj_settings_cache');
        applySettingsRows(cached ? JSON.parse(cached) : []);
    }
}

let quickAddOrder = [];
function applySettingsRows(rows) {
    const map = {};
    rows.forEach(r => map[r.key] = r.value);
    bindingGroups = map['binding_groups'] ? JSON.parse(map['binding_groups']) : [];
    showTapeButton = map['binding_show_tape'] === 'true';
    if (map['binding_linked_resources']) {
        linkedBindingResources = JSON.parse(map['binding_linked_resources']);
    } else {
        linkedBindingResources = inventory
            .filter(i => i.name === 'EMBOSSED' || i.name === 'PVC (BLUE)')
            .map(i => ({ id: i.id, name: i.name }));
    }
    quickAddOrder = map['quick_add_order'] ? JSON.parse(map['quick_add_order']) : [];
}

function renderBindingOptions() {
    const container = document.getElementById('binding-options-container');
    if (!container) return;

    if (bindingGroups.length === 0) {
        // Fallback: show all spirals individually
        const spirals = inventory.filter(i => { const n = i.name.toLowerCase(); return n.includes('spiral') && !n.includes('a5 spiral'); });
        if (!activeBindingItem && spirals.length > 0) activeBindingItem = spirals[0];
        container.innerHTML = spirals.map(m => `<button onclick="window.selectBindingItem('${m.id}')" class="px-2 py-1 rounded text-xs font-bold ${activeBindingItem && activeBindingItem.id === m.id ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}">${m.name} (${m.selling_price})</button>`).join('');
        return;
    }

    if (!activeBindingGroup) activeBindingGroup = bindingGroups[0];
    let html = bindingGroups.map(g => `<button onclick="window.setBindingGroup('${g.id}')" class="px-3 py-1.5 rounded text-xs font-bold transition-all ${activeBindingGroup && activeBindingGroup.id === g.id ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">${g.name}</button>`).join('');

    if (showTapeButton) {
        html += `<button onclick="window.setBindingGroup('__tape__')" class="px-3 py-1.5 rounded text-xs font-bold ${activeBindingGroup && activeBindingGroup.id === '__tape__' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">🏷️ Tape</button>`;
    }

    if (activeBindingGroup && activeBindingGroup.id !== '__tape__' && activeBindingGroup.items && activeBindingGroup.items.length > 0) {
        html += `<div class="w-full flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200">`;
        html += activeBindingGroup.items.map(item => {
            const inv_item = inventory.find(i => i.id === item.id);
            const price = inv_item ? inv_item.selling_price : item.selling_price;
            return `<button onclick="window.selectBindingItem('${item.id}')" class="px-2 py-1 rounded text-xs font-semibold ${activeBindingItem && activeBindingItem.id === item.id ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}" data-binding-item="${item.id}">${item.name} (${price})</button>`;
        }).join('');
        html += `</div>`;
    }

    container.innerHTML = html;
}

window.setBindingGroup = function(id) {
    if (id === '__tape__') {
        activeBindingGroup = { id: '__tape__', name: 'Tape', items: [], noStock: true };
        activeBindingItem = null;
        document.getElementById('quick-amount').value = '';
    } else {
        activeBindingGroup = bindingGroups.find(g => g.id === id) || null;
        activeBindingItem = activeBindingGroup && activeBindingGroup.items[0]
            ? inventory.find(i => i.id === activeBindingGroup.items[0].id) : null;
        // Auto-fill amount from group name price (e.g. "KSH 50" → 50)
        if (activeBindingGroup) {
            const price = parseFloat((activeBindingGroup.name || '').replace(/[^0-9.]/g, ''));
            if (price) document.getElementById('quick-amount').value = price;
        }
    }
    renderBindingOptions();
};

window.selectBindingItem = function(itemId) {
    activeBindingItem = inventory.find(i => i.id === itemId);
    if (activeBindingItem) {
        document.getElementById('quick-amount').value = activeBindingItem.selling_price;
    }
    renderBindingOptions();
};

async function deductBindingMaterials(qty) {
    for (const res of linkedBindingResources) {
        const item = inventory.find(i => i.id === res.id);
        if (item) {
            const newStock = (item.stock_quantity || 0) - qty;
            try {
                // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); /* Handled by Postgres Trigger */
            } catch(e) {}
            item.stock_quantity = newStock;
        }
    }
}

async function loadData() {
    try {
        if (!navigator.onLine) throw new Error('Offline');
        const [{data:inv}, {data:cust}] = await Promise.all([
            supabase.from('inventory').select('*').order('name'),
            supabase.from('customers').select('*').order('name')
        ]);
        inventory = inv || [];
        customers = cust || [];
        localStorage.setItem('litaj_inventory_cache', JSON.stringify(inventory));
        localStorage.setItem('litaj_customers_cache', JSON.stringify(customers));
    } catch (e) {
        inventory = JSON.parse(localStorage.getItem('litaj_inventory_cache') || '[]');
        customers = JSON.parse(localStorage.getItem('litaj_customers_cache') || '[]');
        console.warn('Offline mode: Loaded inventory/customers from cache', inventory.length);
    }

    await loadBindingSettings();
    renderBindingOptions();

    // ── Feature 1: Populate customer dropdown (pos-customer) ──────────────
    populateCustomerDropdown();

    // ── Feature 2: Populate debt panel dropdown (customers with balance > 0) ──
    populateDebtDropdown();
    populateDebtSaleDropdown();

    // ── Feature 3: Render dynamic Quick Add buttons ───────────────────────
    renderQuickAddButtons();

    // Subscribe to real-time inventory updates
    supabase.channel('public:inventory').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, payload => {
        if (payload.eventType === 'INSERT') {
            inventory.push(payload.new);
            inventory.sort((a,b) => a.name.localeCompare(b.name));
        } else if (payload.eventType === 'UPDATE') {
            const idx = inventory.findIndex(i => i.id === payload.new.id);
            if (idx >= 0) inventory[idx] = payload.new;
        } else if (payload.eventType === 'DELETE') {
            inventory = inventory.filter(i => i.id !== payload.old.id);
        }
        renderQuickAddButtons(); // keep buttons in sync on live updates
    }).subscribe();

    await fetchTodaysSales();
}

// ── Feature 1 helper: (re)populate #pos-customer, keeping current selection ──
function populateCustomerDropdown() {
    const sel = document.getElementById('pos-customer');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Walk-in</option>';
    customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.outstanding_debt > 0
            ? `${c.name} (owes Ksh ${parseFloat(c.outstanding_debt).toFixed(0)})`
            : c.name;
        sel.appendChild(opt);
    });
    // Restore prior selection if still valid
    if (currentVal) sel.value = currentVal;
}

// ── Feature 2 helper: populate debt-customer-select with only indebted customers ──
function populateDebtDropdown() {
    const sel = document.getElementById('debt-customer-select');
    if (!sel) return;
    const prior = sel.value;
    sel.innerHTML = '<option value="">— select customer —</option>';
    customers
        .filter(c => parseFloat(c.outstanding_debt || 0) > 0)
        .forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} — Ksh ${parseFloat(c.outstanding_debt).toFixed(2)}`;
            sel.appendChild(opt);
        });
    if (prior) sel.value = prior;
}

// ── Feature 3 helper: build Quick Add buttons from is_quick_add flag ──────────
function renderQuickAddButtons() {
    const container = document.getElementById('quick-srv-container');
    if (!container) return;

    // Items flagged is_quick_add=true; fall back to three hardcoded names if column missing
    let quickItems = inventory.filter(i => i.is_quick_add === true || i.is_quick_add === 1);
    if (quickItems.length === 0) {
        // Graceful fallback — same names as the old hardcoded buttons
        const fallbackNames = ['Print / Copy', 'Typesetting', 'Binding Service'];
        quickItems = inventory.filter(i => fallbackNames.includes(i.name));
    }

    quickItems.sort((a, b) => {
        let idxA = quickAddOrder.indexOf(a.id);
        let idxB = quickAddOrder.indexOf(b.id);
        if (idxA === -1) idxA = 9999;
        if (idxB === -1) idxB = 9999;
        if (idxA !== idxB) return idxA - idxB;
        return a.name.localeCompare(b.name);
    });

    if (quickItems.length === 0) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic col-span-3">No Quick Add items configured. Visit Settings to enable some.</span>';
        // Reset activeQuick safely
        activeQuick = null;
        return;
    }

    // Default selection = first item if current activeQuick is no longer valid
    if (!quickItems.find(i => i.name === activeQuick)) {
        activeQuick = quickItems[0].name;
    }

    container.innerHTML = quickItems.map(item => {
        const isActive = item.name === activeQuick;
        const cls = isActive
            ? 'quick-srv-btn bg-orange-600 text-white py-2 rounded text-sm font-medium'
            : 'quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200';
        return `<button class="${cls}" data-name="${item.name}">${item.name}</button>`;
    }).join('');

    // Re-attach click handlers
    container.querySelectorAll('.quick-srv-btn').forEach(b => {
        b.addEventListener('click', e => window.setQuickServiceUI(e.target.dataset.name));
    });
}



async function fetchTodaysSales() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('sales_log').select('*, inventory(name)').gte('timestamp', `${today}T00:00:00Z`).eq('is_voided', false).order('timestamp', { ascending: false });
    todaysSales = data || []; renderLedger();
}

function renderLedger() {
    let m = 0, c = 0;
    const tbody = document.getElementById('sales-tbody');
    tbody.innerHTML = '';

    // Group by item name + payment method
    const groups = {};
    todaysSales.forEach(s => {
        const key = (s.inventory?.name || 'Unknown');
        if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                totalQty: 0,
                totalAmount: 0,
                mpesaAmount: 0,
                cashAmount: 0,
                entries: []
            };
        }
        groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        if (s.payment_method === 'mpesa') { groups[key].mpesaAmount += s.total_charged; m += s.total_charged; }
        else { groups[key].cashAmount += s.total_charged; c += s.total_charged; }
        groups[key].entries.push(s);
    });

    Object.entries(groups).forEach(([key, grp], idx) => {
        let methodBadge = '';
        if (grp.mpesaAmount > 0) methodBadge += '<span class="text-xs font-bold text-slate-700 bg-emerald-50 px-2 py-0.5 rounded-full mr-1">M-Pesa ' + grp.mpesaAmount.toFixed(0) + '</span>';
        if (grp.cashAmount > 0) methodBadge += '<span class="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">Cash ' + grp.cashAmount.toFixed(0) + '</span>';

        const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_') + '_' + idx;

        // Summary (grouped) row
        tbody.innerHTML += `
        <tr class="hover:bg-gray-50 cursor-pointer border-b" onclick="toggleLedgerGroup('${safeKey}')">
            <td class="py-2 px-4 font-semibold text-slate-800">${grp.name}</td>
            <td class="py-2 px-4 text-center text-slate-600">${grp.totalQty}</td>
            <td class="py-2 px-4 text-right font-bold">Ksh ${grp.totalAmount.toFixed(2)}</td>
            <td class="py-2 px-4 text-center">${methodBadge}</td>
            <td class="py-2 px-4 text-center">
                <span class="text-xs text-orange-500 font-bold select-none">▶ Edit</span>
            </td>
        </tr>
        <tr id="grp-${safeKey}" class="hidden bg-slate-50">
            <td colspan="5" class="p-0">
                <table class="w-full text-xs">
                    <thead><tr class="bg-slate-100 text-slate-500">
                        <th class="py-1.5 px-6 text-left">Time</th>
                        <th class="py-1.5 px-4 text-center">Qty</th>
                        <th class="py-1.5 px-4 text-right">Amount</th>
                        <th class="py-1.5 px-4 text-center">Method</th>
                        <th class="py-1.5 px-4 text-center">Del</th>
                    </tr></thead>
                    <tbody>
                        ${grp.entries.map(e => `
                        <tr class="border-t border-slate-100 hover:bg-red-50" id="entry-row-${e.id}">
                            <td class="py-1.5 px-6 text-slate-500">${new Date(e.timestamp).toLocaleTimeString()}</td>
                            <td class="py-1.5 px-4 text-center">${e.calculated_qty}</td>
                            <td class="py-1.5 px-4 text-right font-semibold">Ksh ${e.total_charged.toFixed(2)}</td>
                            <td class="py-1.5 px-4 text-center"><button onclick="togglePayment('${e.id}', '${e.payment_method}')" class="px-2 py-0.5 rounded text-xs font-bold ${e.payment_method.toLowerCase() === 'mpesa' ? 'bg-slate-100 text-slate-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Click to change">${e.payment_method.toUpperCase()}</button></td>
                            <td class="py-1.5 px-4 text-center">
                                <button onclick="voidSale('${e.id}')" class="text-red-500 hover:text-red-700 font-bold text-base leading-none" title="Void this entry">&times;</button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </td>
        </tr>`;
    });

    document.getElementById('lbl-mpesa').innerText = `Ksh ${m.toFixed(2)}`;
    document.getElementById('lbl-cash').innerText = `Ksh ${c.toFixed(2)}`;
}

window.toggleLedgerGroup = (key) => {
    const row = document.getElementById(`grp-${key}`);
    if (!row) return;
    row.classList.toggle('hidden');
    // Rotate arrow on the toggle button
    const parentRow = row.previousElementSibling;
    const arrow = parentRow ? parentRow.querySelector('span.select-none') : null;
    if (arrow) {
        arrow.textContent = row.classList.contains('hidden') ? '▶ Edit' : '▼ Close';
    }
};


window.setQuickServiceUI = function(name) {
    activeQuick = name;
    document.querySelectorAll('.quick-srv-btn').forEach(b => {
        if (b.dataset.name === name) {
            b.className = 'quick-srv-btn bg-orange-600 text-white py-2 rounded text-sm font-medium shadow-sm transition-all';
        } else {
            b.className = 'quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200 transition-all';
        }
    });
    
    const bindingContainer = document.getElementById('binding-options-container');
    const amountInput = document.getElementById('quick-amount');
    const qtyInput = document.getElementById('quick-qty');
    const qtyContainer = document.getElementById('quick-qty-container');
    
    if (qtyInput) qtyInput.value = 1;
    
    const item = inventory.find(i => i.name === name);
    const isService = item ? (item.is_service === true || item.is_service === 1 || item.is_service === 'true') : true;

    if (qtyContainer) {
        if (isService || name === 'Binding Service') {
            qtyContainer.classList.add('hidden');
        } else {
            qtyContainer.classList.remove('hidden');
        }
    }

    if (bindingContainer) {
        if (name === 'Binding Service') {
            bindingContainer.classList.remove('hidden');
            // Re-render so the active item gets highlighted
            renderBindingOptions();
            // If a ring is already selected, fill the amount; otherwise auto-pick the first
            if (!activeBindingItem) {
                // Try first item in active group, or first spiral
                const firstId = activeBindingGroup?.items?.[0]?.id
                    || inventory.find(i => { const n = i.name.toLowerCase(); return n.includes('spiral') && !n.includes('a5'); })?.id;
                if (firstId) window.selectBindingItem(firstId);
            } else {
                if(amountInput) amountInput.value = activeBindingItem.selling_price;
            }
        } else {
            bindingContainer.classList.add('hidden');
            
            // Auto-populate price if recorded in inventory
            if (amountInput) {
                if (item && item.selling_price > 0) {
                    amountInput.value = item.selling_price;
                } else {
                    amountInput.value = ''; // clear if no fixed price
                }
                amountInput.focus();
            }
        }
    }
};

// ── Feature 1: Add New Customer modal wiring ──────────────────────────────────
function openAddCustomerModal() {
    document.getElementById('new-cust-name').value = '';
    document.getElementById('new-cust-phone').value = '';
    document.getElementById('new-cust-error').classList.add('hidden');
    document.getElementById('modal-add-customer').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-cust-name').focus(), 100);
}

document.getElementById('btn-add-cust-inline').addEventListener('click', openAddCustomerModal);

document.getElementById('btn-cancel-new-cust').addEventListener('click', () => {
    document.getElementById('modal-add-customer').classList.add('hidden');
});

document.getElementById('btn-save-new-cust').addEventListener('click', async () => {
    const name = document.getElementById('new-cust-name').value.trim();
    const phone = document.getElementById('new-cust-phone').value.trim();
    const errEl = document.getElementById('new-cust-error');

    if (!name) {
        errEl.textContent = 'Name is required.';
        errEl.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('btn-save-new-cust');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
        const { data, error } = await supabase
            .from('customers')
            .insert([{ name, phone, outstanding_debt: 0 }])
            .select()
            .single();
        if (error) throw error;

        // Update local cache and refresh dropdowns
        customers.push(data);
        customers.sort((a, b) => a.name.localeCompare(b.name));
        localStorage.setItem('litaj_customers_cache', JSON.stringify(customers));
        populateCustomerDropdown();
        populateDebtDropdown();
    populateDebtSaleDropdown();

        // Auto-select the newly created customer in pos-customer
        document.getElementById('pos-customer').value = data.id;

        document.getElementById('modal-add-customer').classList.add('hidden');
    } catch (err) {
        errEl.textContent = 'Error: ' + err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Customer';
    }
});

// ── Feature 2: Debt Collection wiring ────────────────────────────────────────
document.getElementById('debt-customer-select').addEventListener('change', function() {
    const cust = customers.find(c => c.id == this.value);
    const balEl = document.getElementById('debt-current-balance');
    balEl.value = cust ? `Ksh ${parseFloat(cust.outstanding_debt || 0).toFixed(2)}` : '';
    document.getElementById('debt-status-msg').classList.add('hidden');
    document.getElementById('debt-amount-input').value = '';
});

document.getElementById('btn-collect-debt').addEventListener('click', async () => {
    const custId = document.getElementById('debt-customer-select').value;
    const amount = parseFloat(document.getElementById('debt-amount-input').value);
    const statusEl = document.getElementById('debt-status-msg');

    if (!custId) return alert('Please select a customer.');
    if (!amount || amount <= 0) return alert('Enter a valid amount.');

    const cust = customers.find(c => c.id == custId);
    if (!cust) return;

    const currentDebt = parseFloat(cust.outstanding_debt || 0);
    if (amount > currentDebt) {
        return alert(`Amount exceeds balance. Max payable: Ksh ${currentDebt.toFixed(2)}`);
    }

    const newDebt = Math.max(0, currentDebt - amount);
    const btn = document.getElementById('btn-collect-debt');
    btn.disabled = true; btn.textContent = 'Processing...';

    const method = document.getElementById('debt-method-select').value;

    try {
        // Ensure we have an item to link to (foreign key constraint)
        if (!inventory || inventory.length === 0) {
            throw new Error("No items in inventory to link debt collection.");
        }
        const dummyItemId = inventory[0].id;

        const { error: dbError } = await supabase
            .from('customers')
            .update({ outstanding_debt: newDebt })
            .eq('id', custId);
        if (dbError) throw dbError;

        // Insert into sales_log for daily tracking
        const { error: logError } = await supabase.from('sales_log').insert([{
            item_id: dummyItemId,
            quantity: 1, // dummy quantity
            total_charged: amount,
            calculated_profit: 0,
            payment_method: method,
            status: 'debt_collection'
        }]);
        if (logError) throw logError;

        // Update local cache
        cust.outstanding_debt = newDebt;
        localStorage.setItem('litaj_customers_cache', JSON.stringify(customers));
        populateCustomerDropdown();
        populateDebtDropdown();
    populateDebtSaleDropdown();

        document.getElementById('debt-amount-input').value = '';
        document.getElementById('debt-current-balance').value = `Ksh ${newDebt.toFixed(2)}`;
        document.getElementById('debt-customer-select').value = '';
        document.getElementById('debt-current-balance').value = '';

        statusEl.textContent = `✅ Collected Ksh ${amount.toFixed(2)} from ${cust.name}. Remaining balance: Ksh ${newDebt.toFixed(2)}`;
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 5000);
    } catch (err) {
        alert('Error collecting debt: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Collect Payment';
    }
});



function updateQuickAmountFromQty() {
    const qtyInput = document.getElementById('quick-qty');
    const amountInput = document.getElementById('quick-amount');
    if (!qtyInput || !amountInput) return;
    
    const qty = parseInt(qtyInput.value) || 1;
    if (activeQuick !== 'Binding Service') {
        const item = inventory.find(i => i.name === activeQuick);
        if (item && item.selling_price > 0) {
            amountInput.value = item.selling_price * qty;
        }
    }
}

document.getElementById('quick-qty-plus')?.addEventListener('click', () => {
    const input = document.getElementById('quick-qty');
    if (input) {
        input.value = (parseInt(input.value) || 1) + 1;
        updateQuickAmountFromQty();
    }
});

document.getElementById('quick-qty-minus')?.addEventListener('click', () => {
    const input = document.getElementById('quick-qty');
    if (input) {
        const newVal = (parseInt(input.value) || 1) - 1;
        input.value = newVal < 1 ? 1 : newVal;
        updateQuickAmountFromQty();
    }
});
document.getElementById('quick-pay-mpesa').addEventListener('click', () => window.setQuickPayUI('M-Pesa'));
document.getElementById('quick-pay-cash').addEventListener('click', () => window.setQuickPayUI('Cash'));


document.getElementById('quick-log-btn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('quick-amount').value); if(!amt) return;

      let logItem = null, logQty = 1, logProfit = amt, isBinding = (activeQuick === 'Binding Service');

      if (isBinding) {
          const isNoStock = activeBindingGroup && activeBindingGroup.noStock;
          const ringItem = activeBindingItem || (activeBindingGroup && activeBindingGroup.items && activeBindingGroup.items[0] ? inventory.find(i => i.id === activeBindingGroup.items[0].id) : null);

          if (ringItem && !isNoStock) {
              // Service price per binding job comes from the GROUP NAME (e.g. "KSH 50" → 50)
              const groupNamePrice = activeBindingGroup
                  ? parseFloat((activeBindingGroup.name || '').replace(/[^0-9.]/g, '')) || null
                  : null;
              const standardPrice = groupNamePrice || ringItem.selling_price || 50;
              logQty = Math.max(1, Math.floor(amt / standardPrice));
              logItem = ringItem;
              logProfit = amt - (ringItem.buying_price * logQty);
              // Deduct ring stock by quantity
              const newRingStock = (logItem.stock_quantity || 0) - logQty;
              try {
                  // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newRingStock }).eq('id', logItem.id); /* Handled by Postgres Trigger */
              } catch(e) {}
              if (logItem) logItem.stock_quantity = newRingStock;
          } else {
              // Tape binding or no item configured — use generic Binding Service item
              let svcItem = inventory.find(i => i.name === 'Binding Service');
              if (!svcItem) { 
                  try {
                      if (navigator.onLine) {
                          const {data} = await supabase.from('inventory').insert([{name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true}]).select().single(); 
                          svcItem = data; 
                      } else {
                          svcItem = { id: 'temp-binding-srv', name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true };
                      }
                  } catch(e) { svcItem = { id: 'temp-binding-srv', name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true }; }
                  inventory.push(svcItem); 
              }
              logItem = svcItem;
          }
          // Always deduct linked resources (covers) for any binding job
          await deductBindingMaterials(logQty);
            } else {
          let item = inventory.find(i => i.name === activeQuick);
          if (!item) { 
              try {
                  if (navigator.onLine) {
                      const {data} = await supabase.from('inventory').insert([{name: activeQuick, type: 'variable', selling_price: 0, is_service: true}]).select().single(); 
                      item = data; 
                  } else {
                      item = { id: 	emp- + activeQuick.replace(/\s+/g,'-'), name: activeQuick, type: 'variable', selling_price: 0, is_service: true };
                  }
              } catch(e) { item = { id: 	emp- + activeQuick.replace(/\s+/g,'-'), name: activeQuick, type: 'variable', selling_price: 0, is_service: true }; }
              inventory.push(item); 
          }
          logItem = item;
          
          const qtyInput = document.getElementById('quick-qty');
          logQty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
          logProfit = amt - ((logItem.buying_price || 0) * logQty);

          if (!logItem.is_service && typeof logItem.stock_quantity === 'number') {
              const newStock = logItem.stock_quantity - logQty;
              try {
                  // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', logItem.id); /* Handled by Postgres Trigger */
                  logItem.stock_quantity = newStock;
              } catch(e) {}
          }
      }

      const _qRes = await insertSaleWithOfflineSupport(supabase, {
          item_id: logItem.id, total_charged: amt, calculated_qty: logQty,
          calculated_profit: logProfit, cashier_id: currentUser.id,
          payment_method: quickPay.toLowerCase().replace('-', '')
      });
            if (_qRes.offline) {
          document.getElementById('quick-amount').value = '';
          if(document.getElementById('quick-qty')) document.getElementById('quick-qty').value = 1;
          if(window.setQuickPayUI) window.setQuickPayUI('M-Pesa');
          if(window.setQuickServiceUI) window.setQuickServiceUI('Print / Copy');
          alert('No internet - sale saved locally and will sync when back online.');
          setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
          return;
      }

      document.getElementById('quick-amount').value = '';
      if(document.getElementById('quick-qty')) document.getElementById('quick-qty').value = 1;
      if(window.setQuickPayUI) window.setQuickPayUI('M-Pesa');
      if(window.setQuickServiceUI) window.setQuickServiceUI('Print / Copy');
      fetchTodaysSales();
      setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
});


function handlePosSearch(e) {
    const term = e.target ? e.target.value.toLowerCase() : e.toLowerCase();
    const resDiv = document.getElementById('pos-search-results');
    
    let matches = inventory;
    if(term) {
        matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    }
    
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-3 text-sm text-gray-500 font-medium">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => `<div class="p-3 text-sm cursor-pointer hover:bg-orange-50 border-b flex justify-between items-center transition-colors" onclick="selectPosItem('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.selling_price})"><div class="font-bold text-gray-800">${i.name}</div><div class="font-bold text-orange-600">Ksh ${i.selling_price}</div></div>`).join('');
    }
    resDiv.classList.remove('hidden');
}

document.getElementById('pos-item-search').addEventListener('focus', (e) => handlePosSearch(e));
document.getElementById('pos-item-search').addEventListener('input', (e) => {
    document.getElementById('pos-item-id').value = ''; 
    document.getElementById('pos-total').value = '';
    document.getElementById('kyocera-fields').classList.add('hidden');
    handlePosSearch(e);
});


window.selectPosItem = (id, name, price) => {
    document.getElementById('pos-item-id').value = id;
    document.getElementById('pos-item-search').value = name;
    document.getElementById('pos-search-results').classList.add('hidden');
    
    const qty = parseInt(document.getElementById('pos-qty').value || 1);
    document.getElementById('pos-total').value = (price * qty).toFixed(2);
    
    document.getElementById('kyocera-fields').className = name.toLowerCase().includes('kyocera') ? 'p-3 bg-orange-50 border border-orange-100 rounded-lg mb-4' : 'hidden';
};

document.addEventListener('click', (e) => {
    if(!e.target.closest('#pos-item-search') && !e.target.closest('#pos-search-results')) {
        const res = document.getElementById('pos-search-results');
        if(res) res.classList.add('hidden');
    }
});

document.getElementById('pos-qty').addEventListener('input', () => {
    const id = document.getElementById('pos-item-id').value;
    if(!id) return;
    const item = inventory.find(i => i.id === id);
    if(item) {
        document.getElementById('pos-total').value = (item.selling_price * parseInt(document.getElementById('pos-qty').value || 1)).toFixed(2);
    }
});

['main-pay-mpesa', 'main-pay-cash'].forEach(id => document.getElementById(id).addEventListener('click', async (e) => {
    const amt = parseFloat(document.getElementById('pos-total').value), qty = parseInt(document.getElementById('pos-qty').value);
    const item = inventory.find(i => i.id === document.getElementById('pos-item-id').value);
    
    if(!item || !amt) return alert('Select an item and enter amount');
    
    // Quick validation before submitting
    e.target.innerText = 'Processing...';
    e.target.disabled = true;
    
    try {
        let bc = item.buying_price || 0, kyo = 0;
        if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
            kyo = parseInt(document.getElementById('kyo-pages').value); 
            bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value); 
        }
        
        const logPayload = {
              item_id: item.id, 
              total_charged: amt, 
              calculated_qty: qty, 
              calculated_profit: amt - (bc*qty), 
              cashier_id: currentUser.id, 
              payment_method: e.target.id.includes('mpesa') ? 'mpesa' : 'cash', 
              kyocera_pages: kyo
          };
          
          const qRes = await insertSaleWithOfflineSupport(supabase, logPayload);
          if (qRes.offline) {
              alert('No internet — sale saved locally and will sync when back online.');
          }
        
        // Reset form
        document.getElementById('pos-item-search').value = '';
          setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
        document.getElementById('pos-item-id').value = '';
        document.getElementById('pos-total').value = '';
        document.getElementById('pos-qty').value = 1;
        fetchTodaysSales();
    } finally {
        e.target.innerText = e.target.id.includes('mpesa') ? 'M-Pesa' : 'Cash';
        e.target.disabled = false;
    }
}));


// --- Document Builder Logic ---
let isDocMode = false;
let docCart = [];

let isDebtMode = false;
function resetModes() {
    isDocMode = false;
    isDebtMode = false;
    document.getElementById('mode-direct').className = "px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all";
    document.getElementById('mode-doc').className = "px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all";
    const modeDebt = document.getElementById('mode-debt');
    if(modeDebt) modeDebt.className = "px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all";
    
    document.getElementById('doc-actions').classList.add('hidden');
    document.getElementById('direct-actions').classList.remove('hidden');
    document.getElementById('doc-cart-panel').classList.add('hidden');
    
    document.getElementById('debt-customer-container').classList.add('hidden');
    document.getElementById('main-pay-mpesa').classList.remove('hidden');
    document.getElementById('main-pay-cash').classList.remove('hidden');
    const mainPayDebt = document.getElementById('main-pay-debt');
    if(mainPayDebt) mainPayDebt.classList.add('hidden');
    
    const btnDebtCart = document.getElementById('btn-debt-cart');
    if(btnDebtCart) btnDebtCart.classList.add('hidden');
    const btnDlQuote = document.getElementById('btn-dl-quote');
    const btnRecMpesa = document.getElementById('btn-receipt-mpesa');
    const btnRecCash = document.getElementById('btn-receipt-cash');
    if(btnDlQuote) btnDlQuote.classList.remove('hidden');
    if(btnRecMpesa) btnRecMpesa.classList.remove('hidden');
    if(btnRecCash) btnRecCash.classList.remove('hidden');
}

document.getElementById('mode-direct').addEventListener('click', () => {
    resetModes();
    document.getElementById('mode-direct').className = "px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-orange-600 transition-all";
});

document.getElementById('mode-doc').addEventListener('click', () => {
    resetModes();
    isDocMode = true;
    document.getElementById('mode-doc').className = "px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-orange-600 transition-all";
    document.getElementById('doc-actions').classList.remove('hidden');
    document.getElementById('direct-actions').classList.add('hidden');
    document.getElementById('doc-cart-panel').classList.remove('hidden');
});

const modeDebtBtn = document.getElementById('mode-debt');
if(modeDebtBtn) {
    modeDebtBtn.addEventListener('click', () => {
        resetModes();
        isDebtMode = true;
        modeDebtBtn.className = "px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-orange-600 transition-all";
        
        // Show the cart for debt mode
        document.getElementById('doc-actions').classList.remove('hidden');
        document.getElementById('direct-actions').classList.remove('hidden');
        
        document.getElementById('main-pay-mpesa').classList.add('hidden');
        document.getElementById('main-pay-cash').classList.add('hidden');
        const mainPayDebt = document.getElementById('main-pay-debt');
        if(mainPayDebt) mainPayDebt.classList.remove('hidden');
        
        // Also show the Cart panel
        document.getElementById('doc-cart-panel').classList.remove('hidden');
        document.getElementById('debt-customer-container').classList.remove('hidden');
        
        // Inside the cart, hide the standard receipt buttons and show "Process Debt"
        const btnDlQuote = document.getElementById('btn-dl-quote');
        const btnRecMpesa = document.getElementById('btn-receipt-mpesa');
        const btnRecCash = document.getElementById('btn-receipt-cash');
        if(btnDlQuote) btnDlQuote.classList.add('hidden');
        if(btnRecMpesa) btnRecMpesa.classList.add('hidden');
        if(btnRecCash) btnRecCash.classList.add('hidden');
        
        const btnDebtCart = document.getElementById('btn-debt-cart');
        if(btnDebtCart) btnDebtCart.classList.remove('hidden');
    });
}

function renderDocCart() {
    const tbody = document.getElementById('doc-cart-tbody');
    tbody.innerHTML = '';
    let total = 0;
    docCart.forEach((item, idx) => {
        total += item.total;
        tbody.innerHTML += `
            <tr class="hover:bg-gray-100">
                <td class="p-2">${item.name}</td>
                <td class="p-2 text-center">${item.qty}</td>
                <td class="p-2 text-right">Ksh ${item.total.toFixed(2)}</td>
                <td class="p-2 text-center text-red-500 cursor-pointer" onclick="removeDocItem(${idx})">&times;</td>
            </tr>
        `;
    });
    document.getElementById('doc-cart-total').innerText = `Ksh ${total.toFixed(2)}`;
}

window.removeDocItem = (idx) => {
    docCart.splice(idx, 1);
    renderDocCart();
};

document.getElementById('btn-add-to-doc').addEventListener('click', () => {
    const amt = parseFloat(document.getElementById('pos-total').value);
    const qty = parseInt(document.getElementById('pos-qty').value);
    const item = inventory.find(i => i.id === document.getElementById('pos-item-id').value);
    
    if(!item || !amt) return alert('Select an item and enter amount');
    
    let bc = item.buying_price || 0, kyo = 0;
    if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
        kyo = parseInt(document.getElementById('kyo-pages').value) || 0; 
        bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value || 0); 
    }
    
    docCart.push({
        id: item.id,
        name: item.name,
        qty: qty,
        price: amt / qty,
        total: amt,
        buying_price: bc,
        kyocera_pages: kyo
    });
    
    // Reset inputs
    document.getElementById('pos-item-search').value = '';
    document.getElementById('pos-item-id').value = '';
    document.getElementById('pos-total').value = '';
    document.getElementById('pos-qty').value = 1;
    document.getElementById('kyocera-fields').classList.add('hidden');
    
    renderDocCart();
});

document.getElementById('btn-clear-doc').addEventListener('click', () => {
    if(confirm('Clear document cart?')) { docCart = []; renderDocCart(); }
});

function generatePDF(type, paymentMethod = '') {
    if (docCart.length === 0) return alert('Document cart is empty.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const custId = document.getElementById('pos-customer').value;
    const cust = customers.find(c => c.id === custId) || { name: 'Walk-in Customer' };
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Litaj Hardware", 14, 20);
    
    doc.setFontSize(14);
    doc.text(type === 'quote' ? 'QUOTATION' : 'RECEIPT', 170, 20, { align: 'right' });
    
    // Bill To
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text("Bill To:", 14, 45);
    doc.setFontSize(12);
    doc.text(cust.name, 14, 52);
    if(cust.phone) doc.text(`Phone: ${cust.phone}`, 14, 58);
    
    // Date & Ref
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 170, 45, { align: 'right' });
    doc.text(`Ref: ${Math.random().toString(36).substr(2, 6).toUpperCase()}`, 170, 52, { align: 'right' });
    if(paymentMethod) doc.text(`Paid via: ${paymentMethod}`, 170, 59, { align: 'right' });
    
    // Table
    const tableData = docCart.map(item => [
        item.name,
        item.qty,
        `Ksh ${item.price.toFixed(2)}`,
        `Ksh ${item.total.toFixed(2)}`
    ]);
    
    let sum = 0; docCart.forEach(i => sum += i.total);
    tableData.push(['', '', 'TOTAL', `Ksh ${sum.toFixed(2)}`]);
    
    doc.autoTable({
        startY: 70,
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [234, 88, 12] },
        styles: { font: 'helvetica', fontSize: 10 },
        columnStyles: { 3: { fontStyle: 'bold' } },
        didParseCell: function (data) {
            if (data.row.index === tableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 240, 240];
            }
        }
    });
    
    const finalY = doc.lastAutoTable.finalY || 80;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Thank you for your business!", 105, finalY + 20, { align: 'center' });
    
    doc.save(`${type === 'quote' ? 'Quotation' : 'Receipt'}_${cust.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
}

async function processReceipt(paymentMethod) {
    if (docCart.length === 0) return alert('Cart is empty.');
    
    // Disable buttons
    document.getElementById('btn-receipt-mpesa').disabled = true;
    document.getElementById('btn-receipt-cash').disabled = true;
    document.getElementById('btn-receipt-mpesa').innerText = 'Processing...';
    
    try {
        const logs = docCart.map(i => ({
            item_id: i.id,
            total_charged: i.total,
            calculated_qty: i.qty,
            calculated_profit: i.total - (i.buying_price * i.qty),
            cashier_id: currentUser.id,
            payment_method: paymentMethod.toLowerCase().replace('-', ''),
            kyocera_pages: i.kyocera_pages
        }));
        
        for (const log of logs) {
            const qRes = await insertSaleWithOfflineSupport(supabase, log);
            if (qRes.offline) {
                // If one is offline, all will be offline. We can just alert once at the end.
            }
        }
        if (!navigator.onLine) {
            alert('No internet — receipt sales saved locally and will sync when back online.');
        }
        
        generatePDF('receipt', paymentMethod);
        
        docCart = [];
        renderDocCart();
        fetchTodaysSales();
    } catch(err) {
        alert('Error logging receipt: ' + err.message);
    } finally {
        document.getElementById('btn-receipt-mpesa').disabled = false;
        document.getElementById('btn-receipt-cash').disabled = false;
        document.getElementById('btn-receipt-mpesa').innerText = 'Receipt (M-Pesa)';
    }
}

document.getElementById('btn-dl-quote').addEventListener('click', () => generatePDF('quote'));
document.getElementById('btn-receipt-mpesa').addEventListener('click', () => processReceipt('M-Pesa'));
document.getElementById('btn-receipt-cash').addEventListener('click', () => processReceipt('Cash'));

loadData();









window.togglePayment = async (id, currentMethod) => {
    const newMethod = currentMethod.toLowerCase() === 'cash' ? 'mpesa' : 'cash';
    if (!confirm(`Change payment method to ${newMethod.toUpperCase()}?`)) return;
    try {
        const { error } = await supabase.from('sales_log').update({ payment_method: newMethod }).eq('id', id);
        if (error) throw error;
        fetchTodaysSales();
    } catch(err) {
        alert('Error updating payment: ' + err.message);
    }
};

window.voidSale = async (id) => {
    if (!confirm('Are you sure you want to void this entry?')) return;
    try {
        const { error } = await supabase.from('sales_log').update({
            is_voided: true,
            voided_by: currentUser.id
        }).eq('id', id);
        if (error) throw error;
        fetchTodaysSales();
    } catch(err) {
        alert('Error voiding sale: ' + err.message);
    }
};


// ─── LEDGER TOGGLE ────────────────────────────────────────────────────────────
let ledgerVisible = false;

// Ledger Auto-hide logic (5 minutes)
let ledgerTimer;
function resetLedgerTimer() {
    clearTimeout(ledgerTimer);
    if (ledgerVisible) {
        ledgerTimer = setTimeout(() => {
            if (ledgerVisible) {
                const btn = document.getElementById('btn-toggle-ledger');
                if (btn) btn.click();
            }
        }, 5 * 60 * 1000);
    }
}
document.addEventListener('mousemove', resetLedgerTimer);
document.addEventListener('keydown', resetLedgerTimer);

document.getElementById('btn-toggle-ledger').addEventListener('click', () => {
    ledgerVisible = !ledgerVisible;
    const table = document.getElementById('ledger-table-wrap');
    const totals = document.getElementById('ledger-totals');
    const icon = document.getElementById('ledger-toggle-icon');
    const label = document.getElementById('ledger-toggle-label');
    if (ledgerVisible) {
        table.classList.remove('hidden');
        totals.classList.remove('hidden');
        icon.textContent = '👁️';
        label.textContent = 'Hide';
    } else {
        table.classList.add('hidden');
        totals.classList.add('hidden');
        icon.textContent = '🚫';
        label.textContent = 'Show';
    }
    resetLedgerTimer();
});

// Initialize timer on load
resetLedgerTimer();

// ─── QUICK EXPENSE LOGGER ─────────────────────────────────────────────────────

// Fetch users for wage dropdown
async function loadUsersForWage() {
    const { data } = await supabase.from('users').select('id, username');
    const sel = document.getElementById('exp-wage-user');
    if (sel && data) {
        sel.innerHTML = '<option value="">Select cashier...</option>' + data.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
    }
}
loadUsersForWage();

let activeExpenseTab = 'lunch';

document.querySelectorAll('.exp-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        activeExpenseTab = type;
        
        // Reset tabs UI
        document.querySelectorAll('.exp-tab').forEach(b => {
            b.className = 'exp-tab flex-1 text-xs py-1 rounded font-bold bg-slate-200 text-slate-600 transition-colors';
        });
        e.target.className = 'exp-tab flex-1 text-xs py-1 rounded font-bold bg-slate-700 text-white transition-colors';

        // Toggle fields
        const wageFields = document.getElementById('exp-wage-fields');
        const descField = document.getElementById('exp-desc');
        const amtField = document.getElementById('exp-amount');
        
        wageFields.classList.add('hidden');
        if(descField) descField.classList.add('hidden');
        
        if (type === 'wage') {
            wageFields.classList.remove('hidden');
            amtField.placeholder = "Wage Amount (Ksh)";
        } else if (type === 'other') {
            if(descField) {
                descField.classList.remove('hidden');
                descField.placeholder = "Description...";
            }
            amtField.placeholder = "Amount (Ksh)";
        } else {
            amtField.placeholder = "Amount (Ksh)";
        }
    });
});

document.getElementById('btn-log-expense').addEventListener('click', async () => {
    let desc = '';
    let amt = parseFloat(document.getElementById('exp-amount').value);
    let targetUserId = null;
    
    if (activeExpenseTab === 'lunch') desc = 'Lunch';
    else if (activeExpenseTab === 'transport') desc = 'Transport';
    else if (activeExpenseTab === 'wage') {
        const sel = document.getElementById('exp-wage-user');
        const userId = sel.value;
        if (!userId) return alert('Select a cashier for the wage log.');
        const userName = sel.options[sel.selectedIndex].text;
        desc = `Wage - ${userName}`;
        targetUserId = userId;
    }
    else if (activeExpenseTab === 'other') {
        const descField = document.getElementById('exp-desc');
        desc = descField ? descField.value.trim() : 'Other';
    }

    if (!desc || isNaN(amt) || amt <= 0) return alert('Enter valid details and amount.');
    
    const btn = document.getElementById('btn-log-expense');
    btn.disabled = true; btn.textContent = 'Logging...';
    
    try {
        const payload = {
            amount: amt,
            description: desc
        };
        const res = await insertExpenseWithOfflineSupport(supabase, payload, desc);
        
        // Ensure wage gets tracked in Admin Shift Wages automatically
        if (targetUserId && navigator.onLine) {
            const today = new Date().toISOString().split('T')[0];
            await supabase.from('attendance_log').upsert({
                user_id: targetUserId,
                work_date: today,
                wage_assigned: amt
            }, { onConflict: 'user_id, work_date' });
        }

        const descField = document.getElementById('exp-desc');
        if(descField) descField.value = '';
        document.getElementById('exp-amount').value = '';
        
        if (res.offline) {
            alert('No internet — expense queued locally (' + desc + ' - Ksh ' + amt + ')');
        } else {
            alert('Expense logged: ' + desc + ' - Ksh ' + amt);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Log Expense';
    }
});

// ─── QUICK RESOURCE OPENER ────────────────────────────────────────────────────
const qresInput = document.getElementById('qres-search');
const qresResults = document.getElementById('qres-results');

qresInput.addEventListener('input', () => {
    const term = qresInput.value.toLowerCase();
    const matches = inventory.filter(i => !i.is_service && i.name.toLowerCase().includes(term));
    if (!term || matches.length === 0) { qresResults.classList.add('hidden'); return; }
    qresResults.innerHTML = matches.slice(0, 10).map(i =>
        `<div class="p-2 text-sm cursor-pointer hover:bg-slate-50 border-b"
              onclick="selectQRes('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.buying_price || 0})">
            <div class="font-bold">${i.name}</div>
            <div class="text-xs text-gray-400">Stock: ${i.stock_quantity} | BP: Ksh ${i.buying_price || 0}</div>
         </div>`
    ).join('');
    qresResults.classList.remove('hidden');
});

window.selectQRes = (id, name, bp) => {
    document.getElementById('qres-item-id').value = id;
    document.getElementById('qres-search').value = name;
    
    const children = inventory.filter(i => i.parent_id === id);
    const piecesSidebar = document.getElementById('qres-pieces-sidebar');
    const piecesContent = document.getElementById('qres-pieces-content');
    
    if (piecesSidebar && piecesContent) {
        if (children.length > 0) {
            piecesSidebar.classList.remove('hidden');
            piecesContent.innerHTML = children.map(c => 
                `<div class="bg-white p-1 rounded border mb-1 flex justify-between items-center text-xs">
                    <span class="truncate pr-1">${c.name}</span>
                    <span class="bg-orange-100 text-orange-800 px-1 rounded">${c.units_per_parent || 0}</span>
                </div>`
            ).join('');
        } else {
            piecesSidebar.classList.add('hidden');
            piecesContent.innerHTML = '';
        }
    }
    
    qresResults.classList.add('hidden');
};

document.addEventListener('click', e => {
    if (!e.target.closest('#qres-search') && !e.target.closest('#qres-results')) {
        qresResults.classList.add('hidden');
    }
});

document.getElementById('btn-open-resource').addEventListener('click', async () => {
    const itemId = document.getElementById('qres-item-id').value;
    const qty = parseInt(document.getElementById('qres-qty').value || 1);
    const name = document.getElementById('qres-search').value;
    if (!itemId || qty < 1) return alert('Select an item and enter quantity.');
    
    const selectedItem = inventory.find(i => i.id === itemId);
    const costPerUnit = selectedItem ? selectedItem.buying_price : 0;
    
    const btn = document.getElementById('btn-open-resource');
    btn.disabled = true; btn.textContent = 'Opening...';
    try {
        if (!navigator.onLine) {
            throw new Error("You must be online to open a bulk resource right now.");
        }

        await supabase.from('resources')
            .update({ status: 'exhausted' })
            .eq('name', name)
            .eq('status', 'active');

        const { error } = await supabase.from('resources').insert([{
            name: name,
            units: qty,
            cost: costPerUnit * qty,
            status: 'active',
            opened_at: new Date().toISOString(),
            opened_by: currentUser.id
        }]);
        if (error) throw error;
        
        if (selectedItem) {
            const newParentStock = selectedItem.stock_quantity - qty;
            const { error: pErr } = await supabase.from('inventory')
                .update({ stock_quantity: newParentStock })
                .eq('id', itemId);
            if (pErr) throw pErr;
            
            const children = inventory.filter(i => i.parent_id === itemId);
            for (const child of children) {
                const addQty = qty * (child.units_per_parent || 1);
                const newChildStock = child.stock_quantity + addQty;
                const { error: cErr } = await supabase.from('inventory')
                    .update({ stock_quantity: newChildStock })
                    .eq('id', child.id);
                if (cErr) throw cErr;
            }
            
            if (typeof loadInventory === 'function') {
                await loadInventory();
            }
        }
        
        document.getElementById('qres-search').value = '';
        document.getElementById('qres-item-id').value = '';
        document.getElementById('qres-qty').value = 1;
        
        alert('Resource opened: ' + name + ' x' + qty);
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Open Resource';
    }
});


// --- QTY +/- BUTTONS ---
const qtyInput = document.getElementById('pos-qty');
const totalInput = document.getElementById('pos-total');
const btnMinus = document.getElementById('qty-minus');
const btnPlus = document.getElementById('qty-plus');

function updatePosTotal() {
    const itemId = document.getElementById('pos-item-id').value;
    if (!itemId) return;
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;
    let q = parseFloat(qtyInput.value) || 0;
    if(q < 0) q = 0;
    totalInput.value = item.selling_price * q;
}

if (btnMinus && btnPlus) {
    btnMinus.addEventListener('click', (e) => {
        e.preventDefault();
        let val = parseFloat(qtyInput.value) || 0;
        if (val > 1) { qtyInput.value = val - 1; updatePosTotal(); }
    });
    btnPlus.addEventListener('click', (e) => {
        e.preventDefault();
        let val = parseFloat(qtyInput.value) || 0;
        qtyInput.value = val + 1; updatePosTotal();
    });
    qtyInput.addEventListener('input', updatePosTotal);
}

// Ensure pos-qty handles its own updates when manually typed

// --- KEYBOARD SHORTCUTS ---
const quickAmt = document.getElementById('quick-amount');
quickAmt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Update global quickPay state
        
        
        window.setQuickPayUI(e.shiftKey ? 'Cash' : 'M-Pesa');
        
        // Trigger save
        document.getElementById('quick-log-btn').click();
    }
});

const mainInputs = ['pos-item-search', 'pos-qty', 'pos-total', 'pos-customer', 'kyo-pages', 'kyo-cost-pp'];
mainInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (isDocMode) return; // Do nothing if in Quote/Receipt mode
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('main-pay-cash').click();
                } else {
                    document.getElementById('main-pay-mpesa').click();
                }
            }
        });
    }
});

// Default focus on load
setTimeout(() => { document.getElementById('quick-amount').focus(); }, 500);

// Set focus back after logging a quick sale
const originalQuickLogCode = "document.getElementById('quick-amount').value = ''; fetchTodaysSales();";
const newQuickLogCode = "document.getElementById('quick-amount').value = ''; fetchTodaysSales(); setTimeout(()=>document.getElementById('quick-amount').focus(), 100);";

// --- AUTO-FOCUS ON INACTIVITY ---
let focusTimer;
function resetFocusTimer() {
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
        const quickAmt = document.getElementById('quick-amount');
        if (quickAmt) quickAmt.focus();
    }, 60 * 1000); // 1 minute
}
document.addEventListener('mousemove', resetFocusTimer);
document.addEventListener('keydown', resetFocusTimer);
document.addEventListener('click', resetFocusTimer);
// --- OFFLINE SYNC LISTENER ---
window.addEventListener('online', async () => {
    console.log('[Network] Back online, syncing sales and expenses...');
    const salesCount = await syncOfflineSales(supabase);
    const expensesCount = await syncOfflineExpenses(supabase);
    if (salesCount > 0) {
        // Refresh the ledger
        fetchTodaysSales();
    }
    if (expensesCount > 0) {
        console.log(`Synced ${expensesCount} expenses.`);
    }
});
resetFocusTimer(); // Init

function populateDebtSaleDropdown() {
    const sel = document.getElementById('debt-sale-customer-select');
    if (!sel) return;
    const prior = sel.value;
    sel.innerHTML = '<option value="">-- Choose Customer --</option>';
    customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
    });
    if (prior) sel.value = prior;
}

const mainPayDebt = document.getElementById('main-pay-debt');
if (mainPayDebt) {
    mainPayDebt.addEventListener('click', async () => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        const amt = parseFloat(document.getElementById('pos-total').value);
        const qty = parseInt(document.getElementById('pos-qty').value || 1);
        const itemId = document.getElementById('pos-item-id').value;
        const item = inventory.find(i => i.id === itemId);
        
        if(!item || !amt) return alert('Select an item and enter amount');

        const cust = customers.find(c => c.id == custId);
        if (!cust) return;

        if (!confirm('Log Ksh ' + amt + ' as Debt for ' + cust.name + '?')) return;

        mainPayDebt.disabled = true;
        mainPayDebt.textContent = 'Processing...';

        try {
            let bc = item.buying_price || 0, kyo = 0;
            if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
                kyo = parseInt(document.getElementById('kyo-pages').value); 
                bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value); 
            }
            if(item.name.toLowerCase().includes('binding') && !item.is_kyocera) {
                bc = await calculateBindingCost(qty);
            }
            const prof = amt - bc;

            const { error: insertErr } = await supabase.from('sales_log').insert([{
                item_id: item.id,
                total_charged: amt,
                calculated_qty: qty,
                calculated_profit: prof,
                cashier_id: currentUser.id,
                payment_method: 'cash',
                status: 'debt',
                customer_id: custId
            }]);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + amt;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('litaj_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(qty);
            } else if (item.type === 'fixed') {
                const newStock = (item.stock_quantity || 0) - qty;
                /* await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); - Handled by Postgres Trigger */
                item.stock_quantity = newStock;
            }

            document.getElementById('pos-item-id').value = '';
            document.getElementById('pos-item-search').value = '';
            document.getElementById('pos-qty').value = '';
            document.getElementById('pos-total').value = '';
            document.getElementById('kyocera-fields').classList.add('hidden');
            
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            mainPayDebt.disabled = false;
            mainPayDebt.textContent = 'Debt';
        }
    });
}
// NEW DEBT CHECKOUT LOGIC

const btnDebtCart = document.getElementById('btn-debt-cart');
if (btnDebtCart) {
    btnDebtCart.addEventListener('click', async () => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        if (docCart.length === 0) {
            alert('Cart is empty.');
            return;
        }

        const totalAmount = docCart.reduce((sum, item) => sum + item.total, 0);
        const cust = customers.find(c => c.id == custId);
        if (!cust) return;

        if (!confirm('Log Ksh ' + totalAmount + ' as Debt for ' + cust.name + '?')) return;

        btnDebtCart.disabled = true;
        btnDebtCart.textContent = 'Processing...';

        try {
            const inserts = docCart.map(item => ({
                item_id: item.id,
                total_charged: item.total,
                calculated_qty: item.qty,
                calculated_profit: item.total - (item.buying_price * item.qty),
                cashier_id: currentUser.id,
                payment_method: 'cash',
                status: 'debt',
                customer_id: custId,
                kyocera_pages: item.kyocera_pages
            }));

            const { error: insertErr } = await supabase.from('sales_log').insert(inserts);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + totalAmount;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('litaj_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            for (let item of docCart) {
                if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                    if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(item.qty);
                    continue;
                }
                const logItem = inventory.find(i => i.id === item.id);
                if (logItem && logItem.type === 'fixed') {
                    const newStock = (logItem.stock_quantity || 0) - item.qty;
                    /* await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); - Handled by Postgres Trigger */
                    logItem.stock_quantity = newStock;
                }
            }

            docCart = [];
            renderDocCart();
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            btnDebtCart.disabled = false;
            btnDebtCart.textContent = 'Process Debt';
        }
    });
}

// --- TIERED PRODUCT DRAWER LOGIC ---
const drawerOverlay = document.getElementById('drawer-overlay');
const quickAddDrawer = document.getElementById('quick-add-drawer');

document.getElementById('btn-open-drawer').addEventListener('click', () => {
    drawerOverlay.classList.remove('hidden');
    // slight delay to allow display block to apply before transform
    setTimeout(() => {
        quickAddDrawer.classList.remove('translate-x-full');
    }, 10);
});

document.getElementById('btn-close-drawer').addEventListener('click', () => {
    quickAddDrawer.classList.add('translate-x-full');
    setTimeout(() => {
        drawerOverlay.classList.add('hidden');
    }, 300);
});

drawerOverlay.addEventListener('click', () => {
    document.getElementById('btn-close-drawer').click();
});

// Search and Drag Logic for Drawer
const drawerSearch = document.getElementById('drawer-search-products');
const drawerList = document.getElementById('drawer-products-list');
let drawerDraggedItem = null;

function renderDrawerProducts() {
    const term = drawerSearch.value.toLowerCase();
    const matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    drawerList.innerHTML = matches.slice(0, 15).map(i => `
        <div class="p-2 bg-white border border-slate-200 rounded cursor-grab hover:border-orange-400 shadow-sm flex justify-between items-center text-xs" 
             draggable="true" ondragstart="drawerDragStart(event, '${i.id}')">
            <div>
                <div class="font-bold text-slate-800">${i.name}</div>
                <div class="text-slate-500">Ksh ${i.selling_price || 0}</div>
            </div>
        </div>
    `).join('');
}

window.drawerDragStart = (e, id) => {
    drawerDraggedItem = inventory.find(i => i.id === id);
    e.dataTransfer.setData('text/plain', id);
};

drawerSearch.addEventListener('input', renderDrawerProducts);
// Render once when opened
document.getElementById('btn-open-drawer').addEventListener('click', renderDrawerProducts);

let drawerLinkedTiers = { 1: null, 2: null, 3: null };

function setupDrawerDropzone(tierNum) {
    const section = document.getElementById('dqa-section-' + tierNum);
    section.addEventListener('dragover', e => { e.preventDefault(); section.classList.add('bg-orange-100', 'border-orange-400'); });
    section.addEventListener('dragleave', e => { section.classList.remove('bg-orange-100', 'border-orange-400'); });
    section.addEventListener('drop', e => {
        e.preventDefault();
        section.classList.remove('bg-orange-100', 'border-orange-400');
        if (!drawerDraggedItem) return;

        drawerLinkedTiers[tierNum] = drawerDraggedItem;
        
        document.getElementById('dqa-t' + tierNum + '-name').value = drawerDraggedItem.name;
        document.getElementById('dqa-t' + tierNum + '-cp').value = drawerDraggedItem.buying_price || 0;
        document.getElementById('dqa-t' + tierNum + '-sp').value = drawerDraggedItem.selling_price || 0;
        document.getElementById('dqa-t' + tierNum + '-stock').value = drawerDraggedItem.stock_quantity || 0;
        
        document.getElementById('dqa-linked-badge-' + tierNum).classList.remove('hidden');
        
        if (tierNum === 2) {
            document.getElementById('dqa-t2-en').checked = true;
            document.getElementById('dqa-t2-en').dispatchEvent(new Event('change'));
        }
        if (tierNum === 3) {
            document.getElementById('dqa-t3-en').checked = true;
            document.getElementById('dqa-t3-en').dispatchEvent(new Event('change'));
        }
    });
}

setupDrawerDropzone(1);
setupDrawerDropzone(2);
setupDrawerDropzone(3);

document.getElementById('btn-drawer-quick-add').addEventListener('click', async () => {
    const t1Name = document.getElementById('dqa-t1-name').value;
    if (!t1Name) { alert("Tier 1 Name is required."); return; }

    const type = document.getElementById('dqa-type').value;
    const isService = document.getElementById('dqa-svc').checked;
    const btn = document.getElementById('btn-drawer-quick-add');
    btn.innerHTML = 'Saving...'; btn.disabled = true;

    const tiers = [];
    
    if (document.getElementById('dqa-t3-en').checked) {
        tiers.push({
            level: 3, name: document.getElementById('dqa-t3-name').value,
            type, is_service: isService, tier_level: 3,
            buying_price: parseFloat(document.getElementById('dqa-t3-cp').value||0),
            selling_price: parseFloat(document.getElementById('dqa-t3-sp').value||0),
            stock_quantity: parseInt(document.getElementById('dqa-t3-stock').value||0),
            units_per_parent: 1, _my_units: parseInt(document.getElementById('dqa-t3-units').value||1),
            _linked_product: drawerLinkedTiers[3]
        });
    }
    if (document.getElementById('dqa-t2-en').checked) {
        tiers.push({
            level: 2, name: document.getElementById('dqa-t2-name').value,
            type, is_service: isService, tier_level: 2,
            buying_price: parseFloat(document.getElementById('dqa-t2-cp').value||0),
            selling_price: parseFloat(document.getElementById('dqa-t2-sp').value||0),
            stock_quantity: parseInt(document.getElementById('dqa-t2-stock').value||0),
            _my_units: parseInt(document.getElementById('dqa-t2-units').value||1),
            _linked_product: drawerLinkedTiers[2]
        });
    }
    tiers.push({
        level: 1, name: t1Name,
        type, is_service: isService, tier_level: 1,
        buying_price: parseFloat(document.getElementById('dqa-t1-cp').value||0),
        selling_price: parseFloat(document.getElementById('dqa-t1-sp').value||0),
        stock_quantity: parseInt(document.getElementById('dqa-t1-stock').value||0),
        _linked_product: drawerLinkedTiers[1]
    });

    let lastParentId = null;
    try {
        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            const payload = {
                name: t.name, type: t.type, is_service: t.is_service,
                tier_level: t.tier_level, buying_price: t.buying_price,
                selling_price: t.selling_price, stock_quantity: t.stock_quantity,
                parent_id: lastParentId
            };
            if (i > 0) payload.units_per_parent = tiers[i-1]._my_units || 1;
            else payload.units_per_parent = 1;

            if (t._linked_product) {
                const { error } = await supabase.from('inventory').update({
                    parent_id: payload.parent_id,
                    units_per_parent: payload.units_per_parent,
                    name: payload.name,
                    buying_price: payload.buying_price,
                    selling_price: payload.selling_price,
                    stock_quantity: payload.stock_quantity
                }).eq('id', t._linked_product.id);
                if (error) throw new Error("Error linking tier " + t.level + ": " + error.message);
                lastParentId = t._linked_product.id;
                
                // Update local cache
                const idx = inventory.findIndex(inv => inv.id === t._linked_product.id);
                if(idx >= 0) inventory[idx] = { ...inventory[idx], ...payload };
            } else {
                const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
                if (error) throw new Error("Error saving tier " + t.level + ": " + error.message);
                lastParentId = data.id;
                inventory.push(data);
            }
        }

        // Reset form
        document.querySelectorAll('#drawer-quick-add-form input[type="text"]').forEach(el => el.value = '');
        document.querySelectorAll('#drawer-quick-add-form input[type="number"]').forEach(el => el.value = '0');
        document.querySelectorAll('#drawer-quick-add-form input[type="checkbox"]').forEach(el => { el.checked = false; el.dispatchEvent(new Event('change')); });
        document.getElementById('dqa-t2-units').value = '1';
        document.getElementById('dqa-t3-units').value = '1';
        
        drawerLinkedTiers = { 1: null, 2: null, 3: null };
        document.getElementById('dqa-linked-badge-1').classList.add('hidden');
        document.getElementById('dqa-linked-badge-2').classList.add('hidden');
        document.getElementById('dqa-linked-badge-3').classList.add('hidden');

        alert('Products created/linked successfully!');
        
        // Re-render UI pieces dependent on inventory
        inventory.sort((a,b) => a.name.localeCompare(b.name));
        renderQuickAddButtons();
        
        // Close drawer
        document.getElementById('btn-close-drawer').click();

    } catch (err) {
        alert(err.message);
    } finally {
        btn.innerHTML = 'Save Product'; btn.disabled = false;
    }
});
