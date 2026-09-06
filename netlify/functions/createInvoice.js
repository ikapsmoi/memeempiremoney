exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is missing on Netlify' }) };
    }

    const invoicePayload = {
        title: "Star Booster Pack",
        description: "Instant +50,000 Clout & 2x Permanent Multiplier",
        payload: "star_booster_50_payload",
        currency: "XTR",
        prices: [{ label: "Telegram Stars", amount: 50 }],
        provider_token: ""
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (!data.ok) {
            return { statusCode: 400, body: JSON.stringify({ error: data.description || 'Telegram API Error' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ invoiceUrl: data.result })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};