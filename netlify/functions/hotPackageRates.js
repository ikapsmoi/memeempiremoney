const { createClient } = require('@supabase/supabase-js');

const fallbackHotPackages = [
    { destination: 'Bali', nights: 5, days: 6, price: 620, tag: 'Hot', note: 'Beach + stay combo' },
    { destination: 'Dubai', nights: 3, days: 4, price: 480, tag: 'Hot', note: 'Luxury city break' },
    { destination: 'Paris', nights: 4, days: 5, price: 710, tag: 'Hot', note: 'Weekend escape' },
    { destination: 'Maldives', nights: 6, days: 7, price: 990, tag: 'Hot', note: 'Island retreat' },
    { destination: 'Singapore', nights: 4, days: 5, price: 540, tag: 'Hot', note: 'City + food' },
    { destination: 'Rome', nights: 3, days: 4, price: 430, tag: 'Hot', note: 'Culture & charm' }
];

exports.handler = async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotPackages: fallbackHotPackages })
        };
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });

        const { data, error } = await supabase
            .from('hot_package_rates')
            .select('destination, nights, days, price, tag, note')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotPackages: Array.isArray(data) && data.length ? data : fallbackHotPackages })
        };
    } catch (error) {
        console.error('hotPackageRates error:', error.message);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotPackages: fallbackHotPackages })
        };
    }
};