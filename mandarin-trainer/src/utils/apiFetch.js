import { getSupabaseClient } from './supabase';

export class CreditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CreditError';
  }
}

export async function apiFetch(url, options = {}) {
  const sb = getSupabaseClient();
  const { data: { session } } = await sb.auth.getSession();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 402) {
    throw new CreditError('Out of credits — enter a promo code to continue');
  }

  return response;
}
