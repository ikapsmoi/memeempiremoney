exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Telegram bot is not configured.' })
        };
    }

    const invoiceData = {
        title: 'Super Energy Pack',
        description: 'Refill your energy by 5,000 points instantly!',
        payload: 'energy_pack_5000',
        currency: 'XTR',
        prices: [{ label: 'Price in Stars', amount: 50 }],
        provider_token: ''
    };

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoiceData)
            }
        );
        const data = await response.json();

        if (!response.ok || !data.ok || !data.result) {
            return {
                statusCode: 502,
                body: JSON.stringify({ error: 'Telegram could not create the invoice.' })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ invoiceUrl: data.result })
        };
    } catch (error) {
        return {
            statusCode: 502,
            body: JSON.stringify({ error: 'Unable to reach Telegram.' })
        };
    }
};
