// Azure config
export function getAzureConfig() {
  return {
    key: localStorage.getItem('azure_speech_key') || '',
    region: localStorage.getItem('azure_speech_region') || '',
  };
}

export function setAzureConfig(key, region) {
  localStorage.setItem('azure_speech_key', key);
  localStorage.setItem('azure_speech_region', region);
}

export function hasAzureConfig() {
  return !!(localStorage.getItem('azure_speech_key') && localStorage.getItem('azure_speech_region'));
}

// Supabase config
export function getSupabaseConfig() {
  return {
    url: localStorage.getItem('supabase_url') || '',
    anonKey: localStorage.getItem('supabase_anon_key') || '',
  };
}

export function setSupabaseConfig(url, anonKey) {
  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_anon_key', anonKey);
}

export function hasSupabaseConfig() {
  return !!(localStorage.getItem('supabase_url') && localStorage.getItem('supabase_anon_key'));
}

export function hasAllConfig() {
  return hasAzureConfig() && hasSupabaseConfig();
}
