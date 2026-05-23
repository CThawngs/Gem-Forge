import { supabase } from '../lib/supabase';

// Daily generation limits by plan
export const DAILY_LIMITS: Record<string, number> = {
  free: 1,
  pro: 5,
  ultra: 20,
};

// Storage (total saved Gem) limits by plan
export const STORAGE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 10,
  ultra: Infinity,
};

interface StatusError extends Error {
  status?: number;
}

export async function checkUsageLimit(userId: string, planType: string): Promise<boolean> {
  // ── Daily usage check ─────────────────────────────────────────
  const { data: user, error } = await supabase
    .from('users')
    .select('daily_usage, last_reset_date')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('Failed to fetch user limits.');
  }

  const today = new Date().toISOString().split('T')[0];
  let usage = user.daily_usage || 0;
  let lastReset = user.last_reset_date || '';

  if (lastReset !== today) {
    usage = 0;
    lastReset = today;
  }

  const dailyLimit = DAILY_LIMITS[planType] ?? 1;

  if (usage >= dailyLimit) {
    const err: StatusError = new Error('Usage limit exceeded. Please upgrade your plan.');
    err.status = 403;
    throw err;
  }

  // ── Storage (saved Gem) check ─────────────────────────────────
  if (planType !== 'free') {
    const storageLimit = STORAGE_LIMITS[planType] ?? 10;
    if (storageLimit !== Infinity) {
      const { count, error: countError } = await supabase
        .from('generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        throw new Error('Failed to check storage limits.');
      }

      if ((count ?? 0) >= storageLimit) {
        const err: StatusError = new Error(
          `Storage limit reached. You have reached your tier's capacity (${storageLimit} for ${planType}). Please delete older Gems in your History to generate new ones.`
        );
        err.status = 507; // Insufficient Storage
        throw err;
      }
    }
  }

  // Increment daily usage
  await supabase
    .from('users')
    .update({
      daily_usage: usage + 1,
      last_reset_date: lastReset,
    })
    .eq('id', userId);

  return true;
}
