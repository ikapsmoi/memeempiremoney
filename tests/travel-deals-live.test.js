const assert = require('assert');

(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';

  const supabasePath = require.resolve('@supabase/supabase-js');
  const original = require.cache[supabasePath];

  require.cache[supabasePath] = {
    exports: {
      createClient: () => ({
        from(table) {
          if (table !== 'travel_deals') {
            return {
              select() {
                return Promise.resolve({ data: [], error: { message: 'wrong table' } });
              }
            };
          }
          return {
            select() {
              return Promise.resolve({
                data: [{
                  deal_id: 'd-1',
                  title: 'Bali Villas',
                  category: 'Hotels',
                  tag: 'Hot Deal',
                  summary: 'Private villa stays with member-ready rates.',
                  destination: 'Bali',
                  reference_price: 900,
                  deal_price: 540,
                  emoji: '🌴'
                }],
                error: null
              });
            }
          };
        }
      })
    }
  };

  try {
    const { handler } = require('../netlify/functions/travelDeals');
    const response = await handler();
    const body = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200, 'Expected travelDeals success');
    assert.strictEqual(Array.isArray(body.deals), true, 'Expected deals array');
    assert.strictEqual(body.deals[0].title, 'Bali Villas', 'Expected title from travel_deals');
    assert.strictEqual(body.deals[0].destination, 'Bali', 'Expected destination from travel_deals');
    console.log('travel_deals table test passed');
  } finally {
    if (original) {
      require.cache[supabasePath] = original;
    } else {
      delete require.cache[supabasePath];
    }
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
})();
