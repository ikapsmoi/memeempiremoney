const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const headers = {
    'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Deal rates service is not configured.' }) };
    }

    try {
        const { data, error } = await supabase
            .from('deal_rates')
            .select('rate_id, category, title, unit, reference_rate, our_rate, reference_source, freshness_label, updated_at')
            .eq('is_active', true)
            .order('category')
            .order('title');

        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ rates: data || [] }) };
    } catch (error) {
        console.error('Deal rates service error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to load deal rates.' }) };
    }
};
