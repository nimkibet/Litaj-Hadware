import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';

requireAuth();

let allInventory = [];

async function load() {
    const tb = document.getElementById('inv-tbody');
    if (!tb) return;

    // Show skeleton rows while fetching
    tb.innerHTML = Array(8).fill(0).map(() => `
        <tr class="border-b border-slate-100">
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-16"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-16 ml-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-16 ml-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-12 mx-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-24 mx-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-20 mx-auto"></div></td>
        </tr>
    `).join('');

    try {
        const { data, error } = await supabase.from('inventory').select('*').order('name');
        if (error) throw error;
        allInventory = data || [];
        populateCategoryFilter();
        renderTable();
    } catch (err) {
        console.error('Failed to load inventory:', err);
        tb.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-500 font-bold">Error loading inventory: ${err.message}</td></tr>`;
    }
}

const DEFAULT_CATEGORIES = [
    'Building Materials',
    'Cement & Masonry',
    'Fasteners, Nails & Screws',
    'Roofing & Timber',
    'Plumbing & Pipes',
    'Electrical & Lighting',
    'Paints & Finishes',
    'Hand & Power Tools',
    'Steel, Rebars & Iron Sheets',
    'General Hardware'
];

function populateCategoryFilter() {
    const select = document.getElementById('inv-category-filter');
    const existingCats = Array.from(new Set(allInventory.map(i => i.category || 'General Hardware'))).filter(Boolean);
    const combinedCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...existingCats])).sort();
    
    // Update or dynamically insert category datalist for wizards & inline edits
    let datalist = document.getElementById('category-suggestions');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'category-suggestions';
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = combinedCats.map(c => `<option value="${c}">`).join('');

    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="all">All Categories</option>';
    existingCats.sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (c === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderTable() {
    const tb = document.getElementById('inv-tbody');
    if (!tb) return;

    const term = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
    const sortVal = document.getElementById('inv-sort')?.value || 'name-asc';
    const catVal = document.getElementById('inv-category-filter')?.value || 'all';

    let filtered = allInventory.filter(i => {
        const itemCat = i.category || 'General Hardware';
        if (catVal !== 'all' && itemCat !== catVal) return false;

        const nameMatch = i.name && i.name.toLowerCase().includes(term);
        const catMatch = itemCat.toLowerCase().includes(term);
        const typeMatch = i.type && i.type.toLowerCase().includes(term);
        const serviceMatch = i.is_service && 'service'.includes(term);
        return !term || nameMatch || catMatch || typeMatch || serviceMatch;
    });

    filtered.sort((a, b) => {
        if (sortVal === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        if (sortVal === 'name-desc') return (b.name || '').localeCompare(a.name || '');
        if (sortVal === 'sell-high') return (parseFloat(b.selling_price) || 0) - (parseFloat(a.selling_price) || 0);
        if (sortVal === 'sell-low') return (parseFloat(a.selling_price) || 0) - (parseFloat(b.selling_price) || 0);
        if (sortVal === 'buy-high') return (parseFloat(b.buying_price) || 0) - (parseFloat(a.buying_price) || 0);
        if (sortVal === 'buy-low') return (parseFloat(a.buying_price) || 0) - (parseFloat(b.buying_price) || 0);
        return 0;
    });

    if (filtered.length === 0) {
        tb.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400 font-medium">No inventory products found matching "${term}".</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(i => {
        // Calculate Yield / Packaging text
        let yieldText = '-';
        if (i.parent_id && i.units_per_parent) {
            const parent = allInventory.find(p => p.id === i.parent_id);
            if (parent) {
                yieldText = `<span class="text-xs text-slate-400">1 ${parent.name} = </span><br/><span class="font-bold text-slate-800">${i.units_per_parent} pcs</span>`;
            } else {
                yieldText = `<span class="font-bold text-slate-800">${i.units_per_parent} pcs</span>`;
            }
        } else if (i.units_per_parent > 1) {
            yieldText = `<span class="font-bold text-xs text-slate-500">${i.units_per_parent} pcs (Bulk)</span>`;
        }

        const buyPriceFormatted = parseFloat(i.buying_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const sellPriceFormatted = parseFloat(i.selling_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const safeName = (i.name || 'Unnamed Item').replace(/'/g, "\\'");

        // Main Table Row
        html += `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
            <td class="py-3 px-4 font-bold text-slate-900">
                <div class="leading-tight">${i.name}</div>
                <div class="mt-1">
                    <span class="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">${i.category || 'General Hardware'}</span>
                </div>
            </td>
            <td class="py-3 px-4">
                <span class="px-2.5 py-1 text-xs font-bold rounded-lg ${i.is_service ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'}">
                    ${i.is_service ? 'Service' : (i.type === 'variable' ? 'Variable' : 'Fixed')}
                </span>
            </td>
            <td class="py-3 px-4 text-right font-medium text-slate-600">KSh ${buyPriceFormatted}</td>
            <td class="py-3 px-4 text-right font-bold text-slate-900">KSh ${sellPriceFormatted}</td>
            <td class="py-3 px-4 text-center font-bold text-slate-800">${i.is_service ? '-' : (i.stock_quantity ?? 0)}</td>
            <td class="py-3 px-4 text-center leading-tight">${i.is_service ? '-' : yieldText}</td>
            <td class="py-3 px-4 text-center">
                <button class="bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1 rounded-lg font-bold text-xs mr-2 transition-colors" onclick="toggleEdit('${i.id}')">Edit</button>
                <button class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded-lg font-bold text-xs transition-colors" onclick="del('${i.id}', '${safeName}')">Delete</button>
            </td>
        </tr>
        
        <!-- Inline Edit Row (Hidden by default) -->
        <tr id="edit-row-${i.id}" class="hidden bg-slate-100 border-b-2 border-slate-200 shadow-inner">
            <td colspan="7" class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="md:col-span-3">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Item Name</label>
                        <input type="text" id="edit-name-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.name || ''}">
                    </div>
                    <div class="md:col-span-3">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Category</label>
                        <input type="text" list="category-suggestions" id="edit-cat-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.category || 'General Hardware'}" placeholder="e.g. Cement, Fasteners">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Type</label>
                        <select id="edit-type-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white font-semibold">
                            <option value="fixed" ${i.type === 'fixed' ? 'selected' : ''}>Fixed Price</option>
                            <option value="variable" ${i.type === 'variable' ? 'selected' : ''}>Variable Price</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Buy Price (Ksh)</label>
                        <input type="number" id="edit-bp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.buying_price || 0}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Sell Price (Ksh)</label>
                        <input type="number" id="edit-sp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.selling_price || 0}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Stock Qty</label>
                        <input type="number" id="edit-stock-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.stock_quantity || 0}">
                    </div>
                    <div class="md:col-span-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-t border-slate-100 pt-3 mt-1 gap-3">
                        <div class="flex items-center">
                            <input type="checkbox" id="edit-svc-${i.id}" class="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" ${i.is_service ? 'checked' : ''}>
                            <label for="edit-svc-${i.id}" class="ml-2 text-xs sm:text-sm font-bold text-slate-700">This is a Service (No Stock Deductions)</label>
                        </div>
                        <div class="flex gap-2 w-full sm:w-auto justify-end">
                            <button onclick="openEditWizard('${i.id}')" class="px-3.5 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors">Edit Hierarchy</button>
                            <button onclick="toggleEdit('${i.id}')" class="px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                            <button onclick="saveEdit('${i.id}')" class="px-4 py-2 bg-orange-600 rounded-xl text-xs font-bold text-white hover:bg-orange-700 transition-colors shadow-md shadow-orange-600/20">Save Changes</button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
        `;
    });

    tb.innerHTML = html;
}

window.toggleEdit = (id) => {
    const row = document.getElementById(`edit-row-${id}`);
    if (!row) return;

    if (row.classList.contains('hidden')) {
        // Hide all other open edits first
        document.querySelectorAll('[id^="edit-row-"]').forEach(el => el.classList.add('hidden'));
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
    }
};

window.saveEdit = async (id) => {
    const nameEl = document.getElementById(`edit-name-${id}`);
    const catEl = document.getElementById(`edit-cat-${id}`);
    const typeEl = document.getElementById(`edit-type-${id}`);
    const svcEl = document.getElementById(`edit-svc-${id}`);
    const bpEl = document.getElementById(`edit-bp-${id}`);
    const spEl = document.getElementById(`edit-sp-${id}`);
    const stockEl = document.getElementById(`edit-stock-${id}`);

    const payload = {
        name: nameEl?.value.trim(),
        category: catEl?.value.trim() || 'General Hardware',
        type: typeEl?.value || 'fixed',
        is_service: svcEl?.checked === true,
        buying_price: parseFloat(bpEl?.value || 0),
        selling_price: parseFloat(spEl?.value || 0),
        stock_quantity: parseInt(stockEl?.value || 0)
    };
    
    if (!payload.name) {
        alert("Product name is required");
        return;
    }
    
    // Save to Supabase
    const { error } = await supabase.from('inventory').update(payload).eq('id', id);
    if (error) {
        alert("Error saving: " + error.message);
    } else {
        await load();
    }
};

window.del = (id, name) => { 
    showModal('Delete Item', `
        <div class="space-y-2">
            <p class="text-sm text-slate-700">Are you sure you want to delete <strong class="text-slate-900">${name}</strong>?</p>
            <p class="text-xs text-red-600 font-medium">This will remove this product and unhook it from any linked tiers. This action cannot be undone.</p>
        </div>
    `, async (close) => {
        const { error } = await supabase.from('inventory').delete().eq('id', id);
        if (error) {
            alert("Error deleting item: " + error.message);
            return;
        }
        close();
        await load();
    }, 'Delete Item');
};

// ====================================================================
// SINGLE-SCREEN PACKAGING WIZARD (+ Add New)
// ====================================================================
document.getElementById('btn-add-item')?.addEventListener('click', () => {
    showModal('Single-Screen Packaging Wizard', `
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2" id="pkg-wizard-form">
            <!-- Section 1: Core Info -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <h3 class="text-xs font-black text-slate-800 mb-3 uppercase tracking-wider">1. Core Product Info</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Base Name (e.g. Simba Cement, Wire Nails 3 Inch)</label>
                        <input type="text" id="wiz-name" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none" placeholder="e.g. Simba Cement">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Category</label>
                        <input type="text" list="category-suggestions" id="wiz-category" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="Select or type category..." value="General Hardware">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Type</label>
                        <select id="wiz-type" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white">
                            <option value="fixed">Fixed Price</option>
                            <option value="variable">Variable Price</option>
                        </select>
                    </div>
                    <div class="flex items-center md:col-span-3">
                        <input type="checkbox" id="wiz-is-service" class="mr-2 h-4 w-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500">
                        <label for="wiz-is-service" class="text-xs font-bold text-slate-700">Is Service (No Stock Deductions)</label>
                    </div>
                </div>
            </div>

            <!-- Section 2: Tier 1 Base Unit -->
            <div class="p-4 bg-orange-50/60 border border-orange-200 rounded-2xl">
                <h3 class="text-xs font-black text-orange-800 mb-3 uppercase tracking-wider">2. Tier 1: Base Retail Unit (e.g. Bag, Piece, 1kg)</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="col-span-2 md:col-span-4">
                        <label class="block text-xs font-bold mb-1 text-slate-700">Unit Modifier Name (Optional, e.g. "Piece", "50kg Bag", "1kg")</label>
                        <input type="text" id="wiz-t1-mod" class="w-full border border-orange-300 rounded-xl px-3 py-2 text-sm font-bold placeholder-slate-400 focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. 50kg Bag">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label>
                        <input type="number" id="wiz-t1-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label>
                        <input type="number" id="wiz-t1-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Initial Stock</label>
                        <input type="number" id="wiz-t1-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                </div>
            </div>

            <!-- Section 3: Tier 2 Packet / Bundle / Ream -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">3. Tier 2: Packet / Bundle / Bag</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t2-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t2-body').classList.toggle('hidden', !this.checked)">
                        <label for="wiz-t2-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 2</label>
                    </div>
                </div>
                <div id="t2-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-bold mb-1 text-slate-700">Unit Modifier Name (e.g. "Bundle of 10", "Packet")</label>
                        <input type="text" id="wiz-t2-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold placeholder-slate-400 focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. Bundle">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Units per Packet</label>
                        <input type="number" id="wiz-t2-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. 10">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label>
                        <input type="number" id="wiz-t2-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label>
                        <input type="number" id="wiz-t2-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label>
                        <input type="number" id="wiz-t2-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                </div>
            </div>

            <!-- Section 4: Tier 3 Box / Crate -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">4. Tier 3: Box / Crate</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t3-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t3-body').classList.toggle('hidden', !this.checked)">
                        <label for="wiz-t3-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 3</label>
                    </div>
                </div>
                <div id="t3-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-bold mb-1 text-slate-700">Unit Modifier Name (e.g. "Box")</label>
                        <input type="text" id="wiz-t3-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold placeholder-slate-400 focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. Box">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Packets per Box</label>
                        <input type="number" id="wiz-t3-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. 5">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label>
                        <input type="number" id="wiz-t3-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label>
                        <input type="number" id="wiz-t3-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label>
                        <input type="number" id="wiz-t3-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                </div>
            </div>
            
            <!-- Section 5: Tier 4 Carton / Pallet -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">5. Tier 4: Carton / Pallet</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t4-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t4-body').classList.toggle('hidden', !this.checked)">
                        <label for="wiz-t4-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 4</label>
                    </div>
                </div>
                <div id="t4-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-bold mb-1 text-slate-700">Unit Modifier Name (e.g. "Carton", "Pallet")</label>
                        <input type="text" id="wiz-t4-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold placeholder-slate-400 focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. Carton">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Boxes per Carton</label>
                        <input type="number" id="wiz-t4-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="e.g. 4">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label>
                        <input type="number" id="wiz-t4-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label>
                        <input type="number" id="wiz-t4-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label>
                        <input type="number" id="wiz-t4-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="0">
                    </div>
                </div>
            </div>
        </div>
    `, async (close) => {
        const baseName = document.getElementById('wiz-name')?.value.trim();
        if (!baseName) {
            alert("Base Product Name is required.");
            return;
        }

        const category = document.getElementById('wiz-category')?.value.trim() || 'General Hardware';
        const type = document.getElementById('wiz-type')?.value || 'fixed';
        const isService = document.getElementById('wiz-is-service')?.checked === true;

        // Build tiers top-down (Tier 4 -> Tier 3 -> Tier 2 -> Tier 1)
        const tiers = [];
        const getName = (mod) => mod ? `${baseName} (${mod})` : baseName;

        // Tier 4
        if (document.getElementById('wiz-t4-en')?.checked) {
            tiers.push({
                level: 4,
                name: getName(document.getElementById('wiz-t4-mod')?.value.trim()),
                type,
                is_service: isService,
                tier_level: 4,
                buying_price: parseFloat(document.getElementById('wiz-t4-cp')?.value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t4-sp')?.value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t4-stock')?.value || 0),
                units_per_parent: 1,
                _my_units: parseInt(document.getElementById('wiz-t4-units')?.value || 1)
            });
        }

        // Tier 3
        if (document.getElementById('wiz-t3-en')?.checked) {
            tiers.push({
                level: 3,
                name: getName(document.getElementById('wiz-t3-mod')?.value.trim()),
                type,
                is_service: isService,
                tier_level: 3,
                buying_price: parseFloat(document.getElementById('wiz-t3-cp')?.value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t3-sp')?.value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t3-stock')?.value || 0),
                _my_units: parseInt(document.getElementById('wiz-t3-units')?.value || 1)
            });
        }

        // Tier 2
        if (document.getElementById('wiz-t2-en')?.checked) {
            tiers.push({
                level: 2,
                name: getName(document.getElementById('wiz-t2-mod')?.value.trim()),
                type,
                is_service: isService,
                tier_level: 2,
                buying_price: parseFloat(document.getElementById('wiz-t2-cp')?.value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t2-sp')?.value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t2-stock')?.value || 0),
                _my_units: parseInt(document.getElementById('wiz-t2-units')?.value || 1)
            });
        }

        // Tier 1 (Always added as base retail unit)
        tiers.push({
            level: 1,
            name: getName(document.getElementById('wiz-t1-mod')?.value.trim()),
            type,
            is_service: isService,
            tier_level: 1,
            buying_price: parseFloat(document.getElementById('wiz-t1-cp')?.value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t1-sp')?.value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t1-stock')?.value || 0)
        });

        // Insert sequentially to link parent_id UUIDs properly
        let lastParentId = null;
        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            
            const payload = {
                name: t.name,
                category: category,
                type: t.type,
                is_service: t.is_service,
                tier_level: t.tier_level,
                buying_price: t.buying_price,
                selling_price: t.selling_price,
                stock_quantity: t.stock_quantity,
                parent_id: lastParentId
            };

            // Calculate units_per_parent based on parent tier's package yield
            if (i > 0) {
                payload.units_per_parent = tiers[i-1]._my_units || 1;
            } else {
                payload.units_per_parent = 1; // Top-most enabled tier
            }

            const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
            if (error) {
                alert("Error saving tier " + t.level + ": " + error.message);
                return;
            }
            lastParentId = data.id; // Pass Supabase UUID down to next child
        }

        close();
        await load();
    }, 'Save Packaging Hierarchy', 'max-w-4xl');
});

// ====================================================================
// EDIT PACKAGING HIERARCHY WIZARD
// ====================================================================
window.openEditWizard = async (id) => {
    // 1. Find the selected item
    const selected = allInventory.find(i => i.id === id);
    if (!selected) return;

    // 2. Fetch all inventory items to reconstruct family tree
    const { data: allItems } = await supabase.from('inventory').select('*');
    if (!allItems) return;
    
    // Find absolute root
    let root = selected;
    while (root.parent_id) {
        const p = allItems.find(i => i.id === root.parent_id);
        if (p) root = p; else break;
    }

    // Gather descendants linearly (Top Tier down to Base Tier)
    let current = root;
    let family = [current];
    while (true) {
        const child = allItems.find(i => i.parent_id === current.id);
        if (child) {
            family.push(child);
            current = child;
        } else {
            break;
        }
    }

    // Reverse so family[0] is Tier 1 (Base), family[1] is Tier 2, etc.
    family.reverse();

    const t1 = family[0] || {};
    const t2 = family[1] || null;
    const t3 = family[2] || null;
    const t4 = family[3] || null;

    showModal('Edit Packaging Hierarchy', `
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2" id="pkg-wizard-form">
            <!-- Section 1: Core Info -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <h3 class="text-xs font-black text-slate-800 mb-3 uppercase tracking-wider">1. Core Product Info</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Base Name</label>
                        <input type="text" id="wiz-name" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none" value="${t1.name || ''}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Category</label>
                        <input type="text" list="category-suggestions" id="wiz-category" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.category || 'General Hardware'}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-700">Type</label>
                        <select id="wiz-type" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white">
                            <option value="fixed" ${t1.type === 'fixed' ? 'selected' : ''}>Fixed Price</option>
                            <option value="variable" ${t1.type === 'variable' ? 'selected' : ''}>Variable Price</option>
                        </select>
                    </div>
                    <div class="flex items-center md:col-span-3">
                        <input type="checkbox" id="wiz-is-service" class="mr-2 h-4 w-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" ${t1.is_service ? 'checked' : ''}>
                        <label for="wiz-is-service" class="text-xs font-bold text-slate-700">Is Service (No Stock Deductions)</label>
                    </div>
                </div>
            </div>

            <!-- Tier 1 -->
            <div class="p-4 bg-orange-50/60 border border-orange-200 rounded-2xl">
                <h3 class="text-xs font-black text-orange-800 mb-3 uppercase tracking-wider">2. Tier 1: Base Retail Unit</h3>
                <div class="grid grid-cols-3 gap-3">
                    <div class="col-span-3">
                        <label class="block text-xs font-bold mb-1 text-slate-700">Product Name</label>
                        <input type="text" id="wiz-t1-mod" class="w-full border border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.name || ''}">
                    </div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label><input type="number" id="wiz-t1-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.buying_price || 0}"></div>
                    <div><label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label><input type="number" id="wiz-t1-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.selling_price || 0}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Initial Stock</label><input type="number" id="wiz-t1-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.stock_quantity || 0}"></div>
                </div>
            </div>

            <!-- Tier 2 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">3. Tier 2: Packet / Bundle</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t2-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t2-body').classList.toggle('hidden', !this.checked)" ${t2 ? 'checked' : ''}>
                        <label for="wiz-t2-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 2</label>
                    </div>
                </div>
                <div id="t2-body" class="${t2 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-bold mb-1 text-slate-700">Product Name</label><input type="text" id="wiz-t2-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t2?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 1</label><input type="number" id="wiz-t2-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t1.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label><input type="number" id="wiz-t2-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t2?.buying_price || 0}"></div>
                    <div><label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label><input type="number" id="wiz-t2-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t2?.selling_price || 0}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label><input type="number" id="wiz-t2-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t2?.stock_quantity || 0}"></div>
                </div>
            </div>
            
            <!-- Tier 3 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">4. Tier 3: Box / Crate</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t3-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t3-body').classList.toggle('hidden', !this.checked)" ${t3 ? 'checked' : ''}>
                        <label for="wiz-t3-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 3</label>
                    </div>
                </div>
                <div id="t3-body" class="${t3 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-bold mb-1 text-slate-700">Product Name</label><input type="text" id="wiz-t3-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t3?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 2</label><input type="number" id="wiz-t3-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t2?.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label><input type="number" id="wiz-t3-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t3?.buying_price || 0}"></div>
                    <div><label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label><input type="number" id="wiz-t3-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t3?.selling_price || 0}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label><input type="number" id="wiz-t3-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t3?.stock_quantity || 0}"></div>
                </div>
            </div>
            
            <!-- Tier 4 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">5. Tier 4: Carton / Pallet</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t4-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t4-body').classList.toggle('hidden', !this.checked)" ${t4 ? 'checked' : ''}>
                        <label for="wiz-t4-en" class="text-xs font-bold text-orange-600 cursor-pointer">Enable Tier 4</label>
                    </div>
                </div>
                <div id="t4-body" class="${t4 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-bold mb-1 text-slate-700">Product Name</label><input type="text" id="wiz-t4-mod" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t4?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 3</label><input type="number" id="wiz-t4-units" class="w-full border-2 border-orange-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t3?.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Cost Price (Ksh)</label><input type="number" id="wiz-t4-cp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t4?.buying_price || 0}"></div>
                    <div><label class="block text-xs font-bold mb-1 text-slate-800">Sell Price (Ksh)</label><input type="number" id="wiz-t4-sp" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t4?.selling_price || 0}"></div>
                    <div><label class="block text-xs font-semibold mb-1 text-slate-600">Bulk Stock</label><input type="number" id="wiz-t4-stock" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none bg-white" value="${t4?.stock_quantity || 0}"></div>
                </div>
            </div>
        </div>
    `, async (close) => {
        const category = document.getElementById('wiz-category')?.value.trim() || (t1.category || 'General Hardware');
        const type = document.getElementById('wiz-type')?.value || 'fixed';
        const isService = document.getElementById('wiz-is-service')?.checked === true;

        let t4_enabled = document.getElementById('wiz-t4-en')?.checked === true;
        let t4_payload = t4_enabled ? {
            name: document.getElementById('wiz-t4-mod')?.value.trim(),
            type, is_service: isService, tier_level: 4,
            buying_price: parseFloat(document.getElementById('wiz-t4-cp')?.value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t4-sp')?.value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t4-stock')?.value || 0),
            _my_units: parseInt(document.getElementById('wiz-t4-units')?.value || 1),
            id: t4 ? t4.id : null
        } : null;

        let t3_enabled = document.getElementById('wiz-t3-en')?.checked === true;
        let t3_payload = t3_enabled ? {
            name: document.getElementById('wiz-t3-mod')?.value.trim(),
            type, is_service: isService, tier_level: 3,
            buying_price: parseFloat(document.getElementById('wiz-t3-cp')?.value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t3-sp')?.value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t3-stock')?.value || 0),
            _my_units: parseInt(document.getElementById('wiz-t3-units')?.value || 1),
            id: t3 ? t3.id : null
        } : null;

        let t2_enabled = document.getElementById('wiz-t2-en')?.checked === true;
        let t2_payload = t2_enabled ? {
            name: document.getElementById('wiz-t2-mod')?.value.trim(),
            type, is_service: isService, tier_level: 2,
            buying_price: parseFloat(document.getElementById('wiz-t2-cp')?.value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t2-sp')?.value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t2-stock')?.value || 0),
            _my_units: parseInt(document.getElementById('wiz-t2-units')?.value || 1),
            id: t2 ? t2.id : null
        } : null;

        let t1_payload = {
            name: document.getElementById('wiz-t1-mod')?.value.trim(),
            type, is_service: isService, tier_level: 1,
            buying_price: parseFloat(document.getElementById('wiz-t1-cp')?.value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t1-sp')?.value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t1-stock')?.value || 0),
            id: t1 ? t1.id : null
        };

        const confirmBtn = document.getElementById('litaj-modal-confirm');
        if (confirmBtn) {
            confirmBtn.innerText = 'Updating...';
            confirmBtn.disabled = true;
        }

        try {
            // Delete disabled tiers if they previously existed in DB
            if (!t4_enabled && t4) await supabase.from('inventory').delete().eq('id', t4.id);
            if (!t3_enabled && t3) await supabase.from('inventory').delete().eq('id', t3.id);
            if (!t2_enabled && t2) await supabase.from('inventory').delete().eq('id', t2.id);

            const tiers = [t4_payload, t3_payload, t2_payload, t1_payload].filter(t => t !== null);
            let lastParentId = null;

            for (let i = 0; i < tiers.length; i++) {
                const t = tiers[i];
                if (!t.name) throw new Error("Product names cannot be empty.");
                
                const p = {
                    name: t.name,
                    category: category,
                    type: t.type,
                    is_service: t.is_service,
                    tier_level: t.tier_level,
                    buying_price: t.buying_price,
                    selling_price: t.selling_price,
                    stock_quantity: t.stock_quantity,
                    parent_id: lastParentId
                };
                
                if (i > 0) {
                    p.units_per_parent = tiers[i-1]._my_units || 1;
                } else {
                    p.units_per_parent = 1;
                }
                
                if (t.id) {
                    const { error } = await supabase.from('inventory').update(p).eq('id', t.id);
                    if (error) throw error;
                    lastParentId = t.id;
                } else {
                    const { data, error } = await supabase.from('inventory').insert([p]).select().single();
                    if (error) throw error;
                    lastParentId = data.id;
                }
            }

            close();
            await load();
        } catch (e) {
            alert("Error updating hierarchy: " + e.message);
            if (confirmBtn) {
                confirmBtn.innerText = 'Update Hierarchy';
                confirmBtn.disabled = false;
            }
        }
    }, 'Update Hierarchy', 'max-w-4xl');
};

// ====================================================================
// SEARCH & SORT LISTENERS
// ====================================================================
document.getElementById('inv-search')?.addEventListener('input', renderTable);
document.getElementById('inv-sort')?.addEventListener('change', renderTable);
document.getElementById('inv-category-filter')?.addEventListener('change', renderTable);

// ====================================================================
// EXCEL EXPORT (SheetJS)
// ====================================================================
document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-excel');
    const originalText = btn.innerText;
    
    try {
        btn.innerText = "Exporting...";
        btn.disabled = true;

        const { data, error } = await supabase.from('inventory').select('*').order('name');
        if (error) throw error;
        
        if (!data || data.length === 0) {
            alert("No inventory data to export.");
            return;
        }

        const excelData = data.map(item => ({
            'Item Name': item.name || 'Unnamed Item',
            'Category': item.category || 'General Hardware',
            'Type': item.is_service ? 'Service' : (item.type === 'fixed' ? 'Fixed Price' : 'Variable Price'),
            'Buying Price (Ksh)': item.buying_price || 0,
            'Selling Price (Ksh)': item.selling_price || 0,
            'Stock Quantity': item.is_service ? 'N/A' : (item.stock_quantity || 0),
            'Yield / Units per Parent': item.units_per_parent || 1,
            'Potential Profit per Item (Ksh)': (item.selling_price || 0) - (item.buying_price || 0)
        }));

        if (!window.XLSX) {
            alert("Excel library not loaded. Please check internet connection.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory List");

        const max_name_width = excelData.reduce((w, r) => Math.max(w, (r['Item Name'] || '').length), 20);
        worksheet['!cols'] = [
            { wch: max_name_width + 2 },
            { wch: 22 },
            { wch: 18 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 },
            { wch: 25 },
            { wch: 30 }
        ];

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Litaj_Hardware_Inventory_${dateStr}.xlsx`);
        
    } catch (err) {
        console.error("Export to Excel failed:", err);
        alert("Failed to export Excel: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Load inventory on boot
load();
