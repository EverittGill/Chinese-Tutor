import { apiFetch } from './apiFetch';

// Azure config — token fetched from backend at runtime
let azureTokenCache = null;

export async function getAzureSpeechToken() {
  // Return cached token if fresh (tokens last 10 min, refresh at 8)
  if (azureTokenCache && Date.now() - azureTokenCache.fetchedAt < 8 * 60 * 1000) {
    return azureTokenCache;
  }

  try {
    const res = await apiFetch('/api/speech-token');
    const data = await res.json();
    if (data.token && data.region) {
      azureTokenCache = { token: data.token, region: data.region, fetchedAt: Date.now() };
      return azureTokenCache;
    }
  } catch (e) {
    console.warn('Could not fetch speech token:', e);
  }
  return null;
}

// Supabase config — from Vite env vars
export function getSupabaseConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  };
}

export function hasSupabaseConfig() {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// Setup complete — no keys to enter anymore, just skip straight through
export function hasAllConfig() {
  return true;
}

export function markSetupComplete() {
  // no-op now, kept for compatibility
}
