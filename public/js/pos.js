/**
 * Litaj Hardware POS — POS Terminal Controller
 * Layer 01 (Frontend): Input validation, error states, graceful UX
 * Layer 04 (Auth): requireAuth guard at top of execution
 * Layer 03 (DB): All mutations via Supabase client (parameterized via SDK)
 */

import { supabase, requireAuth, currentUser, formatKsh, showToast } from './supabaseClient.js';

requireAuth();

// ── State ────────────────────────────────────────────────────
let catalog         = [];
let cart            = [];
let customers       = [];
let selectedCustomer = null;
let activeCategory  = 'All';
let pendingPayMethod = null;

const CATEGORIES = ['All', 'Cement & Masonry', 'Plumbing & Pipes', 'Electrical', 'Hand & Power Tools', 'Paint & Thinners', 'Nails & Fasteners', 'Roofing & Timber', 'Safety Equipment', 'General Hardware'];

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    buildCategoryChips();
    await Promise.all([loadCatalog(), loadCustomers(), loadTodayLedger()]);
    bindPaymentButtons();
    bindModalHandlers();
    bindSearchInput();
    bindClearCart();
    bindLedgerRefresh();
});

// ── Catalog ───────────────────────────────────────────────────
async function loadCatalog() {
    const { data, error } = await supabase
        .from('inventory')
        .select('id, name, category, unit_of_measure, selling_price, buying_price, stock_quantity, min_threshold, is_quick_add')
        .eq('is_active', true)
        .order('name');

    if (error) { showToast('Failed to load catalog: ' + error.message, 'error'); return; }
    catalog = data || [];
    renderQuickAdd();
    renderProductGrid(catalog);
}

// ── Quick Add Grid ────────────────────────────────────────────
function renderQuickAdd() {
    const grid = document.getElementById('quick-add-grid');
    const items = catalog.filter(i => i.is_quick_add);
    if (!items.length) { grid.innerHTML = `<div class="col-span-full text-slate-400 text-xs text-center py-2">No quick-add items set in inventory.</div>`; return; }

    grid.innerHTML = items.map(item => `
        <button data-id="${item.id}"
            class="quick-tile text-left p-3 rounded-xl border border-orange-100 bg-orange-50/60 hover:bg-orange-100 hover:border-orange-300 transition-all active:scale-95 shadow-sm">
            <div class="text-xs font-bold text-slate-800 leading-snug line-clamp-2">${item.name}</div>
            <div class="flex items-center justify-between mt-1.5">
                <span class="text-xs font-black text-orange-600 font-mono">${formatKsh(item.selling_price)}</span>
                <span class="text-[9px] text-slate-400 uppercase font-bold">${item.unit_of_measure}</span>
            </div>
        </button>
    `).join('');

    grid.querySelectorAll('.quick-tile').forEach(btn =>
        btn.addEventListener('click', () => addToCart(btn.dataset.id))
    );
}

// ── Category Chips ────────────────────────────────────────────
function buildCategoryChips() {
    const container = document.getElementById('category-chips');
    container.innerHTML = CATEGORIES.map(cat => `
        <button class="category-chip px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 transition-all ${cat === 'All' ? 'active' : ''}" data-cat="${cat}">
            ${cat}
        </button>
    `).join('');

    container.addEventListener('click', e => {
        const btn = e.target.closest('.category-chip');
        if (!btn) return;
        container.querySelectorAll('.category-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        filterAndRender();
    });
}

// ── Product Grid ──────────────────────────────────────────────
function renderProductGrid(items) {
    const grid = document.getElementById('product-grid');
    if (!items.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-8 text-slate-400 text-sm">No products match your search.</div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const isLow = Number(item.stock_quantity) <= Number(item.min_threshold);
        return `
            <button data-id="${item.id}"
                class="product-tile text-left p-3 rounded-xl border bg-white ${isLow ? 'border-amber-300 bg-amber-50/40' : 'border-slate-100 hover:border-orange-300 hover:bg-orange-50/40'} transition-all active:scale-95 shadow-sm">
                <div class="text-xs font-bold text-slate-800 leading-snug line-clamp-2 mb-2">${item.name}</div>
                <div class="text-[10px] text-slate-500 font-medium mb-1 uppercase">${item.category}</div>
                <div class="flex items-end justify-between">
                    <span class="text-sm font-black text-orange-600 font-mono">${formatKsh(item.selling_price)}</span>
                    <span class="text-[10px] ${isLow ? 'text-amber-600 font-bold' : 'text-slate-400'}">${item.stock_quantity} ${item.unit_of_measure}</span>
                </div>
            </button>
        `;
    }).join('');

    grid.querySelectorAll('.product-tile').forEach(btn =>
        btn.addEventListener('click', () => addToCart(btn.dataset.id))
    );
}

// ── Search & Filter ───────────────────────────────────────────
function bindSearchInput() {
    document.getElementById('inp-search').addEventListener('input', filterAndRender);
}

function filterAndRender() {
    const q = document.getElementById('inp-search').value.trim().toLowerCase();
    let items = activeCategory === 'All' ? catalog : catalog.filter(i => i.category === activeCategory);
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q) || (i.barcode || '').includes(q));
    renderProductGrid(items);
}

// ── Cart ──────────────────────────────────────────────────────
function addToCart(itemId, qty = 1) {
    const item = catalog.find(i => i.id === itemId);
    if (!item) return;

    const existing = cart.find(c => c.item_id === itemId);
    if (existing) {
        existing.quantity += qty;
        existing.line_total = existing.quantity * existing.unit_price;
    } else {
        cart.push({
            item_id:       item.id,
            name:          item.name,
            unit_of_measure: item.unit_of_measure,
            unit_price:    Number(item.selling_price),
            buying_price:  Number(item.buying_price),
            quantity:      qty,
            line_total:    Number(item.selling_price) * qty
        });
    }
    renderCart();
    showToast(`${item.name} added to cart`, 'info');
}

window.updateCartQty = (index, value) => {
    const qty = parseFloat(value);
    if (!isNaN(qty) && qty > 0) {
        cart[index].quantity  = qty;
        cart[index].line_total = qty * cart[index].unit_price;
    } else {
        cart.splice(index, 1);
    }
    renderCart();
};

window.removeCartItem = (index) => {
    cart.splice(index, 1);
    renderCart();
};

function bindClearCart() {
    document.getElementById('btn-clear-cart').addEventListener('click', () => {
        if (cart.length && confirm('Clear all items from cart?')) {
            cart = [];
            renderCart();
        }
    });
}

function renderCart() {
    const list     = document.getElementById('cart-items-list');
    const subtotal = document.getElementById('cart-subtotal');
    const total    = document.getElementById('cart-grand-total');
    if (!list) return;

    if (!cart.length) {
        list.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">Cart is empty.<br><span class="text-xs">Select items from the catalog above.</span></div>`;
        subtotal && (subtotal.textContent = 'Ksh 0.00');
        total    && (total.textContent    = 'Ksh 0.00');
        return;
    }

    list.innerHTML = cart.map((line, idx) => `
        <div class="flex items-start gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-slate-800 truncate">${line.name}</div>
                <div class="text-[10px] text-slate-500 font-mono">${formatKsh(line.unit_price)} / ${line.unit_of_measure}</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <input
                    type="number" min="0.1" step="any" value="${line.quantity}"
                    class="w-14 px-1.5 py-1 border border-slate-200 rounded-lg text-center text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none"
                    onchange="updateCartQty(${idx}, this.value)"
                >
                <span class="text-xs font-mono font-black text-slate-900 w-20 text-right">${formatKsh(line.line_total)}</span>
                <button onclick="removeCartItem(${idx})" class="text-slate-300 hover:text-red-500 transition-colors text-sm font-bold ml-0.5">✕</button>
            </div>
        </div>
    `).join('');

    const grand = cart.reduce((s, i) => s + i.line_total, 0);
    subtotal && (subtotal.textContent = formatKsh(grand));
    total    && (total.textContent    = formatKsh(grand));
}

// ── Customers ─────────────────────────────────────────────────
async function loadCustomers() {
    const { data } = await supabase.from('customers').select('id, name, outstanding_debt').order('name');
    customers = data || [];
    const sel = document.getElementById('sel-customer');
    if (!sel) return;
    sel.innerHTML = `<option value="">Walk-in Customer</option>` +
        customers.map(c => `<option value="${c.id}" data-debt="${c.outstanding_debt}">${c.name}${c.outstanding_debt > 0 ? ` (Debt: ${formatKsh(c.outstanding_debt)})` : ''}</option>`).join('');
    sel.addEventListener('change', () => {
        selectedCustomer = customers.find(c => c.id === sel.value) || null;
    });
}

// ── Payment Buttons ───────────────────────────────────────────
function bindPaymentButtons() {
    document.querySelectorAll('.pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!cart.length) { showToast('Add items to cart first.', 'warning'); return; }
            openPaymentModal(btn.dataset.method);
        });
    });
}

function openPaymentModal(method) {
    pendingPayMethod = method;
    const modal = document.getElementById('modal-payment');
    const total  = cart.reduce((s, i) => s + i.line_total, 0);

    document.getElementById('modal-pay-method').textContent = method;
    document.getElementById('modal-pay-total').textContent  = formatKsh(total);
    document.getElementById('mpesa-ref-section').classList.toggle('hidden', method !== 'M-Pesa');
    document.getElementById('cash-tendered-section').classList.toggle('hidden', method !== 'Cash');

    if (method === 'Cash') {
        const tenderedEl  = document.getElementById('inp-tendered');
        const changeEl    = document.getElementById('change-display');
        tenderedEl.value  = '';
        changeEl.textContent = formatKsh(0);
        tenderedEl.addEventListener('input', () => {
            const change = parseFloat(tenderedEl.value || 0) - total;
            changeEl.textContent = formatKsh(Math.max(0, change));
            changeEl.className   = `font-bold text-sm ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`;
        });
    }

    modal.classList.remove('hidden');
}

function bindModalHandlers() {
    document.getElementById('btn-close-payment-modal').addEventListener('click', () =>
        document.getElementById('modal-payment').classList.add('hidden')
    );
    document.getElementById('btn-confirm-sale').addEventListener('click', confirmSale);
}

// ── Checkout & Sale Submission ────────────────────────────────
async function confirmSale() {
    if (!cart.length || !pendingPayMethod) return;
    const btn = document.getElementById('btn-confirm-sale');
    btn.disabled   = true;
    btn.textContent = 'Processing...';

    const total       = cart.reduce((s, i) => s + i.line_total, 0);
    const totalProfit = cart.reduce((s, i) => s + (i.unit_price - i.buying_price) * i.quantity, 0);
    const tendered    = parseFloat(document.getElementById('inp-tendered')?.value || 0);
    const receiptNo   = `LIT-${Date.now().toString().slice(-8)}`;

    try {
        // Insert parent sales_log
        const { data: saleData, error: saleErr } = await supabase
            .from('sales_log')
            .insert([{
                receipt_no:       receiptNo,
                cashier_id:       currentUser?.id || null,
                customer_id:      selectedCustomer?.id || null,
                payment_method:   pendingPayMethod,
                total_charged:    total,
                calculated_profit: totalProfit,
                amount_tendered:  pendingPayMethod === 'Cash' ? tendered : total,
                change_given:     pendingPayMethod === 'Cash' ? Math.max(0, tendered - total) : 0,
                status:           pendingPayMethod === 'Debt' ? 'debt' : 'completed'
            }])
            .select()
            .single();

        if (saleErr) throw saleErr;

        // Insert line items (triggers automatic stock deduction via DB trigger)
        const lines = cart.map(line => ({
            sale_id:             saleData.id,
            item_id:             line.item_id,
            item_name:           line.name,
            quantity:            line.quantity,
            unit_price:          line.unit_price,
            buying_price_at_sale: line.buying_price,
            line_total:          line.line_total,
            profit:              (line.unit_price - line.buying_price) * line.quantity
        }));

        const { error: linesErr } = await supabase.from('sale_items').insert(lines);
        if (linesErr) throw linesErr;

        // Generate receipt
        generateLitajPDF('receipt', receiptNo, pendingPayMethod, [...cart], selectedCustomer, currentUser);

        // Reset state
        document.getElementById('modal-payment').classList.add('hidden');
        cart = [];
        selectedCustomer = null;
        renderCart();
        await Promise.all([loadCatalog(), loadTodayLedger()]);
        showToast(`✅ Sale ${receiptNo} recorded!`, 'success');
    } catch (err) {
        showToast('Sale failed: ' + err.message, 'error');
    } finally {
        btn.disabled   = false;
        btn.textContent = '✅ Confirm & Generate Receipt';
    }
}

// ── Today's Ledger ────────────────────────────────────────────
async function loadTodayLedger() {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('sales_log')
        .select('id, receipt_no, payment_method, total_charged, status, is_voided, created_at, customer_id')
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false });

    const container = document.getElementById('ledger-table');
    if (error || !data?.length) {
        container.innerHTML = `<div class="text-center py-4 text-slate-400 text-sm">${error ? 'Error loading ledger.' : 'No sales recorded today yet.'}</div>`;
        return;
    }

    container.innerHTML = `
        <table class="w-full text-xs">
            <thead>
                <tr class="text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <th class="py-2 text-left font-semibold">Receipt</th>
                    <th class="py-2 text-left font-semibold">Method</th>
                    <th class="py-2 text-right font-semibold">Total</th>
                    <th class="py-2 text-center font-semibold">Status</th>
                    <th class="py-2 text-center font-semibold admin-only">Void</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(s => `
                    <tr class="border-b border-slate-50 hover:bg-slate-50 ${s.is_voided ? 'opacity-40 line-through' : ''}">
                        <td class="py-2 font-mono font-bold text-orange-700">${s.receipt_no}</td>
                        <td class="py-2">${s.payment_method}</td>
                        <td class="py-2 text-right font-mono font-bold">${formatKsh(s.total_charged)}</td>
                        <td class="py-2 text-center">
                            <span class="px-2 py-0.5 rounded-full font-semibold ${s.is_voided ? 'bg-red-100 text-red-600' : s.status === 'debt' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${s.is_voided ? 'Voided' : s.status}
                            </span>
                        </td>
                        <td class="py-2 text-center admin-only">
                            ${!s.is_voided ? `<button class="text-red-500 hover:text-red-700 font-bold btn-void" data-id="${s.id}">Void</button>` : '—'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.querySelectorAll('.btn-void').forEach(btn => {
        btn.addEventListener('click', () => voidSale(btn.dataset.id));
    });

    // Enforce admin-only visibility
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
    container.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
}

async function voidSale(saleId) {
    if (!confirm('Void this sale? This will restore the deducted stock.')) return;
    const { error } = await supabase
        .from('sales_log')
        .update({ is_voided: true, voided_by: currentUser?.id, voided_at: new Date().toISOString() })
        .eq('id', saleId);
    if (error) { showToast('Void failed: ' + error.message, 'error'); return; }
    showToast('Sale voided and stock restored.', 'success');
    await Promise.all([loadCatalog(), loadTodayLedger()]);
}

function bindLedgerRefresh() {
    document.getElementById('btn-refresh-ledger')?.addEventListener('click', loadTodayLedger);
}

// ── Litaj Hardware PDF Generator ─────────────────────────────
export function generateLitajPDF(type = 'receipt', receiptNo, paymentMethod, cartItems, customer, user) {
    const { jsPDF } = window.jspdf;
    const isThermal = type === 'receipt';
    const doc = new jsPDF({ unit: 'mm', format: isThermal ? [80, 200] : 'a4' });
    let y = 8;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 13 : 20);
    doc.setTextColor(234, 88, 12);
    doc.text('LITAJ HARDWARE', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 5 : 8;

    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 7.5 : 10);
    doc.text('Building Materials, Plumbing & Tools', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 4 : 5;
    doc.text(`Receipt: ${receiptNo}  |  ${new Date().toLocaleString('en-KE')}`, isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 6 : 8;

    if (customer) {
        doc.text(`Customer: ${customer.name}`, isThermal ? 5 : 14, y);
        y += isThermal ? 4 : 5;
    }

    const head = isThermal ? [['Item', 'Qty', 'Total']] : [['Item', 'Unit', 'Qty', 'Unit Price', 'Total']];
    const body = cartItems.map(i =>
        isThermal
            ? [i.name.substring(0, 20), `${i.quantity} ${i.unit_of_measure}`, formatKsh(i.line_total)]
            : [i.name, i.unit_of_measure, i.quantity, formatKsh(i.unit_price), formatKsh(i.line_total)]
    );

    doc.autoTable({
        startY: y, head, body, theme: 'plain',
        styles: { fontSize: isThermal ? 7.5 : 10, cellPadding: isThermal ? 1.5 : 3 },
        headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
        margin: { left: isThermal ? 4 : 14, right: isThermal ? 4 : 14 }
    });

    y = doc.lastAutoTable.finalY + 5;
    const grand = cartItems.reduce((s, i) => s + i.line_total, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 10 : 13);
    doc.text(`TOTAL: ${formatKsh(grand)}`, isThermal ? 76 : 196, y, { align: 'right' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 7.5 : 10);
    doc.text(`Payment: ${paymentMethod}  |  Served by: ${user?.full_name || 'Staff'}`, isThermal ? 4 : 14, y);
    if (isThermal) {
        y += 8;
        doc.setFontSize(7);
        doc.text('Thank you for building with Litaj Hardware!', 40, y, { align: 'center' });
    }

    doc.save(`${receiptNo}.pdf`);
}
