// TEMPORARY test page: open /api/payments/health in your browser. DELETE this file once payments work.
const { env, db } = require('../_lib/payments');

module.exports = async (req, res) => {
    const out = {
        paystackKeySet: !!process.env.PAYSTACK_SECRET_KEY,
        allowedOriginsSet: !!process.env.ALLOWED_ORIGINS,
        serviceKeySet: !!(process.env.PQ_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY)
    };
    try {
        const cfg = env();
        out.supabaseProject = cfg.supabaseUrl;
        const { data, error } = await db().from('past_questions').select('id,title,price,is_free').limit(3);
        out.databaseOk = !error;
        out.databaseError = error ? error.message : null;
        out.sampleRows = data ? data.length : 0;
        out.sampleQuestions = data || [];
    } catch (e) {
        out.configError = e.message;
    }
    res.status(200).json(out);
};
