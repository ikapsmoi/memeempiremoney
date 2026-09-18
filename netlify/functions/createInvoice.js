const fetch = global.fetch || require('node-fetch');

const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const response = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return response(204, {});
    if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN || !BOT_TOKEN.includes(':')) {
        return response(500, { error: 'TELEGRAM_BOT_TOKEN is missing or invalid on Netlify.' });
    }

    // 1. Updated Packages to match the Secret Miles Frontend
    const packages = {
        secret_miles_vip_monthly: {
            stars: 750,
            title: "VIP Monthly Pass",
            description: "Unlimited wholesale travel inquiries for 30 days."
        },
        secret_miles_vip_annual: {
            stars: 7500,
            title: "VIP Annual Pass",
            description: "Year-round access. Dedicated agent. Maximum savings."
        },
        secret_miles_single_pass: {
            stars: 150,
            title: "Single Priority Pass",
            description: "1x Custom Wholesale Travel Quote."
        }
    };

    let packageId;
    try {
        packageId = JSON.parse(event.body || '{}').packageId;
    } catch (error) {
        return response(400, { error: 'Request body must be valid JSON.' });
    }
    const selectedPackage = packages[packageId];

    if (!selectedPackage) {
        return response(400, { error: 'Invalid VIP package selected.' });
    }

    // 2. Format the Telegram Stars Invoice Payload
    const invoicePayload = {
        title: selectedPackage.title,
        description: selectedPackage.description,
        // Added a timestamp to the payload string to prevent Telegram "duplicate invoice" errors
        payload: `${packageId}_${Date.now()}`,
        currency: "XTR", // Native Telegram Stars code
        prices: [{ label: "Telegram Stars", amount: selectedPackage.stars }],
        provider_token: "" // MUST be empty for Telegram Stars transactions
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram createInvoiceLink failed:', data.description);
            return response(502, { error: `Telegram rejected the invoice: ${data.description || 'Unknown API error'}` });
        }

        return response(200, { invoiceUrl: data.result });
    } catch (error) {
        console.error('Invoice function error:', error);
        return response(500, { error: 'Unable to create invoice.' });
    }
};