const fetch = require('node-fetch');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { telegram_id, category, destination, dates, name } = JSON.parse(event.body);
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

        if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN environment variable');

        const parsedDates = typeof dates === 'string' ? JSON.parse(dates) : dates;
        const dateStr = parsedDates.checkin ? `${parsedDates.checkin} to ${parsedDates.checkout}` : 'Flexible';

        // 1. Send confirmation message to the USER
        if (telegram_id) {
            const userText = `<b>✈️ Inquiry Received!</b>\n\n` +
                `<b>Category:</b> ${category}\n` +
                `<b>Destination:</b> ${destination}\n` +
                `<b>Dates:</b> ${dateStr}\n\n` +
                `Our private concierge desk is finding wholesale rates. You will receive a direct reply here shortly.`;

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegram_id,
                    text: userText,
                    parse_mode: 'HTML'
                })
            });
        }

        // 2. Alert the ADMIN concierge group/desk
        if (ADMIN_CHAT_ID) {
            const adminText = `<b>🚨 NEW WHOLESALE QUOTE REQUEST</b>\n\n` +
                `<b>User:</b> ${name || 'Traveler'} (ID: <code>${telegram_id}</code>)\n` +
                `<b>Category:</b> ${category}\n` +
                `<b>Destination:</b> ${destination}\n` +
                `<b>Dates:</b> ${dateStr}`;

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: ADMIN_CHAT_ID,
                    text: adminText,
                    parse_mode: 'HTML'
                })
            });
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
        console.error('Notification error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};