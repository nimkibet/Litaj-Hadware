const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sbpncxjddwontoemkuye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_86dCOSVSXe-IXIENSPG5Ow_JJOj5snI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

class TestRunner {
    constructor(suiteName) {
        this.suiteName = suiteName;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log(`\n======================================================`);
        console.log(`🧪 SUITE: ${this.suiteName}`);
        console.log(`======================================================`);

        for (const t of this.tests) {
            const start = Date.now();
            try {
                await t.fn();
                const duration = Date.now() - start;
                console.log(`  ✅ PASS: ${t.name} (${duration}ms)`);
                this.passed++;
            } catch (err) {
                const duration = Date.now() - start;
                console.error(`  ❌ FAIL: ${t.name} (${duration}ms)`);
                console.error(`     Error: ${err.message}`);
                this.failed++;
            }
        }

        console.log(`------------------------------------------------------`);
        console.log(`Results: ${this.passed} passed, ${this.failed} failed out of ${this.tests.length} tests\n`);
        return {
            suite: this.suiteName,
            total: this.tests.length,
            passed: this.passed,
            failed: this.failed
        };
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertCloseTo(actual, expected, tolerance = 0.01, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected} ± ${tolerance}, got ${actual}`);
    }
}

module.exports = {
    supabase,
    TestRunner,
    assert,
    assertEqual,
    assertCloseTo
};
