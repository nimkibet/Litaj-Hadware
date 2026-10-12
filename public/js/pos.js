import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { insertSaleWithOfflineSupport, syncOfflineSales } from './offlineQueue.js';

requireAuth();

// ====================================================================
// STATE
// ====================================================================
let inventory = [];
let customers = [];
let cart = [];
let todaysSales = [];
let activeCategory = 'ALL';
let activePaymentMethod = 'Cash';

// Navigation User Display
if (currentUser) {
    const nameEl = document.getElementById('nav-user-name');
    const roleEl = document.getElementById('nav-user-role');
    if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;
    if (roleEl) roleEl.textContent = currentUser.role || 'Staff';
}

// Mobile menu toggle
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('mobile-menu')?.classList.toggle('hidden');
});
document.getElementById('btn-logout-mobile')?.addEventListener('click', () => {
    document.getElementById('btn-logout')?.click();
});

// ====================================================================
// 1. INVENTORY LOADING & LIVE CATALOG
// ====================================================================
async function loadInventory() {
    try {
        const productCountLabel = document.getElementById('product-count-label');
        if (productCountLabel) productCountLabel.textContent = 'Loading...';

        if (navigator.onLine) {
            const { data, error } = await supabase.from('inventory').select('*').order('name');
            if (error) throw error;
            inventory = data || [];
            localStorage.setItem('litaj_inventory_cache', JSON.stringify(inventory));
        } else {
            inventory = JSON.parse(localStorage.getItem('litaj_inventory_cache') || '[]');
        }

        renderCatalog();
    } catch (err) {
        console.warn('Failed to load inventory online, using cache:', err.message);
        inventory = JSON.parse(localStorage.getItem('litaj_inventory_cache') || '[]');
        renderCatalog();
    }
}

function renderCatalog() {
    const tbody = document.getElementById('products-tbody');
    const searchTerm = (document.getElementById('pos-search')?.value || '').trim().toLowerCase();
    const countLabel = document.getElementById('product-count-label');

    let filtered = inventory.filter(item => {
        // Category filter
        const matchCat = activeCategory === 'ALL' || 
            (item.category && item.category.toLowerCase() === activeCategory.toLowerCase());

        // Search filter
        const matchSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) ||
            (item.category && item.category.toLowerCase().includes(searchTerm)) ||
            (item.barcode && item.barcode.toLowerCase().includes(searchTerm));

        return matchCat && matchSearch;
    });

    if (countLabel) {
        countLabel.textContent = `${filtered.length} of ${inventory.length} items`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400 font-medium">
                    <div class="text-3xl mb-1">🔍</div>
                    <div>No hardware products found matching "${searchTerm}"</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        // Stock badge color
        let stockBadge = '';
        if (item.is_service) {
            stockBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">Service</span>`;
        } else if (item.stock_quantity <= 0) {
            stockBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">Out of Stock</span>`;
        } else if (item.stock_quantity <= (item.min_threshold || 10)) {
            stockBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">${item.stock_quantity} left</span>`;
        } else {
            stockBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">${item.stock_quantity} in stock</span>`;
        }

        const barcodeDisplay = item.barcode ? `<span class="font-mono text-xs text-slate-400">${item.barcode}</span>` : '<span class="text-slate-300">-</span>';

        return `
            <tr class="product-row transition border-b border-slate-100" data-id="${item.id}">
                <td class="py-3 px-3">
                    <div class="font-bold text-slate-900 leading-tight">${item.name}</div>
                    <div class="text-[11px] text-slate-400">${barcodeDisplay}</div>
                </td>
                <td class="py-3 px-3">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">${item.category || 'General'}</span>
                </td>
                <td class="py-3 px-3 text-right font-black text-slate-900 text-sm">
                    KSh ${parseFloat(item.selling_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="py-3 px-3 text-center">
                    ${stockBadge}
                </td>
                <td class="py-3 px-3 text-center">
                    <button class="btn-add-item px-3 py-1.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold rounded-lg text-xs transition shadow-sm" data-id="${item.id}">
                        + Add
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach click events
    tbody.querySelectorAll('.product-row').forEach(row => {
        row.addEventListener('click', (e) => {
            // Avoid double trigger if add button clicked
            if (e.target.closest('.btn-add-item')) return;
            const id = row.dataset.id;
            const item = inventory.find(i => i.id === id);
            if (item) addToCart(item, 1);
        });
    });

    tbody.querySelectorAll('.btn-add-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const item = inventory.find(i => i.id === id);
            if (item) addToCart(item, 1);
        });
    });
}

// Search input handling
const searchInput = document.getElementById('pos-search');
const btnClearSearch = document.getElementById('btn-clear-search');

searchInput?.addEventListener('input', () => {
    if (btnClearSearch) {
        btnClearSearch.classList.toggle('hidden', !searchInput.value.trim());
    }
    renderCatalog();
});

btnClearSearch?.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.classList.add('hidden');
    searchInput.focus();
    renderCatalog();
});

document.getElementById('btn-refresh-inv')?.addEventListener('click', loadInventory);

// Category Chips Filtering
document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => {
            c.classList.remove('bg-orange-600', 'text-white', 'shadow-sm');
            c.classList.add('bg-slate-100', 'text-slate-700');
        });
        chip.classList.add('bg-orange-600', 'text-white', 'shadow-sm');
        chip.classList.remove('bg-slate-100', 'text-slate-700');
        activeCategory = chip.dataset.category;
        renderCatalog();
    });
});

// Quick Barcode Entry in Footer
document.getElementById('btn-quick-barcode-add')?.addEventListener('click', handleBarcodeQuickAdd);
document.getElementById('quick-barcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleBarcodeQuickAdd();
});

function handleBarcodeQuickAdd() {
    const barcodeInput = document.getElementById('quick-barcode');
    const qtyInput = document.getElementById('quick-barcode-qty');
    const code = barcodeInput.value.trim().toLowerCase();
    const qty = parseInt(qtyInput.value) || 1;

    if (!code) return;

    // Match by barcode, or name if barcode not found
    const match = inventory.find(i => 
        (i.barcode && i.barcode.toLowerCase() === code) || 
        i.name.toLowerCase() === code ||
        i.name.toLowerCase().includes(code)
    );

    if (match) {
        addToCart(match, qty);
        barcodeInput.value = '';
        qtyInput.value = '1';
        barcodeInput.focus();
    } else {
        alert(`No product found matching code or name: "${code}"`);
    }
}

// ====================================================================
// 2. CART MANAGEMENT (VEGAS POS LOGIC)
// ====================================================================
function addToCart(product, qtyToAdd = 1) {
    const existingIndex = cart.findIndex(c => c.id === product.id);

    if (existingIndex > -1) {
        cart[existingIndex].qty += qtyToAdd;
        cart[existingIndex].total = cart[existingIndex].qty * cart[existingIndex].selling_price;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            category: product.category || 'General',
            selling_price: parseFloat(product.selling_price || 0),
            buying_price: parseFloat(product.buying_price || 0),
            stock_quantity: product.stock_quantity,
            is_service: product.is_service,
            barcode: product.barcode,
            qty: qtyToAdd,
            total: qtyToAdd * parseFloat(product.selling_price || 0)
        });
    }

    renderCart();
}

function updateCartQty(productId, newQty) {
    const idx = cart.findIndex(c => c.id === productId);
    if (idx === -1) return;

    if (newQty <= 0) {
        cart.splice(idx, 1);
    } else {
        cart[idx].qty = newQty;
        cart[idx].total = cart[idx].qty * cart[idx].selling_price;
    }
    renderCart();
}

function removeCartItem(productId) {
    cart = cart.filter(c => c.id !== productId);
    renderCart();
}

function clearCart() {
    if (cart.length === 0) return;
    if (confirm('Are you sure you want to clear the entire cart?')) {
        cart = [];
        renderCart();
    }
}

document.getElementById('btn-clear-cart')?.addEventListener('click', clearCart);

function renderCart() {
    const tbody = document.getElementById('cart-tbody');
    const badge = document.getElementById('cart-item-count-badge');
    const subtotalEl = document.getElementById('lbl-subtotal');
    const grandTotalEl = document.getElementById('lbl-grand-total');
    const discountInput = document.getElementById('cart-discount');
    const discountValEl = document.getElementById('lbl-discount-val');

    let totalItems = 0;
    let subtotal = 0;

    cart.forEach(item => {
        totalItems += item.qty;
        subtotal += item.total;
    });

    const discount = parseFloat(discountInput?.value || 0) || 0;
    const grandTotal = Math.max(0, subtotal - discount);

    if (badge) badge.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    if (subtotalEl) subtotalEl.textContent = `KSh ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (discountValEl) discountValEl.textContent = `- KSh ${discount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (grandTotalEl) grandTotalEl.textContent = `KSh ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (cart.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-400 font-medium">
                    <div class="text-4xl mb-2">🛒</div>
                    <div class="font-bold text-slate-600">Cart is empty</div>
                    <div class="text-xs mt-1">Select products on the left or scan barcode</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = cart.map(item => `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="py-2.5 px-2">
                <div class="font-bold text-slate-800 text-xs leading-tight">${item.name}</div>
                <div class="text-[10px] text-slate-400 font-medium">${item.category}</div>
            </td>
            <td class="py-2.5 px-2 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button class="cart-qty-minus w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center transition" data-id="${item.id}">-</button>
                    <input type="number" min="1" value="${item.qty}" class="cart-qty-input w-11 h-6 text-center border border-slate-300 rounded font-bold text-xs focus:ring-1 focus:ring-orange-500" data-id="${item.id}">
                    <button class="cart-qty-plus w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-xs flex items-center justify-center transition" data-id="${item.id}">+</button>
                </div>
            </td>
            <td class="py-2.5 px-2 text-right text-xs font-semibold text-slate-600">
                ${item.selling_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </td>
            <td class="py-2.5 px-2 text-right text-xs font-black text-slate-900">
                ${item.total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </td>
            <td class="py-2.5 px-1 text-center">
                <button class="cart-del-btn text-slate-400 hover:text-red-600 font-black text-base px-1 leading-none transition" data-id="${item.id}">&times;</button>
            </td>
        </tr>
    `).join('');

    // Attach Cart Action Listeners
    tbody.querySelectorAll('.cart-qty-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const itm = cart.find(c => c.id === id);
            if (itm) updateCartQty(id, itm.qty - 1);
        });
    });

    tbody.querySelectorAll('.cart-qty-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const itm = cart.find(c => c.id === id);
            if (itm) updateCartQty(id, itm.qty + 1);
        });
    });

    tbody.querySelectorAll('.cart-qty-input').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.id;
            const val = parseInt(input.value) || 1;
            updateCartQty(id, Math.max(1, val));
        });
    });

    tbody.querySelectorAll('.cart-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            removeCartItem(btn.dataset.id);
        });
    });
}

document.getElementById('cart-discount')?.addEventListener('input', renderCart);

// ====================================================================
// 3. CART HOLD & RECALL (Vegas POS Feature)
// ====================================================================
document.getElementById('btn-hold-cart')?.addEventListener('click', () => {
    if (cart.length === 0) return alert('Cart is empty.');
    
    const held = JSON.parse(localStorage.getItem('litaj_held_carts') || '[]');
    const heldCart = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString(),
        cashier: currentUser ? currentUser.username : 'staff',
        items: [...cart]
    };
    held.push(heldCart);
    localStorage.setItem('litaj_held_carts', JSON.stringify(held));
    cart = [];
    renderCart();
    alert('Cart placed on HOLD.');
});

document.getElementById('btn-recall-cart')?.addEventListener('click', () => {
    const held = JSON.parse(localStorage.getItem('litaj_held_carts') || '[]');
    const modal = document.getElementById('modal-held-carts');
    const container = document.getElementById('held-carts-list');

    if (held.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">No held carts currently saved</div>';
    } else {
        container.innerHTML = held.map(h => {
            const sum = h.items.reduce((acc, i) => acc + i.total, 0);
            return `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center hover:bg-orange-50 transition">
                    <div>
                        <div class="text-xs font-bold text-slate-800">${h.timestamp} (${h.cashier})</div>
                        <div class="text-[11px] text-slate-500">${h.items.length} items • Total: KSh ${sum.toFixed(2)}</div>
                    </div>
                    <div class="flex gap-1.5">
                        <button class="btn-restore-held px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg text-xs" data-id="${h.id}">Restore</button>
                        <button class="btn-discard-held px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg text-xs" data-id="${h.id}">&times;</button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-restore-held').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const found = held.find(h => h.id === id);
                if (found) {
                    if (cart.length > 0 && !confirm('Overwriting current active cart. Proceed?')) return;
                    cart = found.items;
                    renderCart();
                    const filtered = held.filter(h => h.id !== id);
                    localStorage.setItem('litaj_held_carts', JSON.stringify(filtered));
                    modal.classList.add('hidden');
                }
            });
        });

        container.querySelectorAll('.btn-discard-held').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const filtered = held.filter(h => h.id !== id);
                localStorage.setItem('litaj_held_carts', JSON.stringify(filtered));
                document.getElementById('btn-recall-cart').click();
            });
        });
    }

    modal.classList.remove('hidden');
});

// ====================================================================
// 4. VEGAS CHECKOUT MODAL & PAYMENT WORKFLOW
// ====================================================================
const checkoutModal = document.getElementById('modal-checkout');
const btnOpenCheckout = document.getElementById('btn-open-checkout');
const btnCloseCheckout = document.getElementById('btn-close-checkout');
const btnCancelCheckout = document.getElementById('btn-cancel-checkout');
const btnSubmitFinalSale = document.getElementById('btn-submit-final-sale');

btnOpenCheckout?.addEventListener('click', openCheckout);
btnCloseCheckout?.addEventListener('click', () => checkoutModal.classList.add('hidden'));
btnCancelCheckout?.addEventListener('click', () => checkoutModal.classList.add('hidden'));

function getCartGrandTotal() {
    const subtotal = cart.reduce((acc, i) => acc + i.total, 0);
    const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
    return Math.max(0, subtotal - discount);
}

function openCheckout() {
    if (cart.length === 0) return alert('Your cart is empty. Please add items before checking out.');

    const grandTotal = getCartGrandTotal();
    const totalDueEl = document.getElementById('checkout-total-due');
    if (totalDueEl) totalDueEl.textContent = `KSh ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    // Reset payment method to Cash
    selectPaymentMethod('Cash');

    // Auto-fill cash tendered with grand total
    const cashInput = document.getElementById('cash-tendered-input');
    if (cashInput) {
        cashInput.value = grandTotal;
        calculateCashChange();
    }

    // Load customers for debt dropdown
    loadCustomersDropdown();

    document.getElementById('checkout-error-msg')?.classList.add('hidden');
    checkoutModal.classList.remove('hidden');

    setTimeout(() => {
        cashInput?.select();
        cashInput?.focus();
    }, 100);
}

// Payment Method Selection Tabs
document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectPaymentMethod(btn.dataset.method);
    });
});

function selectPaymentMethod(method) {
    activePaymentMethod = method;

    // Toggle button active states
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        if (btn.dataset.method === method) {
            btn.className = "pay-method-btn active py-3 px-3 rounded-xl border-2 border-orange-600 bg-orange-50 text-orange-700 font-bold text-sm transition flex flex-col items-center gap-1 shadow-sm";
        } else {
            btn.className = "pay-method-btn py-3 px-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:border-slate-300 transition flex flex-col items-center gap-1";
        }
    });

    // Toggle panel visibility
    document.querySelectorAll('.pay-panel').forEach(p => p.classList.add('hidden'));

    if (method === 'Cash') {
        document.getElementById('checkout-panel-cash')?.classList.remove('hidden');
        document.getElementById('cash-tendered-input')?.focus();
    } else if (method === 'M-Pesa') {
        document.getElementById('checkout-panel-mpesa')?.classList.remove('hidden');
        document.getElementById('mpesa-code-input')?.focus();
    } else if (method === 'Split') {
        document.getElementById('checkout-panel-split')?.classList.remove('hidden');
        const grandTotal = getCartGrandTotal();
        const splitCash = document.getElementById('split-cash-input');
        const splitMpesa = document.getElementById('split-mpesa-input');
        if (splitCash && splitMpesa) {
            splitCash.value = Math.floor(grandTotal / 2);
            splitMpesa.value = grandTotal - parseFloat(splitCash.value);
            calculateSplitBalance();
        }
    } else if (method === 'Debt') {
        document.getElementById('checkout-panel-debt')?.classList.remove('hidden');
    }
}

// Cash Change Calculation & Denomination Chips
const cashTenderedInput = document.getElementById('cash-tendered-input');
cashTenderedInput?.addEventListener('input', calculateCashChange);

function calculateCashChange() {
    const grandTotal = getCartGrandTotal();
    const tendered = parseFloat(cashTenderedInput?.value || 0) || 0;
    const change = tendered - grandTotal;
    const changeLabel = document.getElementById('cash-change-label');

    if (!changeLabel) return;

    if (change >= 0) {
        changeLabel.textContent = `KSh ${change.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        changeLabel.className = "text-2xl font-black text-emerald-600 mt-0.5";
    } else {
        const remaining = Math.abs(change);
        changeLabel.textContent = `Deficit: -KSh ${remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        changeLabel.className = "text-2xl font-black text-red-600 mt-0.5";
    }
}

document.querySelectorAll('.denom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const val = chip.dataset.val;
        const grandTotal = getCartGrandTotal();
        if (val === 'exact') {
            cashTenderedInput.value = grandTotal;
        } else {
            const add = parseFloat(val) || 0;
            cashTenderedInput.value = (parseFloat(cashTenderedInput.value || 0) || 0) + add;
        }
        calculateCashChange();
        cashTenderedInput.focus();
    });
});

// Split Calculations
const splitCashInput = document.getElementById('split-cash-input');
const splitMpesaInput = document.getElementById('split-mpesa-input');
splitCashInput?.addEventListener('input', calculateSplitBalance);
splitMpesaInput?.addEventListener('input', calculateSplitBalance);

function calculateSplitBalance() {
    const grandTotal = getCartGrandTotal();
    const c = parseFloat(splitCashInput?.value || 0) || 0;
    const m = parseFloat(splitMpesaInput?.value || 0) || 0;
    const totalPaid = c + m;
    const diff = grandTotal - totalPaid;
    const remLabel = document.getElementById('split-remaining-label');

    if (!remLabel) return;

    if (diff === 0) {
        remLabel.textContent = 'Exact Amount (Balanced)';
        remLabel.className = 'text-lg font-black text-emerald-600';
    } else if (diff < 0) {
        remLabel.textContent = `Change: KSh ${Math.abs(diff).toFixed(2)}`;
        remLabel.className = 'text-lg font-black text-emerald-600';
    } else {
        remLabel.textContent = `Still Due: KSh ${diff.toFixed(2)}`;
        remLabel.className = 'text-lg font-black text-red-600';
    }
}

// Customers in Debt Mode
async function loadCustomersDropdown() {
    try {
        if (navigator.onLine) {
            const { data } = await supabase.from('customers').select('*').order('name');
            customers = data || [];
        }
    } catch(e) {
        console.warn('Could not load customers:', e.message);
    }

    const select = document.getElementById('debt-customer-dropdown');
    const collectSelect = document.getElementById('collect-debt-cust-select');

    const options = customers.map(c => 
        `<option value="${c.id}" data-debt="${c.outstanding_debt || 0}">${c.name} (${c.phone || 'No phone'}) - Debt: KSh ${parseFloat(c.outstanding_debt || 0).toFixed(2)}</option>`
    ).join('');

    if (select) {
        select.innerHTML = '<option value="">-- Choose Customer --</option>' + options;
    }
    if (collectSelect) {
        collectSelect.innerHTML = '<option value="">-- Choose Customer --</option>' + options;
    }
}

document.getElementById('debt-customer-dropdown')?.addEventListener('change', (e) => {
    const sel = e.target;
    const info = document.getElementById('debt-customer-info');
    const bal = document.getElementById('debt-customer-bal');
    const opt = sel.options[sel.selectedIndex];

    if (opt && opt.value) {
        const debt = parseFloat(opt.dataset.debt || 0);
        bal.textContent = `KSh ${debt.toFixed(2)}`;
        info.classList.remove('hidden');
    } else {
        info.classList.add('hidden');
    }
});

// Quick Add Customer Inline
document.getElementById('btn-quick-add-customer')?.addEventListener('click', () => {
    document.getElementById('modal-quick-customer')?.classList.remove('hidden');
    document.getElementById('new-cust-name')?.focus();
});

document.getElementById('btn-save-quick-cust')?.addEventListener('click', async () => {
    const name = document.getElementById('new-cust-name').value.trim();
    const phone = document.getElementById('new-cust-phone').value.trim();

    if (!name) return alert('Customer name is required');

    try {
        const { data, error } = await supabase.from('customers').insert([{ name, phone, outstanding_debt: 0 }]).select().single();
        if (error) throw error;
        customers.push(data);
        await loadCustomersDropdown();
        document.getElementById('debt-customer-dropdown').value = data.id;
        document.getElementById('debt-customer-dropdown').dispatchEvent(new Event('change'));
        document.getElementById('modal-quick-customer').classList.add('hidden');
        document.getElementById('new-cust-name').value = '';
        document.getElementById('new-cust-phone').value = '';
    } catch (err) {
        alert('Failed to save customer: ' + err.message);
    }
});

// ====================================================================
// 5. SUBMIT FINAL SALE & RECEIPT GENERATION
// ====================================================================
btnSubmitFinalSale?.addEventListener('click', processFinalSale);

async function processFinalSale() {
    const errBox = document.getElementById('checkout-error-msg');
    errBox.classList.add('hidden');

    const grandTotal = getCartGrandTotal();
    const generateReceipt = document.getElementById('chk-generate-receipt')?.checked;

    let customerId = null;
    let paymentRef = '';
    let tenderAmt = 0;
    let changeAmt = 0;

    // Validate Payment Specifics
    if (activePaymentMethod === 'Cash') {
        tenderAmt = parseFloat(cashTenderedInput.value || 0) || 0;
        if (tenderAmt < grandTotal) {
            errBox.textContent = `Insufficient cash entered. Due: KSh ${grandTotal.toFixed(2)}, Tendered: KSh ${tenderAmt.toFixed(2)}`;
            errBox.classList.remove('hidden');
            return;
        }
        changeAmt = tenderAmt - grandTotal;
    } else if (activePaymentMethod === 'M-Pesa') {
        paymentRef = document.getElementById('mpesa-code-input').value.trim();
        tenderAmt = grandTotal;
    } else if (activePaymentMethod === 'Split') {
        const c = parseFloat(splitCashInput.value || 0) || 0;
        const m = parseFloat(splitMpesaInput.value || 0) || 0;
        if (c + m < grandTotal) {
            errBox.textContent = `Split payment total (KSh ${(c+m).toFixed(2)}) is less than Grand Total Due (KSh ${grandTotal.toFixed(2)})`;
            errBox.classList.remove('hidden');
            return;
        }
        paymentRef = `Cash: ${c} | M-Pesa: ${m} (${document.getElementById('split-mpesa-ref').value.trim()})`;
        tenderAmt = c + m;
        changeAmt = (c + m) - grandTotal;
    } else if (activePaymentMethod === 'Debt') {
        customerId = document.getElementById('debt-customer-dropdown').value;
        if (!customerId) {
            errBox.textContent = 'Please select a registered customer for credit account sales.';
            errBox.classList.remove('hidden');
            return;
        }
        tenderAmt = 0;
    }

    btnSubmitFinalSale.disabled = true;
    btnSubmitFinalSale.innerHTML = 'Processing...';

    // Generate shared receipt number for all items in this cart sale
    const receiptNo = `LH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
        // Construct sale log rows for each cart item
        const now = new Date().toISOString();
        const salesRows = cart.map(item => ({
            item_id: item.id,
            receipt_no: receiptNo,
            calculated_qty: item.qty,
            total_charged: item.total,
            calculated_profit: (item.selling_price - item.buying_price) * item.qty,
            buying_price_at_sale: item.buying_price,
            cashier_id: currentUser ? currentUser.id : null,
            customer_id: customerId,
            payment_method: activePaymentMethod,
            amount_tendered: tenderAmt,
            change_given: changeAmt,
            notes: paymentRef || null,
            status: activePaymentMethod === 'Debt' ? 'debt' : 'active',
            timestamp: now
        }));

        // Insert sale rows (with offline queue fallback if needed)
        for (const row of salesRows) {
            await insertSaleWithOfflineSupport(supabase, row);
        }

        // If debt sale, update customer's outstanding balance
        if (activePaymentMethod === 'Debt' && customerId) {
            const cust = customers.find(c => c.id === customerId);
            const newBal = (parseFloat(cust?.outstanding_debt || 0)) + grandTotal;
            await supabase.from('customers').update({ outstanding_debt: newBal }).eq('id', customerId);
        }

        // Generate PDF Receipt ONLY if checkbox is checked
        if (generateReceipt) {
            generateReceiptPDF(receiptNo, cart, grandTotal, activePaymentMethod, tenderAmt, changeAmt, customerId);
        }

        // Reset cart and checkout modal
        const completedCart = [...cart];
        cart = [];
        renderCart();
        checkoutModal.classList.add('hidden');

        // Refresh live inventory & today's sales
        await loadInventory();
        await loadTodaysSales();

        // Flash toast notification
        showToast(`Sale recorded successfully! Ref: ${receiptNo}`);

    } catch (err) {
        console.error('Checkout error:', err);
        errBox.textContent = 'Failed to process sale: ' + err.message;
        errBox.classList.remove('hidden');
    } finally {
        btnSubmitFinalSale.disabled = false;
        btnSubmitFinalSale.innerHTML = '✓ COMPLETE SALE (Enter)';
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = "fixed bottom-5 right-5 z-[100] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 text-sm font-bold animate-bounce";
    toast.innerHTML = `<span>✅</span> <span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ====================================================================
// 6. RECEIPT GENERATION (PDF - Conditional On Checkbox)
// ====================================================================
function generateReceiptPDF(receiptNo, items, grandTotal, method, tendered, change, customerId) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200] // Standard 80mm thermal receipt roll layout
    });

    const cust = customers.find(c => c.id === customerId);

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LITAJ HARDWARE", 40, 10, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Building & Construction Materials", 40, 14, { align: "center" });
    doc.text("Tel: +254 700 000 000", 40, 18, { align: "center" });
    doc.text("--------------------------------------------------", 40, 22, { align: "center" });

    doc.text(`Receipt: ${receiptNo}`, 4, 27);
    doc.text(`Date: ${new Date().toLocaleString()}`, 4, 31);
    doc.text(`Cashier: ${currentUser ? currentUser.username : 'Staff'}`, 4, 35);
    if (cust) {
        doc.text(`Customer: ${cust.name}`, 4, 39);
    }

    doc.text("--------------------------------------------------", 40, 43, { align: "center" });

    // Table of items
    const tableData = items.map(i => [
        i.name,
        i.qty.toString(),
        i.selling_price.toFixed(0),
        i.total.toFixed(0)
    ]);

    doc.autoTable({
        startY: 45,
        head: [['Item', 'Qty', 'Price', 'Total']],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 8, halign: 'center' },
            2: { cellWidth: 14, halign: 'right' },
            3: { cellWidth: 15, halign: 'right' }
        },
        margin: { left: 4, right: 4 }
    });

    const finalY = doc.lastAutoTable.finalY + 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`TOTAL: KSh ${grandTotal.toLocaleString()}`, 76, finalY + 4, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Paid via: ${method}`, 4, finalY + 9);
    if (method === 'Cash' && tendered > 0) {
        doc.text(`Tendered: KSh ${tendered.toLocaleString()}`, 4, finalY + 13);
        doc.text(`Change: KSh ${change.toLocaleString()}`, 4, finalY + 17);
    }

    doc.setFontSize(7);
    doc.text("--------------------------------------------------", 40, finalY + 22, { align: "center" });
    doc.text("Thank you for choosing Litaj Hardware!", 40, finalY + 26, { align: "center" });
    doc.text("Goods once sold are not returnable.", 40, finalY + 29, { align: "center" });

    doc.save(`Receipt_${receiptNo}.pdf`);
}

// ====================================================================
// 7. TODAY'S SALES LEDGER (Per User & Store-wide)
// ====================================================================
const modalLedger = document.getElementById('modal-ledger');
document.getElementById('btn-toggle-ledger')?.addEventListener('click', () => {
    loadTodaysSales();
    modalLedger.classList.remove('hidden');
});
document.getElementById('btn-close-ledger')?.addEventListener('click', () => {
    modalLedger.classList.add('hidden');
});
document.getElementById('ledger-user-filter')?.addEventListener('change', renderTodaysLedger);

async function loadTodaysSales() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('sales_log')
            .select('*, inventory(name), users!sales_log_cashier_id_fkey(username, full_name), customers(name)')
            .gte('timestamp', `${today}T00:00:00Z`)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        todaysSales = data || [];
        renderTodaysLedger();
    } catch(err) {
        console.warn('Failed to load today sales:', err.message);
    }
}

function renderTodaysLedger() {
    const filter = document.getElementById('ledger-user-filter')?.value || 'my';
    const tbody = document.getElementById('ledger-tbody');

    let list = todaysSales;

    // Filter by current cashier if 'my' is selected
    if (filter === 'my' && currentUser) {
        list = list.filter(s => s.cashier_id === currentUser.id);
    }

    let total = 0, cash = 0, mpesa = 0, debt = 0;

    list.forEach(s => {
        if (!s.is_voided) {
            total += parseFloat(s.total_charged || 0);
            const m = (s.payment_method || '').toLowerCase();
            if (m.includes('cash')) cash += parseFloat(s.total_charged || 0);
            else if (m.includes('m-pesa') || m.includes('mpesa')) mpesa += parseFloat(s.total_charged || 0);
            else if (m.includes('debt') || m.includes('credit')) debt += parseFloat(s.total_charged || 0);
        }
    });

    document.getElementById('kpi-ledger-total').textContent = `KSh ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-ledger-cash').textContent = `KSh ${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-ledger-mpesa').textContent = `KSh ${mpesa.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-ledger-debt').textContent = `KSh ${debt.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-ledger-count').textContent = list.length;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 font-medium">No sales recorded today for this view.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(s => {
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemName = s.inventory?.name || 'Item';
        const cashierName = s.users?.username || 'Staff';
        const statusBadge = s.is_voided 
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">VOIDED</span>'
            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${s.payment_method}</span>`;

        return `
            <tr class="hover:bg-slate-50 border-b border-slate-100 ${s.is_voided ? 'opacity-50 line-through' : ''}">
                <td class="py-2.5 px-3 font-mono text-slate-500">${time}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${s.receipt_no || '-'}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${itemName}</td>
                <td class="py-2.5 px-3 text-center font-bold">${s.calculated_qty}</td>
                <td class="py-2.5 px-3 text-right font-black text-slate-900">KSh ${parseFloat(s.total_charged || 0).toLocaleString()}</td>
                <td class="py-2.5 px-3">${statusBadge}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-600 capitalize">${cashierName}</td>
                <td class="py-2.5 px-3 text-center">
                    ${!s.is_voided ? `<button class="btn-void-sale text-red-600 hover:text-red-800 font-bold text-xs" data-id="${s.id}">Void</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-void-sale').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Are you sure you want to VOID this transaction? Stock will be automatically restored.')) return;

            try {
                const { error } = await supabase.from('sales_log')
                    .update({ is_voided: true, status: 'voided', voided_at: new Date().toISOString(), voided_by: currentUser?.id })
                    .eq('id', id);

                if (error) throw error;
                showToast('Sale voided & stock restored.');
                await loadTodaysSales();
                await loadInventory();
            } catch (err) {
                alert('Failed to void sale: ' + err.message);
            }
        });
    });
}

// ====================================================================
// 8. DEBT COLLECTION MODAL
// ====================================================================
const modalDebt = document.getElementById('modal-debt');
document.getElementById('btn-open-debt-modal')?.addEventListener('click', () => {
    loadCustomersDropdown();
    modalDebt.classList.remove('hidden');
});

document.getElementById('collect-debt-cust-select')?.addEventListener('change', (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    const balEl = document.getElementById('collect-debt-bal-display');
    if (opt && opt.value) {
        balEl.textContent = `KSh ${parseFloat(opt.dataset.debt || 0).toFixed(2)}`;
    } else {
        balEl.textContent = 'KSh 0.00';
    }
});

document.getElementById('btn-submit-debt-collect')?.addEventListener('click', async () => {
    const custId = document.getElementById('collect-debt-cust-select').value;
    const method = document.getElementById('collect-debt-method').value;
    const amount = parseFloat(document.getElementById('collect-debt-amount').value || 0);

    if (!custId) return alert('Select a customer');
    if (amount <= 0) return alert('Enter a valid amount paid');

    const btn = document.getElementById('btn-submit-debt-collect');
    btn.disabled = true;
    btn.innerHTML = 'Processing...';

    try {
        const cust = customers.find(c => c.id === custId);
        const currentDebt = parseFloat(cust?.outstanding_debt || 0);
        const newDebt = Math.max(0, currentDebt - amount);

        // Record in sales_log as debt_collection
        const row = {
            receipt_no: `DEBT-PAY-${Date.now().toString().slice(-6)}`,
            total_charged: amount,
            calculated_qty: 1,
            calculated_profit: 0,
            cashier_id: currentUser ? currentUser.id : null,
            customer_id: custId,
            payment_method: method,
            status: 'debt_collection',
            notes: `Debt repayment from ${cust ? cust.name : 'Customer'}`
        };

        await supabase.from('sales_log').insert([row]);
        await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);

        alert(`Payment of KSh ${amount.toFixed(2)} recorded! New Balance: KSh ${newDebt.toFixed(2)}`);
        modalDebt.classList.add('hidden');
        document.getElementById('collect-debt-amount').value = '';
        await loadCustomersDropdown();
        await loadTodaysSales();
    } catch(err) {
        alert('Failed to collect debt: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Collect Payment';
    }
});

// ====================================================================
// 9. GLOBAL KEYBOARD SHORTCUTS (Vegas POS Ergonomics)
// ====================================================================
document.addEventListener('keydown', (e) => {
    // F2: Complete Checkout
    if (e.key === 'F2') {
        e.preventDefault();
        openCheckout();
    }
    // F3: Focus Search Bar
    else if (e.key === 'F3') {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
    }
    // Escape: Close any open modal
    else if (e.key === 'Escape') {
        document.querySelectorAll('.fixed:not(.hidden)').forEach(modal => {
            if (modal.id !== 'modal-held-carts' && !modal.classList.contains('pointer-events-none')) {
                modal.classList.add('hidden');
            }
        });
    }
    // Enter in Checkout modal
    else if (e.key === 'Enter' && !checkoutModal.classList.contains('hidden') && e.target.tagName !== 'BUTTON') {
        // If not in a textarea/multiline, submit sale
        if (e.target.id === 'cash-tendered-input' || e.target.id === 'mpesa-code-input' || e.target.id === 'split-cash-input' || e.target.id === 'split-mpesa-input') {
            e.preventDefault();
            processFinalSale();
        }
    }
});

// ====================================================================
// INITIALIZATION
// ====================================================================
loadInventory();
loadCustomersDropdown();
loadTodaysSales();
syncOfflineSales(supabase);
