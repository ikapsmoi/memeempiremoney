exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    const packages = {
        stars_100: 100, stars_200: 200, stars_300: 300, stars_500: 500,
        stars_1000: 1000, stars_2000: 2000, stars_10000: 10000, stars_20000: 20000
    };
    const packageId = JSON.parse(event.body || '{}').packageId;
    const stars = packages[packageId];
    if (!stars) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Star package.' }) };
    }

    const invoicePayload = {
        title: `${stars} Star Pack`,
        description: `Receive ${stars} Stars worth of MemeCoin`,
        payload: `${packageId}_payload`,
        currency: "XTR",
        prices: [{ label: "Telegram Stars", amount: stars }],
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