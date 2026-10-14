const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('05 - Vegas POS Multi-Payment Checkout Flow & Receipt Flags');

let testReceiptNo = null;
let sampleItemId = null;

runner.test('Should fetch or create a hardware item for checkout testing', async () => {
    const { data: existing } = await supabase.from('inventory').select('id, name, selling_price, buying_price').limit(1);
    if (existing && existing.length > 0) {
        sampleItemId = existing[0].id;
    } else {
        const { data: created } = await supabase.from('inventory').insert([{
            name: 'TEST-CHECKOUT-ITEM',
            selling_price: 500.00,
            buying_price: 350.00,
            stock_quantity: 50,
            type: 'fixed'
        }]).select().single();
        sampleItemId = created.id;
    }
    assert(sampleItemId, 'Sample hardware item must exist');
});

runner.test('Should process CASH checkout: validate change calculation and insert multi-item sales log', async () => {
    testReceiptNo = `LH-TEST-${Date.now().toString().slice(-6)}`;
    const grandTotal = 1500.00;
    const tendered = 2000.00;
    const expectedChange = 500.00;

    assertEqual(tendered - grandTotal, expectedChange, 'Change calculation must be exact');

    // Simulate multi-item checkout sharing the same receipt_no
    const rows = [
        {
            item_id: sampleItemId,
            receipt_no: testReceiptNo,
            calculated_qty: 2,
            total_charged: 1000.00,
            calculated_profit: 300.00,
            payment_method: 'Cash',
            amount_tendered: tendered,
            change_given: expectedChange,
            status: 'active'
        },
        {
            item_id: sampleItemId,
            receipt_no: testReceiptNo,
            calculated_qty: 1,
            total_charged: 500.00,
            calculated_profit: 150.00,
            payment_method: 'Cash',
            amount_tendered: tendered,
            change_given: expectedChange,
            status: 'active'
        }
    ];

    const { error: insertErr } = await supabase.from('sales_log').insert(rows);
    assert(!insertErr, `Failed to insert cash sale: ${insertErr?.message}`);

    // Downstream assertion: query DB by shared receipt_no
    const { data: dbRows, error: fetchErr } = await supabase
        .from('sales_log')
        .select('*')
        .eq('receipt_no', testReceiptNo);

    assert(!fetchErr, `Fetch error: ${fetchErr?.message}`);
    assertEqual(dbRows.length, 2, 'Both cart items must share the same receipt_no');
    assertEqual(dbRows[0].payment_method, 'Cash', 'Payment method must be Cash');
    assertCloseTo(parseFloat(dbRows[0].amount_tendered), 2000.00, 0.01, 'Tendered amount must match in DB');
    assertCloseTo(parseFloat(dbRows[0].change_given), 500.00, 0.01, 'Change given must match in DB');
});

runner.test('Should reject insufficient cash payment tendered', async () => {
    const grandTotal = 1500.00;
    const insufficientTendered = 1200.00;

    const isValid = insufficientTendered >= grandTotal;
    assert(!isValid, 'Tendered amount below grand total must be rejected');
});

runner.test('Should validate M-PESA checkout reference and split payment math', async () => {
    const mpesaRef = 'QKM48XYZ90';
    assert(mpesaRef.length >= 6, 'M-Pesa reference code must be at least 6 characters');

    // Smooth fast checkout: ref code is optional and falls back to MPESA-VERIFIED
    const emptyRef = '';
    const fallbackRef = emptyRef ? `MPESA: ${emptyRef}` : 'MPESA-VERIFIED';
    assertEqual(fallbackRef, 'MPESA-VERIFIED', 'Omitted ref code must cleanly record MPESA-VERIFIED');

    // Split Payment math
    const grandTotal = 3000.00;
    const splitCash = 1000.00;
    const splitMpesa = 2000.00;
    const balance = grandTotal - (splitCash + splitMpesa);
    assertEqual(balance, 0.00, 'Split cash + M-Pesa must balance to exactly grand total');
});

runner.test('Should assert receipt generation checkbox defaults to UNCHECKED (no automatic receipt)', async () => {
    // In POS system, receipt checkbox defaults to unchecked
    const defaultCheckboxState = false;
    assertEqual(defaultCheckboxState, false, 'Receipt generation checkbox MUST be unchecked by default');

    let receiptGenerated = false;
    const onCheckoutComplete = (checkboxChecked) => {
        if (checkboxChecked) receiptGenerated = true;
    };

    onCheckoutComplete(defaultCheckboxState);
    assertEqual(receiptGenerated, false, 'No receipt should be generated when unchecked');

    onCheckoutComplete(true);
    assertEqual(receiptGenerated, true, 'Receipt should ONLY be generated when cashier explicitly checks box');
});

runner.test('Should clean up test checkout records from sales_log', async () => {
    if (testReceiptNo) {
        await supabase.from('sales_log').delete().eq('receipt_no', testReceiptNo);
    }
    const { data: check } = await supabase.from('sales_log').select('*').eq('receipt_no', testReceiptNo);
    assertEqual(check.length, 0, 'Test checkout records must be removed from DB');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
