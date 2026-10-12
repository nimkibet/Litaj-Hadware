import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();

let allInventory = [];

async function load() {
    const tb = document.getElementById('inv-tbody');
    // Show skeleton rows while fetching
    tb.innerHTML = Array(8).fill(0).map(() => `
        <tr class="border-b border-slate-100">
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-16"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-12 ml-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-12 ml-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-8 mx-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 bg-slate-200 rounded animate-pulse w-24 mx-auto"></div></td>
        </tr>
    `).join('');

    const {data} = await supabase.from('inventory').select('*').order('name');
    allInventory = data || [];
    renderTable();
}

function renderTable() {
    const tb = document.getElementById('inv-tbody');
    const term = document.getElementById('inv-search').value.toLowerCase();
    const sortVal = document.getElementById('inv-sort').value;

    let filtered = allInventory.filter(i => i.name.toLowerCase().includes(term) || (i.type && i.type.toLowerCase().includes(term)));

    filtered.sort((a, b) => {
        if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
        if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
        if (sortVal === 'sell-high') return (b.selling_price || 0) - (a.selling_price || 0);
        if (sortVal === 'sell-low') return (a.selling_price || 0) - (b.selling_price || 0);
        if (sortVal === 'buy-high') return (b.buying_price || 0) - (a.buying_price || 0);
        if (sortVal === 'buy-low') return (a.buying_price || 0) - (b.buying_price || 0);
        return 0;
    });

    let html = '';
    filtered.forEach(i => {
        // Calculate Yield Text
        let yieldText = '-';
        if (i.parent_id && i.units_per_parent) {
            const parent = allInventory.find(p => p.id === i.parent_id);
            if (parent) {
                yieldText = `<span class="text-xs text-slate-400">1 ${parent.name} = </span><br/><span class="font-bold">${i.units_per_parent} pcs</span>`;
            } else {
                yieldText = `<span class="font-bold">${i.units_per_parent} pcs</span>`;
            }
        } else if (i.units_per_parent > 1) {
            yieldText = `<span class="font-bold text-xs text-slate-500">${i.units_per_parent} pcs (Bulk)</span>`;
        }

        // Main Display Row
        html += `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
            <td class="py-3 px-4 font-medium text-slate-800">${i.name}</td>
            <td class="py-3 px-4"><span class="px-2 py-1 text-xs font-bold rounded ${i.is_service ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'}">${i.is_service ? 'Service' : i.type}</span></td>
            <td class="py-3 px-4 text-right">${i.buying_price}</td>
            <td class="py-3 px-4 text-right font-bold text-slate-800">${i.selling_price}</td>
            <td class="py-3 px-4 text-center">${i.is_service ? '-' : i.stock_quantity}</td>
            <td class="py-3 px-4 text-center leading-tight">${i.is_service ? '-' : yieldText}</td>
            <td class="py-3 px-4 text-center">
                <button class="bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1 rounded font-bold text-xs mr-2 transition-colors" onclick="toggleEdit('${i.id}')">Edit</button>
                <button class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded font-bold text-xs transition-colors" onclick="del('${i.id}', '${i.name.replace(/'/g, "\\'")}')">Delete</button>
            </td>
        </tr>
        
        <!-- Inline Edit Row (Hidden by default) -->
        <tr id="edit-row-${i.id}" class="hidden bg-slate-100 border-b-2 border-slate-200 shadow-inner">
            <td colspan="7" class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-6 gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Item Name</label>
                        <input type="text" id="edit-name-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.name}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Type</label>
                        <select id="edit-type-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500">
                            <option value="fixed" ${i.type === 'fixed' ? 'selected' : ''}>Fixed Price</option>
                            <option value="variable" ${i.type === 'variable' ? 'selected' : ''}>Variable Price</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Buy Price (Ksh)</label>
                        <input type="number" id="edit-bp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.buying_price}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Sell Price (Ksh)</label>
                        <input type="number" id="edit-sp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.selling_price}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Stock Qty</label>
                        <input type="number" id="edit-stock-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-shadow" value="${i.stock_quantity}">
                    </div>
                    <div class="md:col-span-6 flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                        <div class="flex items-center">
                            <input type="checkbox" id="edit-svc-${i.id}" class="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" ${i.is_service ? 'checked' : ''}>
                            <label class="ml-2 text-sm font-bold text-slate-700">This is a Service (Raw materials tracked via Admin/Resources)</label>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="openEditWizard('${i.id}')" class="px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm font-bold hover:bg-purple-100 transition-colors">Edit Hierarchy</button>
                              <button onclick="toggleEdit('${i.id}')" class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                            <button onclick="saveEdit('${i.id}')" class="px-4 py-2 bg-orange-600 rounded-lg text-sm font-bold text-white hover:bg-orange-700 transition-colors shadow-md shadow-orange-600/20">Save Changes</button>
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
    if (row.classList.contains('hidden')) {
        // Hide all other open edits first
        document.querySelectorAll('[id^="edit-row-"]').forEach(el => el.classList.add('hidden'));
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
    }
};

window.saveEdit = async (id) => {
    const payload = {
        name: document.getElementById(`edit-name-${id}`).value,
        type: document.getElementById(`edit-type-${id}`).value,
        is_service: document.getElementById(`edit-svc-${id}`).checked,
        buying_price: parseFloat(document.getElementById(`edit-bp-${id}`).value || 0),
        selling_price: parseFloat(document.getElementById(`edit-sp-${id}`).value || 0),
        stock_quantity: parseInt(document.getElementById(`edit-stock-${id}`).value || 0)
    };
    
    if(!payload.name) {
        alert("Name is required");
        return;
    }
    
    // Save to supabase
    const { error } = await supabase.from('inventory').update(payload).eq('id', id);
    if (error) {
        alert("Error saving: " + error.message);
    } else {
        load();
    }
};

window.del = (id, name) => { 
    showModal('Delete Item', `<p>Are you sure you want to delete <strong>${name}</strong>? This action cannot be undone.</p>`, async (close) => {
        await supabase.from('inventory').delete().eq('id',id);
        close(); load();
    }, 'Delete Item');
};

document.getElementById('btn-add-item').addEventListener('click', () => {
    showModal('Single-Screen Packaging Wizard', `
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2" id="pkg-wizard-form">
            <!-- Section 1: Core Info -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 class="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide">1. Core Product Info</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1">Base Name (e.g. A4 Paper)</label>
                        <input type="text" id="wiz-name" class="w-full border rounded-lg px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Type</label>
                        <select id="wiz-type" class="w-full border rounded-lg px-3 py-2 text-sm">
                            <option value="fixed">Fixed Price</option>
                            <option value="variable">Variable Price</option>
                        </select>
                    </div>
                    <div class="flex items-center pt-5">
                        <input type="checkbox" id="wiz-is-service" class="mr-2 h-4 w-4">
                        <label class="text-xs font-semibold">Is Service (No Stock)</label>
                    </div>
                </div>
            </div>

            <!-- Section 2: Tier 1 Base Unit -->
            <div class="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                <h3 class="text-sm font-bold text-orange-800 mb-3 uppercase tracking-wide">2. Tier 1: Base Retail Unit (e.g. Single Sheet)</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="col-span-2 md:col-span-4">
                        <label class="block text-xs font-semibold mb-1">Unit Modifier Name (Optional, e.g. "Sheet")</label>
                        <input type="text" id="wiz-t1-mod" class="w-full border rounded-lg px-3 py-2 text-sm placeholder-slate-400" placeholder="e.g. Sheet">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cost Price</label>
                        <input type="number" id="wiz-t1-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Sell Price</label>
                        <input type="number" id="wiz-t1-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Initial Stock</label>
                        <input type="number" id="wiz-t1-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>

            <!-- Section 3: Tier 2 Packet/Ream -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">3. Tier 2: Packet / Ream</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t2-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t2-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-orange-600">Enable Tier 2</label>
                    </div>
                </div>
                <div id="t2-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1">Unit Modifier Name (e.g. "Ream")</label>
                        <input type="text" id="wiz-t2-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Ream">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Units per Packet</label>
                        <input type="number" id="wiz-t2-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 500">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cost Price</label>
                        <input type="number" id="wiz-t2-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Sell Price</label>
                        <input type="number" id="wiz-t2-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Bulk Stock</label>
                        <input type="number" id="wiz-t2-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>

            <!-- Section 4: Tier 3 Box -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">4. Tier 3: Box</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t3-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t3-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-orange-600">Enable Tier 3</label>
                    </div>
                </div>
                <div id="t3-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1">Unit Modifier Name (e.g. "Box")</label>
                        <input type="text" id="wiz-t3-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Box">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Packets per Box</label>
                        <input type="number" id="wiz-t3-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 5">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cost Price</label>
                        <input type="number" id="wiz-t3-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Sell Price</label>
                        <input type="number" id="wiz-t3-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Bulk Stock</label>
                        <input type="number" id="wiz-t3-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>
            
            <!-- Section 5: Tier 4 Carton -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">5. Tier 4: Carton</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t4-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t4-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-orange-600">Enable Tier 4</label>
                    </div>
                </div>
                <div id="t4-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1">Unit Modifier Name (e.g. "Carton")</label>
                        <input type="text" id="wiz-t4-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Carton">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-orange-700 mb-1">Boxes per Carton</label>
                        <input type="number" id="wiz-t4-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 4">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cost Price</label>
                        <input type="number" id="wiz-t4-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Sell Price</label>
                        <input type="number" id="wiz-t4-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Bulk Stock</label>
                        <input type="number" id="wiz-t4-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>

        </div>
    `, async (close) => {
        const baseName = document.getElementById('wiz-name').value;
        if (!baseName) {
            alert("Base Name is required.");
            return;
        }

        const type = document.getElementById('wiz-type').value;
        const isService = document.getElementById('wiz-is-service').checked;

        // Build tiers top-down
        const tiers = [];
        
        // Helper to construct item name
        const getName = (mod) => mod ? `${baseName} (${mod})` : baseName;

        // Tier 4
        if (document.getElementById('wiz-t4-en').checked) {
            tiers.push({
                level: 4,
                name: getName(document.getElementById('wiz-t4-mod').value),
                type, is_service: isService, tier_level: 4,
                
                buying_price: parseFloat(document.getElementById('wiz-t4-cp').value||0),
                selling_price: parseFloat(document.getElementById('wiz-t4-sp').value||0),
                stock_quantity: parseInt(document.getElementById('wiz-t4-stock').value||0),
                units_per_parent: 1, // Top level has no parent
                _my_units: parseInt(document.getElementById('wiz-t4-units').value||1)
            });
        }

        // Tier 3
        if (document.getElementById('wiz-t3-en').checked) {
            tiers.push({
                level: 3,
                name: getName(document.getElementById('wiz-t3-mod').value),
                type, is_service: isService, tier_level: 3,
                
                buying_price: parseFloat(document.getElementById('wiz-t3-cp').value||0),
                selling_price: parseFloat(document.getElementById('wiz-t3-sp').value||0),
                stock_quantity: parseInt(document.getElementById('wiz-t3-stock').value||0),
                _my_units: parseInt(document.getElementById('wiz-t3-units').value||1)
            });
        }

        // Tier 2
        if (document.getElementById('wiz-t2-en').checked) {
            tiers.push({
                level: 2,
                name: getName(document.getElementById('wiz-t2-mod').value),
                type, is_service: isService, tier_level: 2,
                
                buying_price: parseFloat(document.getElementById('wiz-t2-cp').value||0),
                selling_price: parseFloat(document.getElementById('wiz-t2-sp').value||0),
                stock_quantity: parseInt(document.getElementById('wiz-t2-stock').value||0),
                _my_units: parseInt(document.getElementById('wiz-t2-units').value||1)
            });
        }

        // Tier 1 (Always added)
        tiers.push({
            level: 1,
            name: getName(document.getElementById('wiz-t1-mod').value),
            type, is_service: isService, tier_level: 1,
            
            buying_price: parseFloat(document.getElementById('wiz-t1-cp').value||0),
            selling_price: parseFloat(document.getElementById('wiz-t1-sp').value||0),
            stock_quantity: parseInt(document.getElementById('wiz-t1-stock').value||0)
        });

        // Insert sequentially to link parent_ids properly
        let lastParentId = null;
        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            
            const payload = {
                name: t.name,
                type: t.type,
                is_service: t.is_service,
                tier_level: t.tier_level,
                
                buying_price: t.buying_price,
                selling_price: t.selling_price,
                stock_quantity: t.stock_quantity,
                parent_id: lastParentId
            };

            // Calculate units_per_parent based on previous tier
            if (i > 0) {
                // The current tier is a child of the previous tier
                // So units_per_parent is how many of THIS item fit into the PARENT item
                payload.units_per_parent = tiers[i-1]._my_units || 1;
            } else {
                payload.units_per_parent = 1; // Top-most enabled tier
            }

            const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
            if (error) {
                alert("Error saving tier " + t.level + ": " + error.message);
                return; // Stop execution on error
            }
            lastParentId = data.id; // Pass ID down to next child
        }

        close();
        load();
    }, 'Save Packaging Hierarchy', 'max-w-4xl');
});


load();
document.getElementById('inv-search').addEventListener('input', renderTable);
document.getElementById('inv-sort').addEventListener('change', renderTable);

document.getElementById('btn-export-excel').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-excel');
    const originalText = btn.innerText;
    
    try {
        btn.innerText = "Exporting...";
        btn.disabled = true;

        // Fetch fresh data directly from Supabase
        const { data, error } = await supabase.from('inventory').select('*').order('name');
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            alert("No inventory data to export.");
            return;
        }

        // Prepare data for Excel
        const excelData = data.map(item => ({
            'Item Name': item.name || 'Unnamed Item',
            'Category': item.is_service ? 'Service' : (item.type === 'fixed' ? 'Fixed Price' : 'Variable Price'),
            'Buying Price (Ksh)': item.buying_price || 0,
            'Selling Price (Ksh)': item.selling_price || 0,
            'Stock Quantity': item.is_service ? 'N/A' : (item.stock_quantity || 0),
            'Potential Profit per Item (Ksh)': (item.selling_price || 0) - (item.buying_price || 0)
        }));

        // Create a new workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory List");

        // Auto-size columns for better formatting
        const max_name_width = excelData.reduce((w, r) => Math.max(w, r['Item Name'].length), 20);
        worksheet['!cols'] = [
            { wch: max_name_width + 2 }, // Item Name
            { wch: 15 }, // Category
            { wch: 20 }, // Buying Price
            { wch: 20 }, // Selling Price
            { wch: 15 }, // Stock Quantity
            { wch: 30 }  // Potential Profit
        ];

        // Generate Excel file and trigger download
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Litaj_Hardware_Inventory_${dateStr}.xlsx`);
        
    } catch (err) {
        console.error("Export to Excel failed:", err);
        alert("Failed to export Excel. Please check console for details.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

window.openEditWizard = async (id) => {
    // 1. Find the item to see its name and parent_id
    const selected = allInventory.find(i => i.id === id);
    if (!selected) return;

    // 2. Fetch the entire family tree. We fetch everything to reconstruct the tree locally easily
    const { data: allItems } = await supabase.from('inventory').select('*');
    
    // Find the absolute root
    let root = selected;
    while(root.parent_id) {
        const p = allItems.find(i => i.id === root.parent_id);
        if(p) root = p; else break; // safety
    }

    // Now gather descendants linearly (Tier 4 down to Tier 1)
    // Actually, root is the top level (e.g. Carton). Let's trace down.
    let current = root;
    let family = [current];
    while(true) {
        const child = allItems.find(i => i.parent_id === current.id);
        if(child) {
            family.push(child);
            current = child;
        } else {
            break;
        }
    }

    // Now family array has the items from Top Tier to Base Tier.
    // We reverse it to map to Tier 1, 2, 3, 4 where Tier 1 is Base
    family.reverse();

    const t1 = family[0] || {};
    const t2 = family[1] || null;
    const t3 = family[2] || null;
    const t4 = family[3] || null;

    // We reuse the showModal HTML but pre-fill it!
    showModal('Edit Packaging Hierarchy', `
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2" id="pkg-wizard-form">
            <!-- Section 1: Core Info -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 class="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide">1. Core Product Info</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1">Base Name (Optional)</label>
                        <input type="text" id="wiz-name" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t1.name || ''}">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Type</label>
                        <select id="wiz-type" class="w-full border rounded-lg px-3 py-2 text-sm">
                            <option value="fixed" ${t1.type === 'fixed' ? 'selected' : ''}>Fixed Price</option>
                            <option value="variable" ${t1.type === 'variable' ? 'selected' : ''}>Variable Price</option>
                        </select>
                    </div>
                    <div class="flex items-center pt-5">
                        <input type="checkbox" id="wiz-is-service" class="mr-2 h-4 w-4" ${t1.is_service ? 'checked' : ''}>
                        <label class="text-xs font-semibold">Is Service</label>
                    </div>
                </div>
            </div>

            <!-- Tier 1 -->
            <div class="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                <h3 class="text-sm font-bold text-orange-800 mb-3 uppercase tracking-wide">2. Tier 1: Base Retail Unit</h3>
                <div class="grid grid-cols-3 gap-3">
                    <div class="col-span-3">
                        <label class="block text-xs font-semibold mb-1">Product Name</label>
                        <input type="text" id="wiz-t1-mod" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t1.name || ''}">
                    </div>
                    <div><label class="block text-xs font-semibold mb-1">Cost Price</label><input type="number" id="wiz-t1-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t1.buying_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Sell Price</label><input type="number" id="wiz-t1-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t1.selling_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Initial Stock (Pieces)</label><input type="number" id="wiz-t1-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t1.stock_quantity||0}"></div>
                </div>
            </div>

            <!-- Tier 2 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">3. Tier 2</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t2-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t2-body').classList.toggle('hidden', !this.checked)" ${t2 ? 'checked' : ''}>
                        <label class="text-xs font-bold text-orange-600">Enable Tier 2</label>
                    </div>
                </div>
                <div id="t2-body" class="${t2 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-semibold mb-1">Product Name</label><input type="text" id="wiz-t2-mod" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t2?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 1 (Base)</label><input type="number" id="wiz-t2-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" value="${t1.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Cost Price</label><input type="number" id="wiz-t2-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t2?.buying_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Sell Price</label><input type="number" id="wiz-t2-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t2?.selling_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Bulk Stock</label><input type="number" id="wiz-t2-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t2?.stock_quantity||0}"></div>
                </div>
            </div>
            
            <!-- Tier 3 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">4. Tier 3</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t3-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t3-body').classList.toggle('hidden', !this.checked)" ${t3 ? 'checked' : ''}>
                        <label class="text-xs font-bold text-orange-600">Enable Tier 3</label>
                    </div>
                </div>
                <div id="t3-body" class="${t3 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-semibold mb-1">Product Name</label><input type="text" id="wiz-t3-mod" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t3?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 2</label><input type="number" id="wiz-t3-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" value="${t2?.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Cost Price</label><input type="number" id="wiz-t3-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t3?.buying_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Sell Price</label><input type="number" id="wiz-t3-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t3?.selling_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Bulk Stock</label><input type="number" id="wiz-t3-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t3?.stock_quantity||0}"></div>
                </div>
            </div>
            
            <!-- Tier 4 -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">5. Tier 4</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t4-en" class="mr-2 h-4 w-4 text-orange-600 rounded" onchange="document.getElementById('t4-body').classList.toggle('hidden', !this.checked)" ${t4 ? 'checked' : ''}>
                        <label class="text-xs font-bold text-orange-600">Enable Tier 4</label>
                    </div>
                </div>
                <div id="t4-body" class="${t4 ? '' : 'hidden'} grid grid-cols-4 gap-3">
                    <div class="col-span-4"><label class="block text-xs font-semibold mb-1">Product Name</label><input type="text" id="wiz-t4-mod" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t4?.name || ''}"></div>
                    <div><label class="block text-xs font-bold text-orange-700 mb-1">Total Pieces in ONE Tier 3</label><input type="number" id="wiz-t4-units" class="w-full border-2 border-orange-300 rounded-lg px-3 py-2 text-sm font-bold" value="${t3?.units_per_parent || 1}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Cost Price</label><input type="number" id="wiz-t4-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t4?.buying_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Sell Price</label><input type="number" id="wiz-t4-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t4?.selling_price||0}"></div>
                    <div><label class="block text-xs font-semibold mb-1">Bulk Stock</label><input type="number" id="wiz-t4-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="${t4?.stock_quantity||0}"></div>
                </div>
            </div>
        </div>
    `, async (close) => {
        const type = document.getElementById('wiz-type').value;
        const isService = document.getElementById('wiz-is-service').checked;

        let t4_enabled = document.getElementById('wiz-t4-en').checked;
        let t4_payload = t4_enabled ? {
            name: document.getElementById('wiz-t4-mod').value,
            type, is_service: isService, tier_level: 4,
            buying_price: parseFloat(document.getElementById('wiz-t4-cp').value||0),
            selling_price: parseFloat(document.getElementById('wiz-t4-sp').value||0),
            stock_quantity: parseInt(document.getElementById('wiz-t4-stock').value||0),
            _my_units: parseInt(document.getElementById('wiz-t4-units').value||1),
            id: t4 ? t4.id : null
        } : null;

        let t3_enabled = document.getElementById('wiz-t3-en').checked;
        let t3_payload = t3_enabled ? {
            name: document.getElementById('wiz-t3-mod').value,
            type, is_service: isService, tier_level: 3,
            buying_price: parseFloat(document.getElementById('wiz-t3-cp').value||0),
            selling_price: parseFloat(document.getElementById('wiz-t3-sp').value||0),
            stock_quantity: parseInt(document.getElementById('wiz-t3-stock').value||0),
            _my_units: parseInt(document.getElementById('wiz-t3-units').value||1),
            id: t3 ? t3.id : null
        } : null;

        let t2_enabled = document.getElementById('wiz-t2-en').checked;
        let t2_payload = t2_enabled ? {
            name: document.getElementById('wiz-t2-mod').value,
            type, is_service: isService, tier_level: 2,
            buying_price: parseFloat(document.getElementById('wiz-t2-cp').value||0),
            selling_price: parseFloat(document.getElementById('wiz-t2-sp').value||0),
            stock_quantity: parseInt(document.getElementById('wiz-t2-stock').value||0),
            _my_units: parseInt(document.getElementById('wiz-t2-units').value||1),
            id: t2 ? t2.id : null
        } : null;

        let t1_payload = {
            name: document.getElementById('wiz-t1-mod').value,
            type, is_service: isService, tier_level: 1,
            buying_price: parseFloat(document.getElementById('wiz-t1-cp').value||0),
            selling_price: parseFloat(document.getElementById('wiz-t1-sp').value||0),
            stock_quantity: parseInt(document.getElementById('wiz-t1-stock').value||0),
            id: t1 ? t1.id : null
        };

        const btn = document.getElementById('modal-btn-confirm');
        if(btn) { btn.innerText = 'Updating...'; btn.disabled = true; }

        try {
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
            load();
        } catch (e) {
            alert("Error updating hierarchy: " + e.message);
            if(btn) { btn.innerText = 'Update Hierarchy'; btn.disabled = false; }
        }
    }, 'Update Hierarchy', 'max-w-4xl');
};
