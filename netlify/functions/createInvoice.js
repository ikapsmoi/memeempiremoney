exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is missing on Netlify' }) };
    }

    const packages = {
        stars_100: { stars: 100, rupees: 99 },
        stars_200: { stars: 200, rupees: 189 },
        stars_300: { stars: 300, rupees: 279 },
        stars_500: { stars: 500, rupees: 449 },
        stars_1000: { stars: 1000, rupees: 899 },
        stars_2000: { stars: 2000, rupees: 1699 },
        stars_10000: { stars: 10000, rupees: 7999 },
        stars_20000: { stars: 20000, rupees: 14999 }
    };
    const packageId = JSON.parse(event.body || '{}').packageId;
    const selectedPackage = packages[packageId];
    if (!selectedPackage) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Star package.' }) };
    }

    const invoicePayload = {
        title: `${selectedPackage.stars} Star Pack`,
        description: `Receive ${selectedPackage.stars} Stars worth of MemeCoin`,
        payload: `${packageId}_payload`,
        currency: "XTR",
        prices: [{ label: "Telegram Stars", amount: selectedPackage.stars }],
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