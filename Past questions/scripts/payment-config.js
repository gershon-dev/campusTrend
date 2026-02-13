// ============================================
// PAYMENT CONFIGURATION - UPDATED WITH ALL GHANA PREFIXES
// ============================================

// Payment Gateway Configuration
const PAYMENT_CONFIG = {
    // Paystack Configuration (for Card and Mobile Money)
    paystack: {
        publicKey: 'pk_test_8c94c23e4a3ce241ff5f3a8cfb9d40123dbe385e',
        secretKey: 'sk_test_04291fa4b58da2630ec2e9f3dcdefa2aec535446',
        baseUrl: 'https://api.paystack.co',
        currency: 'GHS'
    },

    // Flutterwave Configuration (Alternative payment gateway)
    flutterwave: {
        publicKey: 'FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx',
        baseUrl: 'https://api.flutterwave.com/v3',
        currency: 'GHS'
    },

    // Transaction fees (in percentage)
    fees: {
        momo: 1.5,      // 1.5% for mobile money
        card: 2.9,      // 2.9% for card payments
        bank: 0         // No fee for bank transfer (manual verification)
    },

    // Payment limits
    limits: {
        min: 1,         // Minimum GHS 1
        max: 10000      // Maximum GHS 10,000
    },

    // Mobile Money Networks - UPDATED WITH ALL GHANA PREFIXES
    momoNetworks: {
        mtn: {
            name: 'MTN Mobile Money',
            code: 'mtn',
            prefix: ['024', '025', '053', '054', '055', '059']  // Added 025 and 053
        },
        vodafone: {
            name: 'Vodafone Cash',
            code: 'vod',
            prefix: ['020', '050']
        },
        airteltigo: {
            name: 'AirtelTigo Money',
            code: 'tgo',
            prefix: ['026', '027', '056', '057']
        }
    },

    // Bank Details for Manual Transfer
    bankDetails: {
        bankName: 'Absa Bank Ghana Limited',
        accountName: 'UEW Past Questions',
        accountNumber: '0012345678901',
        branch: 'Winneba Branch',
        swiftCode: 'BARCGHAC'
    },

    // Payment timeout settings
    timeout: {
        momo: 120,      // 2 minutes for mobile money prompt
        card: 300,      // 5 minutes for card payment
        verification: 5 // 5 seconds polling interval for payment verification
    }
};

// API Endpoints
const PAYMENT_ENDPOINTS = {
    // Paystack endpoints
    initializeTransaction: '/transaction/initialize',
    verifyTransaction: '/transaction/verify',
    chargeAuthorization: '/transaction/charge_authorization',

    // Internal backend endpoints (you'll need to create these)
    recordPayment: '/api/payments/record',
    confirmPayment: '/api/payments/confirm',
    uploadReceipt: '/api/payments/upload-receipt',
    verifyPayment: '/api/payments/verify'
};

// Utility function to calculate transaction fee
function calculateFee(amount, method) {
    const feePercentage = PAYMENT_CONFIG.fees[method] || 0;
    return (amount * feePercentage) / 100;
}

// Utility function to calculate total with fee
function calculateTotal(amount, method) {
    const fee = calculateFee(amount, method);
    return amount + fee;
}

// Validate phone number for mobile money - IMPROVED VERSION
function validateMoMoNumber(number, network) {
    // Remove all non-digit characters
    const cleaned = number.replace(/\D/g, '');
    
    // Check if it's 10 digits
    if (cleaned.length !== 10) {
        return { 
            valid: false, 
            message: `Phone number must be exactly 10 digits. You entered ${cleaned.length} digits.` 
        };
    }

    // Check if it starts with 0
    if (!cleaned.startsWith('0')) {
        return {
            valid: false,
            message: 'Phone number must start with 0 (e.g., 0241234567)'
        };
    }

    // Get network prefixes
    const networkPrefixes = PAYMENT_CONFIG.momoNetworks[network]?.prefix || [];
    const prefix = cleaned.substring(0, 3);
    
    // Check if prefix matches the selected network
    if (!networkPrefixes.includes(prefix)) {
        const validPrefixes = networkPrefixes.join(', ');
        return { 
            valid: false, 
            message: `This number (${prefix}...) is not a valid ${PAYMENT_CONFIG.momoNetworks[network]?.name || network} number. Valid prefixes: ${validPrefixes}` 
        };
    }

    return { valid: true, formatted: cleaned };
}

// Format phone number for display
function formatPhoneNumber(number) {
    const cleaned = number.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
    }
    return number;
}

// Validate card number using Luhn algorithm
function validateCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '');
    
    if (!/^\d{13,19}$/.test(cleaned)) {
        return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned[i], 10);

        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
}

// Format card number with spaces
function formatCardNumber(value) {
    const cleaned = value.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g);
    return formatted ? formatted.join(' ') : cleaned;
}

// Format expiry date
function formatExpiryDate(value) {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
        return cleaned.substring(0, 2) + '/' + cleaned.substring(2, 4);
    }
    return cleaned;
}

// Detect card type
function detectCardType(number) {
    const cleaned = number.replace(/\s/g, '');
    
    if (/^4/.test(cleaned)) {
        return 'visa';
    } else if (/^5[1-5]/.test(cleaned)) {
        return 'mastercard';
    } else if (/^3[47]/.test(cleaned)) {
        return 'amex';
    }
    
    return 'unknown';
}

// Generate unique reference
function generateReference() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `UEW-PQ-${timestamp}-${random}`;
}

// Generate order ID
function generateOrderId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `ORD-${timestamp}-${random}`;
}

// Export configuration and utilities
window.paymentConfig = {
    config: PAYMENT_CONFIG,
    endpoints: PAYMENT_ENDPOINTS,
    utils: {
        calculateFee,
        calculateTotal,
        validateMoMoNumber,
        formatPhoneNumber,
        validateCardNumber,
        formatCardNumber,
        formatExpiryDate,
        detectCardType,
        generateReference,
        generateOrderId
    }
};