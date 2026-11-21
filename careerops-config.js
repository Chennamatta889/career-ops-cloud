/* Public configuration only. Never put API keys with elevated privileges here.
 * Use the URL and PUBLISHABLE (or legacy anon) key of a NEW Career-Ops project.
 * Keep GEMINI_API_KEY exclusively in the Supabase Edge Function secret store.
 */
window.CAREEROPS_PRIVATE_CONFIG = Object.freeze({
  supabaseUrl: "",
  publishableKey: ""
});
