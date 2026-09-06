const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!BOT_TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server environment is not configured.' })
        };
    }

    try {
        const { initData, gameState } = JSON.parse(event.body || '{}');
        if (!initData || !gameState || typeof gameState.score !== 'number' || typeof gameState.energy !== 'number') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
        }

        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        urlParams.sort();

        const dataCheckString = [...urlParams.entries()]
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (!hash || calculatedHash !== hash) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Tampered score detected.' })
            };
        }

        const userData = urlParams.get('user');
        const user = userData && JSON.parse(userData);
        if (!user || user.id === undefined) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Telegram user.' }) };
        }

        const { error } = await supabase
            .from('players')
            .upsert({
                telegram_id: user.id,
                score: gameState.score,
                energy: gameState.energy,
                updated_at: new Date().toISOString()
            });

        if (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
    }
};
