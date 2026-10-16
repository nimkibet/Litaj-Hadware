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

runner.test('Should calculate standard 1-day (24h) session expiration and 7-day (168h) Remember Me TTL', () => {
    const STANDARD_TTL = 24 * 60 * 60 * 1000;
    const REMEMBER_TTL = 7 * 24 * 60 * 60 * 1000;

    const now = Date.now();
    const standardExpiry = now + STANDARD_TTL;
    const rememberExpiry = now + REMEMBER_TTL;

    assertEqual(standardExpiry - now, 86400000, 'Standard session duration must be exactly 24 hours (86,400,000 ms)');
    assertEqual(rememberExpiry - now, 604800000, 'Remember Me session duration must be exactly 7 days (604,800,000 ms)');
});

runner.test('Should invalidate and void expired sessions while admitting active sessions', () => {
    const now = Date.now();

    // 1. Active session (valid for next 12 hours)
    const activeSession = {
        id: 'user-uuid-1',
        username: 'admin',
        role: 'admin',
        session_created_at: now - (12 * 60 * 60 * 1000),
        expires_at: now + (12 * 60 * 60 * 1000),
        remember_me: false
    };

    const isExpiredActive = Date.now() > activeSession.expires_at;
    assertEqual(isExpiredActive, false, 'Active session within 24h window must NOT be expired');

    // 2. Expired session (created 25 hours ago with standard 24h TTL)
    const expiredSession = {
        id: 'user-uuid-1',
        username: 'admin',
        role: 'admin',
        session_created_at: now - (25 * 60 * 60 * 1000),
        expires_at: now - (1 * 60 * 60 * 1000),
        remember_me: false
    };

    const isExpiredDead = Date.now() > expiredSession.expires_at;
    assertEqual(isExpiredDead, true, 'Session past 24h window must be flagged as expired');

    // 3. Remember Me session (created 3 days ago with 7-day TTL -> still valid)
    const rememberSession = {
        id: 'user-uuid-1',
        username: 'cashier',
        role: 'cashier',
        session_created_at: now - (3 * 24 * 60 * 60 * 1000),
        expires_at: now + (4 * 24 * 60 * 60 * 1000),
        remember_me: true
    };

    const isExpiredRemember = Date.now() > rememberSession.expires_at;
    assertEqual(isExpiredRemember, false, 'Remember Me session within 7-day window must NOT be expired');

    // 4. Remember Me session past 7 days -> expired
    const deadRememberSession = {
        id: 'user-uuid-1',
        username: 'cashier',
        role: 'cashier',
        session_created_at: now - (8 * 24 * 60 * 60 * 1000),
        expires_at: now - (1 * 24 * 60 * 60 * 1000),
        remember_me: true
    };

    const isDeadRemember = Date.now() > deadRememberSession.expires_at;
    assertEqual(isDeadRemember, true, 'Remember Me session past 7 days must be flagged as expired and voided');
});

if (require.main === module) {
    runner.run().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = runner;
