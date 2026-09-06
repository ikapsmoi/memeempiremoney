exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    // Define your Star package pricing (e.g., 50 Stars for the Booster Pack)
    const invoicePayload = {
        title: "Star Booster Pack",
        description: "Instant +50,000 Clout & 2x Permanent Multiplier",
        payload: "star_booster_50_payload", // Unique tracking ID for this purchase
        currency: "XTR",                    // MUST be XTR for Telegram Stars
        prices: [{ label: "Telegram Stars", amount: 50 }], // 50 Stars
        provider_token: ""                  // MUST be an empty string for digital goods/Stars
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (!data.ok) {
            return { statusCode: 400, body: JSON.stringify({ error: data.description }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ invoiceUrl: data.result })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};