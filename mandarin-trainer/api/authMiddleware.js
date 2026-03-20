import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;

function getAdminClient() {
  if (!supabaseAdmin && supabaseUrl && serviceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  }
  return supabaseAdmin;
}

export async function authenticateRequest(req) {
  const admin = getAdminClient();
  if (!admin) {
    return { error: 'Auth not configured', status: 500 };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing authorization header', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    return { error: 'Invalid or expired token', status: 401 };
  }

  return { user };
}

export async function checkCredits(userId) {
  const admin = getAdminClient();
  const { data } = await admin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();
  return data?.balance ?? 0;
}

export async function deductCredits(userId, cost, model, inputTokens, outputTokens, endpoint) {
  const admin = getAdminClient();

  const { data: credits } = await admin
    .from('user_credits')
    .select('balance, total_spent')
    .eq('user_id', userId)
    .single();

  if (!credits || credits.balance < cost) {
    return { error: 'Insufficient credits', status: 402 };
  }

  await admin
    .from('user_credits')
    .update({
      balance: credits.balance - cost,
      total_spent: credits.total_spent + cost,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log usage
  await admin
    .from('api_usage_log')
    .insert({
      user_id: userId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost,
      endpoint,
    });

  return { success: true, remainingBalance: credits.balance - cost };
}

// Microdollars per token (1,000,000 microdollars = $1)
const RATES = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 2 },
};

export function calculateCost(model, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) {
  const rate = RATES[model] || RATES['claude-sonnet-4-6'];
  return (inputTokens * rate.input)
    + (outputTokens * rate.output)
    + (cacheCreationTokens * rate.input * 1.25)
    + (cacheReadTokens * rate.input * 0.1);
}
