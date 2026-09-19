const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

exports.handler = async (event, context) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        // Initialized safely inside the handler scope
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false },
            realtime: { transport: WebSocket }
        });

        const { data, error } = await supabase
            .from('deal_rates')
            .select('*');

        if (error) throw error;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rates: data })
        };
    } catch (error) {
        console.error('dealRates crash:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};