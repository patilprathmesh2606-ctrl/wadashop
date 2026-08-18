/* =========================================================
   SUPABASE CONNECTION CONFIG
   Fill these two values in with your own project's details.
   Find them in Supabase → Project Settings → API.
   ========================================================= */

const SUPABASE_URL = "https://cmgfyhhipucldvaawjzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ2Z5aGhpcHVjbGR2YWF3anp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjc5NTAsImV4cCI6MjEwMjY0Mzk1MH0.xMdp7FbWgh4_PPLP8ZRNJLwSLmc3hbbcvi90Rp068rA";
// This client is safe to use in the browser — the anon key only
// grants the access defined by your Row Level Security policies.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
