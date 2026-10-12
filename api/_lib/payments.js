// Shared helpers for the payment functions.
// (Files starting with "_" inside /api are NOT deployed as endpoints.)
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function env() {
    const e = {
        secret: process.env.PAYSTACK_SECRET_KEY,
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_KEY,
        origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean),
        accessDays: Number(process.env.ACCESS_DAYS || 365),
        maxDownloads: Number(process.env.MAX_DOWNLOADS || 5)
    };
    const missing = [];
    if (!e.secret) missing.push('PAYSTACK_SECRET_KEY');
    if (!e.supabaseUrl) missing.push('SUPABASE_URL');
    if (!e.serviceKey) missing.push('SUPABASE_SERVICE_KEY');
    if (!e.origins.length) missing.push('ALLOWED_ORIGINS');
    if (missing.length) throw new Error('Missing env vars: ' + missing.join(', '));
    return e;
}

let _db;
function db() {
    if (!_db) _db = createClient(env().supabaseUrl, env().serviceKey); // service role: server only
    return _db;
}

async function paystack(method, path, body) {
    const res = await fetch('https://api.paystack.co' + path, {
        method,
        headers: { Authorization: `Bearer ${env().secret}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, json };
}

// Verify with Paystack, then update DB + grant access. Safe to call repeatedly
// (the verify endpoint and the webhook can race).
async function settlePayment(reference) {
    const sb = db();
    const { data: payment, error } = await sb.from('payments').select('*')
        .eq('payment_reference', reference).maybeSingle();
    if (error) throw error;
    if (!payment) return { status: 'not_found' };

    if (payment.payment_status === 'completed') {
        await grantAccess(payment);
        return { status: 'success', payment };
    }

    const r = await paystack('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (r.status === 404) return { status: 'pending' }; // customer hasn't reached payment step yet
    if (!r.ok) throw new Error('Paystack verify failed: ' + (r.json.message || r.status));
    const tx = r.json.data;

    if (tx.status === 'success') {
        // Never trust "success" alone — check the amount and currency
        const expected = Math.round(Number(payment.amount) * 100);
        if (tx.currency !== 'GHS' || tx.amount !== expected) {
            console.error(`Amount mismatch on ${reference}: paid ${tx.amount} ${tx.currency}, expected ${expected} GHS`);
            await sb.from('payments').update({ payment_status: 'failed', paystack_data: tx }).eq('payment_reference', reference);
            return { status: 'failed' };
        }
        const { data: updated, error: upErr } = await sb.from('payments')
            .update({ payment_status: 'completed', paid_at: tx.paid_at, paystack_data: tx })
            .eq('payment_reference', reference).select().single();
        if (upErr) throw upErr;
        await grantAccess(updated);
        return { status: 'success', payment: updated };
    }

    if (['failed', 'abandoned', 'reversed'].includes(tx.status)) {
        await sb.from('payments').update({ payment_status: 'failed', paystack_data: tx }).eq('payment_reference', reference);
        return { status: 'failed' };
    }
    return { status: 'pending' };
}

// Writes to guest_downloads — the table checkGuestAccess() in supabase-db.js reads.
async function grantAccess(payment) {
    const sb = db();
    const { accessDays, maxDownloads } = env();
    const expiresAt = new Date(Date.now() + accessDays * 86400000).toISOString();

    const { data: existing } = await sb.from('guest_downloads').select('id')
        .eq('payment_reference', payment.payment_reference).maybeSingle();
    if (existing) return;

    const { error } = await sb.from('guest_downloads').insert({
        email: payment.user_email,
        past_question_id: payment.past_question_id,
        payment_reference: payment.payment_reference,
        download_count: 0,
        max_downloads: maxDownloads,
        expires_at: expiresAt
    });

    if (error) {
        if (error.code === '23505') { // same email bought this before → renew that row
            const { error: e2 } = await sb.from('guest_downloads').update({
                payment_reference: payment.payment_reference,
                download_count: 0,
                max_downloads: maxDownloads,
                expires_at: expiresAt
            }).eq('email', payment.user_email).eq('past_question_id', payment.past_question_id);
            if (e2) throw e2;
        } else throw error;
    }
}

module.exports = { EMAIL_RE, env, db, paystack, settlePayment, crypto };
