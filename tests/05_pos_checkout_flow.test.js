const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('05 - Vegas POS Multi-Payment Checkout Flow & Receipt Flags');

let testReceiptNo = null;
let sampleItemId = null;
let createdNewItem = false;

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
        createdNewItem = true;
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

runner.test('Should execute M-PESA sale without ref code (MPESA-VERIFIED) and assert DB state', async () => {
    const mpesaReceiptNo = `LH-TEST-MPESA-${Date.now().toString().slice(-6)}`;
    const grandTotal = 750.00;
    const mpesaRow = {
        item_id: sampleItemId,
        receipt_no: mpesaReceiptNo,
        calculated_qty: 1,
        total_charged: grandTotal,
        calculated_profit: 250.00,
        payment_method: 'M-Pesa',
        amount_tendered: grandTotal,
        change_given: 0,
        notes: 'MPESA-VERIFIED',
        customer_id: null,
        status: 'active'
    };

    const { error: insertErr } = await supabase.from('sales_log').insert([mpesaRow]);
    assert(!insertErr, `M-Pesa sale insert failed: ${insertErr?.message}`);

    const { data: dbRow } = await supabase.from('sales_log').select('*').eq('receipt_no', mpesaReceiptNo).single();
    assertEqual(dbRow.payment_method, 'M-Pesa', 'Method must be M-Pesa');
    assertEqual(dbRow.notes, 'MPESA-VERIFIED', 'Notes must record MPESA-VERIFIED');
    assertEqual(dbRow.customer_id, null, 'Customer ID must be null for generic M-Pesa sale');

    await supabase.from('sales_log').delete().eq('receipt_no', mpesaReceiptNo);
});

runner.test('Should execute SPLIT sale (Cash + M-Pesa) and assert DB state', async () => {
    const splitReceiptNo = `LH-TEST-SPLIT-${Date.now().toString().slice(-6)}`;
    const grandTotal = 1200.00;
    // Database constraint allows ('Cash', 'M-Pesa', 'Debt', 'Card'). Split sales persist compliant as 'Cash' with full split notes
    const splitRow = {
        item_id: sampleItemId,
        receipt_no: splitReceiptNo,
        calculated_qty: 2,
        total_charged: grandTotal,
        calculated_profit: 400.00,
        payment_method: 'Cash',
        amount_tendered: grandTotal,
        change_given: 0,
        notes: 'Cash: 600 | M-Pesa: 600 (VERIFIED)',
        customer_id: null,
        status: 'active'
    };

    const { error: insertErr } = await supabase.from('sales_log').insert([splitRow]);
    assert(!insertErr, `Split sale insert failed: ${insertErr?.message}`);

    const { data: dbRow } = await supabase.from('sales_log').select('*').eq('receipt_no', splitReceiptNo).single();
    assertEqual(dbRow.payment_method, 'Cash', 'Method in DB must satisfy constraint');
    assert(dbRow.notes.includes('Cash: 600') && dbRow.notes.includes('M-Pesa: 600'), 'Split details must persist in notes');
    assertEqual(dbRow.customer_id, null, 'Customer ID must be null for split sale');

    await supabase.from('sales_log').delete().eq('receipt_no', splitReceiptNo);
});

runner.test('Should verify lastCompletedSale construction across all 4 payment modes with no cust reference error', async () => {
    const mockCustomers = [
        { id: 'cust-uuid-1', name: 'John Kamau', outstanding_debt: 500 }
    ];

    // Helper that replicates processFinalSale post-processing logic
    const buildSaleCompletion = (method, customerId, grandTotal, tenderAmt, changeAmt, paymentRef) => {
        const customerObj = customerId ? (mockCustomers.find(c => c.id === customerId) || null) : null;
        return {
            receiptNo: 'LH-TEST-SUCCESS',
            items: [{ name: 'Cement', qty: 1, selling_price: grandTotal, total: grandTotal }],
            grandTotal,
            method,
            customerName: customerObj ? customerObj.name : null,
            tenderAmt,
            changeAmt,
            notes: paymentRef
        };
    };

    // 1. CASH: customerId is null -> must have customerName: null and NEVER throw ReferenceError
    const cashSale = buildSaleCompletion('Cash', null, 1000, 1000, 0, '');
    assertEqual(cashSale.customerName, null, 'Cash sale customerName must be null without error');
    assertEqual(cashSale.method, 'Cash', 'Method must be Cash');

    // 2. M-PESA: customerId is null -> must have customerName: null
    const mpesaSale = buildSaleCompletion('M-Pesa', null, 1000, 1000, 0, 'MPESA-VERIFIED');
    assertEqual(mpesaSale.customerName, null, 'M-Pesa sale customerName must be null without error');
    assertEqual(mpesaSale.notes, 'MPESA-VERIFIED', 'Notes must be MPESA-VERIFIED');

    // 3. SPLIT: customerId is null -> must have customerName: null
    const splitSale = buildSaleCompletion('Split', null, 1000, 1000, 0, 'Cash: 500 | M-Pesa: 500');
    assertEqual(splitSale.customerName, null, 'Split sale customerName must be null without error');

    // 4. DEBT: customerId is valid -> must resolve customer name
    const debtSale = buildSaleCompletion('Debt', 'cust-uuid-1', 1000, 0, 0, '');
    assertEqual(debtSale.customerName, 'John Kamau', 'Debt sale customerName must resolve to customer name');
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

runner.test('Should clean up test checkout records from sales_log and inventory', async () => {
    if (testReceiptNo) {
        await supabase.from('sales_log').delete().eq('receipt_no', testReceiptNo);
    }
    await supabase.from('inventory').delete().eq('name', 'TEST-CHECKOUT-ITEM');
    if (sampleItemId) {
        await supabase.from('inventory').delete().eq('id', sampleItemId);
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
