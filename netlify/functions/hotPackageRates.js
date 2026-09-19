const { createClient } = require('@supabase/supabase-js');

const fallbackHotPackages = [
    { destination: 'Bali', nights: 5, days: 6, price: 620, tag: 'Hot', note: 'Beach + stay combo' },
    { destination: 'Dubai', nights: 3, days: 4, price: 480, tag: 'Hot', note: 'Luxury city break' },
    { destination: 'Paris', nights: 4, days: 5, price: 710, tag: 'Hot', note: 'Weekend escape' },
    { destination: 'Maldives', nights: 6, days: 7, price: 990, tag: 'Hot', note: 'Island retreat' },
    { destination: 'Singapore', nights: 4, days: 5, price: 540, tag: 'Hot', note: 'City + food' },
    { destination: 'Rome', nights: 3, days: 4, price: 430, tag: 'Hot', note: 'Culture & charm' }
];

function normalizeHotPackage(record, index = 0) {
    const destination = record.destination || record.title || 'Destination';
    const nights = Number(record.nights ?? 3 + (index % 3));
    const days = Number(record.days ?? record.nights ?? 4 + (index % 4));
    const rawPrice = Number(record.price ?? record.deal_price ?? record.reference_price ?? 0);

    return {
        destination,
        nights: Number.isFinite(nights) && nights > 0 ? nights : 3 + (index % 3),
        days: Number.isFinite(days) && days > 0 ? days : 4 + (index % 4),
        price: rawPrice > 0 ? rawPrice : 540,
        tag: record.tag || 'Hot',
        note: record.note || record.summary || 'Live Supabase deal'
    };
}

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

        const candidateTables = [
            {
                name: 'hot_package_rates',
                select: 'destination, nights, days, price, tag, note',
                apply: query => query.eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false })
            },
            {
                name: 'travel_deals',
                select: 'destination, title, tag, summary, reference_price, deal_price, emoji',
                apply: query => query.order('updated_at', { ascending: false })
            }
        ];

        for (const table of candidateTables) {
            try {
                let query = supabase.from(table.name).select(table.select);
                query = table.apply(query);
                const { data, error } = await query;

                if (!error && Array.isArray(data) && data.length) {
                    const normalized = table.name === 'travel_deals'
                        ? data.map((record, index) => normalizeHotPackage(record, index))
                        : data.map((record, index) => normalizeHotPackage(record, index));

                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hotPackages: normalized })
                    };
                }
            } catch (ignored) {
                // Try the next table if the current one is missing or incompatible.
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotPackages: fallbackHotPackages })
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