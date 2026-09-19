function getSupabaseServiceKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || null;
}

module.exports = { getSupabaseServiceKey };
