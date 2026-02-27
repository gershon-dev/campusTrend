// Supabase Configuration
// Get credentials from: https://supabase.com/dashboard/project/_/settings/api

const SUPABASE_URL = 'https://udypvfyretvxaxmtbaol.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkeXB2ZnlyZXR2eGF4bXRiYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzMyNDksImV4cCI6MjA4NjQwOTI0OX0.DCubcRVWQ55tlxsArt_Wrf0WCnuD5NGwgdMUa_j8wRc';

// Initialize Supabase client only if not already initialized
// NOTE: We use window.supabaseLib to reference the Supabase library,
// and window.supabaseClient for the initialized client instance.
// Never overwrite window.supabase — that holds the library itself.
if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded! Make sure the Supabase CDN script is included BEFORE supabase-config.js');
} else if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully');
}

// Storage bucket name for past questions PDFs
window.PAST_QUESTIONS_BUCKET = 'past-questions';

// ⚠️ REMOVED: window.supabase = window.supabaseClient
// That line was overwriting the Supabase library with the client instance,
// breaking any code that calls window.supabase.createClient() again.