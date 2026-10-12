import { supabase, requireAuth } from './supabaseClient.js';

requireAuth();

let inventoryList = [];

async function load() {
    const tbody = document.getElementById('inv-tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 font-medium">Loading hardware inventory...</td></tr>`;

    try {
        const { data, error } = await supabase.from('inventory').select('*').order('name');
        if (error) throw error;
        inventoryList = data || [];
        renderTable();
    } catch (err) {
        console.error('Error loading inventory:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-red-500 font-bold">Failed to load inventory: ${err.message}</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('inv-tbody');
    const term = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('inv-cat-filter')?.value || 'ALL';
    const sortVal = document.getElementById('inv-sort')?.value || 'name-asc';

    let filtered = inventoryList.filter(item => {
        const matchTerm = !term || 
            item.name.toLowerCase().includes(term) ||
            (item.category && item.category.toLowerCase().includes(term)) ||
            (item.barcode && item.barcode.toLowerCase().includes(term));

        const matchCat = catFilter === 'ALL' || 
            (item.category && item.category.toLowerCase() === catFilter.toLowerCase());

        return matchTerm && matchCat;
    });

    filtered.sort((a, b) => {
        if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
        if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
        if (sortVal === 'stock-low') return (a.stock_quantity || 0) - (b.stock_quantity || 0);
        if (sortVal === 'stock-high') return (b.stock_quantity || 0) - (a.stock_quantity || 0);
        if (sortVal === 'sell-high') return (b.selling_price || 0) - (a.selling_price || 0);
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 font-medium">No inventory products found matching filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        let statusBadge = '';
        if (item.is_service) {
            statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">Service</span>';
        } else if (item.stock_quantity <= 0) {
            statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">Out of Stock</span>';
        } else if (item.stock_quantity <= (item.min_threshold || 10)) {
            statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">Low Stock (${item.stock_quantity})</span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">In Stock</span>`;
        }

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-4 font-bold text-slate-900">${item.name}</td>
                <td class="py-3 px-4 text-xs font-semibold text-slate-600">${item.category || 'General'}</td>
                <td class="py-3 px-4 font-mono text-xs text-slate-400">${item.barcode || '-'}</td>
                <td class="py-3 px-4 text-right font-medium text-slate-600">KSh ${parseFloat(item.buying_price || 0).toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-bold text-slate-900">KSh ${parseFloat(item.selling_price || 0).toFixed(2)}</td>
                <td class="py-3 px-4 text-center font-bold text-slate-800">${item.is_service ? '-' : item.stock_quantity}</td>
                <td class="py-3 px-4 text-center">${statusBadge}</td>
                <td class="py-3 px-4 text-center space-x-1">
                    <button class="btn-edit px-2.5 py-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs transition" data-id="${item.id}">Edit</button>
                    <button class="btn-delete px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition" data-id="${item.id}" data-name="${item.name.replace(/"/g, '&quot;')}">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteItem(btn.dataset.id, btn.dataset.name));
    });
}

// Search and Filter Listeners
document.getElementById('inv-search')?.addEventListener('input', renderTable);
document.getElementById('inv-cat-filter')?.addEventListener('change', renderTable);
document.getElementById('inv-sort')?.addEventListener('change', renderTable);

// Modal Add/Edit
const modalProduct = document.getElementById('modal-product');
const modalTitle = document.getElementById('modal-product-title');

document.getElementById('btn-add-item')?.addEventListener('click', () => {
    modalTitle.textContent = 'Add New Hardware Product';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-category').value = 'Building Materials';
    document.getElementById('prod-barcode').value = '';
    document.getElementById('prod-buying-price').value = '0';
    document.getElementById('prod-selling-price').value = '0';
    document.getElementById('prod-stock').value = '0';
    document.getElementById('prod-min-threshold').value = '10';
    document.getElementById('prod-is-service').checked = false;
    modalProduct.classList.remove('hidden');
    document.getElementById('prod-name').focus();
});

function openEditModal(id) {
    const item = inventoryList.find(i => i.id === id);
    if (!item) return;

    modalTitle.textContent = 'Edit Hardware Product';
    document.getElementById('prod-id').value = item.id;
    document.getElementById('prod-name').value = item.name;
    document.getElementById('prod-category').value = item.category || 'General';
    document.getElementById('prod-barcode').value = item.barcode || '';
    document.getElementById('prod-buying-price').value = item.buying_price || 0;
    document.getElementById('prod-selling-price').value = item.selling_price || 0;
    document.getElementById('prod-stock').value = item.stock_quantity || 0;
    document.getElementById('prod-min-threshold').value = item.min_threshold || 10;
    document.getElementById('prod-is-service').checked = !!item.is_service;
    modalProduct.classList.remove('hidden');
    document.getElementById('prod-name').focus();
}

document.getElementById('btn-save-product')?.addEventListener('click', async () => {
    const id = document.getElementById('prod-id').value;
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const barcode = document.getElementById('prod-barcode').value.trim() || null;
    const buying_price = parseFloat(document.getElementById('prod-buying-price').value || 0);
    const selling_price = parseFloat(document.getElementById('prod-selling-price').value || 0);
    const stock_quantity = parseInt(document.getElementById('prod-stock').value || 0);
    const min_threshold = parseInt(document.getElementById('prod-min-threshold').value || 10);
    const is_service = document.getElementById('prod-is-service').checked;

    if (!name) return alert('Product name is required');
    if (isNaN(selling_price) || selling_price < 0) return alert('Enter valid selling price');

    const payload = {
        name,
        category,
        barcode,
        buying_price,
        selling_price,
        stock_quantity,
        min_threshold,
        is_service,
        type: is_service ? 'variable' : 'fixed'
    };

    const btn = document.getElementById('btn-save-product');
    btn.disabled = true;
    btn.innerHTML = 'Saving...';

    try {
        if (id) {
            const { error } = await supabase.from('inventory').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('inventory').insert([payload]);
            if (error) throw error;
        }

        modalProduct.classList.add('hidden');
        await load();
    } catch (err) {
        alert('Failed to save product: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Save Product';
    }
});

async function deleteItem(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
        const { error } = await supabase.from('inventory').delete().eq('id', id);
        if (error) throw error;
        await load();
    } catch (err) {
        alert('Failed to delete product: ' + err.message);
    }
}

// Export Excel Functionality
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (inventoryList.length === 0) return alert('No inventory to export.');

    const rows = inventoryList.map(i => ({
        'Item Name': i.name,
        'Category': i.category || 'General',
        'Barcode': i.barcode || '',
        'Cost / Buying Price (Ksh)': i.buying_price,
        'Selling Price (Ksh)': i.selling_price,
        'Stock Quantity': i.is_service ? 'N/A' : i.stock_quantity,
        'Min Alert Threshold': i.min_threshold,
        'Is Service': i.is_service ? 'Yes' : 'No'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Litaj_Hardware_Inventory_${dateStr}.xlsx`);
});

// Init
load();
