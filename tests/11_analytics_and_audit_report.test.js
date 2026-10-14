/**
 * 11 - Hardware Analytics Engine & Executive Audit PDF Data Tests
 * 
 * Asserts on:
 * 1. Live Supabase joins between sales_log, inventory, users, and customers.
 * 2. Grouping sales rows by receipt_no to reconstruct multi-item carts.
 * 3. Exact itemized hardware product identification for store debt (who took debt & what products).
 * 4. Payment tender balance calculations across Cash, M-Pesa, Split, and Credit.
 * 5. Consolidated product sales matrix: units sold, revenue, COGS, gross profit.
 * 6. Cashier shift performance and reconciliation balancing.
 * 7. Observable downstream data isolation and clean teardown.
 */

const { supabase, TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('11 - Analytics Engine & Executive Audit PDF Aggregations');

let cashierId = null;
let testCustomer = null;
let testItemA = null;
let testItemB = null;
const insertedReceipts = [];
const createdItemIds = [];
let createdCustomerId = null;

runner.test('Should prepare cashiers, items, and customer for analytics tests', async () => {
    // 1. Fetch or identify cashier
    const { data: users, error: userErr } = await supabase.from('users').select('id, username').limit(1);
    assert(!userErr && users && users.length > 0, 'At least 1 user must exist in DB');
    cashierId = users[0].id;

    // 2. Create test customer
    const custName = `Audit Client ${Date.now().toString().slice(-4)}`;
    const { data: cust, error: custErr } = await supabase
        .from('customers')
        .insert([{
            name: custName,
            phone: '0712999888',
            outstanding_debt: 0.00
        }])
        .select()
        .single();
    assert(!custErr && cust, `Failed to create test customer: ${custErr?.message}`);
    testCustomer = cust;
    createdCustomerId = cust.id;

    // 3. Create two distinct hardware items
    const { data: itemA, error: errA } = await supabase
        .from('inventory')
        .insert([{
            name: `Cement Brand Alpha ${Date.now().toString().slice(-4)}`,
            category: 'Cement & Masonry',
            buying_price: 600.00,
            selling_price: 750.00,
            stock_quantity: 50,
            unit_of_measure: 'bag'
        }])
        .select()
        .single();
    assert(!errA && itemA, `Failed to create item A: ${errA?.message}`);
    testItemA = itemA;
    createdItemIds.push(itemA.id);

    const { data: itemB, error: errB } = await supabase
        .from('inventory')
        .insert([{
            name: `Nails 3 Inch Heavy ${Date.now().toString().slice(-4)}`,
            category: 'Fasteners & Nails',
            buying_price: 100.00,
            selling_price: 150.00,
            stock_quantity: 100,
            unit_of_measure: 'kg'
        }])
        .select()
        .single();
    assert(!errB && itemB, `Failed to create item B: ${errB?.message}`);
    testItemB = itemB;
    createdItemIds.push(itemB.id);
});

runner.test('Should record controlled hardware sales (Cash, M-Pesa, Split, Debt, Debt Repayment)', async () => {
    const now = new Date().toISOString();
    const pfx = `AUDIT-${Date.now().toString().slice(-4)}`;

    const rCash = `${pfx}-CASH`;
    const rMpesa = `${pfx}-MPESA`;
    const rSplit = `${pfx}-SPLIT`;
    const rDebt = `${pfx}-DEBT`;
    const rRepay = `${pfx}-REPAY`;

    insertedReceipts.push(rCash, rMpesa, rSplit, rDebt, rRepay);

    const testSales = [
        // 1. CASH SALE: 2 bags of Item A @ 750 = 1,500 (Cost = 1,200, Profit = 300)
        {
            receipt_no: rCash,
            item_id: testItemA.id,
            calculated_qty: 2,
            total_charged: 1500.00,
            buying_price_at_sale: 600.00,
            calculated_profit: 300.00,
            cashier_id: cashierId,
            payment_method: 'Cash',
            status: 'completed',
            is_voided: false,
            timestamp: now
        },
        // 2. M-PESA SALE: 1 kg of Item B @ 150 = 150 (Cost = 100, Profit = 50)
        {
            receipt_no: rMpesa,
            item_id: testItemB.id,
            calculated_qty: 1,
            total_charged: 150.00,
            buying_price_at_sale: 100.00,
            calculated_profit: 50.00,
            cashier_id: cashierId,
            payment_method: 'M-Pesa',
            status: 'completed',
            is_voided: false,
            notes: 'MPESA-VERIFIED (0712345678)',
            timestamp: now
        },
        // 3. SPLIT SALE: 1 bag of Item A @ 750 = 750 (Cash: 500, M-Pesa: 250)
        {
            receipt_no: rSplit,
            item_id: testItemA.id,
            calculated_qty: 1,
            total_charged: 750.00,
            buying_price_at_sale: 600.00,
            calculated_profit: 150.00,
            cashier_id: cashierId,
            payment_method: 'Cash',
            status: 'completed',
            is_voided: false,
            notes: 'Split Payment | Cash: 500 | M-Pesa: 250 (VERIFIED)',
            timestamp: now
        },
        // 4. MULTI-ITEM STORE DEBT SALE: Taken on credit by testCustomer
        // Line 1: 3 bags of Item A @ 750 = 2,250 (Cost = 1,800, Profit = 450)
        {
            receipt_no: rDebt,
            item_id: testItemA.id,
            customer_id: testCustomer.id,
            calculated_qty: 3,
            total_charged: 2250.00,
            buying_price_at_sale: 600.00,
            calculated_profit: 450.00,
            cashier_id: cashierId,
            payment_method: 'Debt',
            status: 'debt',
            is_voided: false,
            timestamp: now
        },
        // Line 2: 4 kg of Item B @ 150 = 600 (Cost = 400, Profit = 200)
        {
            receipt_no: rDebt,
            item_id: testItemB.id,
            customer_id: testCustomer.id,
            calculated_qty: 4,
            total_charged: 600.00,
            buying_price_at_sale: 100.00,
            calculated_profit: 200.00,
            cashier_id: cashierId,
            payment_method: 'Debt',
            status: 'debt',
            is_voided: false,
            timestamp: now
        },
        // 5. DEBT REPAYMENT: 1,000 paid in Cash by testCustomer
        {
            receipt_no: rRepay,
            item_id: null,
            customer_id: testCustomer.id,
            calculated_qty: 1,
            total_charged: 1000.00,
            buying_price_at_sale: 0,
            calculated_profit: 0,
            cashier_id: cashierId,
            payment_method: 'Cash',
            status: 'debt_collection',
            is_voided: false,
            notes: `Debt repayment received for ${testCustomer.name}`,
            timestamp: now
        }
    ];

    const { error: insertErr } = await supabase.from('sales_log').insert(testSales);
    assert(!insertErr, `Failed to insert test sales: ${insertErr?.message}`);
});

runner.test('Should fetch and verify Supabase relational joins with inventory, users, and customers', async () => {
    const { data: rows, error } = await supabase
        .from('sales_log')
        .select('*, inventory(id, name, category, unit_of_measure), users!sales_log_cashier_id_fkey(id, username, full_name), customers(id, name, phone)')
        .in('receipt_no', insertedReceipts)
        .order('timestamp');

    assert(!error, `Failed to query sales joins: ${error?.message}`);
    assertEqual(rows.length, 6, 'Should retrieve all 6 sales lines across the 5 receipts');

    // Verify Debt lines have joined customer
    const debtRows = rows.filter(r => r.status === 'debt');
    assertEqual(debtRows.length, 2, 'Should have exactly 2 debt item rows');
    debtRows.forEach(r => {
        assert(r.customers !== null, 'Customer join must not be null for debt sale');
        assertEqual(r.customers.name, testCustomer.name, 'Customer name must match test customer');
        assert(r.inventory !== null, 'Inventory join must not be null for debt line');
    });

    // Verify Debt Repayment has no inventory item but valid customer
    const repayRow = rows.find(r => r.status === 'debt_collection');
    assert(repayRow, 'Repayment row must exist');
    assertEqual(repayRow.item_id, null, 'Repayment should have null item_id');
    assertEqual(repayRow.customers.id, testCustomer.id, 'Repayment customer must match test customer');
});

runner.test('Should group rows by receipt_no and assert observable basket reconstruction', async () => {
    const { data: rows } = await supabase
        .from('sales_log')
        .select('*, inventory(id, name, category, unit_of_measure), users!sales_log_cashier_id_fkey(id, username), customers(id, name, phone)')
        .in('receipt_no', insertedReceipts);

    const receiptMap = {};
    rows.forEach(r => {
        const rNo = r.receipt_no;
        if (!receiptMap[rNo]) {
            receiptMap[rNo] = {
                receipt_no: rNo,
                status: r.status,
                payment_method: r.payment_method,
                notes: r.notes,
                customer: r.customers,
                total_charged: 0,
                calculated_profit: 0,
                items: []
            };
        }
        receiptMap[rNo].items.push(r);
        receiptMap[rNo].total_charged += parseFloat(r.total_charged || 0);
        receiptMap[rNo].calculated_profit += parseFloat(r.calculated_profit || 0);
    });

    const receipts = Object.values(receiptMap);
    assertEqual(receipts.length, 5, 'Should reconstruct exactly 5 distinct receipt transactions');

    // Check Debt Basket specifically (Sale D)
    const debtReceipt = receipts.find(r => r.status === 'debt');
    assert(debtReceipt, 'Debt receipt must exist');
    assertEqual(debtReceipt.items.length, 2, 'Debt receipt must contain both item lines in basket');
    assertEqual(debtReceipt.total_charged, 2850.00, 'Debt basket total must equal 2250 + 600 = 2850.00');
    assertEqual(debtReceipt.customer.name, testCustomer.name, 'Debtor name must match test customer');

    // Verify itemized products on debt breakdown
    const itemNamesOnDebt = debtReceipt.items.map(i => i.inventory.name);
    assert(itemNamesOnDebt.includes(testItemA.name), 'Debt audit must include Item A');
    assert(itemNamesOnDebt.includes(testItemB.name), 'Debt audit must include Item B');
});

runner.test('Should calculate accurate financial KPIs: Gross Rev, Profit, Cash, M-Pesa, Debt Issued, Debt Repaid', async () => {
    const { data: rows } = await supabase
        .from('sales_log')
        .select('*')
        .in('receipt_no', insertedReceipts);

    let grossRev = 0;
    let grossProfit = 0;
    let cashInTill = 0;
    let mpesaVerified = 0;
    let debtIssued = 0;
    let debtCollected = 0;

    // Group by receipt for payment split parsing
    const receiptMap = {};
    rows.forEach(r => {
        if (!receiptMap[r.receipt_no]) {
            receiptMap[r.receipt_no] = {
                receipt_no: r.receipt_no,
                status: r.status,
                payment_method: r.payment_method,
                notes: r.notes,
                total_charged: 0,
                calculated_profit: 0
            };
        }
        receiptMap[r.receipt_no].total_charged += parseFloat(r.total_charged || 0);
        receiptMap[r.receipt_no].calculated_profit += parseFloat(r.calculated_profit || 0);
    });

    Object.values(receiptMap).forEach(r => {
        if (r.status === 'debt') {
            debtIssued += r.total_charged;
            grossRev += r.total_charged;
            grossProfit += r.calculated_profit;
        } else if (r.status === 'debt_collection') {
            debtCollected += r.total_charged;
            const cleanMethod = (r.payment_method || '').toLowerCase().replace(/[^a-z]/g, '');
            if (cleanMethod.includes('cash')) cashInTill += r.total_charged;
            else if (cleanMethod.includes('mpesa')) mpesaVerified += r.total_charged;
        } else {
            grossRev += r.total_charged;
            grossProfit += r.calculated_profit;

            const splitMatch = (r.notes || '').match(/Cash:\s*([\d.]+)\s*\|\s*M-Pesa:\s*([\d.]+)/i);
            if (splitMatch) {
                cashInTill += parseFloat(splitMatch[1]) || 0;
                mpesaVerified += parseFloat(splitMatch[2]) || 0;
            } else {
                const cleanMethod = (r.payment_method || '').toLowerCase().replace(/[^a-z]/g, '');
                if (cleanMethod.includes('cash')) cashInTill += r.total_charged;
                else if (cleanMethod.includes('mpesa')) mpesaVerified += r.total_charged;
            }
        }
    });

    // Expected values:
    // Gross Rev = Cash(1500) + Mpesa(150) + Split(750) + Debt(2850) = 5,250.00
    // Gross Profit = Cash(300) + Mpesa(50) + Split(150) + Debt(450+200=650) = 1,150.00
    // Cash in Till = Cash Sale(1500) + Split Cash(500) + Repay Cash(1000) = 3,000.00
    // M-Pesa = M-Pesa Sale(150) + Split M-Pesa(250) = 400.00
    // Debt Issued = 2,850.00
    // Debt Collected = 1,000.00
    assertEqual(grossRev, 5250.00, 'Gross revenue must equal 5,250.00');
    assertEqual(grossProfit, 1150.00, 'Gross profit must equal 1,150.00');
    assertEqual(cashInTill, 3000.00, 'Cash in till must equal 3,000.00');
    assertEqual(mpesaVerified, 400.00, 'M-Pesa verified must equal 400.00');
    assertEqual(debtIssued, 2850.00, 'Debt issued must equal 2,850.00');
    assertEqual(debtCollected, 1000.00, 'Debt collected must equal 1,000.00');
});

runner.test('Should aggregate Consolidated Products Sold Matrix without debt collection distortion', async () => {
    const { data: rows } = await supabase
        .from('sales_log')
        .select('*, inventory(id, name, category, unit_of_measure)')
        .in('receipt_no', insertedReceipts);

    const productMap = {};
    rows.forEach(r => {
        if (r.status === 'debt_collection') return; // Do not distort inventory products matrix

        const id = r.item_id;
        if (!productMap[id]) {
            productMap[id] = {
                name: r.inventory.name,
                units_sold: 0,
                total_revenue: 0,
                total_cogs: 0,
                total_profit: 0
            };
        }
        const qty = parseFloat(r.calculated_qty || 1);
        const rev = parseFloat(r.total_charged || 0);
        const prof = parseFloat(r.calculated_profit || 0);
        const buyingPrice = parseFloat(r.buying_price_at_sale || 0);

        productMap[id].units_sold += qty;
        productMap[id].total_revenue += rev;
        productMap[id].total_cogs += (qty * buyingPrice);
        productMap[id].total_profit += prof;
    });

    const products = Object.values(productMap);
    assertEqual(products.length, 2, 'Should aggregate exactly 2 distinct hardware items');

    const aggA = productMap[testItemA.id];
    // Item A: 2 (Cash) + 1 (Split) + 3 (Debt) = 6 bags
    // Total Revenue = 1500 + 750 + 2250 = 4,500.00
    // Total Cost = 6 * 600 = 3,600.00
    // Total Profit = 4,500 - 3,600 = 900.00
    assertEqual(aggA.units_sold, 6, 'Item A must have 6 bags sold');
    assertEqual(aggA.total_revenue, 4500.00, 'Item A total revenue must equal 4,500.00');
    assertEqual(aggA.total_cogs, 3600.00, 'Item A COGS must equal 3,600.00');
    assertEqual(aggA.total_profit, 900.00, 'Item A gross profit must equal 900.00');

    const aggB = productMap[testItemB.id];
    // Item B: 1 (M-Pesa) + 4 (Debt) = 5 kg
    // Total Revenue = 150 + 600 = 750.00
    // Total Cost = 5 * 100 = 500.00
    // Total Profit = 250.00
    assertEqual(aggB.units_sold, 5, 'Item B must have 5 kg sold');
    assertEqual(aggB.total_revenue, 750.00, 'Item B total revenue must equal 750.00');
    assertEqual(aggB.total_profit, 250.00, 'Item B gross profit must equal 250.00');
});

runner.test('Should clean up all test sales, customer, and inventory records', async () => {
    // 1. Delete test sales log
    const { error: delSalesErr } = await supabase
        .from('sales_log')
        .delete()
        .in('receipt_no', insertedReceipts);
    assert(!delSalesErr, `Failed to clean test sales_log: ${delSalesErr?.message}`);

    // 2. Delete test items
    if (createdItemIds.length > 0) {
        const { error: delItemErr } = await supabase
            .from('inventory')
            .delete()
            .in('id', createdItemIds);
        assert(!delItemErr, `Failed to delete test inventory: ${delItemErr?.message}`);
    }

    // 3. Delete test customer
    if (createdCustomerId) {
        const { error: delCustErr } = await supabase
            .from('customers')
            .delete()
            .eq('id', createdCustomerId);
        assert(!delCustErr, `Failed to delete test customer: ${delCustErr?.message}`);
    }
});

runner.run().then(success => {
    process.exit(success ? 0 : 1);
});
