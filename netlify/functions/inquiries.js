const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return null;
    }

    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );
}

const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

const reply = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
});

function validateTelegramInitData(initData) {
    if (!initData || !process.env.TELEGRAM_BOT_TOKEN) return null;

    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    params.delete('hash');
    params.sort();

    if (!receivedHash) return null;

    const dataCheckString = [...params.entries()]
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();
    const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    const received = Buffer.from(receivedHash, 'hex');
    const calculated = Buffer.from(calculatedHash, 'hex');
    if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) return null;

    const userData = params.get('user');
    if (!userData) return null;

    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

    try {
        const user = JSON.parse(userData);
        return user && user.id !== undefined ? user : null;
    } catch (error) {
        return null;
    }
}

function getInitData(event) {
    const header = Object.entries(event.headers || {})
        .find(([name]) => name.toLowerCase() === 'x-telegram-init-data')?.[1];
    if (header) return header;

    const query = event.queryStringParameters || {};
    return query.initData;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return reply(204, {});
    if (!['GET', 'POST'].includes(event.httpMethod)) return reply(405, { error: 'Method Not Allowed' });

    const supabase = getSupabaseClient();
    if (!supabase || !process.env.TELEGRAM_BOT_TOKEN) {
        return reply(500, { error: 'Inquiry service is not configured.' });
    }

    const user = validateTelegramInitData(getInitData(event));
    if (!user) return reply(401, { error: 'Valid Telegram session required.' });

    try {
        if (event.httpMethod === 'GET') {
            const { data, error } = await supabase
                .from('inquiries')
                .select('inquiry_id, telegram_id, category, destination, dates, details, status, created_at')
                .eq('telegram_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return reply(200, { inquiries: data || [] });
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (error) {
            return reply(400, { error: 'Request body must be valid JSON.' });
        }

        if (body.action === 'reply') {
            const inquiryId = typeof body.inquiry_id === 'string' ? body.inquiry_id.trim() : '';
            const replyText = typeof body.reply_text === 'string' ? body.reply_text.trim() : '';

            if (!inquiryId || !replyText) {
                return reply(400, { error: 'Inquiry id and reply text are required.' });
            }

            const { data: inquiryData, error: inquiryLookupError } = await supabase
                .from('inquiries')
                .select('inquiry_id')
                .eq('inquiry_id', inquiryId)
                .eq('telegram_id', user.id)
                .single();

            if (inquiryLookupError || !inquiryData) {
                return reply(404, { error: 'Inquiry not found for this account.' });
            }

            const { data: replyData, error: replyError } = await supabase
                .from('inquiry_replies')
                .insert({
                    inquiry_id: inquiryId,
                    telegram_id: user.id,
                    reply_text: replyText
                })
                .select()
                .single();

            if (replyError) throw replyError;

            return reply(201, { reply: replyData });
        }

        const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
            ? body.details
            : {};
        const rawQuery = typeof body.raw_query === 'string' ? body.raw_query.trim() : (typeof details.raw_query === 'string' ? details.raw_query.trim() : '');
        const hasRawQuery = rawQuery.length > 0;
        const category = hasRawQuery
            ? 'Magic Request'
            : (typeof body.category === 'string' ? body.category.trim() : '');
        const destination = hasRawQuery
            ? 'Magic Request'
            : (typeof body.destination === 'string' ? body.destination.trim() : '');
        const dates = hasRawQuery
            ? 'Flexible'
            : (typeof body.dates === 'string' ? body.dates.trim() : '');

        if (hasRawQuery) {
            details.raw_query = rawQuery;
        }

        if (!hasRawQuery && (!category || category.length > 40 || !destination || destination.length > 160 || !dates || dates.length > 100)) {
            return reply(400, { error: 'Category, destination, and dates are required.' });
        }

        const { data, error: inquiryError } = await supabase.rpc('create_inquiry', {
            p_telegram_id: user.id,
            p_category: category,
            p_destination: destination,
            p_dates: dates,
            p_details: details
        });
        if (inquiryError) {
            if (inquiryError.code === 'P0001') {
                return reply(402, { error: 'Your two free quotes have been used.', code: 'TRIAL_LIMIT_REACHED' });
            }
            throw inquiryError;
        }

        return reply(201, { inquiry: data?.[0] });
    } catch (error) {
        console.error('Inquiry service error:', error);
        return reply(500, { error: 'Unable to process inquiry.' });
    }
};
