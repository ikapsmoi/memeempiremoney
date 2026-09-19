const { createClient } = require('@supabase/supabase-js');
const fetch = global.fetch || require('node-fetch');
const { getSupabaseServiceKey } = require('../lib/supabase');

const supabase = createClient(
    process.env.SUPABASE_URL,
    getSupabaseServiceKey()
);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

// 1. Updated to Secret Miles VIP Packages
const vipPackages = {
    secret_miles_vip_monthly: 750,
    secret_miles_vip_annual: 7500,
    secret_miles_single_pass: 150
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

    if (!botToken || !process.env.SUPABASE_URL || !getSupabaseServiceKey()) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Webhook is not configured.' }) };
    }

    const requestSecret = Object.entries(event.headers || {})
        .find(([name]) => name.toLowerCase() === 'x-telegram-bot-api-secret-token')?.[1];
    if (!webhookSecret || requestSecret !== webhookSecret) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized webhook.' }) };
    }

    try {
        const update = JSON.parse(event.body || '{}');

        // --- STEP 1: PRE-CHECKOUT QUERY (User clicks "Pay") ---
        if (update.pre_checkout_query) {
            const query = update.pre_checkout_query;
            
            // Extract the base package ID by stripping the _Date.now() timestamp we added
            const packageId = query.invoice_payload.substring(0, query.invoice_payload.lastIndexOf('_'));
            const expectedStars = vipPackages[packageId];
            
            const isValidOrder = Boolean(expectedStars)
                && query.currency === 'XTR'
                && query.total_amount === expectedStars;
                
            await answerPreCheckoutQuery(
                query.id,
                isValidOrder,
                isValidOrder ? undefined : 'This travel package is no longer available.'
            );
            return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        // --- STEP 2: SUCCESSFUL PAYMENT (Stars Deducted) ---
        const payment = update.message && update.message.successful_payment;
        const user = update.message && update.message.from;
        
        if (payment && user) {
            const packageId = payment.invoice_payload.substring(0, payment.invoice_payload.lastIndexOf('_'));
            const expectedStars = vipPackages[packageId];
            
            if (!expectedStars || payment.currency !== 'XTR' || payment.total_amount !== expectedStars) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payment payload.' }) };
            }

            // --- FULFILLMENT: Grant VIP via Supabase ---
            // ⚠️ IMPORTANT: Create a new RPC in your Supabase database named 'grant_vip_access' 
            const { error } = await supabase.rpc('grant_vip_access', {
                p_telegram_id: user.id,
                p_package_id: packageId,
                p_stars_paid: expectedStars,
                p_payload: payment.invoice_payload,
                p_charge_id: payment.telegram_payment_charge_id
            });

            if (error) {
                console.error('Failed to grant VIP Access', error);
                return { statusCode: 500, body: JSON.stringify({ error: 'Payment received but VIP fulfillment failed.' }) };
            }
            
            // --- OPTIONAL UPGRADE: Send automated confirmation receipt via Bot ---
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: user.id,
                    text: '🎉 *Payment Successful!*\n\nYour Secret Miles VIP Access is now active. Return to the Mini App to start booking unlimited wholesale travel.',
                    parse_mode: 'Markdown'
                })
            }).catch(e => console.error('Failed to send confirmation message:', e));
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        console.error('Telegram webhook error', error);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid webhook update.' }) };
    }
};