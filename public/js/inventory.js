/**
 * Litaj Hardware POS — Inventory Controller
 * Layer 01: Client-side form validation before any DB call
 * Layer 03: All queries via Supabase SDK (parameterized — SQL injection mitigated)
 * Layer 04: requireAuth() guard at top of execution
 */

import { supabase, requireAuth, currentUser, formatKsh, showToast } from './supabaseClient.js';

requireAuth();

let inventoryList = [];
let editingItemId = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadInventory();
    bindSearch();
    bindModalHandlers();
    bindFormSubmit();
    bindExport();
});

// ── Fetch Inventory ───────────────────────────────────────────
export async function loadInventory() {
    const tbody = document.getElementById('inventory-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">Loading stock...</td></tr>`;

    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500 text-sm">Error: ${error.message}</td></tr>`;
        showToast('Failed to load inventory', 'error');
        return;
    }

    inventoryList = data || [];
    renderStats();
    renderTable(inventoryList);
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
    const lowCount = inventoryList.filter(i => Number(i.stock_quantity) <= Number(i.min_threshold)).length;
    const totalEl  = document.getElementById('stat-total');
    const lowEl    = document.getElementById('stat-low');
    if (totalEl) totalEl.textContent = inventoryList.length;
    if (lowEl)   lowEl.textContent   = lowCount;
}

// ── Render Table ──────────────────────────────────────────────
function renderTable(items) {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">No products found. Click "Add Product" to begin.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const isLow    = Number(item.stock_quantity) <= Number(item.min_threshold);
        const margin   = Number(item.selling_price) - Number(item.buying_price);
        const isAdmin  = currentUser?.role === 'admin' || currentUser?.role === 'manager';
        return `
            <tr class="border-b border-slate-100 hover:bg-orange-50/30 transition-colors">
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-800 text-sm">${item.name}</div>
                    ${item.barcode ? `<div class="text-[10px] text-slate-400 font-mono">${item.barcode}</div>` : ''}
                    ${item.is_quick_add ? `<span class="text-[9px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full">⚡ Quick Add</span>` : ''}
                </td>
                <td class="py-3 px-4"><span class="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">${item.category}</span></td>
                <td class="py-3 px-4 text-xs font-bold uppercase text-slate-500">${item.unit_of_measure}</td>
                <td class="py-3 px-4 text-right">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        isLow ? 'bg-amber-50 text-orange-700 border-orange-300' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }">
                        ${item.stock_quantity}${isLow ? ' ⚠️' : ''}
                    </span>
                </td>
                <td class="py-3 px-4 text-right text-xs font-mono text-slate-500">${formatKsh(item.buying_price)}</td>
                <td class="py-3 px-4 text-right text-sm font-mono font-black text-slate-900">${formatKsh(item.selling_price)}</td>
                <td class="py-3 px-4 text-right text-xs font-mono font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}">
                    +${formatKsh(margin)}
                </td>
                <td class="py-3 px-4 text-center">
                    <button data-id="${item.id}" class="btn-edit px-2.5 py-1 text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg mr-1 transition-colors">Edit</button>
                    ${isAdmin ? `<button data-id="${item.id}" class="btn-delete px-2.5 py-1 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">Del</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit').forEach(btn =>
        btn.addEventListener('click', () => openModal(btn.dataset.id))
    );
    tbody.querySelectorAll('.btn-delete').forEach(btn =>
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id))
    );
}

// ── Search ────────────────────────────────────────────────────
function bindSearch() {
    document.getElementById('inv-search')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        renderTable(q ? inventoryList.filter(i => i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q) || (i.barcode || '').includes(q)) : inventoryList);
    });
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
    editingItemId = id;
    const form    = document.getElementById('form-product');
    const title   = document.getElementById('modal-product-title');
    const errEl   = document.getElementById('form-error');
    if (!form) return;

    errEl?.classList.add('hidden');
    form.reset();

    if (id) {
        title.textContent = 'Edit Hardware Product';
        const item = inventoryList.find(i => i.id === id);
        if (item) {
            document.getElementById('prod-name').value     = item.name;
            document.getElementById('prod-category').value = item.category;
            document.getElementById('prod-uom').value      = item.unit_of_measure;
            document.getElementById('prod-bp').value       = item.buying_price;
            document.getElementById('prod-sp').value       = item.selling_price;
            document.getElementById('prod-stock').value    = item.stock_quantity;
            document.getElementById('prod-min').value      = item.min_threshold;
            document.getElementById('prod-barcode').value  = item.barcode || '';
            document.getElementById('prod-quickadd').checked = item.is_quick_add;
            updateMarginPreview();
        }
    } else {
        title.textContent = 'Add New Hardware Product';
        document.getElementById('prod-min').value = '5';
        document.getElementById('margin-preview').textContent = 'Ksh 0.00';
    }

    document.getElementById('modal-product').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-product')?.classList.add('hidden');
    editingItemId = null;
}

function bindModalHandlers() {
    document.getElementById('btn-add-product')?.addEventListener('click', () => openModal());
    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);

    // Live margin preview
    ['prod-bp', 'prod-sp'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateMarginPreview);
    });
}

function updateMarginPreview() {
    const bp     = parseFloat(document.getElementById('prod-bp')?.value || 0);
    const sp     = parseFloat(document.getElementById('prod-sp')?.value || 0);
    const margin = sp - bp;
    const el     = document.getElementById('margin-preview');
    if (el) {
        el.textContent = formatKsh(margin);
        el.className   = `text-sm font-black font-mono ${margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`;
    }
}

// ── Form Submit ───────────────────────────────────────────────
function bindFormSubmit() {
    document.getElementById('form-product')?.addEventListener('submit', async e => {
        e.preventDefault();
        const errEl  = document.getElementById('form-error');
        const btn    = document.getElementById('btn-save-product');
        errEl.classList.add('hidden');

        // Layer 01: Client-side validation
        const name = document.getElementById('prod-name').value.trim();
        const sp   = parseFloat(document.getElementById('prod-sp').value);
        const bp   = parseFloat(document.getElementById('prod-bp').value);
        if (!name)          { showError(errEl, 'Product name is required.'); return; }
        if (isNaN(sp) || sp < 0) { showError(errEl, 'Selling price must be 0 or greater.'); return; }
        if (isNaN(bp) || bp < 0) { showError(errEl, 'Buying price must be 0 or greater.'); return; }

        btn.disabled     = true;
        btn.textContent  = 'Saving...';

        const payload = {
            name,
            category:        document.getElementById('prod-category').value,
            unit_of_measure: document.getElementById('prod-uom').value,
            buying_price:    bp,
            selling_price:   sp,
            stock_quantity:  parseFloat(document.getElementById('prod-stock').value) || 0,
            min_threshold:   parseFloat(document.getElementById('prod-min').value) || 5,
            barcode:         document.getElementById('prod-barcode').value.trim() || null,
            is_quick_add:    document.getElementById('prod-quickadd').checked
        };

        try {
            if (editingItemId) {
                const { error } = await supabase.from('inventory').update(payload).eq('id', editingItemId);
                if (error) throw error;
                showToast('Product updated!', 'success');
            } else {
                const { error } = await supabase.from('inventory').insert([payload]);
                if (error) throw error;
                showToast('Product added!', 'success');
            }
            closeModal();
            await loadInventory();
        } catch (err) {
            showError(errEl, err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Save Product';
        }
    });
}

function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ── Delete ────────────────────────────────────────────────────
async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { showToast('Cannot delete: ' + error.message, 'error'); return; }
    showToast('Product deleted.', 'warning');
    await loadInventory();
}

// ── Excel Export ──────────────────────────────────────────────
function bindExport() {
    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
        if (!inventoryList.length) { showToast('No data to export', 'warning'); return; }
        const rows = inventoryList.map(i => ({
            'Product Name':      i.name,
            'Category':          i.category,
            'Unit':              i.unit_of_measure,
            'Stock Qty':         i.stock_quantity,
            'Low Alert At':      i.min_threshold,
            'Buying Price (Ksh)': i.buying_price,
            'Selling Price (Ksh)': i.selling_price,
            'Margin (Ksh)':      Number(i.selling_price) - Number(i.buying_price),
            'Quick Add':         i.is_quick_add ? 'Yes' : 'No',
            'Barcode':           i.barcode || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Litaj Hardware Inventory');
        XLSX.writeFile(wb, `Litaj_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Excel file downloaded!', 'success');
    });
}
