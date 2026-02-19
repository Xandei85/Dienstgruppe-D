// supabaseClient.js

(function () {
  if (!window.supabase || !window.supabase.createClient) {
    console.warn("Supabase library not loaded.");
    return;
  }

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn("Supabase config missing.");
    return;
  }

  // Wichtig: NICHT window.supabase überschreiben!
  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );
})();
