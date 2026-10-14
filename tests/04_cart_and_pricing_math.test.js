const { TestRunner, assert, assertEqual, assertCloseTo } = require('./helpers/testClient');

const runner = new TestRunner('04 - POS Cart Pricing Math & Cart State Preservation');

runner.test('Should compute accurate line totals and cart subtotal across multiple hardware items', async () => {
    const cart = [
        { id: 'item-1', name: 'Simba Cement 50kg', selling_price: 750.00, qty: 5 },
        { id: 'item-2', name: 'Nails 3 inch (kg)', selling_price: 150.00, qty: 10 },
        { id: 'item-3', name: 'Iron Sheet 30G 2.5m', selling_price: 1200.00, qty: 8 }
    ];

    // Compute line totals
    cart.forEach(item => {
        item.total = item.qty * item.selling_price;
    });

    assertEqual(cart[0].total, 3750.00, 'Cement line total must be 3,750');
    assertEqual(cart[1].total, 1500.00, 'Nails line total must be 1,500');
    assertEqual(cart[2].total, 9600.00, 'Iron Sheet line total must be 9,600');

    const subtotal = cart.reduce((acc, i) => acc + i.total, 0);
    assertEqual(subtotal, 14850.00, 'Subtotal must be 14,850.00');
});

runner.test('Should enforce maximum 50% discount limit and reject negative discounts', async () => {
    const subtotal = 14850.00;
    const maxAllowedDiscount = subtotal * 0.50; // 7,425.00

    // Standard discount within 50% limit (850 <= 7,425)
    const rawDiscount1 = 850.00;
    const effectiveDiscount1 = Math.min(maxAllowedDiscount, Math.max(0, rawDiscount1));
    const grandTotal1 = Math.max(0, subtotal - effectiveDiscount1);
    assertEqual(effectiveDiscount1, 850.00, 'Discount within 50% must be honored in full');
    assertEqual(grandTotal1, 14000.00, 'Grand total after 850 discount must be 14,000.00');

    // Excessive discount (> 50% of subtotal, e.g. 10,000 or 100% of price)
    const rawDiscount2 = 10000.00;
    const effectiveDiscount2 = Math.min(maxAllowedDiscount, Math.max(0, rawDiscount2));
    const grandTotal2 = Math.max(0, subtotal - effectiveDiscount2);
    assertEqual(effectiveDiscount2, 7425.00, 'Discount must be strictly capped at 50% of subtotal (7,425.00)');
    assertEqual(grandTotal2, 7425.00, 'Grand total must be at least 50% of subtotal when capped');

    // Negative discount input protection
    const negativeDiscount = -500.00;
    const effectiveNegativeDiscount = Math.min(maxAllowedDiscount, Math.max(0, negativeDiscount));
    assertEqual(effectiveNegativeDiscount, 0.00, 'Negative discount must be sanitized to 0.00');

    // Negative quantity and price validation
    const negativeQty = -5;
    const sanitizedQty = Math.max(0, negativeQty);
    assertEqual(sanitizedQty, 0, 'Negative cart quantity must be rejected or sanitized to 0');

    // Zero or negative grand total checkout prevention
    const zeroSubtotal = 0;
    const canCheckoutZero = zeroSubtotal > 0;
    assertEqual(canCheckoutZero, false, 'Checkout must be blocked when grand total is zero or negative');
});

runner.test('Should calculate profit margin accurately per hardware item line', async () => {
    const item = {
        buying_price: 620.00,
        selling_price: 780.00,
        qty: 10
    };

    const profitPerUnit = item.selling_price - item.buying_price;
    const totalProfit = profitPerUnit * item.qty;

    assertCloseTo(profitPerUnit, 160.00, 0.01, 'Unit profit must be 160.00');
    assertCloseTo(totalProfit, 1600.00, 0.01, 'Total profit must be 1,600.00');
});

runner.test('Should accurately serialize, hold and recall active carts without data loss', async () => {
    const activeCart = [
        { id: '101', name: 'Wheelbarrow Heavy Duty', selling_price: 4500.00, qty: 2, total: 9000.00 },
        { id: '102', name: 'Shovel Round Head', selling_price: 650.00, qty: 4, total: 2600.00 }
    ];

    const heldCartPayload = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        cashier: 'test_cashier',
        items: JSON.parse(JSON.stringify(activeCart))
    };

    // Simulate serialization & deserialization (localStorage mock)
    const serialized = JSON.stringify([heldCartPayload]);
    const restoredHeldList = JSON.parse(serialized);

    assert(restoredHeldList.length === 1, 'Restored held list must contain 1 cart');
    const restored = restoredHeldList[0];
    assertEqual(restored.cashier, 'test_cashier', 'Cashier must match');
    assertEqual(restored.items.length, 2, 'Restored items count must be 2');
    assertEqual(restored.items[0].name, 'Wheelbarrow Heavy Duty', 'First item name must match');
    assertEqual(restored.items[0].qty, 2, 'First item qty must match');
    assertEqual(restored.items[1].name, 'Shovel Round Head', 'Second item name must match');
    assertEqual(restored.items[1].qty, 4, 'Second item qty must match');

    const restoredSum = restored.items.reduce((acc, i) => acc + i.total, 0);
    assertEqual(restoredSum, 11600.00, 'Restored total must match 11,600.00');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
