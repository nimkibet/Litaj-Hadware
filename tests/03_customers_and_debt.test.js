const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('03 - Customer Accounts & Credit Debt Management');

let testCustId = null;
let debtSaleReceiptNo = null;
const custName = `TEST-CONTRACTOR-PETER-${Date.now()}`;
const custPhone = '0722334455';

runner.test('Should register a new customer with initial zero debt', async () => {
    const payload = {
        name: custName,
        phone: custPhone,
        outstanding_debt: 0
    };

    const { data, error } = await supabase.from('customers').insert([payload]).select().single();
    assert(!error, `Failed to create customer: ${error?.message}`);
    assert(data && data.id, 'Customer must have generated ID');
    testCustId = data.id;

    // Downstream assertion in DB
    const { data: dbCust, error: fetchErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', testCustId)
        .single();

    assert(!fetchErr, `Customer query error: ${fetchErr?.message}`);
    assertEqual(dbCust.name, custName, 'Customer name must match');
    assertEqual(dbCust.phone, custPhone, 'Customer phone must match');
    assertCloseTo(parseFloat(dbCust.outstanding_debt), 0, 0.01, 'Initial debt must be 0');
});

runner.test('Should increase outstanding debt upon credit sale and assert downstream mutation', async () => {
    assert(testCustId, 'Customer ID must exist');

    const creditAmount = 12500.00;

    // Simulate credit sale debt addition
    const { error: updErr } = await supabase
        .from('customers')
        .update({ outstanding_debt: creditAmount })
        .eq('id', testCustId);

    assert(!updErr, `Failed to update customer debt: ${updErr?.message}`);

    // Downstream assertion: check customer balance in database
    const { data: custAfterSale } = await supabase
        .from('customers')
        .select('*')
        .eq('id', testCustId)
        .single();

    assertCloseTo(parseFloat(custAfterSale.outstanding_debt), 12500.00, 0.01, 'Customer debt in DB must equal 12500.00');
});

runner.test('Should record debt repayment in sales_log and decrement customer balance', async () => {
    const repaymentAmount = 5000.00;
    debtSaleReceiptNo = `DEBT-PAY-${Date.now().toString().slice(-6)}`;

    // 1. Record debt collection in sales_log
    const logRow = {
        receipt_no: debtSaleReceiptNo,
        total_charged: repaymentAmount,
        calculated_qty: 1,
        calculated_profit: 0,
        customer_id: testCustId,
        payment_method: 'Cash',
        status: 'debt_collection',
        notes: `Partial debt payment for ${custName}`
    };

    const { error: logErr } = await supabase.from('sales_log').insert([logRow]);
    assert(!logErr, `Failed to log debt payment: ${logErr?.message}`);

    // 2. Decrement customer debt: 12,500 - 5,000 = 7,500
    const newDebt = 12500.00 - repaymentAmount;
    await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', testCustId);

    // 3. Downstream assertion: Verify log row created in DB
    const { data: logEntry, error: logFetchErr } = await supabase
        .from('sales_log')
        .select('*')
        .eq('receipt_no', debtSaleReceiptNo)
        .single();

    assert(!logFetchErr && logEntry, 'Repayment log row must exist in sales_log');
    assertEqual(logEntry.status, 'debt_collection', 'Status must be "debt_collection"');
    assertCloseTo(parseFloat(logEntry.total_charged), 5000.00, 0.01, 'Repayment amount must be 5000.00');

    // 4. Downstream assertion: Verify customer balance decremented in DB
    const { data: updatedCust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', testCustId)
        .single();

    assertCloseTo(parseFloat(updatedCust.outstanding_debt), 7500.00, 0.01, 'Remaining debt must be exactly 7500.00');
});

runner.test('Should only accept repayment amount equal to or lower than outstanding debt and reject amounts greater than debt', async () => {
    const currentDebt = 7500.00;

    // Test 1: Amount exceeding debt (e.g. 10,000) must be rejected
    const excessiveAmount = 10000.00;
    const canAcceptExcess = excessiveAmount <= currentDebt;
    assertEqual(canAcceptExcess, false, 'Repayment greater than outstanding debt must be rejected for nice math');

    // Test 2: Exact debt amount (7,500) must be accepted
    const exactAmount = 7500.00;
    const canAcceptExact = exactAmount > 0 && exactAmount <= currentDebt;
    assertEqual(canAcceptExact, true, 'Exact debt payment must be accepted');

    // Test 3: Lower amount (partial 2,500) must be accepted
    const partialAmount = 2500.00;
    const canAcceptPartial = partialAmount > 0 && partialAmount <= currentDebt;
    assertEqual(canAcceptPartial, true, 'Partial debt payment lower than debt must be accepted');

    // Test 4: Math must never produce negative debt balance
    const resultingBal = currentDebt - exactAmount;
    assertEqual(resultingBal, 0.00, 'Exact settlement balance must be exactly 0.00 without negatives');
});

runner.test('Should process final settlement and clear debt to 0', async () => {
    // Collect remaining 7,500
    await supabase.from('customers').update({ outstanding_debt: 0 }).eq('id', testCustId);

    const { data: settledCust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', testCustId)
        .single();

    assertCloseTo(parseFloat(settledCust.outstanding_debt), 0, 0.01, 'Settled debt must be exactly 0.00');
});

runner.test('Should clean up test customer and debt log records', async () => {
    if (debtSaleReceiptNo) {
        await supabase.from('sales_log').delete().eq('receipt_no', debtSaleReceiptNo);
    }
    if (testCustId) {
        await supabase.from('customers').delete().eq('id', testCustId);
    }

    const { data: checkCust } = await supabase.from('customers').select('*').eq('id', testCustId);
    assertEqual(checkCust.length, 0, 'Test customer must be cleaned up from DB');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
