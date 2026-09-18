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
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Travel deals service is not configured.' }) };
    }

    try {
        const { data, error } = await supabase
            .from('travel_deals')
            .select('deal_id, title, category, tag, summary, destination, reference_price, deal_price, currency, emoji, valid_until, updated_at')
            .eq('is_active', true)
            .order('updated_at', { ascending: false });
        if (error) throw error;
        const currentTime = Date.now();
        const deals = (data || [])
            .filter(deal => !deal.valid_until || new Date(deal.valid_until).getTime() >= currentTime)
            .map(deal => ({
                id: deal.deal_id,
                title: deal.title,
                tag: deal.tag,
                emoji: deal.emoji,
                discount: deal.deal_price === null
                    ? deal.summary
                    : `${deal.currency} ${deal.deal_price} · ${deal.summary}`
            }));
        return { statusCode: 200, headers, body: JSON.stringify({ deals }) };
    } catch (error) {
        console.error('Travel deals service error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to load travel deals.' }) };
    }
};