const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const starPacks = {
    stars_100: 100,
    stars_200: 200,
    stars_300: 300,
    stars_500: 500,
    stars_1000: 1000,
    stars_2000: 2000,
    stars_10000: 10000,
    stars_20000: 20000
};

async function answerPreCheckoutQuery(queryId, ok, errorMessage) {
    const response = await fetch(
        `https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pre_checkout_query_id: queryId,
                ok,
                ...(errorMessage ? { error_message: errorMessage } : {})
            })
        }
    );

    if (!response.ok) throw new Error('Telegram pre-checkout response failed.');
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!botToken || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook is not configured.' }) };
    }

    if (!webhookSecret || event.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized webhook.' }) };
    }

    try {
        const update = JSON.parse(event.body || '{}');

        if (update.pre_checkout_query) {
            const query = update.pre_checkout_query;
            const packageId = query.invoice_payload.replace(/_payload$/, '');
            const expectedStars = starPacks[packageId];
            const isValidOrder = Boolean(expectedStars)
                && query.currency === 'XTR'
                && query.total_amount === expectedStars;
            await answerPreCheckoutQuery(
                query.id,
                isValidOrder,
                isValidOrder ? undefined : 'This product is no longer available.'
            );
            return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        const payment = update.message && update.message.successful_payment;
        const user = update.message && update.message.from;
        if (payment && user) {
            const packageId = payment.invoice_payload.replace(/_payload$/, '');
            const expectedStars = starPacks[packageId];
            if (!expectedStars || payment.currency !== 'XTR' || payment.total_amount !== expectedStars) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payment payload.' }) };
            }

            const { error } = await supabase.rpc('grant_meme_pack', {
                p_telegram_id: user.id,
                p_meme_amount: expectedStars,
                p_payload: payment.invoice_payload,
                p_charge_id: payment.telegram_payment_charge_id
            });

            if (error) {
                console.error('Failed to grant purchased Stars', error);
                return { statusCode: 500, body: JSON.stringify({ error: 'Payment received but fulfillment failed.' }) };
            }
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        console.error('Telegram webhook error', error);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid webhook update.' }) };
    }
};
