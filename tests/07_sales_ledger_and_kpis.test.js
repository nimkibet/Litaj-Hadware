const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('07 - Today\'s Sales Ledger & Register KPI Aggregations');

let sampleItemId = null;
let cashierA_Id = null;
let cashierB_Id = null;
const insertedReceipts = [];

runner.test('Should prepare cashiers and hardware item for ledger testing', async () => {
    const { data: users } = await supabase.from('users').select('id, username').limit(2);
    assert(users && users.length >= 1, 'At least 1 user must exist in DB');
    cashierA_Id = users[0].id;
    cashierB_Id = users[1] ? users[1].id : users[0].id;

    const { data: items } = await supabase.from('inventory').select('id').limit(1);
    assert(items && items.length > 0, 'Hardware item must exist in DB');
    sampleItemId = items[0].id;
});

runner.test('Should insert controlled today sales with various payment methods', async () => {
    const now = new Date().toISOString();
    const prefix = `LEDGER-${Date.now().toString().slice(-4)}`;

    const testSales = [
        {
            receipt_no: `${prefix}-1`,
            item_id: sampleItemId,
            calculated_qty: 1,
            total_charged: 5000.00,
            calculated_profit: 1000.00,
            cashier_id: cashierA_Id,
            payment_method: 'Cash',
            is_voided: false,
            status: 'completed',
            timestamp: now
        },
        {
            receipt_no: `${prefix}-2`,
            item_id: sampleItemId,
            calculated_qty: 1,
            total_charged: 3500.00,
            calculated_profit: 700.00,
            cashier_id: cashierA_Id,
            payment_method: 'M-Pesa',
            is_voided: false,
            status: 'completed',
            timestamp: now
        },
        {
            receipt_no: `${prefix}-3`,
            item_id: sampleItemId,
            calculated_qty: 1,
            total_charged: 2000.00,
            calculated_profit: 400.00,
            cashier_id: cashierB_Id,
            payment_method: 'Debt',
            is_voided: false,
            status: 'completed',
            timestamp: now
        },
        {
            receipt_no: `${prefix}-4`,
            item_id: sampleItemId,
            calculated_qty: 1,
            total_charged: 1000.00,
            calculated_profit: 200.00,
            cashier_id: cashierA_Id,
            payment_method: 'Cash',
            is_voided: true, // VOIDED sale
            status: 'voided',
            timestamp: now
        }
    ];

    testSales.forEach(s => insertedReceipts.push(s.receipt_no));

    const { error } = await supabase.from('sales_log').insert(testSales);
    assert(!error, `Failed to insert ledger sales: ${error?.message}`);
});

runner.test('Should query sales and verify observable KPI math excluding voided transactions', async () => {
    const { data: rows, error } = await supabase
        .from('sales_log')
        .select('*')
        .in('receipt_no', insertedReceipts);

    assert(!error, `Failed to fetch inserted ledger rows: ${error?.message}`);
    assertEqual(rows.length, 4, 'Should fetch all 4 test ledger rows');

    // Aggregate KPIs
    let total = 0, cash = 0, mpesa = 0, debt = 0, activeCount = 0;

    rows.forEach(s => {
        if (!s.is_voided) {
            activeCount++;
            const amt = parseFloat(s.total_charged || 0);
            total += amt;
            const method = (s.payment_method || '').toLowerCase();
            if (method.includes('cash')) cash += amt;
            else if (method.includes('m-pesa') || method.includes('mpesa')) mpesa += amt;
            else if (method.includes('debt') || method.includes('credit')) debt += amt;
        }
    });

    assertCloseTo(total, 10500.00, 0.01, 'Total Sales KPI must be 10,500.00 (5000 + 3500 + 2000)');
    assertCloseTo(cash, 5000.00, 0.01, 'Cash KPI must be 5,000.00 (voided 1,000 excluded)');
    assertCloseTo(mpesa, 3500.00, 0.01, 'M-Pesa KPI must be 3,500.00');
    assertCloseTo(debt, 2000.00, 0.01, 'Debt KPI must be 2,000.00');
    assertEqual(activeCount, 3, 'Active sales count must be 3');
});

runner.test('Should verify cashier-specific ledger filtering', async () => {
    const { data: rows } = await supabase
        .from('sales_log')
        .select('*')
        .in('receipt_no', insertedReceipts)
        .eq('cashier_id', cashierA_Id)
        .eq('is_voided', false);

    const cashierATotal = rows.reduce((acc, r) => acc + parseFloat(r.total_charged || 0), 0);
    assertCloseTo(cashierATotal, 8500.00, 0.01, 'Cashier A non-voided sales must total 8,500.00 (5000 cash + 3500 mpesa)');
});

runner.test('Should clean up test ledger records', async () => {
    if (insertedReceipts.length > 0) {
        await supabase.from('sales_log').delete().in('receipt_no', insertedReceipts);
    }
    const { data: check } = await supabase.from('sales_log').select('*').in('receipt_no', insertedReceipts);
    assertEqual(check.length, 0, 'Test ledger receipts must be cleaned up from DB');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
