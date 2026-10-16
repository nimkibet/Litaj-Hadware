const { supabase, TestRunner, assert, assertEqual } = require('./helpers/testClient');

const runner = new TestRunner('09 - Dynamic Store Configuration & Category Discovery');

let originalCompany = null;
let originalPhone = null;
const testSettingKey = `test_setting_${Date.now()}`;

runner.test('Should query live store settings from Supabase table', async () => {
    const { data, error } = await supabase.from('settings').select('*');
    assert(!error, `Failed to query settings table: ${error?.message}`);
    assert(data && data.length > 0, 'Settings table must contain configuration rows');

    const configMap = {};
    data.forEach(s => {
        configMap[s.key] = s.value;
    });

    assert(configMap.company_name, 'Store setting "company_name" must exist in DB');
    assert(configMap.phone_contact, 'Store setting "phone_contact" must exist in DB');
    assert(configMap.receipt_footer, 'Store setting "receipt_footer" must exist in DB');

    originalCompany = configMap.company_name;
    originalPhone = configMap.phone_contact;
});

runner.test('Should insert and verify a dynamic hardware setting downstream', async () => {
    const testValue = `Litaj Hardware Branch-${Date.now()}`;
    const { error: insertErr } = await supabase.from('settings').insert([
        {
            key: testSettingKey,
            value: testValue,
            updated_at: new Date().toISOString()
        }
    ]);

    assert(!insertErr, `Failed to insert test setting: ${insertErr?.message}`);

    // Observable downstream assertion: Query DB directly
    const { data: fetched, error: fetchErr } = await supabase
        .from('settings')
        .select('*')
        .eq('key', testSettingKey)
        .single();

    assert(!fetchErr, `Failed to fetch inserted setting: ${fetchErr?.message}`);
    assertEqual(fetched.value, testValue, 'Dynamic setting value must match inserted value');
});

runner.test('Should update an existing setting and assert observable downstream mutation', async () => {
    const updatedValue = `Updated Value ${Date.now()}`;
    const { error: updateErr } = await supabase
        .from('settings')
        .update({ value: updatedValue, updated_at: new Date().toISOString() })
        .eq('key', testSettingKey);

    assert(!updateErr, `Failed to update setting: ${updateErr?.message}`);

    // Downstream verification
    const { data: updatedRow, error: verifyErr } = await supabase
        .from('settings')
        .select('*')
        .eq('key', testSettingKey)
        .single();

    assert(!verifyErr, `Failed to fetch updated setting: ${verifyErr?.message}`);
    assertEqual(updatedRow.value, updatedValue, 'Setting value in DB must reflect update');
});

runner.test('Should dynamically extract distinct inventory categories from live inventory', async () => {
    // Add two items with unique categories to ensure dynamic discovery
    const catA = `CatAlpha_${Date.now().toString().slice(-4)}`;
    const catB = `CatBeta_${Date.now().toString().slice(-4)}`;

    const { data: inserted, error: itemErr } = await supabase.from('inventory').insert([
        {
            name: `Test Cat Alpha Item`,
            category: catA,
            barcode: `CAT-A-${Date.now().toString().slice(-4)}`,
            buying_price: 100,
            selling_price: 150,
            stock_quantity: 10,
            min_threshold: 2
        },
        {
            name: `Test Cat Beta Item`,
            category: catB,
            barcode: `CAT-B-${Date.now().toString().slice(-4)}`,
            buying_price: 200,
            selling_price: 250,
            stock_quantity: 10,
            min_threshold: 2
        }
    ]).select();

    assert(!itemErr, `Failed to insert category test items: ${itemErr?.message}`);

    // Simulate pos.js dynamic category resolution:
    // Query live inventory categories
    const { data: allItems } = await supabase.from('inventory').select('category');
    const rawCategories = allItems.map(i => (i.category || '').trim()).filter(Boolean);
    const uniqueCategories = ['ALL', ...Array.from(new Set(rawCategories)).sort()];

    assert(uniqueCategories.includes('ALL'), 'Dynamic category set must include ALL');
    assert(uniqueCategories.includes(catA), `Dynamic category set must contain ${catA}`);
    assert(uniqueCategories.includes(catB), `Dynamic category set must contain ${catB}`);

    // Clean up inserted category items
    const ids = inserted.map(i => i.id);
    await supabase.from('inventory').delete().in('id', ids);
});

runner.test('Should store, update, and retrieve persistent hardware categories in settings table', async () => {
    const testCategoryA = `Abrasives & Polishes ${Date.now().toString().slice(-4)}`;
    const testCategoryB = `Safety Helmets & Vests ${Date.now().toString().slice(-4)}`;
    const initialCategories = ['General Hardware', 'Paints & Finishes', testCategoryA];

    // 1. Upsert hardware_categories row into settings table
    const { error: upsertErr } = await supabase.from('settings').upsert({
        key: 'hardware_categories',
        value: JSON.stringify(initialCategories),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    assert(!upsertErr, `Failed to upsert hardware_categories: ${upsertErr?.message}`);

    // 2. Observable downstream assertion: query settings table directly
    const { data: row, error: fetchErr } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'hardware_categories')
        .single();

    assert(!fetchErr, `Failed to query hardware_categories: ${fetchErr?.message}`);
    assert(row && row.value, 'hardware_categories row must contain a value string');

    const parsed = JSON.parse(row.value);
    assert(Array.isArray(parsed), 'hardware_categories must parse as an Array');
    assert(parsed.includes(testCategoryA), `hardware_categories must contain ${testCategoryA}`);

    // 3. Add new category, ensuring case-insensitive deduplication
    const isDuplicate = parsed.some(c => c.toLowerCase() === testCategoryA.toLowerCase());
    assert(isDuplicate, 'Duplicate check must detect existing category case-insensitively');

    // Add unique category
    const updatedCategories = [...parsed, testCategoryB].sort((a, b) => a.localeCompare(b));
    const { error: updateErr } = await supabase.from('settings').upsert({
        key: 'hardware_categories',
        value: JSON.stringify(updatedCategories),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    assert(!updateErr, `Failed to update hardware_categories: ${updateErr?.message}`);

    // 4. Downstream verification of second category
    const { data: updatedRow } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'hardware_categories')
        .single();

    const secondParsed = JSON.parse(updatedRow.value);
    assert(secondParsed.includes(testCategoryB), `Updated categories must contain ${testCategoryB}`);
    assert(secondParsed.length === initialCategories.length + 1, 'Length must increment by exactly 1');

    // Restore standard default hardware categories so DB remains in pristine production state
    const DEFAULT_CATEGORIES = [
        'Building Materials & Cement',
        'Fasteners, Nails & Screws',
        'Roofing & Timber',
        'Plumbing & Pipes',
        'Electrical & Lighting',
        'Paints & Finishes',
        'Hand & Power Tools',
        'Steel, Rebars & Iron Sheets',
        'General Hardware'
    ];
    await supabase.from('settings').upsert({
        key: 'hardware_categories',
        value: JSON.stringify(DEFAULT_CATEGORIES),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
});

runner.test('Should clean up test settings record', async () => {
    const { error: delErr } = await supabase
        .from('settings')
        .delete()
        .eq('key', testSettingKey);

    assert(!delErr, `Failed to delete test setting: ${delErr?.message}`);

    // Assert absence downstream
    const { data: check } = await supabase
        .from('settings')
        .select('*')
        .eq('key', testSettingKey);

    assertEqual(check.length, 0, 'Test setting record must be completely removed');
});

runner.run();
