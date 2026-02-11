// Supabase Configuration
// Replace these with your actual Supabase project credentials
// Get them from: https://supabase.com/dashboard/project/_/settings/api

const SUPABASE_URL = 'https://udypvfyretvxaxmtbaol.supabase.co'; // e.g., https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkeXB2ZnlyZXR2eGF4bXRiYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzMyNDksImV4cCI6MjA4NjQwOTI0OX0.DCubcRVWQ55tlxsArt_Wrf0WCnuD5NGwgdMUa_j8wRc'; // Your anon/public key


// Initialize Supabase client only if not already initialized
if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Storage bucket name for past questions PDFs
window.PAST_QUESTIONS_BUCKET = 'past-questions';

// Create a shorthand reference
window.supabase = window.supabaseClient;