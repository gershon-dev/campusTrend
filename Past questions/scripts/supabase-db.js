// ============================================
// SUPABASE DATABASE OPERATIONS - GUEST ACCESS VERSION
// No authentication required!
// ============================================

// Get all past questions with optional filters
async function getPastQuestions(filters = {}) {
    try {
        let query = window.supabaseClient
            .from('past_questions')
            .select('*')
            .order('created_at', { ascending: false });
        
        // Apply filters
        if (filters.faculty) {
            query = query.eq('faculty', filters.faculty);
        }
        if (filters.department) {
            query = query.eq('department', filters.department);
        }
        if (filters.level) {
            query = query.eq('level', filters.level);
        }
        if (filters.semester) {
            query = query.eq('semester', filters.semester);
        }
        if (filters.is_free !== undefined) {
            query = query.eq('is_free', filters.is_free);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching past questions:', error);
        return { success: false, error: error.message };
    }
}

// Get a single past question by ID
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

// Check if email has access to a past question (guest system)
async function checkGuestAccess(questionId, email) {
    try {
        // Get the question details
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('is_free, price')
            .eq('id', questionId)
            .single();
        
        // If question is free, grant access to everyone
        if (question.is_free) {
            return { success: true, hasAccess: true, isFree: true };
        }
        
        // If no email provided, require payment
        if (!email) {
            return { 
                success: true, 
                hasAccess: false, 
                message: 'Purchase required',
                price: question.price 
            };
        }
        
        // Check if email has purchased access
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
        
        return { 
            success: true, 
            hasAccess: false, 
            message: 'Purchase required',
            price: question.price 
        };
    } catch (error) {
        console.error('Error checking access:', error);
        return { success: false, hasAccess: false, error: error.message };
    }
}

// Legacy function - kept for compatibility
async function checkUserAccess(questionId) {
    try {
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('is_free, price')
            .eq('id', questionId)
            .single();
        
        // If question is free, grant access to everyone
        if (question.is_free) {
            return { success: true, hasAccess: true, isFree: true };
        }
        
        return { 
            success: true, 
            hasAccess: false, 
            message: 'Purchase required',
            price: question.price 
        };
    } catch (error) {
        console.error('Error checking access:', error);
        return { success: false, hasAccess: false, error: error.message };
    }
}

// Get user's purchased past questions (not used in guest system)
async function getUserPurchases() {
    return { success: false, error: 'Guest system - no user accounts' };
}

// Record a payment (GUEST VERSION - No user_id required)
async function recordPayment(paymentData) {
    try {
        // Prepare payment data (NO user_id - pure guest)
        const paymentRecord = {
            user_email: paymentData.email,
            past_question_id: paymentData.questionId,
            amount: paymentData.amount,
            currency: paymentData.currency || 'GHS',
            payment_method: paymentData.method,
            payment_reference: paymentData.reference,
            payment_status: 'pending'
            // NO user_id field at all!
        };

        console.log('Recording payment (guest mode):', paymentRecord);

        // Insert payment record
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
        return { 
            success: false, 
            error: error.message,
            details: error 
        };
    }
}

// Confirm payment and grant access (GUEST VERSION)
async function confirmPayment(paymentReference) {
    try {
        // Get payment details
        const { data: payment, error: getError } = await window.supabaseClient
            .from('payments')
            .select('*')
            .eq('payment_reference', paymentReference)
            .single();
        
        if (getError) throw getError;
        
        // Update payment status
        const { error: paymentError } = await window.supabaseClient
            .from('payments')
            .update({
                payment_status: 'completed',
                paid_at: new Date().toISOString()
            })
            .eq('payment_reference', paymentReference);
        
        if (paymentError) throw paymentError;
        
        // Grant access using email (guest system)
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
        
        if (accessError && accessError.code !== '23505') { // Not a duplicate
            console.error('Access grant error:', accessError);
            // Don't fail - payment is already confirmed
        }
        
        return { success: true, data: { payment, access } };
    } catch (error) {
        console.error('Error confirming payment:', error);
        return { success: false, error: error.message };
    }
}

// Generate a temporary download URL (GUEST VERSION)
async function generateDownloadUrl(questionId, email) {
    try {
        // Get the question
        const { data: question, error: questionError } = await window.supabaseClient
            .from('past_questions')
            .select('*')
            .eq('id', questionId)
            .single();
        
        if (questionError) throw questionError;
        
        // If free, allow download
        if (question.is_free) {
            // Generate signed URL
            const { data, error } = await window.supabaseClient.storage
                .from(window.PAST_QUESTIONS_BUCKET)
                .createSignedUrl(question.file_path, 3600);
            
            if (error) throw error;
            
            // Track download
            await window.supabaseClient
                .from('past_questions')
                .update({ 
                    download_count: (question.download_count || 0) + 1 
                })
                .eq('id', questionId);
            
            return { success: true, url: data.signedUrl };
        }
        
        // For paid questions, check guest access
        if (!email) {
            throw new Error('Email required for paid downloads');
        }
        
        const accessCheck = await checkGuestAccess(questionId, email);
        
        if (!accessCheck.hasAccess) {
            throw new Error(accessCheck.message || 'Access denied - payment required');
        }
        
        // Generate signed URL
        const { data, error } = await window.supabaseClient.storage
            .from(window.PAST_QUESTIONS_BUCKET)
            .createSignedUrl(question.file_path, 3600);
        
        if (error) throw error;
        
        // Update download count
        await window.supabaseClient
            .from('guest_downloads')
            .update({ 
                download_count: window.supabaseClient.sql`download_count + 1`
            })
            .eq('email', email)
            .eq('past_question_id', questionId);
        
        return { success: true, url: data.signedUrl };
    } catch (error) {
        console.error('Error generating download URL:', error);
        return { success: false, error: error.message };
    }
}

// Upload a past question (Admin function - still requires auth)
async function uploadPastQuestion(file, metadata) {
    try {
        // Check if user is authenticated
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (!user) {
            throw new Error('User must be authenticated to upload files');
        }
        
        // Create file path: faculty/department/level/semester/filename
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `${metadata.faculty}/${metadata.department}/${metadata.level}/${metadata.semester}/${fileName}`;
        
        // Upload file to storage
        const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
            .from(window.PAST_QUESTIONS_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });
        
        if (uploadError) throw uploadError;
        
        // Insert record in database
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
            // If database insert fails, try to delete the uploaded file
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

// Search past questions
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

// Get statistics (for admin dashboard)
async function getStatistics() {
    try {
        // Get total questions
        const { count: totalQuestions } = await window.supabaseClient
            .from('past_questions')
            .select('*', { count: 'exact', head: true });
        
        // Get free questions
        const { count: freeQuestions } = await window.supabaseClient
            .from('past_questions')
            .select('*', { count: 'exact', head: true })
            .eq('is_free', true);
        
        // Get total guests
        const { count: totalGuests } = await window.supabaseClient
            .from('guest_downloads')
            .select('email', { count: 'exact', head: true });
        
        // Get total revenue
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

// Export functions for use in other files
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