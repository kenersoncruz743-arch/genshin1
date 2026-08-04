// Requer o script da CDN do Supabase carregado antes deste arquivo (ver index.html)
window.sb = supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);
