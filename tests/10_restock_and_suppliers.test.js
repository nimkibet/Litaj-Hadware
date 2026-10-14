const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('10 - Restock & Supplier Orders Workflow (Zero Trust)');

let testSupplierId = null;
let testPoId = null;
let testPoItemId = null;
let testInventoryItemId = null;
const uniqueSuffix = Date.now().toString().slice(-6);
const testSupplierName = `TEST-SUPPLIER-DEVKI-${uniqueSuffix}`;
const testItemName = `TEST-DEVKI-STEEL-BAR-12MM-${uniqueSuffix}`;
const testPoNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uniqueSuffix}`;

runner.test('Should register a new supplier and verify initial zero balance', async () => {
    const payload = {
        name: testSupplierName,
        contact_person: 'John Devki',
        phone: '0712345678',
        email: 'devki@hardware.co.ke',
        address: 'Industrial Area, Nairobi',
        outstanding_balance: 0.00,
        notes: 'Steel rebar primary vendor'
    };

    const { data, error } = await supabase.from('suppliers').insert([payload]).select().single();
    assert(!error, `Failed to insert supplier: ${error?.message}`);
    assert(data && data.id, 'Supplier must have a generated UUID');
    testSupplierId = data.id;

    // Observable downstream assertion
    const { data: dbSupplier } = await supabase.from('suppliers').select('*').eq('id', testSupplierId).single();
    assertEqual(dbSupplier.name, testSupplierName, 'Supplier name must match');
    assertCloseTo(parseFloat(dbSupplier.outstanding_balance), 0.00, 0.01, 'Initial balance must be zero');
});

runner.test('Should create a test hardware inventory item with initial stock', async () => {
    const payload = {
        name: testItemName,
        category: 'Building Materials',
        buying_price: 1200.00,
        selling_price: 1450.00,
        stock_quantity: 20,
        min_threshold: 5,
        type: 'fixed',
        is_service: false
    };

    const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
    assert(!error && data, `Failed to create test inventory item: ${error?.message}`);
    testInventoryItemId = data.id;
    assertEqual(parseInt(data.stock_quantity), 20, 'Initial stock must be 20');
});

runner.test('Should generate a Purchase Order (Generate Order Section) with line items', async () => {
    assert(testSupplierId, 'Supplier ID required');
    assert(testInventoryItemId, 'Inventory Item ID required');

    // 1. Create Purchase Order Header
    const poPayload = {
        po_number: testPoNumber,
        supplier_id: testSupplierId,
        supplier_name: testSupplierName,
        status: 'PENDING',
        payment_status: 'UNPAID',
        total_expected_cost: 60000.00, // 50 pcs * 1200.00
        total_actual_cost: 0.00,
        amount_paid: 0.00,
        payment_method: 'CASH',
        notes: 'Urgent site delivery requested',
        created_by: 'Admin Tester'
    };

    const { data: po, error: poErr } = await supabase.from('purchase_orders').insert([poPayload]).select().single();
    assert(!poErr && po, `Failed to insert PO header: ${poErr?.message}`);
    testPoId = po.id;

    // 2. Insert PO Item Line
    const itemPayload = {
        po_id: testPoId,
        product_id: testInventoryItemId,
        product_name: testItemName,
        ordered_qty: 50,
        expected_buying_price: 1200.00,
        received_qty: 0,
        actual_buying_price: 0.00,
        is_verified: false,
        stock_added: false
    };

    const { data: item, error: itemErr } = await supabase.from('purchase_order_items').insert([itemPayload]).select().single();
    assert(!itemErr && item, `Failed to insert PO line item: ${itemErr?.message}`);
    testPoItemId = item.id;

    // Downstream verification
    const { data: dbPo } = await supabase.from('purchase_orders').select('*').eq('id', testPoId).single();
    assertEqual(dbPo.po_number, testPoNumber, 'PO Number must persist downstream');
    assertEqual(dbPo.status, 'PENDING', 'PO Status must be PENDING');
    assertEqual(dbPo.payment_status, 'UNPAID', 'Payment Status must be UNPAID');
    assertCloseTo(parseFloat(dbPo.total_expected_cost), 60000.00, 0.01, 'Expected cost must be 60000');
});

runner.test('Should verify order line item with price change and assert observable stock increment', async () => {
    assert(testPoId, 'PO ID required');
    assert(testPoItemId, 'PO Item ID required');
    assert(testInventoryItemId, 'Inventory Item ID required');

    // Verification simulation:
    // Goods arrive: Supplier delivers 50 pcs, but buying price increased from 1200.00 to 1250.00
    const receivedQty = 50;
    const actualPrice = 1250.00; // Supplier price variance
    const verifier = 'Admin Verifier';

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('verify_po_item_stock', {
        p_po_id: testPoId,
        p_item_id: testPoItemId,
        p_received_qty: receivedQty,
        p_actual_price: actualPrice,
        p_verifier: verifier
    });

    assert(!rpcErr, `Verification RPC failed: ${rpcErr?.message}`);
    assert(rpcResult && rpcResult.success, 'Verification RPC must report success');

    // Downstream Assertion 1: Inventory stock MUST be incremented (Initial 20 + Received 50 = 70)
    const { data: invItem } = await supabase.from('inventory').select('*').eq('id', testInventoryItemId).single();
    assertEqual(parseInt(invItem.stock_quantity), 70, 'Observable downstream stock must increment to 70');
    assertCloseTo(parseFloat(invItem.buying_price), 1250.00, 0.01, 'Buying price must update to actual delivery price');

    // Downstream Assertion 2: PO Item must be marked verified and stock_added
    const { data: verifiedItem } = await supabase.from('purchase_order_items').select('*').eq('id', testPoItemId).single();
    assertEqual(verifiedItem.is_verified, true, 'PO item is_verified must be true');
    assertEqual(verifiedItem.stock_added, true, 'PO item stock_added must be true');
    assertEqual(parseInt(verifiedItem.received_qty), 50, 'PO item received_qty must be 50');
    assertCloseTo(parseFloat(verifiedItem.actual_buying_price), 1250.00, 0.01, 'Actual buying price must be recorded');

    // Downstream Assertion 3: PO Header status must be RECEIVED and total_actual_cost updated (50 * 1250 = 62500)
    const { data: updatedPo } = await supabase.from('purchase_orders').select('*').eq('id', testPoId).single();
    assertEqual(updatedPo.status, 'RECEIVED', 'PO status must become RECEIVED');
    assertCloseTo(parseFloat(updatedPo.total_actual_cost), 62500.00, 0.01, 'PO total actual cost must be 62500');

    // Downstream Assertion 4: Supplier outstanding balance must reflect unpaid shipment (62500)
    const { data: sup } = await supabase.from('suppliers').select('*').eq('id', testSupplierId).single();
    assertCloseTo(parseFloat(sup.outstanding_balance), 62500.00, 0.01, 'Supplier outstanding balance must reflect unpaid delivery');

    // Downstream Assertion 5: Restock log audit trail must exist
    const { data: logs } = await supabase.from('restock_logs').select('*').eq('po_id', testPoId);
    assertEqual(logs.length, 1, 'Restock audit log must have 1 entry');
    assertEqual(parseInt(logs[0].previous_stock), 20, 'Previous stock in log must be 20');
    assertEqual(parseInt(logs[0].new_stock), 70, 'New stock in log must be 70');
    assertEqual(parseInt(logs[0].quantity_added), 50, 'Quantity added in log must be 50');
});

runner.test('Should record supplier payment and assert downstream debt decrement and PO completion', async () => {
    assert(testSupplierId, 'Supplier ID required');
    assert(testPoId, 'PO ID required');

    // Pay full 62,500 via Bank Transfer
    const { data: payResult, error: payErr } = await supabase.rpc('record_supplier_payment', {
        p_supplier_id: testSupplierId,
        p_po_id: testPoId,
        p_amount: 62500.00,
        p_method: 'BANK',
        p_reference: 'KCB-REF-889922',
        p_notes: 'Full payment for rebar shipment',
        p_user: 'Admin Accountant'
    });

    assert(!payErr, `Payment RPC failed: ${payErr?.message}`);
    assert(payResult && payResult.success, 'Payment RPC must report success');

    // Downstream Assertion 1: Supplier balance must be cleared to 0
    const { data: sup } = await supabase.from('suppliers').select('*').eq('id', testSupplierId).single();
    assertCloseTo(parseFloat(sup.outstanding_balance), 0.00, 0.01, 'Supplier debt balance must be cleared to 0');

    // Downstream Assertion 2: PO status must transition to COMPLETED with payment_status = PAID
    const { data: completedPo } = await supabase.from('purchase_orders').select('*').eq('id', testPoId).single();
    assertEqual(completedPo.status, 'COMPLETED', 'PO status must become COMPLETED');
    assertEqual(completedPo.payment_status, 'PAID', 'PO payment status must become PAID');
    assertCloseTo(parseFloat(completedPo.amount_paid), 62500.00, 0.01, 'PO amount_paid must be 62500');

    // Downstream Assertion 3: Payment record must exist in supplier_payments
    const { data: payments } = await supabase.from('supplier_payments').select('*').eq('po_id', testPoId);
    assertEqual(payments.length, 1, 'Supplier payment log must have 1 entry');
    assertEqual(payments[0].payment_method, 'BANK', 'Payment method must be BANK');
    assertEqual(payments[0].reference, 'KCB-REF-889922', 'Payment reference must match');
});

runner.test('Should clean up test restock records, supplier, and inventory item', async () => {
    if (testPoId) {
        await supabase.from('supplier_payments').delete().eq('po_id', testPoId);
        await supabase.from('restock_logs').delete().eq('po_id', testPoId);
        await supabase.from('purchase_order_items').delete().eq('po_id', testPoId);
        await supabase.from('purchase_orders').delete().eq('id', testPoId);
    }
    if (testSupplierId) {
        await supabase.from('suppliers').delete().eq('id', testSupplierId);
    }
    if (testInventoryItemId) {
        await supabase.from('inventory').delete().eq('id', testInventoryItemId);
    }

    // Verify row cleanup
    const { data: checkPo } = await supabase.from('purchase_orders').select('*').eq('id', testPoId);
    assertEqual(checkPo.length, 0, 'Test PO must be completely removed');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
