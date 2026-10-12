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
