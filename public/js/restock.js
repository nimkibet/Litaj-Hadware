import { supabase, currentUser, requireAuth } from '/js/supabaseClient.js';
import { showModal } from '/js/uiHelper.js';

// State
let suppliers = [];
let inventory = [];
let purchaseOrders = [];
let restockLogs = [];
let draftPoItems = [];
let selectedSearchProduct = null;
let currentPoNumber = generatePoNumber();

// Initialize
requireAuth();

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initPoGenerator();
    initSupplierManagement();
    initOrderListFilters();
    initRestockLogs();

    // Load initial data
    await Promise.all([
        loadSuppliers(),
        loadInventory(),
        loadPurchaseOrders(),
        loadRestockLogs()
    ]);
});

function generatePoNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PO-${today}-${rand}`;
}

// -------------------------------------------------------------
// TABS HANDLING
// -------------------------------------------------------------
function initTabs() {
    const tabOrders = document.getElementById('tab-orders');
    const tabGenerate = document.getElementById('tab-generate');
    const tabSuppliers = document.getElementById('tab-suppliers');
    const tabLogs = document.getElementById('tab-logs');

    const secOrders = document.getElementById('section-orders');
    const secGenerate = document.getElementById('section-generate');
    const secSuppliers = document.getElementById('section-suppliers');
    const secLogs = document.getElementById('section-logs');

    const allTabs = [tabOrders, tabGenerate, tabSuppliers, tabLogs];
    const allSections = [secOrders, secGenerate, secSuppliers, secLogs];

    function switchTab(activeTab, activeSec) {
        allTabs.forEach(t => {
            t.classList.remove('active', 'text-slate-700');
            t.classList.add('text-slate-500');
        });
        allSections.forEach(s => s.classList.add('hidden'));

        activeTab.classList.add('active', 'text-slate-700');
        activeTab.classList.remove('text-slate-500');
        activeSec.classList.remove('hidden');
    }

    tabOrders.addEventListener('click', () => switchTab(tabOrders, secOrders));
    tabGenerate.addEventListener('click', () => {
        resetPoGenerator();
        switchTab(tabGenerate, secGenerate);
    });
    tabSuppliers.addEventListener('click', () => switchTab(tabSuppliers, secSuppliers));
    tabLogs.addEventListener('click', () => switchTab(tabLogs, secLogs));

    document.getElementById('btn-quick-new-po')?.addEventListener('click', () => {
        resetPoGenerator();
        switchTab(tabGenerate, secGenerate);
    });

    document.getElementById('btn-add-supplier-top')?.addEventListener('click', () => {
        openAddSupplierModal();
    });
}

// -------------------------------------------------------------
// DATA LOADERS
// -------------------------------------------------------------
async function loadSuppliers() {
    try {
        const { data, error } = await supabase.from('suppliers').select('*').order('name');
        if (error) throw error;
        suppliers = data || [];
        renderSuppliersTable();
        populateSupplierSelect();
        const badge = document.getElementById('badge-supplier-count');
        if (badge) badge.textContent = suppliers.length;
    } catch (err) {
        console.error('Error loading suppliers:', err);
    }
}

async function loadInventory() {
    try {
        const { data, error } = await supabase.from('inventory').select('*').order('name');
        if (error) throw error;
        inventory = data || [];
    } catch (err) {
        console.error('Error loading inventory:', err);
    }
}

async function loadPurchaseOrders() {
    try {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select(`
                *,
                purchase_order_items (*)
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        purchaseOrders = data || [];
        renderOrdersTable();

        // Update pending count badge
        const pendingCount = purchaseOrders.filter(p => p.status === 'PENDING' || p.status === 'PARTIAL').length;
        const badge = document.getElementById('badge-pending-count');
        if (badge) {
            badge.textContent = `${pendingCount} Open`;
            badge.classList.toggle('hidden', pendingCount === 0);
        }
    } catch (err) {
        console.error('Error loading purchase orders:', err);
    }
}

async function loadRestockLogs() {
    try {
        const { data, error } = await supabase
            .from('restock_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        restockLogs = data || [];
        renderRestockLogsTable();
    } catch (err) {
        console.error('Error loading restock logs:', err);
    }
}

// -------------------------------------------------------------
// SECTION 1: ORDERS & VERIFICATION TABLE
// -------------------------------------------------------------
function initOrderListFilters() {
    const searchInput = document.getElementById('order-search');
    const statusSelect = document.getElementById('order-status-filter');

    const filter = () => renderOrdersTable();
    searchInput?.addEventListener('input', filter);
    statusSelect?.addEventListener('change', filter);
}

function renderOrdersTable() {
    const tbody = document.getElementById('orders-tbody');
    const searchVal = (document.getElementById('order-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('order-status-filter')?.value || 'ALL';

    const filtered = purchaseOrders.filter(po => {
        const matchesSearch = po.po_number.toLowerCase().includes(searchVal) ||
                              po.supplier_name.toLowerCase().includes(searchVal);
        const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const countLabel = document.getElementById('orders-count-label');
    if (countLabel) countLabel.textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-10 text-slate-400">
                    No purchase orders found matching your filters.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(po => {
        // Delivery status badge
        let delBadge = '';
        if (po.status === 'PENDING') {
            delBadge = '<span class="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Pending Delivery</span>';
        } else if (po.status === 'PARTIAL') {
            delBadge = '<span class="bg-blue-100 text-blue-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Partially Received</span>';
        } else if (po.status === 'RECEIVED') {
            delBadge = '<span class="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Received</span>';
        } else if (po.status === 'COMPLETED') {
            delBadge = '<span class="bg-purple-100 text-purple-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Completed & Cleared</span>';
        } else {
            delBadge = `<span class="bg-slate-100 text-slate-600 text-[11px] font-bold px-2 py-0.5 rounded-full">${po.status}</span>`;
        }

        // Payment status badge
        let payBadge = '';
        if (po.payment_status === 'PAID') {
            payBadge = '<span class="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Fully Paid</span>';
        } else if (po.payment_status === 'PARTIAL') {
            payBadge = '<span class="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Partial Payment</span>';
        } else {
            payBadge = '<span class="bg-red-100 text-red-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full">Unpaid (Credit)</span>';
        }

        const dateFormatted = new Date(po.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        const totalCost = parseFloat(po.total_actual_cost > 0 ? po.total_actual_cost : po.total_expected_cost) || 0;
        const amountPaid = parseFloat(po.amount_paid) || 0;

        const isFullyReceived = po.status === 'RECEIVED' || po.status === 'COMPLETED';

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-4 font-mono font-bold text-slate-900">${po.po_number}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(po.supplier_name)}</td>
                <td class="py-3 px-4 text-slate-500">${dateFormatted}</td>
                <td class="py-3 px-4 text-right font-bold text-slate-900">KSh ${totalCost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-4 text-right font-semibold text-emerald-700">KSh ${amountPaid.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-4 text-center">${delBadge}</td>
                <td class="py-3 px-4 text-center">${payBadge}</td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        ${!isFullyReceived ? `
                            <button data-verify-id="${po.id}" class="btn-verify-order bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                Verify Goods
                            </button>
                        ` : ''}
                        <button data-print-po-id="${po.id}" class="btn-print-po bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg text-xs font-semibold transition" title="Print/Download Invoice PDF">
                            PDF Invoice
                        </button>
                        ${po.payment_status !== 'PAID' ? `
                            <button data-pay-po-id="${po.id}" class="btn-record-po-pay bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-xs font-bold border border-emerald-200 transition">
                                Pay
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners
    tbody.querySelectorAll('.btn-verify-order').forEach(btn => {
        btn.addEventListener('click', () => openVerifyOrderModal(btn.dataset.verifyId));
    });
    tbody.querySelectorAll('.btn-print-po').forEach(btn => {
        btn.addEventListener('click', () => generatePoPdf(btn.dataset.printPoId));
    });
    tbody.querySelectorAll('.btn-record-po-pay').forEach(btn => {
        btn.addEventListener('click', () => openPoPaymentModal(btn.dataset.payPoId));
    });
}

// -------------------------------------------------------------
// VERIFICATION MODAL WITH CHECKBOXES (THE CORE RESTOCK RECEIVE FEATURE)
// -------------------------------------------------------------
async function openVerifyOrderModal(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    // Fetch freshest items
    const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', poId)
        .order('created_at');

    if (error || !items || items.length === 0) {
        alert('Could not load line items for this purchase order.');
        return;
    }

    const itemsRowsHtml = items.map((item, idx) => {
        const isAlreadyVerified = item.is_verified && item.stock_added;
        const initialReceivedQty = item.is_verified ? item.received_qty : item.ordered_qty;
        const initialActualPrice = (item.actual_buying_price > 0) ? item.actual_buying_price : item.expected_buying_price;

        return `
            <tr class="verify-row ${isAlreadyVerified ? 'bg-emerald-50/50' : ''} border-b border-slate-200" data-item-id="${item.id}" data-product-id="${item.product_id || ''}">
                <td class="py-3 px-3 text-center">
                    <input type="checkbox" class="chk-verify-item w-4 h-4 text-orange-600 rounded cursor-pointer" ${isAlreadyVerified ? 'checked disabled' : 'checked'}>
                </td>
                <td class="py-3 px-3">
                    <div class="font-bold text-slate-800 text-xs sm:text-sm">${escapeHtml(item.product_name)}</div>
                    ${isAlreadyVerified ? '<span class="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider">Already in stock</span>' : ''}
                </td>
                <td class="py-3 px-3 text-center font-bold text-slate-700 text-xs sm:text-sm">
                    ${item.ordered_qty}
                </td>
                <td class="py-3 px-3 text-center">
                    <input type="number" min="0" step="1" value="${initialReceivedQty}" class="input-received-qty border border-slate-300 rounded-lg px-2 py-1 text-xs sm:text-sm w-20 text-center font-bold focus:ring-2 focus:ring-orange-500" ${isAlreadyVerified ? 'disabled' : ''}>
                </td>
                <td class="py-3 px-3 text-right text-xs sm:text-sm text-slate-500">
                    KSh ${parseFloat(item.expected_buying_price).toFixed(2)}
                </td>
                <td class="py-3 px-3 text-right">
                    <input type="number" min="0" step="0.5" value="${initialActualPrice}" class="input-actual-price border border-slate-300 rounded-lg px-2 py-1 text-xs sm:text-sm w-24 text-right font-bold focus:ring-2 focus:ring-orange-500" ${isAlreadyVerified ? 'disabled' : ''}>
                </td>
                <td class="py-3 px-3 text-right font-bold text-slate-900 text-xs sm:text-sm line-actual-total">
                    KSh ${(initialReceivedQty * initialActualPrice).toFixed(2)}
                </td>
            </tr>
        `;
    }).join('');

    const modalContent = `
        <div class="space-y-4">
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center text-xs">
                <div>
                    <span class="text-slate-500">Supplier:</span>
                    <strong class="text-slate-800 ml-1">${escapeHtml(po.supplier_name)}</strong>
                </div>
                <div>
                    <span class="text-slate-500">PO Number:</span>
                    <strong class="font-mono text-slate-800 ml-1">${po.po_number}</strong>
                </div>
                <div>
                    <span class="text-slate-500">Amount Paid So Far:</span>
                    <strong class="text-emerald-700 ml-1">KSh ${parseFloat(po.amount_paid).toFixed(2)}</strong>
                </div>
            </div>

            <div class="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                    <thead class="bg-slate-100 text-slate-700 font-bold sticky top-0 uppercase text-[11px]">
                        <tr>
                            <th class="py-2.5 px-3 text-center">Verify</th>
                            <th class="py-2.5 px-3">Item Description</th>
                            <th class="py-2.5 px-3 text-center">Ordered</th>
                            <th class="py-2.5 px-3 text-center">Received Qty</th>
                            <th class="py-2.5 px-3 text-right">Expected Cost</th>
                            <th class="py-2.5 px-3 text-right">Actual Cost</th>
                            <th class="py-2.5 px-3 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody id="verify-items-tbody">
                        ${itemsRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Recalculated Summary -->
            <div class="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center text-sm">
                <div>
                    <span class="text-slate-400 block text-xs">Total Actual Cost of Delivery:</span>
                    <span id="verify-modal-grand-total" class="text-lg font-black text-orange-400">KSh 0.00</span>
                </div>
                <div class="text-right">
                    <span class="text-slate-400 block text-xs">Net Balance Owed to Supplier:</span>
                    <span id="verify-modal-net-balance" class="text-base font-bold text-red-400">KSh 0.00</span>
                </div>
            </div>

            <!-- Optional payment on verification -->
            <div class="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs space-y-2">
                <div class="flex items-center justify-between">
                    <label class="font-bold text-amber-900">Make Payment Now on Delivery?</label>
                    <input type="checkbox" id="chk-verify-pay-now" class="w-4 h-4 text-orange-600 rounded">
                </div>
                <div id="verify-pay-box" class="hidden grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div>
                        <label class="block text-[10px] text-slate-500">Amount to Pay Now (KSh)</label>
                        <input type="number" id="input-verify-pay-amount" min="0" step="1" value="0" class="border border-slate-300 rounded px-2 py-1 text-xs w-full font-bold">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-500">Payment Source</label>
                        <select id="select-verify-pay-source" class="border border-slate-300 rounded px-2 py-1 text-xs w-full bg-white font-semibold">
                            <option value="Cash (From Shelf)">Cash (From Shelf)</option>
                            <option value="MPESA">M-PESA</option>
                            <option value="BANK">Bank Transfer</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-500">Reference / Notes</label>
                        <input type="text" id="input-verify-pay-ref" placeholder="Code / Ref" class="border border-slate-300 rounded px-2 py-1 text-xs w-full">
                    </div>
                </div>
            </div>
        </div>
    `;

    showModal('Verify Goods Received & Update Stock', modalContent, async (closeModal) => {
        // Collect checked rows to verify
        const rows = document.querySelectorAll('#verify-items-tbody tr.verify-row');
        const verifier = (currentUser?.full_name || currentUser?.username || 'Admin');
        let anyUpdated = false;

        for (const row of rows) {
            const chk = row.querySelector('.chk-verify-item');
            if (chk.checked && !chk.disabled) {
                const itemId = row.dataset.itemId;
                const recQty = parseFloat(row.querySelector('.input-received-qty').value) || 0;
                const actPrice = parseFloat(row.querySelector('.input-actual-price').value) || 0;

                const { data, error: rpcErr } = await supabase.rpc('verify_po_item_stock', {
                    p_po_id: poId,
                    p_item_id: itemId,
                    p_received_qty: recQty,
                    p_actual_price: actPrice,
                    p_verifier: verifier
                });

                if (rpcErr) {
                    console.error('Error verifying item:', rpcErr);
                    throw new Error(`Failed to verify item: ${rpcErr.message}`);
                }
                anyUpdated = true;
            }
        }

        // Process payment if entered
        const chkPayNow = document.getElementById('chk-verify-pay-now');
        if (chkPayNow && chkPayNow.checked) {
            const payAmt = parseFloat(document.getElementById('input-verify-pay-amount')?.value) || 0;
            const paySource = document.getElementById('select-verify-pay-source')?.value || 'Cash (From Shelf)';
            const payRef = document.getElementById('input-verify-pay-ref')?.value || '';

            if (payAmt > 0 && po.supplier_id) {
                const { error: payErr } = await supabase.rpc('record_supplier_payment', {
                    p_supplier_id: po.supplier_id,
                    p_po_id: poId,
                    p_amount: payAmt,
                    p_method: paySource,
                    p_reference: payRef,
                    p_notes: 'Payment upon goods verification',
                    p_user: verifier
                });
                if (payErr) console.error('Error recording verification payment:', payErr);
            }
        }

        closeModal();
        await Promise.all([loadPurchaseOrders(), loadInventory(), loadSuppliers(), loadRestockLogs()]);
        alert(anyUpdated ? '✅ Goods verified and stock quantities updated in inventory successfully!' : 'No new items were updated.');
    }, 'Verify & Update Stock', 'max-w-4xl');

    // Attach live recalculation inside the modal
    const updateModalTotals = () => {
        let grandTotal = 0;
        document.querySelectorAll('#verify-items-tbody tr.verify-row').forEach(row => {
            const chk = row.querySelector('.chk-verify-item');
            if (chk.checked) {
                const q = parseFloat(row.querySelector('.input-received-qty').value) || 0;
                const p = parseFloat(row.querySelector('.input-actual-price').value) || 0;
                const lineTot = q * p;
                row.querySelector('.line-actual-total').textContent = `KSh ${lineTot.toFixed(2)}`;
                grandTotal += lineTot;
            }
        });

        const paidSoFar = parseFloat(po.amount_paid) || 0;
        const netOwed = Math.max(0, grandTotal - paidSoFar);

        const gtElem = document.getElementById('verify-modal-grand-total');
        if (gtElem) gtElem.textContent = `KSh ${grandTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

        const netElem = document.getElementById('verify-modal-net-balance');
        if (netElem) netElem.textContent = `KSh ${netOwed.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

        const payInput = document.getElementById('input-verify-pay-amount');
        if (payInput && (!payInput.value || payInput.value === '0')) {
            payInput.value = netOwed.toFixed(2);
        }
    };

    document.querySelectorAll('#verify-items-tbody input').forEach(input => {
        input.addEventListener('input', updateModalTotals);
        input.addEventListener('change', updateModalTotals);
    });

    const chkPayNow = document.getElementById('chk-verify-pay-now');
    chkPayNow?.addEventListener('change', (e) => {
        document.getElementById('verify-pay-box')?.classList.toggle('hidden', !e.target.checked);
    });

    updateModalTotals();
}

// -------------------------------------------------------------
// SECTION 2: GENERATE PURCHASE ORDER (PO BUILDER)
// -------------------------------------------------------------
function initPoGenerator() {
    const poNumElem = document.getElementById('gen-po-number');
    if (poNumElem) poNumElem.textContent = currentPoNumber;

    // Delivery date defaults to tomorrow
    const delivDate = document.getElementById('gen-delivery-date');
    if (delivDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        delivDate.value = tomorrow.toISOString().slice(0, 10);
    }

    // Product search autocomplete
    const searchInput = document.getElementById('po-product-search');
    const resultsBox = document.getElementById('po-search-results');
    const hintBox = document.getElementById('selected-product-hint');

    let debounceTimer;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const term = e.target.value.toLowerCase().trim();
        if (term.length === 0) {
            resultsBox.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            const matches = inventory.filter(p => p.name.toLowerCase().includes(term)).slice(0, 8);
            if (matches.length === 0) {
                resultsBox.innerHTML = '<div class="p-3 text-xs text-slate-400">No matching products found.</div>';
            } else {
                resultsBox.innerHTML = matches.map(p => `
                    <div class="po-search-item p-2.5 hover:bg-orange-50 cursor-pointer flex justify-between items-center text-xs" data-id="${p.id}">
                        <div>
                            <strong class="text-slate-800">${escapeHtml(p.name)}</strong>
                            <span class="text-slate-500 block text-[11px]">Stock: ${p.stock_quantity || 0}</span>
                        </div>
                        <div class="text-right">
                            <span class="font-bold text-slate-900">Cost: KSh ${parseFloat(p.buying_price || 0).toFixed(2)}</span>
                        </div>
                    </div>
                `).join('');

                resultsBox.querySelectorAll('.po-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const prod = inventory.find(p => p.id === item.dataset.id);
                        if (prod) {
                            selectedSearchProduct = prod;
                            searchInput.value = prod.name;
                            document.getElementById('po-add-price').value = prod.buying_price || 0;
                            hintBox.innerHTML = `Selected: <strong>${escapeHtml(prod.name)}</strong> (Current Stock: ${prod.stock_quantity || 0}, Current Cost: KSh ${parseFloat(prod.buying_price || 0).toFixed(2)})`;
                            resultsBox.classList.add('hidden');
                            document.getElementById('po-add-qty').focus();
                        }
                    });
                });
            }
            resultsBox.classList.remove('hidden');
        }, 150);
    });

    // Close search box on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput?.contains(e.target) && !resultsBox?.contains(e.target)) {
            resultsBox?.classList.add('hidden');
        }
    });

    // Add Line Item Button
    document.getElementById('btn-add-line-item')?.addEventListener('click', () => {
        const prodName = searchInput?.value.trim();
        const qty = parseFloat(document.getElementById('po-add-qty')?.value) || 1;
        const price = parseFloat(document.getElementById('po-add-price')?.value) || 0;

        if (!prodName) {
            alert('Please select or enter a product name.');
            return;
        }

        // Add to draft items
        draftPoItems.push({
            productId: selectedSearchProduct ? selectedSearchProduct.id : null,
            productName: prodName,
            orderedQty: qty,
            expectedBuyingPrice: price,
            lineTotal: qty * price
        });

        // Reset input fields
        selectedSearchProduct = null;
        searchInput.value = '';
        document.getElementById('po-add-qty').value = 1;
        document.getElementById('po-add-price').value = '';
        hintBox.innerHTML = '';

        renderDraftPoItems();
    });

    // Prepayment toggle
    const chkPrepayment = document.getElementById('chk-has-prepayment');
    chkPrepayment?.addEventListener('change', (e) => {
        document.getElementById('prepayment-inputs')?.classList.toggle('hidden', !e.target.checked);
    });

    // Quick add supplier modal button in PO generator
    document.getElementById('btn-modal-add-supplier')?.addEventListener('click', () => {
        openAddSupplierModal();
    });

    // Save PO Button
    document.getElementById('btn-save-po')?.addEventListener('click', handleSavePurchaseOrder);
}

function renderDraftPoItems() {
    const tbody = document.getElementById('po-items-tbody');
    if (!tbody) return;

    if (draftPoItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-6 text-slate-400 text-xs">
                    No items added to order yet. Search and add products above.
                </td>
            </tr>
        `;
        updateDraftPoTotals();
        return;
    }

    tbody.innerHTML = draftPoItems.map((item, idx) => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs sm:text-sm">
            <td class="py-2.5 px-3 text-slate-400 font-mono">${idx + 1}</td>
            <td class="py-2.5 px-3 font-semibold text-slate-800">${escapeHtml(item.productName)}</td>
            <td class="py-2.5 px-3 text-center font-bold text-slate-800">${item.orderedQty}</td>
            <td class="py-2.5 px-3 text-right text-slate-700">KSh ${item.expectedBuyingPrice.toFixed(2)}</td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-900">KSh ${item.lineTotal.toFixed(2)}</td>
            <td class="py-2.5 px-3 text-center">
                <button data-remove-idx="${idx}" class="btn-remove-draft text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded">
                    &times;
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-remove-draft').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.removeIdx);
            draftPoItems.splice(idx, 1);
            renderDraftPoItems();
        });
    });

    updateDraftPoTotals();
}

function updateDraftPoTotals() {
    const totalItems = draftPoItems.length;
    const totalUnits = draftPoItems.reduce((sum, item) => sum + item.orderedQty, 0);
    const grandTotal = draftPoItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const itemsElem = document.getElementById('summary-items-count');
    const unitsElem = document.getElementById('summary-units-count');
    const totalElem = document.getElementById('summary-grand-total');

    if (itemsElem) itemsElem.textContent = totalItems;
    if (unitsElem) unitsElem.textContent = totalUnits;
    if (totalElem) totalElem.textContent = `KSh ${grandTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function resetPoGenerator() {
    currentPoNumber = generatePoNumber();
    const poNumElem = document.getElementById('gen-po-number');
    if (poNumElem) poNumElem.textContent = currentPoNumber;

    draftPoItems = [];
    selectedSearchProduct = null;
    const searchInput = document.getElementById('po-product-search');
    if (searchInput) searchInput.value = '';
    const hintBox = document.getElementById('selected-product-hint');
    if (hintBox) hintBox.innerHTML = '';
    const notesBox = document.getElementById('gen-notes');
    if (notesBox) notesBox.value = '';

    const chkPrepayment = document.getElementById('chk-has-prepayment');
    if (chkPrepayment) chkPrepayment.checked = false;
    document.getElementById('prepayment-inputs')?.classList.add('hidden');
    const amtPaid = document.getElementById('gen-amount-paid');
    if (amtPaid) amtPaid.value = 0;
    const payRef = document.getElementById('gen-payment-ref');
    if (payRef) payRef.value = '';

    renderDraftPoItems();
}

async function handleSavePurchaseOrder() {
    const supplierSelect = document.getElementById('gen-supplier-select');
    const supplierId = supplierSelect?.value;
    const supplierObj = suppliers.find(s => s.id === supplierId);

    if (!supplierId || !supplierObj) {
        alert('Please select a supplier for this purchase order.');
        return;
    }

    if (draftPoItems.length === 0) {
        alert('Please add at least one product line item to the order.');
        return;
    }

    const delivDate = document.getElementById('gen-delivery-date')?.value || null;
    const payMethod = document.getElementById('gen-payment-method')?.value || 'CASH';
    const notes = document.getElementById('gen-notes')?.value || '';

    const chkPrepayment = document.getElementById('chk-has-prepayment');
    const amountPaid = (chkPrepayment && chkPrepayment.checked)
        ? (parseFloat(document.getElementById('gen-amount-paid')?.value) || 0)
        : 0;
    const paymentRef = document.getElementById('gen-payment-ref')?.value || '';

    const grandTotal = draftPoItems.reduce((sum, item) => sum + item.lineTotal, 0);

    let paymentStatus = 'UNPAID';
    if (amountPaid >= grandTotal && grandTotal > 0) {
        paymentStatus = 'PAID';
    } else if (amountPaid > 0) {
        paymentStatus = 'PARTIAL';
    }

    const creator = (currentUser?.full_name || currentUser?.username || 'Admin');

    const btnSave = document.getElementById('btn-save-po');
    btnSave.disabled = true;
    btnSave.textContent = 'Saving Purchase Order...';

    try {
        // 1. Insert PO Header
        const poPayload = {
            po_number: currentPoNumber,
            supplier_id: supplierId,
            supplier_name: supplierObj.name,
            status: 'PENDING',
            payment_status: paymentStatus,
            total_expected_cost: grandTotal,
            total_actual_cost: 0.00,
            amount_paid: amountPaid,
            payment_method: payMethod,
            payment_reference: paymentRef,
            notes: notes,
            expected_delivery_date: delivDate,
            created_by: creator
        };

        const { data: newPo, error: poErr } = await supabase
            .from('purchase_orders')
            .insert([poPayload])
            .select()
            .single();

        if (poErr) throw poErr;

        // 2. Insert Line Items
        const itemsPayload = draftPoItems.map(item => ({
            po_id: newPo.id,
            product_id: item.productId,
            product_name: item.productName,
            ordered_qty: item.orderedQty,
            expected_buying_price: item.expectedBuyingPrice,
            received_qty: 0,
            actual_buying_price: 0.00,
            is_verified: false,
            stock_added: false
        }));

        const { error: itemsErr } = await supabase
            .from('purchase_order_items')
            .insert(itemsPayload);

        if (itemsErr) throw itemsErr;

        // 3. If prepayment made, record supplier payment
        if (amountPaid > 0) {
            await supabase.rpc('record_supplier_payment', {
                p_supplier_id: supplierId,
                p_po_id: newPo.id,
                p_amount: amountPaid,
                p_method: payMethod,
                p_reference: paymentRef,
                p_notes: 'Initial prepayment / deposit on PO creation',
                p_user: creator
            });
        }

        alert(`✅ Purchase Order ${newPo.po_number} created successfully!`);
        
        // Ask if they want to download the PDF now
        if (confirm('Do you want to download/print the official PDF Purchase Order now?')) {
            generatePoPdf(newPo.id);
        }

        // Reset and switch to Orders tab
        resetPoGenerator();
        await Promise.all([loadPurchaseOrders(), loadSuppliers()]);
        document.getElementById('tab-orders')?.click();

    } catch (err) {
        console.error('Failed to save PO:', err);
        alert(`Error saving purchase order: ${err.message}`);
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Generate & Save Order
        `;
    }
}

// -------------------------------------------------------------
// SECTION 3: SUPPLIERS DIRECTORY & PAYMENTS
// -------------------------------------------------------------
function initSupplierManagement() {
    document.getElementById('supplier-search')?.addEventListener('input', renderSuppliersTable);
    document.getElementById('btn-open-add-supplier-modal')?.addEventListener('click', openAddSupplierModal);
}

function populateSupplierSelect() {
    const select = document.getElementById('gen-supplier-select');
    if (!select) return;
    const currentVal = select.value;

    select.innerHTML = '<option value="">-- Choose Supplier --</option>' + 
        suppliers.map(s => `
            <option value="${s.id}">${escapeHtml(s.name)} (Balance: KSh ${parseFloat(s.outstanding_balance || 0).toFixed(2)})</option>
        `).join('');

    if (currentVal) select.value = currentVal;
}

function renderSuppliersTable() {
    const tbody = document.getElementById('suppliers-tbody');
    if (!tbody) return;

    const searchVal = (document.getElementById('supplier-search')?.value || '').toLowerCase().trim();
    const filtered = suppliers.filter(s => 
        s.name.toLowerCase().includes(searchVal) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(searchVal)) ||
        (s.phone && s.phone.toLowerCase().includes(searchVal))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-slate-400">
                    No suppliers found. Click "+ New Supplier" to register one.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const bal = parseFloat(s.outstanding_balance || 0);
        let balClass = 'text-slate-800';
        if (bal > 0) balClass = 'text-red-600 font-bold'; // We owe them
        else if (bal < 0) balClass = 'text-emerald-600 font-bold'; // They owe us (credit)

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(s.name)}</td>
                <td class="py-3 px-4 text-slate-700">${escapeHtml(s.contact_person || '-')}</td>
                <td class="py-3 px-4 text-slate-600 font-mono text-xs">${escapeHtml(s.phone || '-')}</td>
                <td class="py-3 px-4 text-slate-500">${escapeHtml(s.address || '-')}</td>
                <td class="py-3 px-4 text-right ${balClass}">KSh ${bal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button data-pay-supplier-id="${s.id}" class="btn-supplier-pay bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold transition">
                            Pay
                        </button>
                        <button data-edit-supplier-id="${s.id}" class="btn-supplier-edit bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded text-xs font-semibold transition">
                            Edit
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-supplier-pay').forEach(btn => {
        btn.addEventListener('click', () => openDirectSupplierPaymentModal(btn.dataset.paySupplierId));
    });

    tbody.querySelectorAll('.btn-supplier-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditSupplierModal(btn.dataset.editSupplierId));
    });
}

function openAddSupplierModal() {
    const content = `
        <div class="space-y-3 text-left">
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Company / Supplier Name *</label>
                <input type="text" id="sup-name" placeholder="e.g. Devki Steel Mills Ltd" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full font-bold focus:ring-2 focus:ring-orange-500">
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">Contact Person</label>
                    <input type="text" id="sup-contact" placeholder="e.g. Sales Rep Name" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                    <input type="text" id="sup-phone" placeholder="07XXXXXXXX" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                <input type="email" id="sup-email" placeholder="sales@supplier.com" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Physical Address / City</label>
                <input type="text" id="sup-address" placeholder="e.g. Industrial Area, Nairobi" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea id="sup-notes" rows="2" placeholder="e.g. 14 days credit terms" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full"></textarea>
            </div>
        </div>
    `;

    showModal('Register New Supplier', content, async (closeModal) => {
        const name = document.getElementById('sup-name')?.value.trim();
        if (!name) throw new Error('Supplier name is required.');

        const contact = document.getElementById('sup-contact')?.value.trim();
        const phone = document.getElementById('sup-phone')?.value.trim();
        const email = document.getElementById('sup-email')?.value.trim();
        const address = document.getElementById('sup-address')?.value.trim();
        const notes = document.getElementById('sup-notes')?.value.trim();

        const { error } = await supabase.from('suppliers').insert([{
            name,
            contact_person: contact,
            phone,
            email,
            address,
            notes,
            outstanding_balance: 0.00
        }]);

        if (error) throw error;
        closeModal();
        await loadSuppliers();
    }, 'Save Supplier');
}

function openEditSupplierModal(supplierId) {
    const s = suppliers.find(x => x.id === supplierId);
    if (!s) return;

    const content = `
        <div class="space-y-3 text-left">
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Company / Supplier Name *</label>
                <input type="text" id="sup-name" value="${escapeHtml(s.name)}" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full font-bold focus:ring-2 focus:ring-orange-500">
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">Contact Person</label>
                    <input type="text" id="sup-contact" value="${escapeHtml(s.contact_person || '')}" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                    <input type="text" id="sup-phone" value="${escapeHtml(s.phone || '')}" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                <input type="email" id="sup-email" value="${escapeHtml(s.email || '')}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Physical Address / City</label>
                <input type="text" id="sup-address" value="${escapeHtml(s.address || '')}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Notes / Terms</label>
                <textarea id="sup-notes" rows="2" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">${escapeHtml(s.notes || '')}</textarea>
            </div>
        </div>
    `;

    showModal('Edit Supplier Details', content, async (closeModal) => {
        const name = document.getElementById('sup-name')?.value.trim();
        if (!name) throw new Error('Supplier name is required.');

        const contact = document.getElementById('sup-contact')?.value.trim();
        const phone = document.getElementById('sup-phone')?.value.trim();
        const email = document.getElementById('sup-email')?.value.trim();
        const address = document.getElementById('sup-address')?.value.trim();
        const notes = document.getElementById('sup-notes')?.value.trim();

        const { error } = await supabase.from('suppliers').update({
            name,
            contact_person: contact,
            phone,
            email,
            address,
            notes
        }).eq('id', supplierId);

        if (error) throw error;
        closeModal();
        await loadSuppliers();
    }, 'Update Supplier');
}

function openDirectSupplierPaymentModal(supplierId) {
    const s = suppliers.find(x => x.id === supplierId);
    if (!s) return;

    const currentBal = parseFloat(s.outstanding_balance || 0);

    const content = `
        <div class="space-y-3 text-left">
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span class="text-xs text-slate-500">Supplier:</span>
                <strong class="text-sm text-slate-800 ml-1 block">${escapeHtml(s.name)}</strong>
                <span class="text-xs text-slate-500 mt-1 block">Current Debt Owed: 
                    <strong class="${currentBal > 0 ? 'text-red-600' : 'text-slate-800'}">
                        KSh ${currentBal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </strong>
                </span>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Payment Amount (KSh) *</label>
                <input type="number" id="pay-amt" min="1" step="1" value="${currentBal > 0 ? currentBal : ''}" placeholder="0.00" class="border border-slate-300 rounded-lg px-3 py-2 text-base font-black w-full text-right focus:ring-2 focus:ring-emerald-500">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select id="pay-method" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white font-semibold">
                    <option value="Cash (From Shelf)">Cash (From Shelf / Drawer)</option>
                    <option value="MPESA">M-PESA</option>
                    <option value="BANK">Bank Transfer (EFT/RTGS)</option>
                    <option value="CHEQUE">Cheque</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Reference Number / Code</label>
                <input type="text" id="pay-ref" placeholder="e.g. M-PESA Code / Chq No" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea id="pay-notes" rows="2" placeholder="e.g. Partial debt settlement" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full"></textarea>
            </div>
        </div>
    `;

    showModal('Record Payment to Supplier', content, async (closeModal) => {
        const amt = parseFloat(document.getElementById('pay-amt')?.value) || 0;
        if (amt <= 0) throw new Error('Payment amount must be greater than zero.');

        const method = document.getElementById('pay-method')?.value || 'Cash (From Shelf)';
        const ref = document.getElementById('pay-ref')?.value || '';
        const notes = document.getElementById('pay-notes')?.value || '';
        const user = (currentUser?.full_name || currentUser?.username || 'Admin');

        const { error } = await supabase.rpc('record_supplier_payment', {
            p_supplier_id: supplierId,
            p_po_id: null,
            p_amount: amt,
            p_method: method,
            p_reference: ref,
            p_notes: notes,
            p_user: user
        });

        if (error) throw error;
        closeModal();
        await Promise.all([loadSuppliers(), loadPurchaseOrders()]);
        alert(`✅ Payment of KSh ${amt.toLocaleString('en-KE', { minimumFractionDigits: 2 })} recorded to ${s.name}!`);
    }, 'Record Payment');
}

function openPoPaymentModal(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    const totalCost = parseFloat(po.total_actual_cost > 0 ? po.total_actual_cost : po.total_expected_cost) || 0;
    const paidSoFar = parseFloat(po.amount_paid) || 0;
    const balanceDue = Math.max(0, totalCost - paidSoFar);

    const content = `
        <div class="space-y-3 text-left">
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>Supplier: <strong class="text-slate-800">${escapeHtml(po.supplier_name)}</strong></div>
                <div>PO Number: <strong class="font-mono text-slate-800">${po.po_number}</strong></div>
                <div>Total Cost: <strong>KSh ${totalCost.toFixed(2)}</strong></div>
                <div>Paid So Far: <strong class="text-emerald-700">KSh ${paidSoFar.toFixed(2)}</strong></div>
                <div class="mt-1 pt-1 border-t border-slate-200">Balance Due: <strong class="text-red-600 text-sm">KSh ${balanceDue.toFixed(2)}</strong></div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Payment Amount (KSh) *</label>
                <input type="number" id="po-pay-amt" min="1" step="1" value="${balanceDue > 0 ? balanceDue : ''}" class="border border-slate-300 rounded-lg px-3 py-2 text-base font-black w-full text-right focus:ring-2 focus:ring-emerald-500">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select id="po-pay-method" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white font-semibold">
                    <option value="Cash (From Shelf)">Cash (From Shelf)</option>
                    <option value="MPESA">M-PESA</option>
                    <option value="BANK">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Reference / Code</label>
                <input type="text" id="po-pay-ref" placeholder="Code / Ref" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full">
            </div>
        </div>
    `;

    showModal(`Record Payment for ${po.po_number}`, content, async (closeModal) => {
        const amt = parseFloat(document.getElementById('po-pay-amt')?.value) || 0;
        if (amt <= 0) throw new Error('Payment amount must be greater than zero.');

        const method = document.getElementById('po-pay-method')?.value || 'Cash (From Shelf)';
        const ref = document.getElementById('po-pay-ref')?.value || '';
        const user = (currentUser?.full_name || currentUser?.username || 'Admin');

        const { error } = await supabase.rpc('record_supplier_payment', {
            p_supplier_id: po.supplier_id,
            p_po_id: poId,
            p_amount: amt,
            p_method: method,
            p_reference: ref,
            p_notes: `Payment for purchase order ${po.po_number}`,
            p_user: user
        });

        if (error) throw error;
        closeModal();
        await Promise.all([loadPurchaseOrders(), loadSuppliers()]);
        alert(`✅ Payment of KSh ${amt.toLocaleString('en-KE', { minimumFractionDigits: 2 })} recorded for ${po.po_number}!`);
    }, 'Pay Order');
}

// -------------------------------------------------------------
// SECTION 4: RESTOCK HISTORY LOG & EXCEL EXPORT
// -------------------------------------------------------------
function initRestockLogs() {
    document.getElementById('log-search')?.addEventListener('input', renderRestockLogsTable);
    document.getElementById('btn-export-restock-logs')?.addEventListener('click', exportRestockLogsExcel);
}

function renderRestockLogsTable() {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;

    const searchVal = (document.getElementById('log-search')?.value || '').toLowerCase().trim();
    const filtered = restockLogs.filter(l =>
        l.product_name.toLowerCase().includes(searchVal) ||
        (l.po_number && l.po_number.toLowerCase().includes(searchVal)) ||
        (l.supplier_name && l.supplier_name.toLowerCase().includes(searchVal)) ||
        (l.verified_by && l.verified_by.toLowerCase().includes(searchVal))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-400">
                    No restock history logs found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(log => {
        const timeFormatted = new Date(log.created_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-2.5 px-4 text-slate-500 font-mono text-xs">${timeFormatted}</td>
                <td class="py-2.5 px-4 font-mono font-bold text-slate-700">${escapeHtml(log.po_number || '-')}</td>
                <td class="py-2.5 px-4 text-slate-700">${escapeHtml(log.supplier_name || '-')}</td>
                <td class="py-2.5 px-4 font-bold text-slate-900">${escapeHtml(log.product_name)}</td>
                <td class="py-2.5 px-4 text-right font-extrabold text-emerald-700">+${log.quantity_added}</td>
                <td class="py-2.5 px-4 text-right font-semibold text-slate-800">KSh ${parseFloat(log.unit_cost).toFixed(2)}</td>
                <td class="py-2.5 px-4 text-center font-mono text-xs text-slate-600">${log.previous_stock} &rarr; <strong class="text-slate-900">${log.new_stock}</strong></td>
                <td class="py-2.5 px-4 text-slate-600 text-xs">${escapeHtml(log.verified_by || 'Admin')}</td>
            </tr>
        `;
    }).join('');
}

function exportRestockLogsExcel() {
    if (!window.XLSX) {
        alert('Excel export library not loaded.');
        return;
    }

    if (restockLogs.length === 0) {
        alert('No restock logs to export.');
        return;
    }

    const data = restockLogs.map(l => ({
        'Timestamp': new Date(l.created_at).toLocaleString(),
        'PO Number': l.po_number || '',
        'Supplier': l.supplier_name || '',
        'Product Name': l.product_name,
        'Qty Added': l.quantity_added,
        'Unit Cost (KSh)': l.unit_cost,
        'Previous Stock': l.previous_stock,
        'New Stock': l.new_stock,
        'Verified By': l.verified_by || 'Admin'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Restock History');
    XLSX.writeFile(wb, `Litaj_Hardware_Restock_History_${Date.now()}.xlsx`);
}

// -------------------------------------------------------------
// PDF PURCHASE ORDER & INVOICE GENERATOR (OFFICIAL SUPPLIER DOC)
// -------------------------------------------------------------
async function generatePoPdf(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    // Fetch freshest items
    const { data: items } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', poId)
        .order('created_at');

    if (!items || items.length === 0) {
        alert('This purchase order has no items to display.');
        return;
    }

    const supplier = suppliers.find(s => s.id === po.supplier_id) || {
        name: po.supplier_name,
        contact_person: '',
        phone: '',
        address: ''
    };

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('PDF generator library is loading. Please try again.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const primaryColor = [234, 88, 12]; // #ea580c orange
    const darkSlate = [30, 41, 59];    // #1e293b slate

    // --- Header Banner ---
    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.rect(0, 0, 210, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('LITAJ HARDWARE STORE', 14, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Premium Building Materials, Timber & Hardware Supplies', 14, 21);
    doc.text('Tel: +254 700 000 000 | Email: orders@litajhardware.co.ke', 14, 25);

    // Title on right of banner
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('PURCHASE ORDER', 196, 15, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(po.po_number, 196, 22, { align: 'right' });

    // --- Details Box ---
    let y = 38;

    // Supplier Info (Left)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, 88, 30, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 88, 30, 2, 2, 'D');

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SUPPLIER / VENDOR:', 18, y + 6);

    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setFontSize(10);
    doc.text(supplier.name, 18, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (supplier.contact_person) doc.text(`Attn: ${supplier.contact_person}`, 18, y + 17);
    if (supplier.phone) doc.text(`Phone: ${supplier.phone}`, 18, y + 21);
    if (supplier.address) doc.text(`Address: ${supplier.address}`, 18, y + 25);

    // Order Info (Right)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(108, y, 88, 30, 2, 2, 'F');
    doc.roundedRect(108, y, 88, 30, 2, 2, 'D');

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('ORDER SPECIFICATIONS:', 112, y + 6);

    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Date Created: ${new Date(po.created_at).toLocaleDateString('en-GB')}`, 112, y + 12);
    doc.text(`Expected Delivery: ${po.expected_delivery_date || 'Prompt Delivery'}`, 112, y + 17);
    doc.text(`Payment Terms: ${po.payment_method || 'Cash / Invoice'}`, 112, y + 21);
    doc.text(`Order Status: ${po.status} | Payment: ${po.payment_status}`, 112, y + 25);

    // --- Line Items Table ---
    y = 75;

    // Header row
    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.rect(14, y, 182, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('#', 18, y + 5);
    doc.text('ITEM DESCRIPTION', 30, y + 5);
    doc.text('ORDERED QTY', 115, y + 5, { align: 'center' });
    doc.text('EXPECTED UNIT COST', 150, y + 5, { align: 'right' });
    doc.text('TOTAL COST (KSH)', 190, y + 5, { align: 'right' });

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

    let grandTotal = 0;
    items.forEach((item, index) => {
        const unitCost = parseFloat(item.actual_buying_price > 0 ? item.actual_buying_price : item.expected_buying_price) || 0;
        const qty = item.is_verified ? item.received_qty : item.ordered_qty;
        const lineTot = qty * unitCost;
        grandTotal += lineTot;

        if (index % 2 === 0) {
            doc.setFillColor(250, 250, 250);
            doc.rect(14, y, 182, 6.5, 'F');
        }

        doc.setFontSize(8);
        doc.text(String(index + 1), 18, y + 4.5);
        doc.text(item.product_name.substring(0, 48), 30, y + 4.5);
        doc.text(String(qty), 115, y + 4.5, { align: 'center' });
        doc.text(unitCost.toFixed(2), 150, y + 4.5, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(lineTot.toFixed(2), 190, y + 4.5, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        y += 6.5;

        // Page break safety
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
    });

    // Bottom line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, 196, y);
    y += 4;

    // --- Summary & Signatures ---
    const summaryX = 125;
    doc.setFillColor(248, 250, 252);
    doc.rect(summaryX, y, 71, 26, 'F');
    doc.rect(summaryX, y, 71, 26, 'D');

    doc.setFontSize(8.5);
    doc.text('Subtotal:', summaryX + 4, y + 6);
    doc.text(`KSh ${grandTotal.toFixed(2)}`, 192, y + 6, { align: 'right' });

    doc.text('Amount Paid:', summaryX + 4, y + 12);
    doc.setTextColor(16, 185, 129); // green
    doc.text(`KSh ${parseFloat(po.amount_paid).toFixed(2)}`, 192, y + 12, { align: 'right' });

    const balanceDue = Math.max(0, grandTotal - parseFloat(po.amount_paid));
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Balance Due:', summaryX + 4, y + 20);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`KSh ${balanceDue.toFixed(2)}`, 192, y + 20, { align: 'right' });

    // Notes on left
    if (po.notes) {
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Special Instructions / Site Notes:', 14, y + 6);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.text(doc.splitTextToSize(po.notes, 100), 14, y + 11);
    }

    // Signatures Block
    y += 42;
    doc.setDrawColor(180, 180, 180);
    doc.line(14, y, 80, y);
    doc.line(130, y, 196, y);

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Authorized Signatory (Litaj Hardware - ${po.created_by})`, 14, y + 4);
    doc.text('Supplier / Carrier Acknowledgment & Stamp', 130, y + 4);

    // Save/Download PDF
    doc.save(`${po.po_number}_Litaj_Hardware_PO.pdf`);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}
