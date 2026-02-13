// ============================================
// PAYMENT PROCESSING LOGIC - FIXED VERSION
// ============================================

let currentQuestion = null;
let currentAmount = 0;
let selectedMethod = null;
let paymentReference = null;
let countdownTimer = null;
let isProcessing = false; // Prevent double-clicks

// Initialize payment page
document.addEventListener('DOMContentLoaded', async () => {
    // Get question ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const questionId = urlParams.get('questionId');
    const amount = parseFloat(urlParams.get('amount'));

    if (!questionId || !amount) {
        showError('Invalid payment request');
        setTimeout(() => {
            window.location.href = 'past-questions.html';
        }, 2000);
        return;
    }

    currentAmount = amount;

    // Load question details
    await loadQuestionDetails(questionId);

    // Setup payment method selection
    setupPaymentMethods();

    // Setup form input formatting
    setupFormFormatting();
});

// Load question details
async function loadQuestionDetails(questionId) {
    try {
        const result = await window.dbOperations.getPastQuestionById(questionId);

        if (!result.success) {
            throw new Error(result.error || 'Failed to load question');
        }

        currentQuestion = result.data;

        // Display question details
        document.getElementById('questionDetails').innerHTML = `
            <h3>${currentQuestion.title}</h3>
            <div class="question-meta">
                <strong>Course:</strong> ${currentQuestion.course_code || ''} ${currentQuestion.course_name || ''}
            </div>
            <div class="question-meta">
                <strong>Level:</strong> ${currentQuestion.level} | <strong>Semester:</strong> ${currentQuestion.semester === 'first' ? 'First' : 'Second'}
            </div>
            <div class="question-meta">
                <strong>Year:</strong> ${currentQuestion.year || 'N/A'}
            </div>
        `;

        // Update price breakdown
        updatePriceBreakdown(currentAmount, 'momo'); // Default to momo
        
        // Generate order ID
        const orderId = window.paymentConfig.utils.generateOrderId();
        document.getElementById('orderId').textContent = orderId;

    } catch (error) {
        showError(error.message);
    }
}

// Update price breakdown
function updatePriceBreakdown(amount, method) {
    const fee = window.paymentConfig.utils.calculateFee(amount, method);
    const total = amount + fee;

    document.getElementById('subtotal').textContent = `GH₵ ${amount.toFixed(2)}`;
    document.getElementById('fee').textContent = `GH₵ ${fee.toFixed(2)}`;
    document.getElementById('total').textContent = `GH₵ ${total.toFixed(2)}`;

    // Update pay button amounts
    document.getElementById('momoAmount').textContent = total.toFixed(2);
    document.getElementById('cardAmount').textContent = total.toFixed(2);
    document.getElementById('bankAmount').textContent = `GH₵ ${total.toFixed(2)}`;
}

// Setup payment method selection
function setupPaymentMethods() {
    const methods = document.querySelectorAll('.payment-method');
    
    methods.forEach(method => {
        method.addEventListener('click', () => {
            // Remove active class from all methods
            methods.forEach(m => m.classList.remove('active'));
            
            // Add active class to selected method
            method.classList.add('active');
            
            // Hide all forms
            document.querySelectorAll('.payment-form').forEach(form => {
                form.style.display = 'none';
            });
            
            // Show selected form
            const methodType = method.dataset.method;
            selectedMethod = methodType;
            document.getElementById(`${methodType}Form`).style.display = 'block';
            
            // Update price breakdown
            updatePriceBreakdown(currentAmount, methodType);
        });
    });
}

// Setup form input formatting
function setupFormFormatting() {
    // Format card number
    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber) {
        cardNumber.addEventListener('input', (e) => {
            e.target.value = window.paymentConfig.utils.formatCardNumber(e.target.value);
        });
    }

    // Format expiry date
    const cardExpiry = document.getElementById('cardExpiry');
    if (cardExpiry) {
        cardExpiry.addEventListener('input', (e) => {
            e.target.value = window.paymentConfig.utils.formatExpiryDate(e.target.value);
        });
    }

    // Format CVV (numbers only)
    const cardCVV = document.getElementById('cardCVV');
    if (cardCVV) {
        cardCVV.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }

    // Format phone number
    const momoNumber = document.getElementById('momoNumber');
    if (momoNumber) {
        momoNumber.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
        });
    }
}

// Process Mobile Money Payment - FIXED VERSION
async function processMoMoPayment() {
    // Prevent double-clicking
    if (isProcessing) {
        console.log('Payment already in progress...');
        return;
    }

    try {
        isProcessing = true;

        const network = document.querySelector('input[name="network"]:checked').value;
        const phoneNumber = document.getElementById('momoNumber').value;
        const accountName = document.getElementById('momoName').value;

        // Validate inputs
        if (!phoneNumber || !accountName) {
            showError('Please fill in all required fields');
            return;
        }

        // Validate phone number
        const validation = window.paymentConfig.utils.validateMoMoNumber(phoneNumber, network);
        if (!validation.valid) {
            showError(validation.message);
            return;
        }

        // Calculate total with fee
        const total = window.paymentConfig.utils.calculateTotal(currentAmount, 'momo');

        // Show processing modal
        showProcessingModal('Initiating payment...');

        // Generate UNIQUE payment reference with extra randomness
        paymentReference = window.paymentConfig.utils.generateReference();
        console.log('Generated payment reference:', paymentReference);

        // Get user email
        const userEmail = await getUserEmail();

        // Record payment in database with email
        const recordResult = await window.dbOperations.recordPayment({
            questionId: currentQuestion.id,
            amount: total,
            currency: 'GHS',
            method: `momo_${network}`,
            reference: paymentReference,
            email: userEmail  // Include email for guest checkout
        });

        if (!recordResult.success) {
            console.error('Payment recording failed:', recordResult);
            throw new Error(recordResult.error || 'Failed to record payment');
        }

        console.log('Payment recorded successfully:', recordResult.data);

        // Initialize Paystack payment
        const paystackResult = await initializePaystackMoMo({
            email: userEmail,
            amount: total * 100, // Paystack uses kobo/pesewas
            reference: paymentReference,
            mobile_money: {
                phone: validation.formatted,
                provider: network
            }
        });

        if (!paystackResult.success) {
            throw new Error(paystackResult.message || 'Payment initialization failed');
        }

        // Hide processing modal
        hideProcessingModal();

        // Show MoMo prompt modal
        showMoMoPromptModal(validation.formatted);

        // Start verification polling
        startPaymentVerification(paymentReference);

    } catch (error) {
        hideProcessingModal();
        console.error('Payment error:', error);
        showError(error.message || 'Payment failed. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// Process Card Payment
async function processCardPayment() {
    if (isProcessing) return;

    try {
        isProcessing = true;

        const cardNumber = document.getElementById('cardNumber').value;
        const cardExpiry = document.getElementById('cardExpiry').value;
        const cardCVV = document.getElementById('cardCVV').value;
        const cardName = document.getElementById('cardName').value;

        // Validate inputs
        if (!cardNumber || !cardExpiry || !cardCVV || !cardName) {
            showError('Please fill in all card details');
            return;
        }

        // Validate card number
        if (!window.paymentConfig.utils.validateCardNumber(cardNumber)) {
            showError('Invalid card number');
            return;
        }

        // Validate expiry
        const [month, year] = cardExpiry.split('/');
        if (!month || !year || month > 12 || month < 1) {
            showError('Invalid expiry date');
            return;
        }

        // Calculate total with fee
        const total = window.paymentConfig.utils.calculateTotal(currentAmount, 'card');

        // Show processing modal
        showProcessingModal('Processing card payment...');

        // Generate payment reference
        paymentReference = window.paymentConfig.utils.generateReference();

        // Get user email
        const userEmail = await getUserEmail();

        // Record payment in database
        const recordResult = await window.dbOperations.recordPayment({
            questionId: currentQuestion.id,
            amount: total,
            currency: 'GHS',
            method: 'card',
            reference: paymentReference,
            email: userEmail
        });

        if (!recordResult.success) {
            throw new Error(recordResult.error || 'Failed to record payment');
        }

        // Initialize Paystack card payment
        const paystackResult = await initializePaystackCard({
            email: userEmail,
            amount: total * 100,
            reference: paymentReference,
            card: {
                number: cardNumber.replace(/\s/g, ''),
                cvv: cardCVV,
                expiry_month: month,
                expiry_year: `20${year}`
            }
        });

        if (!paystackResult.success) {
            throw new Error(paystackResult.message || 'Card payment failed');
        }

        // Payment successful
        hideProcessingModal();
        
        // Confirm payment and grant access
        await confirmPaymentAndGrantAccess(paymentReference);

    } catch (error) {
        hideProcessingModal();
        showError(error.message);
    } finally {
        isProcessing = false;
    }
}

// Submit Bank Transfer
async function submitBankTransfer() {
    if (isProcessing) return;

    try {
        isProcessing = true;

        const receiptFile = document.getElementById('receiptUpload').files[0];

        if (!receiptFile) {
            showError('Please upload your payment receipt');
            return;
        }

        // Show processing modal
        showProcessingModal('Uploading payment proof...');

        // Generate payment reference
        paymentReference = window.paymentConfig.utils.generateReference();

        // Calculate total (no fee for bank transfer)
        const total = window.paymentConfig.utils.calculateTotal(currentAmount, 'bank');

        // Get user email
        const userEmail = await getUserEmail();

        // Record payment in database
        const recordResult = await window.dbOperations.recordPayment({
            questionId: currentQuestion.id,
            amount: total,
            currency: 'GHS',
            method: 'bank_transfer',
            reference: paymentReference,
            email: userEmail
        });

        if (!recordResult.success) {
            throw new Error(recordResult.error || 'Failed to record payment');
        }

        // Upload receipt to Supabase Storage
        const receiptPath = `receipts/${paymentReference}_${receiptFile.name}`;
        const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
            .from('payment-receipts')
            .upload(receiptPath, receiptFile);

        if (uploadError) {
            throw new Error('Failed to upload receipt');
        }

        // Update payment record with receipt path
        await window.supabaseClient
            .from('payments')
            .update({ receipt_path: receiptPath })
            .eq('payment_reference', paymentReference);

        hideProcessingModal();
        
        // Show success message
        showSuccess('Payment proof submitted successfully! You will receive access within 24 hours after verification.');
        
        setTimeout(() => {
            window.location.href = 'past-questions.html';
        }, 3000);

    } catch (error) {
        hideProcessingModal();
        showError(error.message);
    } finally {
        isProcessing = false;
    }
}

// Initialize Paystack Mobile Money Payment
async function initializePaystackMoMo(paymentData) {
    try {
        // In production, this should call your backend API which then calls Paystack
        // For now, we'll simulate the payment process
        
        // Simulated Paystack response
        return {
            success: true,
            data: {
                authorization_url: '#',
                access_code: 'mock_access_code',
                reference: paymentData.reference
            }
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

// Initialize Paystack Card Payment
async function initializePaystackCard(paymentData) {
    try {
        // In production, this should call your backend API which then calls Paystack
        // For now, we'll simulate successful payment
        
        return {
            success: true,
            data: {
                reference: paymentData.reference,
                status: 'success'
            }
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

// Start payment verification polling
function startPaymentVerification(reference) {
    let countdown = window.paymentConfig.config.timeout.momo;
    const countdownElement = document.getElementById('countdown');
    
    countdownTimer = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(countdownTimer);
            cancelPayment();
            showError('Payment timeout. Please try again.');
        }
    }, 1000);

    // Poll for payment status every 5 seconds
    const verificationInterval = setInterval(async () => {
        const result = await verifyPayment(reference);

        if (result.success && result.status === 'success') {
            clearInterval(verificationInterval);
            clearInterval(countdownTimer);
            hideMoMoPromptModal();
            await confirmPaymentAndGrantAccess(reference);
        }
    }, window.paymentConfig.config.timeout.verification * 1000);
}

// Verify payment status
async function verifyPayment(reference) {
    try {
        // In production, this should call your backend API to verify with Paystack
        // For simulation, we'll auto-approve after 10 seconds
        
        const { data, error } = await window.supabaseClient
            .from('payments')
            .select('payment_status')
            .eq('payment_reference', reference)
            .single();

        if (error) throw error;

        return {
            success: true,
            status: data.payment_status === 'completed' ? 'success' : 'pending'
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

// Confirm payment and grant access
async function confirmPaymentAndGrantAccess(reference) {
    try {
        showProcessingModal('Confirming payment and granting access...');

        const result = await window.dbOperations.confirmPayment(reference);

        if (!result.success) {
            throw new Error('Failed to confirm payment');
        }

        hideProcessingModal();
        
        // Redirect to success page
        window.location.href = `payment-success.html?reference=${reference}&questionId=${currentQuestion.id}`;

    } catch (error) {
        hideProcessingModal();
        showError(error.message);
    }
}

// Get user email
async function getUserEmail() {
    const result = await window.authFunctions.getCurrentUser();
    return result.user?.email || 'guest@uewpastquestions.com';
}

// Handle receipt upload
function handleReceiptUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById('receiptPreview');
    const fileSize = (file.size / 1024 / 1024).toFixed(2);

    preview.innerHTML = `
        <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; margin-top: 10px;">
            <strong>📄 ${file.name}</strong><br>
            <small>Size: ${fileSize} MB</small>
        </div>
    `;
    preview.style.display = 'block';
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Account number copied to clipboard!');
    });
}

// Cancel payment
function cancelPayment() {
    clearInterval(countdownTimer);
    hideMoMoPromptModal();
    showError('Payment cancelled');
}

// UI Helper Functions
function showProcessingModal(message) {
    document.getElementById('processingMessage').textContent = message;
    document.getElementById('processingModal').style.display = 'flex';
}

function hideProcessingModal() {
    document.getElementById('processingModal').style.display = 'none';
}

function showMoMoPromptModal(phoneNumber) {
    document.getElementById('promptNumber').textContent = window.paymentConfig.utils.formatPhoneNumber(phoneNumber);
    document.getElementById('momoPromptModal').style.display = 'flex';
}

function hideMoMoPromptModal() {
    document.getElementById('momoPromptModal').style.display = 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
    
    // Scroll to top to show error
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';
    
    // Scroll to top to show success
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
    window.history.back();
}