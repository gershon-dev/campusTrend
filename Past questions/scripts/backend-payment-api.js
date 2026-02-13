// ============================================
// BACKEND API IMPLEMENTATION (Node.js/Express)
// Save this as: backend/payment-api.js
// ============================================

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// Environment variables (use .env file)
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Supabase Admin Client (server-side only)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// 1. INITIALIZE PAYMENT
// ============================================

router.post('/payments/initialize', async (req, res) => {
    try {
        const { 
            email, 
            amount, 
            reference, 
            questionId, 
            paymentMethod 
        } = req.body;

        // Validate inputs
        if (!email || !amount || !reference || !questionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate amount (minimum GH₵ 1)
        if (amount < 100) {  // 100 pesewas = GH₵ 1
            return res.status(400).json({
                success: false,
                message: 'Minimum amount is GH₵ 1.00'
            });
        }

        // Get question details from Supabase
        const { data: question, error: questionError } = await supabase
            .from('past_questions')
            .select('*')
            .eq('id', questionId)
            .single();

        if (questionError || !question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Initialize payment with Paystack
        const paystackData = {
            email,
            amount,  // Amount in pesewas (GH₵ 5 = 500 pesewas)
            reference,
            currency: 'GHS',
            metadata: {
                questionId,
                questionTitle: question.title,
                custom_fields: [
                    {
                        display_name: "Question Title",
                        variable_name: "question_title",
                        value: question.title
                    }
                ]
            }
        };

        // Add payment method specific data
        if (paymentMethod === 'mobile_money') {
            paystackData.channels = ['mobile_money'];
        } else if (paymentMethod === 'card') {
            paystackData.channels = ['card'];
        }

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            paystackData,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!paystackResponse.data.status) {
            throw new Error(paystackResponse.data.message);
        }

        // Record payment in database
        const { error: dbError } = await supabase
            .from('payments')
            .insert({
                user_email: email,
                past_question_id: questionId,
                amount: amount / 100,  // Convert back to GH₵
                currency: 'GHS',
                payment_method: paymentMethod,
                payment_reference: reference,
                payment_status: 'pending'
            });

        if (dbError) {
            console.error('Database error:', dbError);
        }

        // Return success with authorization URL
        res.json({
            success: true,
            data: {
                authorization_url: paystackResponse.data.data.authorization_url,
                access_code: paystackResponse.data.data.access_code,
                reference: reference
            }
        });

    } catch (error) {
        console.error('Payment initialization error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Payment initialization failed'
        });
    }
});

// ============================================
// 2. VERIFY PAYMENT
// ============================================

router.get('/payments/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;

        // Verify with Paystack
        const paystackResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            }
        );

        if (!paystackResponse.data.status) {
            throw new Error('Payment verification failed');
        }

        const paymentData = paystackResponse.data.data;

        // Update payment status in database
        const { data: payment, error: updateError } = await supabase
            .from('payments')
            .update({
                payment_status: paymentData.status,
                paid_at: paymentData.paid_at,
                paystack_data: paymentData
            })
            .eq('payment_reference', reference)
            .select()
            .single();

        if (updateError) {
            throw new Error('Failed to update payment status');
        }

        // If payment successful, grant access
        if (paymentData.status === 'success') {
            await grantUserAccess(payment);
        }

        res.json({
            success: true,
            status: paymentData.status,
            data: {
                reference: reference,
                amount: paymentData.amount / 100,
                status: paymentData.status,
                paid_at: paymentData.paid_at
            }
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Payment verification failed'
        });
    }
});

// ============================================
// 3. PAYMENT WEBHOOK (Automatic Confirmation)
// ============================================

router.post('/payments/webhook', async (req, res) => {
    try {
        // Verify webhook signature
        const hash = crypto
            .createHmac('sha512', PAYSTACK_SECRET_KEY)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.error('Invalid webhook signature');
            return res.sendStatus(401);
        }

        const event = req.body;

        // Handle different event types
        switch (event.event) {
            case 'charge.success':
                await handleSuccessfulPayment(event.data);
                break;

            case 'charge.failed':
                await handleFailedPayment(event.data);
                break;

            default:
                console.log('Unhandled event type:', event.event);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(500);
    }
});

// ============================================
// 4. UPLOAD BANK RECEIPT
// ============================================

router.post('/payments/upload-receipt', async (req, res) => {
    try {
        const { reference, receiptFile } = req.body;

        if (!reference || !receiptFile) {
            return res.status(400).json({
                success: false,
                message: 'Missing reference or receipt file'
            });
        }

        // Update payment record with receipt
        const { error } = await supabase
            .from('payments')
            .update({
                receipt_path: receiptFile,
                payment_status: 'pending_verification'
            })
            .eq('payment_reference', reference);

        if (error) {
            throw new Error('Failed to update payment record');
        }

        // Send notification to admin for manual verification
        await sendAdminNotification(reference);

        res.json({
            success: true,
            message: 'Receipt uploaded successfully. Payment pending verification.'
        });

    } catch (error) {
        console.error('Receipt upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Grant access to user after successful payment
async function grantUserAccess(payment) {
    try {
        // Get or create user
        let userId = payment.user_id;
        
        if (!userId) {
            // Create guest user
            const { data: user, error: userError } = await supabase
                .from('user_profiles')
                .insert({
                    email: payment.user_email,
                    full_name: 'Guest User',
                    is_guest: true
                })
                .select()
                .single();

            if (userError) throw userError;
            userId = user.id;

            // Update payment with user_id
            await supabase
                .from('payments')
                .update({ user_id: userId })
                .eq('id', payment.id);
        }

        // Grant access
        const { error: accessError } = await supabase
            .from('user_access')
            .insert({
                user_id: userId,
                past_question_id: payment.past_question_id,
                access_type: 'purchased',
                download_count: 0,
                max_downloads: 5,
                granted_at: new Date().toISOString()
            });

        if (accessError && accessError.code !== '23505') {  // Ignore duplicate error
            throw accessError;
        }

        // Send confirmation email
        await sendPaymentConfirmationEmail(payment);

        console.log(`Access granted to user ${userId} for question ${payment.past_question_id}`);

    } catch (error) {
        console.error('Error granting access:', error);
        throw error;
    }
}

// Handle successful payment from webhook
async function handleSuccessfulPayment(data) {
    try {
        const reference = data.reference;

        // Update payment status
        const { data: payment, error: updateError } = await supabase
            .from('payments')
            .update({
                payment_status: 'completed',
                paid_at: data.paid_at,
                paystack_data: data
            })
            .eq('payment_reference', reference)
            .select()
            .single();

        if (updateError) throw updateError;

        // Grant access
        await grantUserAccess(payment);

    } catch (error) {
        console.error('Error handling successful payment:', error);
    }
}

// Handle failed payment from webhook
async function handleFailedPayment(data) {
    try {
        await supabase
            .from('payments')
            .update({
                payment_status: 'failed',
                paystack_data: data
            })
            .eq('payment_reference', data.reference);

    } catch (error) {
        console.error('Error handling failed payment:', error);
    }
}

// Send payment confirmation email
async function sendPaymentConfirmationEmail(payment) {
    try {
        // Implement email sending (use SendGrid, AWS SES, etc.)
        console.log(`Sending confirmation email to ${payment.user_email}`);
        
        // Example with SendGrid:
        /*
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
            to: payment.user_email,
            from: 'noreply@uewpastquestions.com',
            subject: 'Payment Confirmation - UEW Past Questions',
            html: `
                <h1>Payment Successful!</h1>
                <p>Amount: GH₵ ${payment.amount}</p>
                <p>Reference: ${payment.payment_reference}</p>
                <p>You can now download your past question.</p>
            `
        };
        
        await sgMail.send(msg);
        */

    } catch (error) {
        console.error('Error sending confirmation email:', error);
    }
}

// Send admin notification for manual verification
async function sendAdminNotification(reference) {
    try {
        // Send email/SMS to admin about new receipt upload
        console.log(`Admin notification sent for payment ${reference}`);
        
    } catch (error) {
        console.error('Error sending admin notification:', error);
    }
}

// ============================================
// EXPORT ROUTER
// ============================================

module.exports = router;

// ============================================
// USAGE IN MAIN APP
// ============================================

/*
// In your main Express app (server.js or app.js):

const express = require('express');
const cors = require('cors');
const paymentRouter = require('./payment-api');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', paymentRouter);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
*/

// ============================================
// ENVIRONMENT VARIABLES (.env file)
// ============================================

/*
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3000
NODE_ENV=development
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxx
*/
