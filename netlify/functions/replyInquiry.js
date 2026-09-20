const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { inquiryId, replyText } = JSON.parse(event.body);
        if (!inquiryId || !replyText) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing inquiryId or replyText' }) };
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false },
            realtime: { transport: WebSocket }
        });

        // 1. Fetch the inquiry details to get the user's telegram_id and destination
        const { data: inquiryData, error: fetchError } = await supabase
            .from('inquiries')
            .select('*')
            .eq('inquiry_id', inquiryId)
            .single();

        if (fetchError || !inquiryData) {
            throw new Error('Original inquiry not found');
        }

        // 2. Append to the shared inquiry thread
        const { error: replyError } = await supabase
            .from('inquiry_replies')
            .insert([{
                inquiry_id: inquiryId,
                reply_text: replyText,
                telegram_id: inquiryData.telegram_id,
                sender_type: 'admin'
            }]);

        if (replyError) throw replyError;

        // 3. Update status on the main inquiries table
        await supabase
            .from('inquiries')
            .update({ status: 'responded' })
            .eq('inquiry_id', inquiryId);

        // 4. Send Instant Push Notification PM via Telegram Bot (if telegram_id and bot token exist)
        if (botToken && inquiryData.telegram_id) {
            const message = `✨ *Quote Ready for your ${inquiryData.destination || 'travel'} request!*\n\n"${replyText}"\n\nOpen your T4L Vault to review and book.`;
            
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: inquiryData.telegram_id,
                    text: message,
                    parse_mode: 'Markdown'
                })
            }).catch(err => console.warn('Telegram PM push failed:', err));
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true })
        };

    } catch (error) {
        console.error('replyInquiry function error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};