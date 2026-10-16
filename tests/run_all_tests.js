/**
 * Litaj Hardware POS - Master Test Suite Runner
 * Executes all 9 production test suites covering Auth, Inventory, Debt/Customers,
 * Cart Math, Checkout Flows, Stock Triggers, Daily Ledger, Offline Sync, and Store Settings.
 *
 * Adheres to 13-Layer Production Engineer Testing Philosophy:
 * "Assert on the observable downstream output, not the action's exit code."
 */

const { execSync } = require('child_process');
const path = require('path');

const suites = [
    { file: '01_auth_users.test.js', name: '01 - User Authentication & Role Boundaries' },
    { file: '02_inventory_management.test.js', name: '02 - Hardware Inventory Lifecycle & Downstream Assertions' },
    { file: '03_customers_and_debt.test.js', name: '03 - Customer Accounts & Downstream Debt Ledger' },
    { file: '04_cart_and_pricing_math.test.js', name: '04 - POS Cart Calculations & Discount Bounds' },
    { file: '05_pos_checkout_flow.test.js', name: '05 - POS Checkout Flows, Tenders & Split Balancing' },
    { file: '06_stock_sync_and_voiding.test.js', name: '06 - Live Inventory Stock Deduction & Void Restoration' },
    { file: '07_sales_ledger_and_kpis.test.js', name: '07 - Today\'s Sales Ledger & Register KPI Aggregations' },
    { file: '08_offline_queue_sync.test.js', name: '08 - Offline Sales Queue & Cloud Synchronization' },
    { file: '09_store_settings_dynamic.test.js', name: '09 - Dynamic Store Configuration & Category Discovery' },
    { file: '10_restock_and_suppliers.test.js', name: '10 - Restock & Supplier Orders Workflow (Zero Trust)' },
    { file: '11_analytics_and_audit_report.test.js', name: '11 - Analytics Engine & Executive Audit PDF Data' },
    { file: '12_packaging_tiers_and_resource_unboxing.test.js', name: '12 - Vegas Packaging Tiers, Resource Unboxing & Fractional UoM' }
];

console.log('======================================================================');
console.log('🚀 LITAJ HARDWARE POS - FULL PRODUCTION TEST SUITE RUNNER');
console.log('   Zero-Trust Observable Downstream State Verification');
console.log('======================================================================\n');

let totalPassed = 0;
let totalFailed = 0;
const results = [];
const startTime = Date.now();

for (const suite of suites) {
    const fullPath = path.join(__dirname, suite.file);
    const suiteStart = Date.now();
    process.stdout.write(`⏳ Running: ${suite.name}...\n`);
    try {
        const output = execSync(`node "${fullPath}"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const duration = Date.now() - suiteStart;
        console.log(output);

        // Parse passes/fails from output
        const match = output.match(/Results: (\d+) passed, (\d+) failed/);
        const p = match ? parseInt(match[1]) : 0;
        const f = match ? parseInt(match[2]) : 0;

        totalPassed += p;
        totalFailed += f;

        results.push({
            name: suite.name,
            passed: p,
            failed: f,
            status: f === 0 ? 'PASS' : 'FAIL',
            duration: `${duration}ms`
        });
    } catch (err) {
        const duration = Date.now() - suiteStart;
        console.error(`\n❌ ERROR in suite ${suite.name}:`);
        console.error(err.stdout || err.message);

        const match = (err.stdout || '').match(/Results: (\d+) passed, (\d+) failed/);
        const p = match ? parseInt(match[1]) : 0;
        const f = match ? parseInt(match[2]) : 1;

        totalPassed += p;
        totalFailed += f;

        results.push({
            name: suite.name,
            passed: p,
            failed: f,
            status: 'FAIL',
            duration: `${duration}ms`
        });
    }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n======================================================================');
console.log('📊 MASTER TEST EXECUTION SUMMARY REPORT');
console.log('======================================================================');
results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(` ${icon} [${r.status}] ${r.name.padEnd(58)} (${r.passed} passed, ${r.failed} failed) [${r.duration}]`);
});
console.log('----------------------------------------------------------------------');
console.log(`Total Test Suites:  ${suites.length}`);
console.log(`Total Assertions:   ${totalPassed + totalFailed}`);
console.log(`Passed Assertions:  ${totalPassed}`);
console.log(`Failed Assertions:  ${totalFailed}`);
console.log(`Execution Time:     ${totalDuration}s`);
console.log('======================================================================\n');

if (totalFailed > 0) {
    console.error(`💥 TEST SUITE FAILED: ${totalFailed} assertions failed.`);
    process.exit(1);
} else {
    console.log('🎉 ALL PRODUCTION TEST SUITES PASSED WITH 100% SUCCESS RATE!');
    process.exit(0);
}
