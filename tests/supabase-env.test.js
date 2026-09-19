const test = require('node:test');
const assert = require('node:assert/strict');

const { getSupabaseServiceKey } = require('../netlify/lib/supabase');

test('prefers the modern Supabase service role key when present', () => {
  const previousServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.SUPABASE_SERVICE_KEY = 'legacy-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'role-key';

  try {
    assert.equal(getSupabaseServiceKey(), 'role-key');
  } finally {
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = previousServiceKey;

    if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
  }
});

test('falls back to the legacy Supabase service key name', () => {
  const previousServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'legacy-key';

  try {
    assert.equal(getSupabaseServiceKey(), 'legacy-key');
  } finally {
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = previousServiceKey;

    if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
  }
});
