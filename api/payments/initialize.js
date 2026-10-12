const { EMAIL_RE, env, db, paystack, crypto } = require('../_lib/payments');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const cfg = env();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const questionId = req.body?.questionId;

        if (!EMAIL_RE.test(email) || !questionId) {
            return res.status(400).json({ success: false, message: 'A valid email and questionId are required' });
        }

        const sb = db();
        const { data: question, error: qErr } = await sb.from('past_questions')
            .select('id, title, price, is_free').eq('id', questionId).maybeSingle();

        if (qErr) {
            console.error('Question lookup error:', qErr.message, '| project:', cfg.supabaseUrl);
            return res.status(500).json({ success: false, message: 'Server database configuration error' });
        }
        if (!question) console.error('Question not found:', questionId, 'in', cfg.supabaseUrl);
        if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
        if (question.is_free) return res.status(400).json({ success: false, message: 'This question is free' });

        const price = Number(question.price); // price always comes from the database
        if (!(price >= 1)) return res.status(400).json({ success: false, message: 'Invalid price on this question' });

        // Where Paystack sends the buyer afterwards — only to origins you allow
        let callbackUrl = `${cfg.origins[0]}/payment-success.html`;
        try {
            const u = new URL(String(req.body?.callbackUrl || ''));
            if (cfg.origins.includes(u.origin)) callbackUrl = u.href;
        } catch (_) { /* keep default */ }

        const reference = `UEW-PQ-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        const { error: dbErr } = await sb.from('payments').insert({
            user_email: email,
            past_question_id: question.id,
            amount: price,
            currency: 'GHS',
            payment_method: 'paystack',
            payment_reference: reference,
            payment_status: 'pending'
        });
        if (dbErr) throw new Error('Could not record payment: ' + dbErr.message);

        const r = await paystack('POST', '/transaction/initialize', {
            email,
            amount: Math.round(price * 100), // pesewas
            currency: 'GHS',
            reference,
            channels: ['card', 'mobile_money'],
            callback_url: callbackUrl,
            metadata: { questionId: question.id, questionTitle: question.title }
        });
        if (!r.ok || !r.json.status) throw new Error(r.json.message || 'Paystack initialization failed');

        res.json({ success: true, data: { authorization_url: r.json.data.authorization_url, reference } });
    } catch (err) {
        console.error('Initialize error:', err.message);
        res.status(500).json({ success: false, message: 'Could not start payment. Please try again.' });
    }
};