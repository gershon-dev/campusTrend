const { db, settlePayment } = require('../_lib/payments');

module.exports = async (req, res) => {
    const reference = String(req.query?.reference || '');
    if (!reference) return res.status(400).json({ success: false, message: 'reference required' });

    try {
        const result = await settlePayment(reference);
        if (result.status !== 'success') return res.json({ success: true, status: result.status });

        const { data: q } = await db().from('past_questions')
            .select('title').eq('id', result.payment.past_question_id).maybeSingle();

        res.json({
            success: true,
            status: 'success',
            data: {
                questionId: result.payment.past_question_id,
                email: result.payment.user_email,
                title: q?.title || 'Past question'
            }
        });
    } catch (err) {
        console.error('Verify error:', err.message);
        res.status(500).json({ success: false, message: 'Verification failed. Please refresh in a moment.' });
    }
};
