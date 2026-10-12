const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('02 - Hardware Inventory Lifecycle & Downstream Assertions');

let testItemId = null;
const uniqueBarcode = `BAR-${Date.now().toString().slice(-6)}`;
const testItemName = `TEST-RHINO-CEMENT-50KG-${Date.now()}`;

runner.test('Should insert a new hardware item and assert downstream DB state', async () => {
    const payload = {
        name: testItemName,
        category: 'Building Materials',
        barcode: uniqueBarcode,
        buying_price: 650.00,
        selling_price: 780.00,
        stock_quantity: 80,
        min_threshold: 15,
        type: 'fixed',
        is_service: false
    };

    const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
    assert(!error, `Failed to insert hardware item: ${error?.message}`);
    assert(data && data.id, 'Inserted item must have a generated ID');
    testItemId = data.id;

    // Observable downstream assertion: Query DB directly
    const { data: dbItem, error: fetchErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', testItemId)
        .single();

    assert(!fetchErr, `Failed to query inserted item: ${fetchErr?.message}`);
    assertEqual(dbItem.name, testItemName, 'Item name must match');
    assertEqual(dbItem.category, 'Building Materials', 'Category must match');
    assertEqual(dbItem.barcode, uniqueBarcode, 'Barcode must match');
    assertCloseTo(parseFloat(dbItem.buying_price), 650.00, 0.01, 'Buying price must match');
    assertCloseTo(parseFloat(dbItem.selling_price), 780.00, 0.01, 'Selling price must match');
    assertEqual(parseInt(dbItem.stock_quantity), 80, 'Stock quantity must match');
    assertEqual(parseInt(dbItem.min_threshold), 15, 'Min threshold must match');
});

runner.test('Should mutate hardware item price and stock and assert downstream DB update', async () => {
    assert(testItemId, 'testItemId must exist');

    const updatePayload = {
        selling_price: 820.00,
        stock_quantity: 75,
        min_threshold: 20
    };

    const { error: updateErr } = await supabase
        .from('inventory')
        .update(updatePayload)
        .eq('id', testItemId);

    assert(!updateErr, `Failed to update item: ${updateErr?.message}`);

    // Observable downstream assertion: Verify mutation in database
    const { data: updatedItem } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', testItemId)
        .single();

    assertCloseTo(parseFloat(updatedItem.selling_price), 820.00, 0.01, 'Updated selling price must persist in DB');
    assertEqual(parseInt(updatedItem.stock_quantity), 75, 'Updated stock must persist in DB');
    assertEqual(parseInt(updatedItem.min_threshold), 20, 'Updated threshold must persist in DB');
});

runner.test('Should query item by live barcode', async () => {
    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('barcode', uniqueBarcode)
        .single();

    assert(!error && data, `Barcode lookup failed: ${error?.message}`);
    assertEqual(data.id, testItemId, 'Barcode query must return exact item');
});

runner.test('Should detect low-stock threshold when stock <= min_threshold', async () => {
    // Set stock to 10 which is below threshold of 20
    await supabase.from('inventory').update({ stock_quantity: 10 }).eq('id', testItemId);

    const { data: item } = await supabase.from('inventory').select('*').eq('id', testItemId).single();
    const isLowStock = item.stock_quantity <= item.min_threshold;
    assert(isLowStock, `Item with stock ${item.stock_quantity} and threshold ${item.min_threshold} must flag low stock`);
});

runner.test('Should delete test hardware item and assert downstream row removal', async () => {
    const { error: delErr } = await supabase.from('inventory').delete().eq('id', testItemId);
    assert(!delErr, `Failed to delete test item: ${delErr?.message}`);

    // Downstream assertion: Row must no longer exist
    const { data: checkItem } = await supabase.from('inventory').select('*').eq('id', testItemId);
    assertEqual(checkItem.length, 0, 'Item must be completely deleted from DB');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
