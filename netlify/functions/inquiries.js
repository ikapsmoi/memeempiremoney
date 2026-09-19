const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseServiceKey } = require('../lib/supabase');

function getSupabaseClient() {
    const serviceKey = getSupabaseServiceKey();
    if (!process.env.SUPABASE_URL || !serviceKey) {
        return null;
    }

    return createClient(
        process.env.SUPABASE_URL,
        serviceKey
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

    try {
        const params = new URLSearchParams(initData);
        const receivedHash = String(params.get('hash') || '').trim();
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

        const received = Buffer.from(receivedHash.toLowerCase(), 'hex');
        const calculated = Buffer.from(calculatedHash.toLowerCase(), 'hex');

        if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
            console.warn('Telegram init-data validation failed for inquiry request.');
            return null;
        }

        const userData = params.get('user');
        if (!userData) return null;

        const authDate = Number(params.get('auth_date'));
        if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

        const user = JSON.parse(userData);
        return user && user.id !== undefined ? user : null;
    } catch (error) {
        console.warn('Telegram init-data validation threw:', error.message);
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

async function sendCustomerReplyNotification({ botToken, telegramId, inquiryId, replyText, inquiryDestination }) {
    if (!botToken || !telegramId) return;

    const safeDestination = String(inquiryDestination || 'your request').slice(0, 200);
    const payload = {
        chat_id: telegramId,
        text: `<b>✈️ Travel4Life reply</b>\n\n` +
            `<b>Request:</b> ${safeDestination}\n` +
            `<b>Reply:</b> ${replyText}\n\n` +
            `We have updated your request. If you need anything else, send another message and our concierge team will help.`,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.warn(`Customer reply notification failed for inquiry ${inquiryId}: ${response.status} ${errorBody}`);
    }
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
                .select('inquiry_id, telegram_id, destination, status')
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

            await supabase
                .from('inquiries')
                .update({ status: 'responded' })
                .eq('inquiry_id', inquiryId)
                .eq('telegram_id', user.id);

            await sendCustomerReplyNotification({
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                telegramId: inquiryData.telegram_id,
                inquiryId,
                replyText,
                inquiryDestination: inquiryData.destination
            });

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
