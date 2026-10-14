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
let currentActiveView = 'products'; // 'products', 'cart', 'ledger'

// Header User & Connection Status
if (currentUser) {
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;
}

function updateConnectionStatus() {
    const dot = document.getElementById('conn-status-dot');
    const text = document.getElementById('conn-status-text');
    if (navigator.onLine) {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
        if (text) text.textContent = "Online";
    } else {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
        if (text) text.textContent = "Offline (Queuing)";
    }
}
window.addEventListener('online', () => {
    updateConnectionStatus();
    syncOfflineSales(supabase);
});
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// Dynamic Viewport Height Handler (Fixes Samsung A03 & Android URL/System Navigation bar shifts)
function updateAppHeight() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
}
window.addEventListener('resize', updateAppHeight);
window.addEventListener('orientationchange', updateAppHeight);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAppHeight);
}
updateAppHeight();

// ====================================================================
// MOBILE-FIRST RESPONSIVE VIEW SWITCHER
// ====================================================================
const viewProducts = document.getElementById('view-products');
const viewCart = document.getElementById('view-cart');
const viewLedger = document.getElementById('view-ledger');

const tabBtnProducts = document.getElementById('tab-btn-products');
const tabBtnCart = document.getElementById('tab-btn-cart');
const tabBtnLedger = document.getElementById('tab-btn-ledger');
const tabBtnDebt = document.getElementById('tab-btn-debt');

function isMobile() {
    return window.innerWidth < 1024;
}

function switchView(target) {
    currentActiveView = target;
    const mobile = isMobile();

    // Reset mobile tab buttons styling
    const tabs = [
        { btn: tabBtnProducts, name: 'products' },
        { btn: tabBtnCart, name: 'cart' },
        { btn: tabBtnLedger, name: 'ledger' }
    ];

    tabs.forEach(t => {
        if (t.btn) {
            if (t.name === target) {
                t.btn.classList.add('text-orange-500');
                t.btn.classList.remove('text-slate-400');
            } else {
                t.btn.classList.remove('text-orange-500');
                t.btn.classList.add('text-slate-400');
            }
        }
    });

    if (mobile) {
        // On Mobile: Only one view is active at a time
        if (target === 'products') {
            viewProducts?.classList.remove('hidden');
            viewCart?.classList.add('hidden');
            viewLedger?.classList.add('hidden');
        } else if (target === 'cart') {
            viewProducts?.classList.add('hidden');
            viewCart?.classList.remove('hidden');
            viewLedger?.classList.add('hidden');
        } else if (target === 'ledger') {
            viewProducts?.classList.add('hidden');
            viewCart?.classList.add('hidden');
            viewLedger?.classList.remove('hidden');
            loadTodaysSales();
        }
    } else {
        // On Desktop (>= 1024px):
        if (target === 'ledger') {
            // Full ledger mode on desktop
            viewProducts?.classList.add('hidden');
            viewCart?.classList.add('hidden');
            viewLedger?.classList.remove('hidden');
            document.getElementById('btn-close-ledger-view')?.classList.remove('hidden');
            loadTodaysSales();
        } else {
            // Default 2-column split POS mode
            viewProducts?.classList.remove('hidden');
            viewCart?.classList.remove('hidden');
            viewLedger?.classList.add('hidden');
            document.getElementById('btn-close-ledger-view')?.classList.add('hidden');
        }
    }

    if (target === 'products') {
        setTimeout(focusQuickSearch, 100);
    }
}

// Mobile Tab Bar Click Handlers
tabBtnProducts?.addEventListener('click', () => switchView('products'));
tabBtnCart?.addEventListener('click', () => switchView('cart'));
tabBtnLedger?.addEventListener('click', () => switchView('ledger'));
tabBtnDebt?.addEventListener('click', () => {
    loadCustomersDropdown();
    document.getElementById('modal-debt')?.classList.remove('hidden');
});

// Mobile Back Buttons
document.getElementById('btn-cart-back-to-products')?.addEventListener('click', () => switchView('products'));
document.getElementById('btn-ledger-back-to-products')?.addEventListener('click', () => switchView('products'));
document.getElementById('mobile-floating-cart-bar')?.addEventListener('click', () => switchView('cart'));

// Desktop Ledger Toggle Buttons
document.getElementById('btn-toggle-ledger')?.addEventListener('click', () => switchView('ledger'));
document.getElementById('btn-close-ledger-view')?.addEventListener('click', () => switchView('products'));

// Handle responsive resize dynamically
window.addEventListener('resize', () => {
    if (!isMobile()) {
        if (currentActiveView !== 'ledger') {
            viewProducts?.classList.remove('hidden');
            viewCart?.classList.remove('hidden');
            viewLedger?.classList.add('hidden');
        }
    } else {
        switchView(currentActiveView);
    }
});

// ====================================================================
// 1. INVENTORY LOADING & HARDWARE CATALOG
// ====================================================================
// Store Settings State (Dynamically loaded from database)
let storeSettings = {
    store_name: 'LITAJ HARDWARE',
    store_tagline: 'Building & Construction Materials',
    store_phone: '+254 700 000 000',
    store_address: 'Main Commercial Center',
    receipt_footer: 'Thank you for choosing Litaj Hardware! Goods once sold are not returnable.'
};

async function loadStoreSettings() {
    try {
        if (navigator.onLine) {
            const { data } = await supabase.from('settings').select('*');
            if (data && data.length > 0) {
                data.forEach(s => {
                    if (s.key && s.value) storeSettings[s.key] = s.value;
                });
                localStorage.setItem('litaj_settings_cache', JSON.stringify(storeSettings));
            }
        } else {
            storeSettings = JSON.parse(localStorage.getItem('litaj_settings_cache') || JSON.stringify(storeSettings));
        }
    } catch (e) {
        console.warn('Could not load dynamic settings:', e.message);
    }
}

function renderCategoryChips() {
    const container = document.getElementById('category-chips');
    if (!container) return;

    const rawCats = inventory
        .map(i => (i.category || '').trim())
        .filter(Boolean);

    const uniqueCategories = ['ALL', ...Array.from(new Set(rawCats)).sort()];

    container.innerHTML = uniqueCategories.map(cat => {
        const isMatch = activeCategory.toLowerCase() === cat.toLowerCase();
        const label = cat === 'ALL' ? 'All Items' : cat;
        const chipClass = isMatch
            ? 'cat-chip active flex-shrink-0 px-3.5 py-2 rounded-xl bg-orange-600 text-white shadow-sm font-bold text-xs sm:text-sm'
            : 'cat-chip flex-shrink-0 px-3.5 py-2 rounded-xl bg-slate-100 active:bg-slate-200 text-slate-700 transition font-bold text-xs sm:text-sm';
        return `<button type="button" class="${chipClass}" data-category="${cat}">${label}</button>`;
    }).join('');

    container.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            activeCategory = chip.dataset.category;
            renderCategoryChips();
            renderCatalog();
        });
    });
}

async function loadInventory() {
    try {
        const countLabel = document.getElementById('product-count-label');
        if (countLabel) countLabel.textContent = 'Refreshing...';

        if (navigator.onLine) {
            const { data, error } = await supabase.from('inventory').select('*').order('name');
            if (error) throw error;
            inventory = data || [];
            localStorage.setItem('litaj_inventory_cache', JSON.stringify(inventory));
        } else {
            inventory = JSON.parse(localStorage.getItem('litaj_inventory_cache') || '[]');
        }

        renderCategoryChips();
        renderCatalog();
    } catch (err) {
        console.warn('Failed to load inventory online, using local cache:', err.message);
        inventory = JSON.parse(localStorage.getItem('litaj_inventory_cache') || '[]');
        renderCategoryChips();
        renderCatalog();
    }
}

function renderCatalog() {
    const container = document.getElementById('products-container');
    if (!container) return;

    const topSearch = (document.getElementById('pos-search')?.value || '').trim().toLowerCase();
    const quickSearch = (document.getElementById('quick-barcode')?.value || '').trim().toLowerCase();
    const searchTerm = quickSearch || topSearch;
    const countLabel = document.getElementById('product-count-label');

    const filtered = inventory.filter(item => {
        const matchCat = activeCategory === 'ALL' || 
            (item.category && item.category.toLowerCase() === activeCategory.toLowerCase());

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
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 font-medium">
                <div class="text-4xl mb-2">🔍</div>
                <div class="text-sm font-bold text-slate-700">No hardware products found</div>
                <div class="text-xs text-slate-400 mt-1">${searchTerm ? `No matches for "${searchTerm}"` : 'Select a different category'}</div>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        let stockBadgeHtml = '';
        const isOutOfStock = !item.is_service && item.stock_quantity <= 0;

        if (item.is_service) {
            stockBadgeHtml = `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">Service</span>`;
        } else if (isOutOfStock) {
            stockBadgeHtml = `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">Out of Stock</span>`;
        } else if (item.stock_quantity <= (item.min_threshold || 10)) {
            stockBadgeHtml = `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800">${item.stock_quantity} left</span>`;
        } else {
            stockBadgeHtml = `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">${item.stock_quantity} in stock</span>`;
        }

        const formattedPrice = parseFloat(item.selling_price || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <div class="product-row p-3 sm:p-3.5 hover:bg-orange-50/70 active:bg-orange-100/80 transition flex items-center justify-between gap-3 cursor-pointer select-none" data-id="${item.id}">
                <div class="flex-1 min-w-0 pr-1">
                    <div class="font-black text-slate-900 text-base sm:text-lg leading-snug truncate">${item.name}</div>
                    <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 font-medium">
                        <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">${item.category || 'General'}</span>
                        <span>•</span>
                        ${stockBadgeHtml}
                        ${item.barcode ? `<span class="hidden sm:inline font-mono text-xs text-slate-500 font-semibold">#${item.barcode}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2.5 flex-shrink-0">
                    <div class="text-right">
                        <div class="text-[10px] sm:text-xs uppercase font-bold text-slate-400">Price</div>
                        <div class="text-base sm:text-lg font-black text-slate-900">KSh ${formattedPrice}</div>
                    </div>
                    <button class="btn-add-item w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-xl flex items-center justify-center shadow-md shadow-orange-600/20 transition flex-shrink-0" data-id="${item.id}" title="Add to cart">
                        +
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach click events: Tapping the row or clicking '+' adds item
    container.querySelectorAll('.product-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.btn-add-item')) return;
            const id = row.dataset.id;
            const item = inventory.find(i => i.id === id);
            if (item) addToCart(item, 1);
        });
    });

    container.querySelectorAll('.btn-add-item').forEach(btn => {
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

// Instant Search / Barcode Entry in Bottom Bar
const quickBarcodeInput = document.getElementById('quick-barcode');
const quickBarcodeQtyInput = document.getElementById('quick-barcode-qty');
const btnQuickBarcodeAdd = document.getElementById('btn-quick-barcode-add');

// Live instant filtering as cashier types in the bottom bar
quickBarcodeInput?.addEventListener('input', () => {
    renderCatalog();
});

btnQuickBarcodeAdd?.addEventListener('click', handleBarcodeQuickAdd);
quickBarcodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleBarcodeQuickAdd();
    }
});

function handleBarcodeQuickAdd() {
    const query = (quickBarcodeInput?.value || '').trim().toLowerCase();
    const qty = parseInt(quickBarcodeQtyInput?.value) || 1;

    if (!query) return;

    // Multi-level matching hierarchy:
    // 1. Exact barcode match
    // 2. Exact item name match
    // 3. Item name starts with query
    // 4. Substring in item name
    // 5. Substring in category
    const match = inventory.find(i => i.barcode && i.barcode.toLowerCase() === query)
        || inventory.find(i => i.name.toLowerCase() === query)
        || inventory.find(i => i.name.toLowerCase().startsWith(query))
        || inventory.find(i => i.name.toLowerCase().includes(query))
        || inventory.find(i => i.category && i.category.toLowerCase().includes(query));

    if (match) {
        addToCart(match, qty);
        if (quickBarcodeInput) quickBarcodeInput.value = '';
        if (quickBarcodeQtyInput) quickBarcodeQtyInput.value = '1';
        renderCatalog(); // Reset filtered catalog view to show all
        focusQuickSearch();
        showToast(`Added ${qty}x ${match.name} to cart`);
    } else {
        showToast(`No item found matching "${query}"`);
    }
}

// ====================================================================
// AUTO-SNAP FOCUS & 30-SECOND INACTIVITY WATCHDOG
// ====================================================================
function focusQuickSearch() {
    // Safety check: Never steal focus if an active modal dialog is open
    const openModal = document.querySelector('.fixed:not(.hidden)');
    if (openModal) return;

    // Safety check: On mobile, only focus if viewing the products catalog
    if (typeof currentActiveView !== 'undefined' && currentActiveView !== 'products') {
        return;
    }

    const input = document.getElementById('quick-barcode');
    if (input && document.activeElement !== input) {
        input.focus();
        if (input.value) input.select();
    }
}

let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        focusQuickSearch();
    }, INACTIVITY_TIMEOUT_MS);
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
});
resetInactivityTimer();

// ====================================================================
// 2. CART MANAGEMENT (VEGAS POS LOGIC + MOBILE TOUCH CONTROLS)
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

    // Subtle feedback toast for quick mobile thumb tapping
    if (isMobile()) {
        const floatTotal = document.getElementById('floating-cart-total');
        if (floatTotal) {
            floatTotal.classList.add('scale-110');
            setTimeout(() => floatTotal.classList.remove('scale-110'), 200);
        }
    }
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
        focusQuickSearch();
    }
}

document.getElementById('btn-clear-cart')?.addEventListener('click', clearCart);

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-item-count-badge');
    const subtotalEl = document.getElementById('lbl-subtotal');
    const grandTotalEl = document.getElementById('lbl-grand-total');
    const discountInput = document.getElementById('cart-discount');
    const discountValEl = document.getElementById('lbl-discount-val');

    // Mobile floating cart elements
    const floatingBar = document.getElementById('mobile-floating-cart-bar');
    const floatingItems = document.getElementById('floating-cart-items');
    const floatingTotal = document.getElementById('floating-cart-total');
    const mobileCartBadge = document.getElementById('mobile-cart-badge');

    let totalItems = 0;
    let subtotal = 0;

    cart.forEach(item => {
        totalItems += item.qty;
        subtotal += item.total;
    });

    const discount = parseFloat(discountInput?.value || 0) || 0;
    const grandTotal = Math.max(0, subtotal - discount);

    const formattedSubtotal = `KSh ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const formattedGrandTotal = `KSh ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (badge) badge.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    if (subtotalEl) subtotalEl.textContent = formattedSubtotal;
    if (discountValEl) discountValEl.textContent = `- KSh ${discount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (grandTotalEl) grandTotalEl.textContent = formattedGrandTotal;

    // Update Mobile Floating Cart Bar & Tab Badge
    if (totalItems > 0) {
        if (floatingBar && isMobile() && currentActiveView === 'products') {
            floatingBar.classList.remove('hidden');
        }
        if (floatingItems) floatingItems.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'} in cart`;
        if (floatingTotal) floatingTotal.textContent = formattedGrandTotal;
        if (mobileCartBadge) {
            mobileCartBadge.textContent = totalItems;
            mobileCartBadge.classList.remove('hidden');
        }
    } else {
        if (floatingBar) floatingBar.classList.add('hidden');
        if (mobileCartBadge) mobileCartBadge.classList.add('hidden');
    }

    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 font-medium">
                <div class="text-4xl mb-2">🛒</div>
                <div class="font-bold text-slate-600">Cart is empty</div>
                <div class="text-xs mt-1">Tap hardware items on catalog to add</div>
            </div>`;
        return;
    }

    container.innerHTML = cart.map(item => `
        <div class="cart-item-card p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-2.5">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <h4 class="font-black text-slate-900 text-base leading-snug truncate">${item.name}</h4>
                    <div class="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">
                        KSh ${item.selling_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} each
                    </div>
                </div>
                <button class="cart-del-btn text-slate-400 hover:text-red-600 active:text-red-700 p-2 text-lg font-black leading-none transition" data-id="${item.id}" title="Remove item">
                    🗑️
                </button>
            </div>
            <div class="flex justify-between items-center pt-2.5 border-t border-slate-100">
                <!-- Large Touch Quantity Hitboxes (min 38x38px) -->
                <div class="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
                    <button class="cart-qty-minus w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white active:bg-slate-200 text-slate-900 font-black text-lg shadow-sm flex items-center justify-center transition" data-id="${item.id}">−</button>
                    <input type="number" min="1" value="${item.qty}" class="cart-qty-input w-14 h-9 sm:h-10 text-center bg-transparent font-black text-base text-slate-900 focus:outline-none" data-id="${item.id}">
                    <button class="cart-qty-plus w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white active:bg-slate-200 text-slate-900 font-black text-lg shadow-sm flex items-center justify-center transition" data-id="${item.id}">+</button>
                </div>
                <!-- Line Total -->
                <div class="text-right">
                    <div class="text-[10px] sm:text-xs text-slate-400 font-bold uppercase">Total</div>
                    <div class="text-base sm:text-lg font-black text-slate-900">KSh ${item.total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>
            </div>
        </div>
    `).join('');

    // Attach Cart Action Listeners
    container.querySelectorAll('.cart-qty-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const itm = cart.find(c => c.id === id);
            if (itm) updateCartQty(id, itm.qty - 1);
        });
    });

    container.querySelectorAll('.cart-qty-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const itm = cart.find(c => c.id === id);
            if (itm) updateCartQty(id, itm.qty + 1);
        });
    });

    container.querySelectorAll('.cart-qty-input').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.id;
            const val = parseInt(input.value) || 1;
            updateCartQty(id, Math.max(1, val));
        });
    });

    container.querySelectorAll('.cart-del-btn').forEach(btn => {
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
btnCloseCheckout?.addEventListener('click', () => {
    checkoutModal.classList.add('hidden');
    focusQuickSearch();
});
btnCancelCheckout?.addEventListener('click', () => {
    checkoutModal.classList.add('hidden');
    focusQuickSearch();
});

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
    }, 150);
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
            btn.className = "pay-method-btn active py-3 px-2 rounded-xl border-2 border-orange-600 bg-orange-50 text-orange-700 font-bold text-xs sm:text-sm transition flex flex-col items-center gap-1 shadow-sm";
        } else {
            btn.className = "pay-method-btn py-3 px-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-xs sm:text-sm active:border-slate-300 transition flex flex-col items-center gap-1";
        }
    });

    // Toggle panel visibility
    document.querySelectorAll('.pay-panel').forEach(p => p.classList.add('hidden'));

    if (method === 'Cash') {
        document.getElementById('checkout-panel-cash')?.classList.remove('hidden');
        document.getElementById('cash-tendered-input')?.focus();
    } else if (method === 'M-Pesa') {
        document.getElementById('checkout-panel-mpesa')?.classList.remove('hidden');
        const grandTotal = getCartGrandTotal();
        const mpesaAmtInput = document.getElementById('mpesa-amount-input');
        if (mpesaAmtInput) {
            mpesaAmtInput.value = grandTotal;
            setTimeout(() => {
                mpesaAmtInput.focus();
                mpesaAmtInput.select();
            }, 100);
        }
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
        remLabel.className = 'text-base font-black text-emerald-600';
    } else if (diff < 0) {
        remLabel.textContent = `Change: KSh ${Math.abs(diff).toFixed(2)}`;
        remLabel.className = 'text-base font-black text-emerald-600';
    } else {
        remLabel.textContent = `Still Due: KSh ${diff.toFixed(2)}`;
        remLabel.className = 'text-base font-black text-red-600';
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
// 5. SUBMIT FINAL SALE & RECEIPT GENERATION (OPTIONAL VIA CHECKBOX)
// ====================================================================
btnSubmitFinalSale?.addEventListener('click', processFinalSale);

async function processFinalSale() {
    const errBox = document.getElementById('checkout-error-msg');
    errBox.classList.add('hidden');

    const grandTotal = getCartGrandTotal();
    const generateReceipt = document.getElementById('chk-generate-receipt')?.checked === true;

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
        const mpesaAmt = parseFloat(document.getElementById('mpesa-amount-input')?.value || 0) || grandTotal;
        if (mpesaAmt < grandTotal) {
            errBox.textContent = `Insufficient M-Pesa amount. Due: KSh ${grandTotal.toFixed(2)}, Entered: KSh ${mpesaAmt.toFixed(2)}`;
            errBox.classList.remove('hidden');
            return;
        }
        tenderAmt = mpesaAmt;
        changeAmt = Math.max(0, mpesaAmt - grandTotal);
        const code = (document.getElementById('mpesa-code-input')?.value || '').trim();
        const phone = (document.getElementById('mpesa-phone-input')?.value || '').trim();
        let ref = code ? `MPESA: ${code}` : 'MPESA-VERIFIED';
        if (phone) ref += ` (${phone})`;
        paymentRef = ref;
    } else if (activePaymentMethod === 'Split') {
        const c = parseFloat(splitCashInput.value || 0) || 0;
        const m = parseFloat(splitMpesaInput.value || 0) || 0;
        if (c + m < grandTotal) {
            errBox.textContent = `Split payment total (KSh ${(c+m).toFixed(2)}) is less than Grand Total Due (KSh ${grandTotal.toFixed(2)})`;
            errBox.classList.remove('hidden');
            return;
        }
        const splitRef = (document.getElementById('split-mpesa-ref')?.value || '').trim();
        paymentRef = `Cash: ${c} | M-Pesa: ${m}${splitRef ? ` (${splitRef})` : ' (VERIFIED)'}`;
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

        // Generate PDF Doc if receipt printing is requested
        let pdfDoc = null;
        if (generateReceipt) {
            pdfDoc = buildReceiptPDFDoc(receiptNo, cart, grandTotal, activePaymentMethod, tenderAmt, changeAmt, customerId);
            if (pdfDoc) {
                pdfDoc.save(`Receipt_${receiptNo}.pdf`);
            }
        }

        const completedItems = [...cart];
        lastCompletedSale = {
            receiptNo,
            items: completedItems,
            grandTotal,
            method: activePaymentMethod,
            customerName: cust ? cust.name : null,
            tenderAmt,
            changeAmt,
            notes: paymentRef,
            doc: pdfDoc || buildReceiptPDFDoc(receiptNo, completedItems, grandTotal, activePaymentMethod, tenderAmt, changeAmt, customerId)
        };

        // Reset cart and checkout modal
        cart = [];
        renderCart();
        checkoutModal.classList.add('hidden');

        // On mobile, return to catalog view for next customer
        if (isMobile()) {
            switchView('products');
        }

        // Refresh live inventory & today's sales
        await loadInventory();
        await loadTodaysSales();

        // Open the Sale Success Dialog
        openSaleSuccessModal(lastCompletedSale);

    } catch (err) {
        console.error('Checkout error:', err);
        errBox.textContent = 'Failed to process sale: ' + err.message;
        errBox.classList.remove('hidden');
    } finally {
        btnSubmitFinalSale.disabled = false;
        btnSubmitFinalSale.innerHTML = '✓ COMPLETE SALE';
    }
}

let lastCompletedSale = null;

function openSaleSuccessModal(sale) {
    const modal = document.getElementById('modal-sale-success');
    if (!modal) return;

    const info = document.getElementById('success-receipt-info');
    if (info) {
        info.textContent = `Ref: #${sale.receiptNo} • KSh ${sale.grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})} (${sale.method})`;
    }

    modal.classList.remove('hidden');
}

// Button Handlers for Sale Success Dialog
document.getElementById('btn-success-print-pdf')?.addEventListener('click', () => {
    if (!lastCompletedSale) return;
    if (lastCompletedSale.doc) {
        lastCompletedSale.doc.save(`Receipt_${lastCompletedSale.receiptNo}.pdf`);
    } else {
        const doc = buildReceiptPDFDoc(lastCompletedSale.receiptNo, lastCompletedSale.items, lastCompletedSale.grandTotal, lastCompletedSale.method, 0, 0, null);
        if (doc) doc.save(`Receipt_${lastCompletedSale.receiptNo}.pdf`);
    }
});

document.getElementById('btn-success-done')?.addEventListener('click', () => {
    document.getElementById('modal-sale-success')?.classList.add('hidden');
    focusQuickSearch();
});

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = "fixed bottom-5 right-5 z-[100] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 text-sm font-bold transition-transform duration-300";
    toast.innerHTML = `<span>✅</span> <span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ====================================================================
// 6. RECEIPT GENERATION & WHATSAPP SHARING
// ====================================================================
function buildReceiptPDFDoc(receiptNo, items, grandTotal, method, tendered, change, customerId) {
    if (!window.jspdf) {
        console.warn('jsPDF library not available');
        return null;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200] // Standard 80mm thermal receipt roll layout
    });

    const cust = customers.find(c => c.id === customerId);

    // Header (Dynamically loaded from database settings)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(storeSettings.store_name || "LITAJ HARDWARE", 40, 10, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(storeSettings.store_tagline || "Building & Construction Materials", 40, 14, { align: "center" });
    if (storeSettings.store_phone) {
        doc.text(`Tel: ${storeSettings.store_phone}`, 40, 18, { align: "center" });
    }
    doc.text("--------------------------------------------------", 40, 22, { align: "center" });

    doc.text(`Receipt: ${receiptNo}`, 4, 27);
    doc.text(`Date: ${new Date().toLocaleString()}`, 4, 31);
    doc.text(`Cashier: ${currentUser ? (currentUser.full_name || currentUser.username) : 'Staff'}`, 4, 35);
    if (cust) {
        doc.text(`Customer: ${cust.name}`, 4, 39);
    }

    doc.text("--------------------------------------------------", 40, 43, { align: "center" });

    // Table of items
    const tableData = items.map(i => [
        i.name,
        i.qty.toString(),
        parseFloat(i.selling_price || 0).toFixed(0),
        parseFloat(i.total || (i.selling_price * i.qty)).toFixed(0)
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

    const finalY = (doc.lastAutoTable?.finalY || 60) + 3;

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
    
    // Dynamic footer notice from settings
    const footerMsg = storeSettings.receipt_footer || "Thank you for choosing Litaj Hardware!\nGoods once sold are not returnable.";
    const footerLines = footerMsg.split('\n');
    footerLines.forEach((line, idx) => {
        doc.text(line, 40, finalY + 26 + (idx * 3.5), { align: "center" });
    });

    return doc;
}

function generateReceiptPDF(receiptNo, items, grandTotal, method, tendered, change, customerId) {
    const doc = buildReceiptPDFDoc(receiptNo, items, grandTotal, method, tendered, change, customerId);
    if (doc) doc.save(`Receipt_${receiptNo}.pdf`);
}

// ====================================================================
// 7. TODAY'S SALES LEDGER (Per User & Store-wide)
// ====================================================================
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
    const container = document.getElementById('ledger-records-container');

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

    const kpiTotal = document.getElementById('kpi-ledger-total');
    const kpiCash = document.getElementById('kpi-ledger-cash');
    const kpiMpesa = document.getElementById('kpi-ledger-mpesa');
    const kpiDebt = document.getElementById('kpi-ledger-debt');
    const kpiCount = document.getElementById('kpi-ledger-count');

    if (kpiTotal) kpiTotal.textContent = `KSh ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (kpiCash) kpiCash.textContent = `KSh ${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (kpiMpesa) kpiMpesa.textContent = `KSh ${mpesa.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (kpiDebt) kpiDebt.textContent = `KSh ${debt.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (kpiCount) kpiCount.textContent = `${list.length} sale${list.length === 1 ? '' : 's'}`;

    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 font-medium">
                <div class="text-4xl mb-2">📋</div>
                <div class="font-bold text-slate-600">No sales recorded today</div>
                <div class="text-xs text-slate-400 mt-1">${filter === 'my' ? 'No transactions logged under your cashier account yet.' : 'No transactions recorded across all registers today.'}</div>
            </div>`;
        return;
    }

    container.innerHTML = list.map(s => {
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemName = s.inventory?.name || s.notes || 'Hardware Item';
        const cashierName = s.users?.full_name || s.users?.username || 'Staff';
        
        let statusBadge = '';
        if (s.is_voided) {
            statusBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700">VOIDED</span>';
        } else {
            statusBadge = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">${s.payment_method}</span>`;
        }

        return `
            <div class="p-3 sm:p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${s.is_voided ? 'opacity-60 bg-slate-50' : 'hover:border-slate-300'}">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-11 h-11 rounded-xl ${s.is_voided ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-700'} font-black flex items-center justify-center text-lg flex-shrink-0">
                        ${s.is_voided ? '✕' : '🛒'}
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-black text-slate-900 text-base truncate ${s.is_voided ? 'line-through text-slate-400' : ''}">${itemName}</span>
                            ${statusBadge}
                        </div>
                        <div class="text-xs sm:text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-2 font-medium">
                            <span>Qty: <b class="text-slate-800">${s.calculated_qty}</b></span>
                            <span>•</span>
                            <span class="font-mono text-xs text-slate-700 font-semibold">${time}</span>
                            <span>•</span>
                            <span class="capitalize text-slate-700 font-semibold">by ${cashierName}</span>
                            ${s.receipt_no ? `<span>•</span><span class="font-mono text-xs text-slate-400">#${s.receipt_no}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div class="text-right">
                        <div class="text-[10px] sm:text-xs text-slate-400 font-bold uppercase">${s.payment_method}</div>
                        <div class="text-base sm:text-lg font-black ${s.is_voided ? 'line-through text-slate-400' : 'text-slate-900'}">
                            KSh ${parseFloat(s.total_charged || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                    </div>
                    ${!s.is_voided ? `
                        <div class="flex items-center gap-1.5">
                            <button class="btn-void-sale px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-bold text-xs sm:text-sm transition" data-id="${s.id}">
                                Void
                            </button>
                        </div>
                    ` : '<span class="text-xs sm:text-sm font-bold text-red-500 px-2.5 py-1 bg-red-50 rounded-lg">Voided</span>'}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-void-sale').forEach(btn => {
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
    modalDebt?.classList.remove('hidden');
});
document.getElementById('btn-collect-debt-from-ledger')?.addEventListener('click', () => {
    loadCustomersDropdown();
    modalDebt?.classList.remove('hidden');
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
        modalDebt?.classList.add('hidden');
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
        if (currentActiveView !== 'products') switchView('products');
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
        setTimeout(focusQuickSearch, 100);
    }
    // Enter in Checkout modal
    else if (e.key === 'Enter' && checkoutModal && !checkoutModal.classList.contains('hidden') && e.target.tagName !== 'BUTTON') {
        if (e.target.id === 'cash-tendered-input' || e.target.id === 'mpesa-amount-input' || e.target.id === 'mpesa-code-input' || e.target.id === 'split-cash-input' || e.target.id === 'split-mpesa-input') {
            e.preventDefault();
            processFinalSale();
        }
    }
});

// ====================================================================
// INITIALIZATION
// ====================================================================
switchView('products');
loadStoreSettings();
loadInventory();
loadCustomersDropdown();
loadTodaysSales();
syncOfflineSales(supabase);
setTimeout(focusQuickSearch, 300);
