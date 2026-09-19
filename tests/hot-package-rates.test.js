const assert = require('assert');

(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';

  const original = require.cache[require.resolve('@supabase/supabase-js')];
  require.cache[require.resolve('@supabase/supabase-js')] = {
    exports: {
      createClient: () => ({
        from(table) {
          return {
            select() {
              const query = {
                eq() {
                  return {
                    order() {
                      return Promise.resolve({
                        data: table === 'hot_package_rates' ? [] : [],
                        error: table === 'hot_package_rates' ? { message: 'No such table' } : null
                      });
                    }
                  };
                },
                order() {
                  return Promise.resolve({
                    data: table === 'travel_deals' ? [{
                      destination: 'Bali',
                      title: 'Bali Escape',
                      tag: 'Hot',
                      summary: 'Beach + stay combo',
                      reference_price: 900,
                      deal_price: 620
                    }] : [],
                    error: table === 'travel_deals' ? null : { message: 'No such table' }
                  });
                }
              };
              return query;
            }
          };
        }
      })
    }
  };

  try {
    const { handler } = require('../netlify/functions/hotPackageRates');
    const response = await handler();
    const body = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200, 'Expected a 200 response');
    assert.strictEqual(Array.isArray(body.hotPackages), true, 'Expected hotPackages array');
    assert.strictEqual(body.hotPackages[0].destination, 'Bali', 'Expected live Supabase travel_deals data to be used');
    console.log('hot package rate test passed');
  } finally {
    if (original) {
      require.cache[require.resolve('@supabase/supabase-js')] = original;
    } else {
      delete require.cache[require.resolve('@supabase/supabase-js')];
    }
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
})();
