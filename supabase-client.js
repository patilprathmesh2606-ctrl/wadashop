/* =========================================================
   SUPABASE CONNECTION CONFIG
   Fill these two values in with your own project's details.
   Find them in Supabase → Project Settings → API.
   ========================================================= */

const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// This client is safe to use in the browser — the anon key only
// grants the access defined by your Row Level Security policies.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
