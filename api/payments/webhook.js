const { env, settlePayment, crypto } = require('../_lib/payments');

async function readRaw(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const raw = await readRaw(req); // signature is computed over the exact bytes Paystack sent
        const signature = String(req.headers['x-paystack-signature'] || '');
        const expected = crypto.createHmac('sha512', env().secret).update(raw).digest('hex');

        const valid = signature.length === expected.length &&
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        if (!valid) return res.status(401).end();

        const event = JSON.parse(raw.toString('utf8'));
        if (event.event === 'charge.success') {
            await settlePayment(event.data.reference); // re-verifies with Paystack itself
        }
        res.status(200).end();
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(500).end(); // Paystack will retry
    }
};

module.exports.config = { api: { bodyParser: false } };
