// ============================================
// PAYMENT PAGE — hands off to Paystack's hosted checkout
// ============================================

let currentQuestion = null;
let isProcessing = false;

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

document.addEventListener('DOMContentLoaded', async () => {
    const questionId = new URLSearchParams(window.location.search).get('questionId');

    if (!questionId) {
        showError('Invalid payment request');
        setTimeout(() => (window.location.href = 'past-questions.html'), 2000);
        return;
    }

    await loadQuestionDetails(questionId);

    // Prefill email if the visitor happens to be logged in
    const auth = await window.authFunctions.getCurrentUser();
    if (auth.user?.email) $('payEmail').value = auth.user.email;

    $('payBtn').addEventListener('click', startPayment);
});

async function loadQuestionDetails(questionId) {
    const result = await window.dbOperations.getPastQuestionById(questionId);

    if (!result.success) {
        showError(result.error || 'Failed to load question');
        return;
    }

    currentQuestion = result.data;

    if (currentQuestion.is_free) {
        window.location.href = 'past-questions.html';
        return;
    }

    const price = Number(currentQuestion.price);

    $('questionDetails').innerHTML = `
        <h3>${escapeHtml(currentQuestion.title)}</h3>
        <div class="question-meta"><strong>Course:</strong> ${escapeHtml(currentQuestion.course_code)} ${escapeHtml(currentQuestion.course_name)}</div>
        <div class="question-meta"><strong>Level:</strong> ${escapeHtml(currentQuestion.level)} | <strong>Semester:</strong> ${currentQuestion.semester === 'first' ? 'First' : 'Second'}</div>
        <div class="question-meta"><strong>Year:</strong> ${escapeHtml(currentQuestion.year || 'N/A')}</div>
    `;

    $('total').textContent = `GH₵ ${price.toFixed(2)}`;
    $('payAmount').textContent = price.toFixed(2);
    $('payBtn').disabled = false;
}

async function startPayment() {
    if (isProcessing || !currentQuestion) return;

    const email = $('payEmail').value.trim().toLowerCase();
    if (!window.paymentConfig.isValidEmail(email)) {
        showError('Please enter a valid email address. Your download access is linked to it.');
        return;
    }

    isProcessing = true;
    $('payBtn').disabled = true;
    $('payBtn').textContent = 'Opening Paystack...';
    $('errorMessage').style.display = 'none';

    try {
        const response = await fetch(`${window.paymentConfig.apiBaseUrl}/payments/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                questionId: currentQuestion.id,
                // payment-success.html sits next to this page, wherever the site is hosted
                callbackUrl: new URL('payment-success.html', window.location.href).href
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Could not start payment');
        }

        // Paystack's own page takes over: card / mobile money entry, OTP, PIN prompts
        window.location.href = result.data.authorization_url;
    } catch (error) {
        console.error('Payment start error:', error);
        showError(error.message || 'Could not start payment. Please try again.');
        isProcessing = false;
        $('payBtn').disabled = false;
        $('payBtn').innerHTML = `Pay GH₵ <span id="payAmount">${Number(currentQuestion.price).toFixed(2)}</span> with Paystack`;
    }
}

function showError(message) {
    const el = $('errorMessage');
    el.textContent = message;
    el.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
    window.history.back();
}