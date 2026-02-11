// ============================================
// SUPABASE DATABASE OPERATIONS - FIXED VERSION
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

// Check if user has access to a past question
async function checkUserAccess(questionId) {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (!user) {
            return { success: false, hasAccess: false, message: 'Please log in to access this content' };
        }
        
        // Get the question details
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('is_free, price')
            .eq('id', questionId)
            .single();
        
        // If question is free, grant access
        if (question.is_free) {
            return { success: true, hasAccess: true, isFree: true };
        }
        
        // Check if user has purchased access
        const { data: access } = await window.supabaseClient
            .from('user_access')
            .select('*, past_questions(*)')
            .eq('user_id', user.id)
            .eq('past_question_id', questionId)
            .or('expires_at.is.null,expires_at.gt.now()')
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

// Get user's purchased past questions
async function getUserPurchases() {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (!user) {
            throw new Error('User not authenticated');
        }
        
        const { data, error } = await window.supabaseClient
            .from('user_access')
            .select(`
                *,
                past_questions (*)
            `)
            .eq('user_id', user.id)
            .or('expires_at.is.null,expires_at.gt.now()');
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching user purchases:', error);
        return { success: false, error: error.message };
    }
}

// Record a payment
async function recordPayment(paymentData) {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (!user) {
            throw new Error('User not authenticated');
        }
        
        const { data, error } = await window.supabaseClient
            .from('payments')
            .insert({
                user_id: user.id,
                past_question_id: paymentData.questionId,
                amount: paymentData.amount,
                currency: paymentData.currency || 'GHS',
                payment_method: paymentData.method,
                payment_reference: paymentData.reference,
                payment_status: 'pending'
            })
            .select()
            .single();
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error recording payment:', error);
        return { success: false, error: error.message };
    }
}

// Confirm payment and grant access
async function confirmPayment(paymentReference) {
    try {
        // Update payment status
        const { data: payment, error: paymentError } = await window.supabaseClient
            .from('payments')
            .update({
                payment_status: 'completed',
                paid_at: new Date().toISOString()
            })
            .eq('payment_reference', paymentReference)
            .select()
            .single();
        
        if (paymentError) throw paymentError;
        
        // Grant access to the user
        const { data: access, error: accessError } = await window.supabaseClient
            .from('user_access')
            .insert({
                user_id: payment.user_id,
                past_question_id: payment.past_question_id,
                access_type: 'purchased',
                download_count: 0,
                max_downloads: 5 // Allow 5 downloads per purchase
            })
            .select()
            .single();
        
        if (accessError) throw accessError;
        
        return { success: true, data: { payment, access } };
    } catch (error) {
        console.error('Error confirming payment:', error);
        return { success: false, error: error.message };
    }
}

// Generate a temporary download URL
async function generateDownloadUrl(questionId) {
    try {
        // Check if user has access
        const accessCheck = await checkUserAccess(questionId);
        
        if (!accessCheck.hasAccess) {
            throw new Error(accessCheck.message || 'Access denied');
        }
        
        // Get the file path
        const { data: question } = await window.supabaseClient
            .from('past_questions')
            .select('file_path')
            .eq('id', questionId)
            .single();
        
        // Generate signed URL (expires in 1 hour)
        const { data, error } = await window.supabaseClient.storage
            .from(window.PAST_QUESTIONS_BUCKET)
            .createSignedUrl(question.file_path, 3600); // 3600 seconds = 1 hour
        
        if (error) throw error;
        
        // Record the download
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user) {
            await window.supabaseClient.rpc('record_download', {
                p_user_id: user.id,
                p_question_id: questionId
            });
        }
        
        return { success: true, url: data.signedUrl };
    } catch (error) {
        console.error('Error generating download URL:', error);
        return { success: false, error: error.message };
    }
}

// Upload a past question (Admin function)
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
        
        // Get total users
        const { count: totalUsers } = await window.supabaseClient
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });
        
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
                totalUsers: totalUsers || 0,
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
    getUserPurchases,
    recordPayment,
    confirmPayment,
    generateDownloadUrl,
    uploadPastQuestion,
    searchPastQuestions,
    getStatistics
};