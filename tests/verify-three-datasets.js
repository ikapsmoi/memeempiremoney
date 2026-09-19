const assert = require('assert');
const supabasePath = require.resolve('@supabase/supabase-js');
const original = require.cache[supabasePath];

const fakeSupabase = {
  from(table) {
    const map = {
      travel_deals: [{
        title: 'Bali Villas',
        destination: 'Bali',
        tag: 'Hot Deal',
        summary: 'Private villa stays',
        deal_price: 540,
        reference_price: 900,
        emoji: '🌴'
      }],
      hot_package_rates: [{
        destination: 'Dubai',
        nights: 3,
        days: 4,
        price: 480,
        tag: 'Hot',
        note: 'Luxury city break'
      }],
      deal_rates: [{
        category: 'Hotels',
        title: 'Bali escape stay',
        unit: 'per stay',
        reference_rate: 900,
        our_rate: 540,
        freshness_label: 'Reference snapshot'
      }]
    };

    return {
      select() {
        return {
          eq() {
            return {
              order() {
                return Promise.resolve({ data: [], error: null });
              }
            };
          },
          order() {
            return Promise.resolve({ data: map[table] || [], error: null });
          }
        };
      }
    };
  }
};

require.cache[supabasePath] = { exports: { createClient: () => fakeSupabase } };
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';

(async () => {
  try {
    const travel = require('../netlify/functions/travelDeals');
    const hot = require('../netlify/functions/hotPackageRates');
    const rates = require('../netlify/functions/dealRates');

    const travelRes = await travel.handler();
    const hotRes = await hot.handler();
    const ratesRes = await rates.handler();

    const travelBody = JSON.parse(travelRes.body);
    const hotBody = JSON.parse(hotRes.body);
    const ratesBody = JSON.parse(ratesRes.body);

    assert.strictEqual(Array.isArray(travelBody.deals), true);
    assert.strictEqual(travelBody.deals[0].destination, 'Bali');

    assert.strictEqual(Array.isArray(hotBody.hotPackages), true);
    assert.strictEqual(hotBody.hotPackages[0].destination, 'Dubai');

    assert.strictEqual(Array.isArray(ratesBody.rates), true);
    assert.strictEqual(ratesBody.rates[0].category, 'Hotels');

    console.log('three Supabase datasets verified');
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
