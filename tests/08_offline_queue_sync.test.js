const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('08 - Offline Sales Queue & Cloud Synchronization');

let testItemId = null;
let initialStock = 0;
const testReceipts = [];

// In-memory queue mimicking IndexedDB / localStorage offline store
class OfflineQueueSimulator {
    constructor() {
        this.queue = [];
    }

    enqueue(salePayload) {
        // Enforce required fields
        if (!salePayload.receipt_no || !salePayload.total_charged || !salePayload.item_id) {
            throw new Error('Invalid offline sale payload: Missing required properties');
        }
        const record = {
            id: Date.now() + Math.random(),
            queued_at: Date.now(),
            ...salePayload
        };
        this.queue.push(record);
        return record;
    }

    getPending() {
        return [...this.queue];
    }

    remove(id) {
        this.queue = this.queue.filter(item => item.id !== id);
    }

    clear() {
        this.queue = [];
    }

    async syncToSupabase(supabaseClient) {
        const pending = this.getPending();
        let syncedCount = 0;

        for (const item of pending) {
            const { id, queued_at, ...payload } = item;
            const { error } = await supabaseClient.from('sales_log').insert([payload]);
            if (!error) {
                this.remove(id);
                syncedCount++;
            } else {
                throw new Error(`Sync error for receipt ${payload.receipt_no}: ${error.message}`);
            }
        }
        return syncedCount;
    }
}

const offlineStore = new OfflineQueueSimulator();

runner.test('Should prepare hardware item and initial stock for offline test', async () => {
    const itemData = {
        name: `TEST Offline Pipe ${Date.now()}`,
        category: 'Plumbing',
        buying_price: 300.00,
        selling_price: 500.00,
        stock_quantity: 50,
        min_threshold: 5,
        barcode: `OFFLINE-${Date.now().toString().slice(-6)}`
    };

    const { data, error } = await supabase.from('inventory').insert([itemData]).select().single();
    assert(!error, `Failed to setup test item: ${error?.message}`);
    testItemId = data.id;
    initialStock = data.stock_quantity;
    assertEqual(initialStock, 50, 'Initial stock should be 50');
});

runner.test('Should enqueue valid sales payloads in offline store when disconnected', async () => {
    const prefix = `OFFLINE-${Date.now().toString().slice(-4)}`;

    const sale1 = {
        item_id: testItemId,
        receipt_no: `${prefix}-A`,
        calculated_qty: 3,
        total_charged: 1500.00,
        calculated_profit: 600.00,
        payment_method: 'Cash',
        amount_tendered: 2000.00,
        change_given: 500.00,
        status: 'completed',
        notes: 'Offline sale queued during network outage',
        timestamp: new Date().toISOString()
    };

    const sale2 = {
        item_id: testItemId,
        receipt_no: `${prefix}-B`,
        calculated_qty: 2,
        total_charged: 1000.00,
        calculated_profit: 400.00,
        payment_method: 'M-Pesa',
        amount_tendered: 1000.00,
        change_given: 0.00,
        status: 'completed',
        notes: 'Offline sale queued during network outage',
        timestamp: new Date().toISOString()
    };

    offlineStore.enqueue(sale1);
    offlineStore.enqueue(sale2);

    testReceipts.push(sale1.receipt_no, sale2.receipt_no);

    assertEqual(offlineStore.getPending().length, 2, 'Queue should hold 2 offline transactions');
});

runner.test('Should reject invalid offline payloads missing mandatory properties', () => {
    let errorThrown = false;
    try {
        offlineStore.enqueue({ total_charged: 100 }); // missing receipt_no and item_id
    } catch (e) {
        errorThrown = true;
    }
    assert(errorThrown, 'Queue must reject sales without receipt_no and item_id');
});

runner.test('Should sync offline queue to Supabase and drain queue upon success', async () => {
    const synced = await offlineStore.syncToSupabase(supabase);
    assertEqual(synced, 2, 'Exactly 2 offline transactions should be synced');
    assertEqual(offlineStore.getPending().length, 0, 'Offline queue must be empty after successful sync');
});

runner.test('Should observe synced transactions in Supabase sales_log downstream', async () => {
    const { data: rows, error } = await supabase
        .from('sales_log')
        .select('*')
        .in('receipt_no', testReceipts);

    assert(!error, `Failed to query synced sales: ${error?.message}`);
    assertEqual(rows.length, 2, 'Both synced sales must exist in sales_log');

    const totalSyncedAmount = rows.reduce((acc, r) => acc + parseFloat(r.total_charged), 0);
    assertCloseTo(totalSyncedAmount, 2500.00, 0.01, 'Combined synced revenue should be KSh 2,500.00');
});

runner.test('Should verify observable stock deduction in inventory downstream via triggers', async () => {
    const { data: updatedItem, error } = await supabase
        .from('inventory')
        .select('stock_quantity')
        .eq('id', testItemId)
        .single();

    assert(!error, `Failed to query updated item stock: ${error?.message}`);
    // Sold 3 + 2 = 5 items offline
    const expectedStock = initialStock - 5;
    assertEqual(updatedItem.stock_quantity, expectedStock, `Stock should be decremented from ${initialStock} to ${expectedStock}`);
});

runner.test('Should clean up test offline records and inventory item', async () => {
    await supabase.from('sales_log').delete().in('receipt_no', testReceipts);
    if (testItemId) {
        await supabase.from('inventory').delete().eq('id', testItemId);
    }
    assert(true, 'Cleaned up offline test sales and inventory');
});

runner.run();
