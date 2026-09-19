const assert = require('assert');
const crypto = require('crypto');

const buildInitData = (userId) => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'abc',
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update('123:TESTBOT')
    .digest();

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  params.set('hash', hash);
  return params.toString();
};

const buildValidTelegramInitData = (userId, botToken = '123:TESTBOT') => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'abc',
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });

  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  params.set('hash', hash);
  return params.toString();
};

(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  process.env.TELEGRAM_BOT_TOKEN = '123:TESTBOT';

  const ordered = {};
  const calls = [];

  const fakeSupabase = {
    from(table) {
      ordered.table = table;
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    single: async () => {
                      if (table === 'inquiries') {
                        return { data: { inquiry_id: 'inq-1', telegram_id: 999, destination: 'Bali', status: 'received' }, error: null };
                      }
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        },
        insert(payload) {
          calls.push({ table, payload });
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    inquiry_id: 'inq-1',
                    telegram_id: 999,
                    reply_text: payload.reply_text,
                    reply_id: 'rep-1'
                  },
                  error: null
                })
              };
            }
          };
        },
        update(payload) {
          calls.push({ table, action: 'update', payload });
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ data: { inquiry_id: 'inq-1' }, error: null });
                }
              };
            }
          };
        }
      };
    }
  };

  const supabaseModulePath = require.resolve('@supabase/supabase-js');
  const original = require.cache[supabaseModulePath];
  require.cache[supabaseModulePath] = {
    exports: { createClient: () => fakeSupabase }
  };

  const fetchCalls = [];
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    };
  };

  try {
    const { handler } = require('../netlify/functions/inquiries');
    const event = {
      httpMethod: 'POST',
      headers: { 'x-telegram-init-data': buildInitData(999) },
      body: JSON.stringify({
        action: 'reply',
        inquiry_id: 'inq-1',
        reply_text: 'Here is your quote.'
      })
    };

    const response = await handler(event);

    assert.strictEqual(response.statusCode, 201, 'Expected reply to be saved');
    assert.strictEqual(calls[0].table, 'inquiry_replies', 'Reply should be inserted into inquiry_replies');
    assert.strictEqual(fetchCalls.length >= 1, true, 'Customer should be notified via Telegram');
    const telegramCall = fetchCalls.find((call) => String(call.url).includes('sendMessage'));
    assert.ok(telegramCall, 'Expected a Telegram sendMessage call to the customer');
    assert.ok(String(telegramCall.options.body).includes('Here is your quote.'), 'Reply text should be included in the Telegram notification');
    console.log('reply notification test passed');

    const validSubmitFakeSupabase = {
      rpc: async (functionName, params) => {
        if (functionName !== 'create_inquiry') {
          return { data: null, error: { message: 'Unexpected function call' } };
        }
        return {
          data: [{ inquiry_id: 'inq-2', telegram_id: 999 }],
          error: null
        };
      }
    };

    require.cache[supabaseModulePath] = { exports: { createClient: () => validSubmitFakeSupabase } };

    const validInitData = buildValidTelegramInitData(999, '123:TESTBOT');
    const createInquiryEvent = {
      httpMethod: 'POST',
      headers: { 'x-telegram-init-data': validInitData },
      body: JSON.stringify({
        category: 'Hotels',
        destination: 'Bali',
        dates: '2026-10-01 to 2026-10-05',
        details: { travellers: '2' }
      })
    };

    const createInquiryResponse = await require('../netlify/functions/inquiries').handler(createInquiryEvent);
    assert.strictEqual(createInquiryResponse.statusCode, 201, 'Expected valid Telegram init-data to pass quote submission');
    console.log('valid Telegram init-data test passed');
  } finally {
    if (original) {
      require.cache[supabaseModulePath] = original;
    } else {
      delete require.cache[supabaseModulePath];
    }
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
})();
