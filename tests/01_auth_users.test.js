const { supabase, TestRunner, assert, assertEqual } = require('./helpers/testClient');

const runner = new TestRunner('01 - User Authentication & Roles (Zero Trust)');

runner.test('Should fetch live users directly from Supabase users table', async () => {
    const { data, error } = await supabase.from('users').select('*');
    assert(!error, `Failed to fetch users: ${error?.message}`);
    assert(Array.isArray(data) && data.length > 0, 'Users table is empty or did not return array');
});

runner.test('Should verify admin account has role "admin" and 4-digit PIN', async () => {
    const { data, error } = await supabase.from('users').select('*').eq('role', 'admin');
    assert(!error, `Error querying admin: ${error?.message}`);
    assert(data.length > 0, 'No admin user found in database');
    const admin = data[0];
    assertEqual(admin.role, 'admin', 'Admin user role must be "admin"');
    assert(typeof admin.pin === 'string' && admin.pin.length >= 4, 'Admin PIN must be at least 4 digits');
});

runner.test('Should verify cashier account has role "cashier"', async () => {
    const { data, error } = await supabase.from('users').select('*').eq('role', 'cashier');
    assert(!error, `Error querying cashier: ${error?.message}`);
    assert(data.length > 0, 'No cashier user found in database');
    const cashier = data[0];
    assertEqual(cashier.role, 'cashier', 'Cashier user role must be "cashier"');
    assert(typeof cashier.pin === 'string' && cashier.pin.length >= 4, 'Cashier PIN must be at least 4 digits');
});

runner.test('Should authenticate valid PIN and reject invalid PIN', async () => {
    // 1. Fetch valid user
    const { data: users } = await supabase.from('users').select('*').limit(1);
    const validUser = users[0];

    // 2. Query with matching PIN
    const { data: successData, error: successErr } = await supabase
        .from('users')
        .select('*')
        .eq('username', validUser.username)
        .eq('pin', validUser.pin)
        .single();

    assert(!successErr && successData, 'Valid PIN should return user record');
    assertEqual(successData.id, validUser.id, 'User ID should match');

    // 3. Query with deliberately incorrect PIN
    const { data: failData } = await supabase
        .from('users')
        .select('*')
        .eq('username', validUser.username)
        .eq('pin', '99999999_INVALID');

    assert(!failData || failData.length === 0, 'Invalid PIN must NOT return any user record');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
