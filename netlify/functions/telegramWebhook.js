const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

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
            const isValidOrder = query.invoice_payload === 'energy_pack_5000';
            await answerPreCheckoutQuery(
                query.id,
                isValidOrder,
                isValidOrder ? undefined : 'This product is no longer available.'
            );
            return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        const payment = update.message && update.message.successful_payment;
        const user = update.message && update.message.from;
        if (payment && user && payment.invoice_payload === 'energy_pack_5000') {
            const { error } = await supabase.rpc('grant_energy_pack', {
                p_telegram_id: user.id,
                p_energy: 5000,
                p_charge_id: payment.telegram_payment_charge_id
            });

            if (error) {
                console.error('Failed to grant purchased energy', error);
                return { statusCode: 500, body: JSON.stringify({ error: 'Payment received but fulfillment failed.' }) };
            }
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        console.error('Telegram webhook error', error);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid webhook update.' }) };
    }
};
