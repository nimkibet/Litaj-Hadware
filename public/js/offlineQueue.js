// IndexedDB offline queue for sales
// Queues sales when offline and syncs to Supabase when connectivity returns.

const DB_NAME = 'litaj-offline';
const DB_VERSION = 1;
const STORE = 'pending_sales';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('pending_expenses')) {
                db.createObjectStore('pending_expenses', { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function queueOfflineSale(payload) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add({ ...payload, queued_at: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function getPendingSales() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deletePendingSale(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function insertSaleWithOfflineSupport(supabase, payload) {
    if (!navigator.onLine) {
        await queueOfflineSale(payload);
        console.log('[Offline] Sale queued locally:', payload);
        return { offline: true };
    }
    const { data, error } = await supabase.from('sales_log').insert([payload]).select().single();
    if (error) throw error;
    return { data };
}

export async function syncOfflineSales(supabase) {
    const pending = await getPendingSales();
    if (!pending.length) return;

    console.log(`[Sync] ${pending.length} pending sales to sync...`);
    let synced = 0;

    for (const sale of pending) {
        const { id, queued_at, ...payload } = sale;
        try {
            const { error } = await supabase.from('sales_log').insert([payload]);
            if (!error) {
                await deletePendingSale(id);
                synced++;
            }
        } catch (err) {
            console.warn('[Sync] Failed to sync sale:', err.message);
        }
    }

    if (synced > 0) {
        console.log(`[Sync] Synced ${synced} offline sales`);
        return synced;
    }
    return 0;
}

export async function insertExpenseWithOfflineSupport(supabase, payload, desc) {
    if (!navigator.onLine) {
        const db = await openOfflineDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('pending_expenses', 'readwrite');
            tx.objectStore('pending_expenses').add({ ...payload, _offline_desc: desc, queued_at: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        console.log('[Offline] Expense queued locally:', payload);
        return { offline: true };
    }
    const { data, error } = await supabase.from('expenses').insert([payload]).select().single();
    if (error) throw error;
    return { data };
}

export async function syncOfflineExpenses(supabase) {
    const db = await openOfflineDB();
    const pending = await new Promise((resolve, reject) => {
        const tx = db.transaction('pending_expenses', 'readonly');
        const req = tx.objectStore('pending_expenses').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    if (!pending || !pending.length) return 0;
    console.log(`[Sync] ${pending.length} pending expenses to sync...`);
    
    let synced = 0;
    for (const exp of pending) {
        const { id, queued_at, _offline_desc, ...payload } = exp;
        try {
            const { error } = await supabase.from('expenses').insert([payload]);
            if (!error) {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('pending_expenses', 'readwrite');
                    tx.objectStore('pending_expenses').delete(id);
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                synced++;
            }
        } catch (err) {
            console.warn('[Sync] Failed to sync expense:', err.message);
        }
    }
    return synced;
}
