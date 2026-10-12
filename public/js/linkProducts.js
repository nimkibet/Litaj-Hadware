import { supabase, requireAuth } from './supabaseClient.js';
requireAuth();

let inventory = [];
let draggedItem = null;
let pendingLinks = []; // { parent_id, child_id, units_per_parent }
let renderTree = []; // Local state of hierarchy

async function load() {
    const { data } = await supabase.from('inventory').select('*').order('name');
    inventory = data || [];
    renderAll();
}

function renderAll() {
    const list = document.getElementById('products-list');
    const q = document.getElementById('search-products').value.toLowerCase();
    
    list.innerHTML = inventory
        .filter(i => i.name.toLowerCase().includes(q))
        .map(i => `
        <div class="p-3 bg-white border border-slate-200 rounded-lg mb-2 cursor-grab hover:border-orange-400 shadow-sm flex justify-between items-center" 
             draggable="true" ondragstart="dragStart(event, '${i.id}')">
            <div>
                <div class="font-bold text-sm">${i.name}</div>
                <div class="text-xs text-slate-500">Stock: ${i.stock_quantity} | KSH ${i.selling_price}</div>
            </div>
            <div class="text-xs font-mono text-slate-400 px-2 py-1 bg-slate-100 rounded">ID: ${i.id.substring(0,4)}</div>
        </div>
    `).join('');

    renderHierarchy();
}

window.dragStart = (e, id) => {
    draggedItem = inventory.find(i => i.id === id);
    e.dataTransfer.setData('text/plain', id);
};

// Hierarchy Zone Drop
const zone = document.getElementById('hierarchy-zone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', e => { zone.classList.remove('drag-over'); });
zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (!draggedItem) return;
    
    // Dropped in empty space = Make it a root parent
    if (!renderTree.find(t => t.id === draggedItem.id)) {
        renderTree.push({ ...draggedItem, children: [] });
        document.getElementById('btn-save-links').classList.remove('hidden');
        renderHierarchy();
    }
});

window.dropOnParent = (e, parentId) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById(`parent-${parentId}`).classList.remove('drag-over');
    
    if (!draggedItem || draggedItem.id === parentId) return;
    
    const parentNode = renderTree.find(t => t.id === parentId);
    if (!parentNode) return;

    // Check if child already in this parent
    if (parentNode.children.find(c => c.id === draggedItem.id)) return;

    // Ask for units
    const modal = document.getElementById('link-modal');
    document.getElementById('lm-parent-name').innerText = parentNode.name;
    document.getElementById('lm-child-name').innerText = draggedItem.name;
    
    document.getElementById('lm-units').value = 1;
    document.getElementById('lm-bp').value = draggedItem.buying_price || 0;
    document.getElementById('lm-sp').value = draggedItem.selling_price || 0;
    document.getElementById('lm-stock').value = draggedItem.stock_quantity || 0;

    modal.classList.remove('hidden');

    document.getElementById('lm-cancel').onclick = () => modal.classList.add('hidden');
    document.getElementById('lm-confirm').onclick = () => {
        
        const units = parseInt(document.getElementById('lm-units').value || 1);
        const bp = parseFloat(document.getElementById('lm-bp').value || 0);
        const sp = parseFloat(document.getElementById('lm-sp').value || 0);
        const stock = parseInt(document.getElementById('lm-stock').value || 0);

        
        parentNode.children.push({ ...draggedItem, units_per_parent: units, buying_price: bp, selling_price: sp, stock_quantity: stock });

        
        
        pendingLinks.push({
            parent_id: parentId,
            child_id: draggedItem.id,
            units_per_parent: units,
            buying_price: bp,
            selling_price: sp,
            stock_quantity: stock
        });


        document.getElementById('btn-save-links').classList.remove('hidden');
        modal.classList.add('hidden');
        renderHierarchy();
    };
};

window.dragOverParent = (e, parentId) => {
    e.preventDefault();
    document.getElementById(`parent-${parentId}`).classList.add('drag-over');
};
window.dragLeaveParent = (e, parentId) => {
    document.getElementById(`parent-${parentId}`).classList.remove('drag-over');
};

function renderHierarchy() {
    if (renderTree.length === 0) {
        zone.innerHTML = `<div class="text-center py-10 text-slate-400 font-medium text-sm">Drag a product here to set it as a <strong class="text-slate-600">Parent</strong>, then drop another product into it as a <strong class="text-slate-600">Child</strong>.</div>`;
        return;
    }

    zone.innerHTML = renderTree.map(parent => `
        <div id="parent-${parent.id}" class="bg-white border-2 border-slate-200 rounded-xl p-4 mb-4 transition-colors"
             ondragover="dragOverParent(event, '${parent.id}')" ondragleave="dragLeaveParent(event, '${parent.id}')" ondrop="dropOnParent(event, '${parent.id}')">
            <div class="font-black text-slate-800 text-lg flex items-center gap-2">
                <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                ${parent.name} (Parent)
            </div>
            <div class="text-xs text-slate-500 mt-1 mb-3">Drop child products here.</div>
            
            <div class="space-y-2 pl-4 border-l-2 border-orange-100">
                ${parent.children.length === 0 ? '<div class="text-xs text-slate-400 italic py-2">No children yet. Drop an item here.</div>' : ''}
                ${parent.children.map(child => `
                    <div class="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-100">
                        <div>
                            <span class="font-bold text-sm text-orange-900">${child.name}</span>
                            <span class="text-xs text-orange-600 ml-2">Child Tier</span>
                        </div>
                        <div class="font-bold text-sm text-slate-700 bg-white px-2 py-1 rounded shadow-sm">
                            ${child.units_per_parent} per parent
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

document.getElementById('search-products').addEventListener('input', renderAll);

document.getElementById('btn-save-links').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-links');
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    for (const link of pendingLinks) {
        // Update the child item with the new parent_id and units_per_parent
        
        await supabase.from('inventory').update({
            parent_id: link.parent_id,
            units_per_parent: link.units_per_parent,
            buying_price: link.buying_price,
            selling_price: link.selling_price,
            stock_quantity: link.stock_quantity
        }).eq('id', link.child_id);

    }

    alert('Links saved successfully!');
    pendingLinks = [];
    renderTree = [];
    btn.innerHTML = 'Save Links';
    btn.classList.add('hidden');
    load();
});

load();

// --- Quick Add Product Logic ---
let linkedTiers = { 1: null, 2: null, 3: null };

function setupDropzone(tierNum) {
    const section = document.getElementById(`qa-section-${tierNum}`);
    section.addEventListener('dragover', e => { e.preventDefault(); section.classList.add('bg-orange-100', 'border-orange-400'); });
    section.addEventListener('dragleave', e => { section.classList.remove('bg-orange-100', 'border-orange-400'); });
    section.addEventListener('drop', e => {
        e.preventDefault();
        section.classList.remove('bg-orange-100', 'border-orange-400');
        if (!draggedItem) return;

        linkedTiers[tierNum] = draggedItem;
        
        // Auto-fill
        document.getElementById(`qa-t${tierNum}-name`).value = draggedItem.name;
        document.getElementById(`qa-t${tierNum}-cp`).value = draggedItem.buying_price || 0;
        document.getElementById(`qa-t${tierNum}-sp`).value = draggedItem.selling_price || 0;
        document.getElementById(`qa-t${tierNum}-stock`).value = draggedItem.stock_quantity || 0;
        
        document.getElementById(`qa-linked-badge-${tierNum}`).classList.remove('hidden');
        
        if (tierNum === 2) {
            document.getElementById('qa-t2-en').checked = true;
            document.getElementById('qa-t2-en').dispatchEvent(new Event('change'));
        }
        if (tierNum === 3) {
            document.getElementById('qa-t3-en').checked = true;
            document.getElementById('qa-t3-en').dispatchEvent(new Event('change'));
        }
    });
}

setupDropzone(1);
setupDropzone(2);
setupDropzone(3);

document.getElementById('btn-quick-add').addEventListener('click', async () => {
    const t1Name = document.getElementById('qa-t1-name').value;
    if (!t1Name) { alert("Tier 1 Name is required."); return; }

    const type = document.getElementById('qa-type').value;
    const isService = document.getElementById('qa-svc').checked;
    const btn = document.getElementById('btn-quick-add');
    btn.innerHTML = 'Saving...'; btn.disabled = true;

    const tiers = [];
    
    // Tier 3
    if (document.getElementById('qa-t3-en').checked) {
        tiers.push({
            level: 3, name: document.getElementById('qa-t3-name').value,
            type, is_service: isService, tier_level: 3,
            buying_price: parseFloat(document.getElementById('qa-t3-cp').value||0),
            selling_price: parseFloat(document.getElementById('qa-t3-sp').value||0),
            stock_quantity: parseInt(document.getElementById('qa-t3-stock').value||0),
            units_per_parent: 1, _my_units: parseInt(document.getElementById('qa-t3-units').value||1),
            _linked_product: linkedTiers[3]
        });
    }
    // Tier 2
    if (document.getElementById('qa-t2-en').checked) {
        tiers.push({
            level: 2, name: document.getElementById('qa-t2-name').value,
            type, is_service: isService, tier_level: 2,
            buying_price: parseFloat(document.getElementById('qa-t2-cp').value||0),
            selling_price: parseFloat(document.getElementById('qa-t2-sp').value||0),
            stock_quantity: parseInt(document.getElementById('qa-t2-stock').value||0),
            _my_units: parseInt(document.getElementById('qa-t2-units').value||1),
            _linked_product: linkedTiers[2]
        });
    }
    // Tier 1
    tiers.push({
        level: 1, name: t1Name,
        type, is_service: isService, tier_level: 1,
        buying_price: parseFloat(document.getElementById('qa-t1-cp').value||0),
        selling_price: parseFloat(document.getElementById('qa-t1-sp').value||0),
        stock_quantity: parseInt(document.getElementById('qa-t1-stock').value||0),
        _linked_product: linkedTiers[1]
    });

    let lastParentId = null;
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
            if (error) { alert("Error linking tier " + t.level + ": " + error.message); btn.innerHTML = 'Save Product'; btn.disabled = false; return; }
            lastParentId = t._linked_product.id;
        } else {
            const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
            if (error) { alert("Error saving tier " + t.level + ": " + error.message); btn.innerHTML = 'Save Product'; btn.disabled = false; return; }
            lastParentId = data.id;
        }
    }

    // Reset form
    document.querySelectorAll('#quick-add-form input[type="text"]').forEach(el => el.value = '');
    document.querySelectorAll('#quick-add-form input[type="number"]').forEach(el => el.value = '0');
    document.querySelectorAll('#quick-add-form input[type="checkbox"]').forEach(el => { el.checked = false; el.dispatchEvent(new Event('change')); });
    document.getElementById('qa-t2-units').value = '1';
    document.getElementById('qa-t3-units').value = '1';
    
    linkedTiers = { 1: null, 2: null, 3: null };
    document.getElementById('qa-linked-badge-1').classList.add('hidden');
    document.getElementById('qa-linked-badge-2').classList.add('hidden');
    document.getElementById('qa-linked-badge-3').classList.add('hidden');

    btn.innerHTML = 'Save Product'; btn.disabled = false;
    alert('Products created/linked successfully!');
    load(); // Refresh the list!
});
