// ============================================
// SUPABASE DATABASE OPERATIONS
// All read/download functions are guest-accessible.
// Only uploadPastQuestion requires authentication.
// ============================================

// Get all past questions with optional filters — NO auth required
async function getPastQuestions(filters = {}) {
    try {
        let query = window.supabaseClient
            .from('past_questions')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.faculty)               query = query.eq('faculty', filters.faculty);
        if (filters.department)            query = query.eq('department', filters.department);
        if (filters.level)                 query = query.eq('level', filters.level);
        if (filters.semester)              query = query.eq('semester', filters.semester);
        if (filters.is_free !== undefined) query = query.eq('is_free', filters.is_free);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching past questions:', error);
        return { success: false, error: error.message };
    }
}

// Get a single past question by ID — NO auth required
async function getPastQuestionById(questionId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('past_questions')
            .select('*')
            .eq('id', questionId)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching past question:', error);
        return { success: false, error: error.message };
    }
}

// Check guest access by email — NO auth required
async function checkGuestAccess(questionId, email) {
    try {
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('is_free, price')
            .eq('id', questionId)
            .single();

        if (question.is_free) {
            return { success: true, hasAccess: true, isFree: true };
        }

        if (!email) {
            return { success: true, hasAccess: false, message: 'Purchase required', price: question.price };
        }

        const { data: access } = await window.supabaseClient
            .from('guest_downloads')
            .select('*')
            .eq('email', email)
            .eq('past_question_id', questionId)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (access && access.download_count < access.max_downloads) {
            return { success: true, hasAccess: true, access };
        }

        return { success: true, hasAccess: false, message: 'Purchase required', price: question.price };
    } catch (error) {
        console.error('Error checking access:', error);
        return { success: false, hasAccess: false, error: error.message };
    }
}

// Legacy alias — NO auth required
async function checkUserAccess(questionId) {
    try {
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('is_free, price')
            .eq('id', questionId)
            .single();

        if (question.is_free) {
            return { success: true, hasAccess: true, isFree: true };
        }

        return { success: true, hasAccess: false, message: 'Purchase required', price: question.price };
    } catch (error) {
        console.error('Error checking access:', error);
        return { success: false, hasAccess: false, error: error.message };
    }
}

// Not used in guest system
async function getUserPurchases() {
    return { success: false, error: 'Guest system - no user accounts' };
}

// Record a payment — NO auth required (guest checkout)
async function recordPayment(paymentData) {
    try {
        const paymentRecord = {
            user_email: paymentData.email,
            past_question_id: paymentData.questionId,
            amount: paymentData.amount,
            currency: paymentData.currency || 'GHS',
            payment_method: paymentData.method,
            payment_reference: paymentData.reference,
            payment_status: 'pending'
        };

        console.log('Recording payment (guest mode):', paymentRecord);

        const { data, error } = await window.supabaseClient
            .from('payments')
            .insert(paymentRecord)
            .select()
            .single();

        if (error) {
            console.error('Supabase error details:', error);
            throw error;
        }

        console.log('Payment recorded successfully:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Error recording payment:', error);
        return { success: false, error: error.message, details: error };
    }
}

// Confirm payment and grant access — NO auth required
async function confirmPayment(paymentReference) {
    try {
        const { data: payment, error: getError } = await window.supabaseClient
            .from('payments')
            .select('*')
            .eq('payment_reference', paymentReference)
            .single();

        if (getError) throw getError;

        const { error: paymentError } = await window.supabaseClient
            .from('payments')
            .update({ payment_status: 'completed', paid_at: new Date().toISOString() })
            .eq('payment_reference', paymentReference);

        if (paymentError) throw paymentError;

        const { data: access, error: accessError } = await window.supabaseClient
            .from('guest_downloads')
            .insert({
                email: payment.user_email,
                past_question_id: payment.past_question_id,
                payment_reference: paymentReference,
                download_count: 0,
                max_downloads: 5
            })
            .select()
            .single();

        if (accessError && accessError.code !== '23505') {
            console.error('Access grant error:', accessError);
        }

        return { success: true, data: { payment, access } };
    } catch (error) {
        console.error('Error confirming payment:', error);
        return { success: false, error: error.message };
    }
}

// Generate a temporary signed download URL — NO auth required
async function generateDownloadUrl(questionId, email) {
    try {
        const { data: question, error: questionError } = await window.supabaseClient
            .from('past_questions')
            .select('*')
            .eq('id', questionId)
            .single();

        if (questionError) throw questionError;

        if (!question.file_path) {
            throw new Error(`No file_path set for question ID "${questionId}". Check the database record.`);
        }

        const filePath = question.file_path.replace(/^\/+/, '');
        const bucket = window.PAST_QUESTIONS_BUCKET;

        console.debug(`[generateDownloadUrl] bucket="${bucket}", path="${filePath}"`);

        // Verify file exists in Storage
        const { data: fileList, error: listError } = await window.supabaseClient.storage
            .from(bucket)
            .list(filePath.substring(0, filePath.lastIndexOf('/')), {
                search: filePath.substring(filePath.lastIndexOf('/') + 1)
            });

        if (listError) {
            console.error('[generateDownloadUrl] Storage list error:', listError);
        } else if (!fileList || fileList.length === 0) {
            throw new Error(
                `File not found in Storage. Bucket: "${bucket}", Path: "${filePath}". ` +
                `Check that the file was uploaded and the path in the database matches exactly.`
            );
        }

        // Free questions — anyone can download without login
        if (question.is_free) {
            const { data, error } = await window.supabaseClient.storage
                .from(bucket)
                .createSignedUrl(filePath, 3600);

            if (error) throw error;

            await window.supabaseClient
                .from('past_questions')
                .update({ download_count: (question.download_count || 0) + 1 })
                .eq('id', questionId);

            return { success: true, url: data.signedUrl };
        }

        // Paid questions — check guest access by email (no login needed)
        if (!email) {
            throw new Error('Email required for paid downloads');
        }

        const accessCheck = await checkGuestAccess(questionId, email);

        if (!accessCheck.hasAccess) {
            throw new Error(accessCheck.message || 'Access denied - payment required');
        }

        const { data, error } = await window.supabaseClient.storage
            .from(bucket)
            .createSignedUrl(filePath, 3600);

        if (error) throw error;

        // Increment download count safely (fix: was incorrectly using sql template literal)
        const { data: currentAccess } = await window.supabaseClient
            .from('guest_downloads')
            .select('download_count')
            .eq('email', email)
            .eq('past_question_id', questionId)
            .single();

        if (currentAccess) {
            await window.supabaseClient
                .from('guest_downloads')
                .update({ download_count: (currentAccess.download_count || 0) + 1 })
                .eq('email', email)
                .eq('past_question_id', questionId);
        }

        return { success: true, url: data.signedUrl };
    } catch (error) {
        console.error('Error generating download URL:', error);
        return { success: false, error: error.message };
    }
}

// Upload a past question — REQUIRES LOGIN (admin/uploader only)
async function uploadPastQuestion(file, metadata) {
    try {
        // This is the ONLY function that enforces auth.
        // requireUploadAuth() will redirect to login.html if not signed in.
        const authed = await window.authFunctions.requireUploadAuth();
        if (!authed) return { success: false, error: 'Authentication required to upload' };

        const { data: { user } } = await window.supabaseClient.auth.getUser();

        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `${metadata.faculty}/${metadata.department}/${metadata.level}/${metadata.semester}/${fileName}`;

        const { error: uploadError } = await window.supabaseClient.storage
            .from(window.PAST_QUESTIONS_BUCKET)
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        const { data: question, error: dbError } = await window.supabaseClient
            .from('past_questions')
            .insert({
                title: metadata.title,
                faculty: metadata.faculty,
                department: metadata.department,
                level: metadata.level,
                semester: metadata.semester,
                course_code: metadata.courseCode,
                course_name: metadata.courseName,
                year: metadata.year,
                file_path: filePath,
                file_size: file.size,
                price: metadata.price || 0,
                is_free: metadata.isFree || false
            })
            .select()
            .single();

        if (dbError) {
            // Clean up uploaded file if DB insert fails
            await window.supabaseClient.storage
                .from(window.PAST_QUESTIONS_BUCKET)
                .remove([filePath]);
            throw dbError;
        }

        return { success: true, data: question };
    } catch (error) {
        console.error('Error uploading past question:', error);
        return { success: false, error: error.message };
    }
}

// Search past questions — NO auth required
async function searchPastQuestions(searchTerm) {
    try {
        const { data, error } = await window.supabaseClient
            .from('past_questions')
            .select('*')
            .or(`title.ilike.%${searchTerm}%,course_name.ilike.%${searchTerm}%,course_code.ilike.%${searchTerm}%`)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error searching past questions:', error);
        return { success: false, error: error.message };
    }
}

// Get statistics — NO auth required
async function getStatistics() {
    try {
        const { count: totalQuestions } = await window.supabaseClient
            .from('past_questions')
            .select('*', { count: 'exact', head: true });

        const { count: freeQuestions } = await window.supabaseClient
            .from('past_questions')
            .select('*', { count: 'exact', head: true })
            .eq('is_free', true);

        const { count: totalGuests } = await window.supabaseClient
            .from('guest_downloads')
            .select('email', { count: 'exact', head: true });

        const { data: payments } = await window.supabaseClient
            .from('payments')
            .select('amount')
            .eq('payment_status', 'completed');

        const totalRevenue = payments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;

        return {
            success: true,
            data: {
                totalQuestions: totalQuestions || 0,
                freeQuestions: freeQuestions || 0,
                paidQuestions: (totalQuestions || 0) - (freeQuestions || 0),
                totalGuests: totalGuests || 0,
                totalRevenue: totalRevenue.toFixed(2)
            }
        };
    } catch (error) {
        console.error('Error getting statistics:', error);
        return { success: false, error: error.message };
    }
}

// Export all functions
window.dbOperations = {
    getPastQuestions,
    getPastQuestionById,
    checkUserAccess,
    checkGuestAccess,
    getUserPurchases,
    recordPayment,
    confirmPayment,
    generateDownloadUrl,
    uploadPastQuestion,
    searchPastQuestions,
    getStatistics
};