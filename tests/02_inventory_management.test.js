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

runner.test('Should simulate packaging tiers addition (Essie model) with Supabase UUIDs', async () => {
    const baseName = `SIM-TIER-NAILS-${Date.now()}`;
    
    // Simulate Tier 2: Box of 100
    const { data: t2, error: t2Err } = await supabase.from('inventory').insert([{
        name: `${baseName} (Box of 100)`,
        type: 'fixed',
        is_service: false,
        tier_level: 2,
        buying_price: 1000.00,
        selling_price: 1500.00,
        stock_quantity: 10,
        units_per_parent: 1,
        parent_id: null
    }]).select().single();

    assert(!t2Err && t2?.id, `Tier 2 insertion failed: ${t2Err?.message}`);
    const parentUuid = t2.id;

    // Simulate Tier 1: Single Piece (Child of Tier 2)
    const { data: t1, error: t1Err } = await supabase.from('inventory').insert([{
        name: `${baseName} (Piece)`,
        type: 'fixed',
        is_service: false,
        tier_level: 1,
        buying_price: 12.00,
        selling_price: 20.00,
        stock_quantity: 0,
        units_per_parent: 100,
        parent_id: parentUuid
    }]).select().single();

    assert(!t1Err && t1?.id, `Tier 1 insertion failed: ${t1Err?.message}`);

    // Downstream assertion: Verify parent_id linkage in DB
    const { data: verifiedChild } = await supabase.from('inventory').select('*').eq('id', t1.id).single();
    assertEqual(verifiedChild.parent_id, parentUuid, 'Child tier must reference parent UUID');
    assertEqual(verifiedChild.units_per_parent, 100, 'Child tier must have units_per_parent = 100');

    // Simulate edit on Tier 1
    const { error: editErr } = await supabase.from('inventory').update({
        selling_price: 22.00,
        stock_quantity: 50
    }).eq('id', t1.id);
    assert(!editErr, `Edit failed: ${editErr?.message}`);

    const { data: editedChild } = await supabase.from('inventory').select('*').eq('id', t1.id).single();
    assertCloseTo(parseFloat(editedChild.selling_price), 22.00, 0.01, 'Edited selling price must persist in DB');
    assertEqual(parseInt(editedChild.stock_quantity), 50, 'Edited stock quantity must persist in DB');

    // Clean up simulated tier items
    await supabase.from('inventory').delete().in('id', [t1.id, t2.id]);
    const { data: cleanupCheck } = await supabase.from('inventory').select('*').in('id', [t1.id, t2.id]);
    assertEqual(cleanupCheck.length, 0, 'Simulated tier items must be completely removed');
});

runner.test('Should verify inventory search and multi-criteria sort behavior', async () => {
    const mockItems = [
        { name: 'Simba Cement 50kg', type: 'fixed', selling_price: 680, buying_price: 620, is_service: false },
        { name: 'Wire Nails 3 Inch', type: 'fixed', selling_price: 160, buying_price: 120, is_service: false },
        { name: 'Delivery Service', type: 'variable', selling_price: 500, buying_price: 0, is_service: true },
        { name: 'Timber 2x4 10ft', type: 'fixed', selling_price: 450, buying_price: 350, is_service: false }
    ];

    // Search simulation: "nail"
    const term = 'nail';
    const searchResults = mockItems.filter(i => 
        i.name.toLowerCase().includes(term) || 
        i.type.toLowerCase().includes(term) || 
        (i.is_service && 'service'.includes(term))
    );
    assertEqual(searchResults.length, 1, 'Search for "nail" must return 1 result');
    assertEqual(searchResults[0].name, 'Wire Nails 3 Inch', 'Search result must match name');

    // Search simulation: "service"
    const svcResults = mockItems.filter(i => 
        i.name.toLowerCase().includes('service') || 
        (i.is_service && 'service'.includes('service'))
    );
    assertEqual(svcResults.length, 1, 'Search for "service" must match service item');

    // Sort: name-asc (A-Z)
    const sortedAsc = [...mockItems].sort((a, b) => a.name.localeCompare(b.name));
    assertEqual(sortedAsc[0].name, 'Delivery Service', 'A-Z sort must place Delivery Service first');
    assertEqual(sortedAsc[3].name, 'Wire Nails 3 Inch', 'A-Z sort must place Wire Nails last');

    // Sort: sell-high (Highest selling price first)
    const sortedSellHigh = [...mockItems].sort((a, b) => b.selling_price - a.selling_price);
    assertEqual(sortedSellHigh[0].selling_price, 680, 'Highest price item must be 680');
    assertEqual(sortedSellHigh[3].selling_price, 160, 'Lowest price item must be 160');

    // Sort: buy-low (Lowest buying price first)
    const sortedBuyLow = [...mockItems].sort((a, b) => a.buying_price - b.buying_price);
    assertEqual(sortedBuyLow[0].buying_price, 0, 'Lowest cost item must be 0 (Service)');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
