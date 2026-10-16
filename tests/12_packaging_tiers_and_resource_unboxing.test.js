const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('12 - Vegas Packaging Tiers, Resource Unboxing & Fractional UoM');

let parentId = null;
let childId = null;
let createdResourceId = null;
const timestamp = Date.now();
const parentName = `TEST-BULK-BOX-WIRE-NAILS-${timestamp}`;
const childName = `TEST-RETAIL-KG-WIRE-NAILS-${timestamp}`;

runner.test('Should insert bulk parent and retail child linked by UUID parent_id', async () => {
    // 1. Insert Parent Tier (e.g. Bulk Box containing 10 kg)
    const { data: parentData, error: parentErr } = await supabase.from('inventory').insert([{
        name: parentName,
        category: 'Fasteners',
        tier_level: 2,
        buying_price: 1200.00,
        selling_price: 1500.00,
        stock_quantity: 5, // 5 boxes
        unit_of_measure: 'box',
        units_per_parent: 1,
        type: 'fixed',
        is_service: false
    }]).select().single();

    assert(!parentErr, `Failed to insert parent bulk item: ${parentErr?.message}`);
    assert(parentData && parentData.id, 'Parent item must have a generated UUID');
    parentId = parentData.id;

    // 2. Insert Child Tier (e.g. Retail 1kg nails linked to parent by UUID)
    const { data: childData, error: childErr } = await supabase.from('inventory').insert([{
        name: childName,
        category: 'Fasteners',
        tier_level: 1,
        buying_price: 130.00,
        selling_price: 180.00,
        stock_quantity: 0, // Out of stock initially
        unit_of_measure: 'kg',
        units_per_parent: 10, // 1 box yields 10 kg
        parent_id: parentId,
        type: 'fixed',
        is_service: false
    }]).select().single();

    assert(!childErr, `Failed to insert child retail item: ${childErr?.message}`);
    assert(childData && childData.id, 'Child item must have a generated UUID');
    childId = childData.id;

    // Verify parent_id linkage in DB
    assertEqual(childData.parent_id, parentId, 'Child parent_id must match parent UUID');
});

runner.test('Should perform automated break-bulk unboxing and log to active resources', async () => {
    // Fetch live state
    const { data: parent } = await supabase.from('inventory').select('*').eq('id', parentId).single();
    const { data: child } = await supabase.from('inventory').select('*').eq('id', childId).single();

    assert(parent && child, 'Parent and child must exist');

    // Simulate Break-Bulk unboxing logic:
    // Need 2.5 kg, child has 0 kg, 1 box yields 10 kg
    const neededQty = 2.5;
    const yieldUnits = parseFloat(child.units_per_parent) || 1;
    const packsNeeded = Math.ceil(neededQty / yieldUnits); // 1 pack
    const packsToOpen = Math.min(parent.stock_quantity, Math.max(1, packsNeeded));
    const addedUnits = packsToOpen * yieldUnits;

    const newParentStock = parent.stock_quantity - packsToOpen; // 5 - 1 = 4
    const newChildStock = child.stock_quantity + addedUnits;   // 0 + 10 = 10

    // 1. Update parent stock in DB
    const { error: pErr } = await supabase.from('inventory').update({ stock_quantity: newParentStock }).eq('id', parent.id);
    assert(!pErr, `Parent update failed: ${pErr?.message}`);

    // 2. Update child stock in DB
    const { error: cErr } = await supabase.from('inventory').update({ stock_quantity: newChildStock }).eq('id', child.id);
    assert(!cErr, `Child update failed: ${cErr?.message}`);

    // 3. Log to resources table with status 'active'
    const parentCost = (parseFloat(parent.buying_price || 0) || 0) * packsToOpen;
    const resourceName = `${parent.name} (Auto-Opened for ${child.name})`;
    const { data: resData, error: resErr } = await supabase.from('resources').insert([{
        name: resourceName,
        units: packsToOpen,
        cost: parentCost,
        status: 'active'
    }]).select().single();

    assert(!resErr, `Failed to insert resource record: ${resErr?.message}`);
    assert(resData && resData.id, 'Resource must have a valid ID');
    createdResourceId = resData.id;

    // Observable downstream assertions:
    const { data: liveParent } = await supabase.from('inventory').select('stock_quantity').eq('id', parentId).single();
    const { data: liveChild } = await supabase.from('inventory').select('stock_quantity').eq('id', childId).single();
    const { data: liveResource } = await supabase.from('resources').select('*').eq('id', createdResourceId).single();

    assertEqual(parseFloat(liveParent.stock_quantity), 4, 'Parent bulk stock must decrement by 1');
    assertEqual(parseFloat(liveChild.stock_quantity), 10, 'Child retail stock must increment by 10');
    assertEqual(liveResource.status, 'active', 'Resource record must have active status');
    assertEqual(liveResource.units, 1, 'Resource units must be 1');
    assertCloseTo(parseFloat(liveResource.cost), 1200.00, 0.01, 'Resource cost must reflect bulk purchase cost');
});

runner.test('Should support fractional sales and stock deductions with decimal precision', async () => {
    // Sell 2.5 kg from the unboxed 10 kg
    const soldQty = 2.5;
    const { data: liveChild } = await supabase.from('inventory').select('stock_quantity').eq('id', childId).single();
    const updatedStock = parseFloat(liveChild.stock_quantity) - soldQty;

    const { error } = await supabase.from('inventory').update({ stock_quantity: updatedStock }).eq('id', childId);
    assert(!error, `Failed to update fractional stock: ${error?.message}`);

    // Verify observable downstream float in Supabase
    const { data: verifiedChild } = await supabase.from('inventory').select('stock_quantity').eq('id', childId).single();
    assertCloseTo(parseFloat(verifiedChild.stock_quantity), 7.5, 0.01, 'Fractional stock must accurately reflect 7.5 kg');
});

runner.test('Should accurately calculate profit margins, markups and loss indicators', () => {
    // Normal Profit case
    const cp1 = 1200;
    const sp1 = 1500;
    const profit1 = sp1 - cp1;
    const margin1 = ((profit1 / sp1) * 100).toFixed(1);
    const markup1 = ((profit1 / cp1) * 100).toFixed(1);

    assertEqual(profit1, 300, 'Profit must be 300');
    assertEqual(margin1, '20.0', 'Margin must be 20.0%');
    assertEqual(markup1, '25.0', 'Markup must be 25.0%');

    // Loss Case
    const cp2 = 200;
    const sp2 = 150;
    const profit2 = sp2 - cp2;
    const lossPct = (((cp2 - sp2) / cp2) * 100).toFixed(1);

    assertEqual(profit2, -50, 'Loss must be -50');
    assertEqual(lossPct, '25.0', 'Loss percentage must be 25.0%');
});

runner.test('Should clean up test inventory tiers and resource logs', async () => {
    if (createdResourceId) {
        await supabase.from('resources').delete().eq('id', createdResourceId);
    }
    if (childId) {
        await supabase.from('inventory').delete().eq('id', childId);
    }
    if (parentId) {
        await supabase.from('inventory').delete().eq('id', parentId);
    }

    // Verify downstream cleanup
    const { data: resCheck } = await supabase.from('resources').select('id').eq('id', createdResourceId || 'none');
    const { data: childCheck } = await supabase.from('inventory').select('id').eq('id', childId || 'none');
    const { data: parentCheck } = await supabase.from('inventory').select('id').eq('id', parentId || 'none');

    assertEqual(resCheck?.length || 0, 0, 'Resource test record must be cleaned up');
    assertEqual(childCheck?.length || 0, 0, 'Child item test record must be cleaned up');
    assertEqual(parentCheck?.length || 0, 0, 'Parent item test record must be cleaned up');
});

if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = runner;
