import { supabase } from '../lib/supabase';

export async function applyCoupon(userId: string, code: string) {
  if (code !== 'Test') {
    throw new Error('Invalid coupon code');
  }

  // Bypass if Supabase is not fully configured (MVP demo mode)
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    return { success: true };
  }

  // Bypass all payment gateways completely
  // Immediately update the USERS table
  const { error: userError } = await supabase
    .from('users')
    .update({ current_plan: 'ultra' })
    .eq('id', userId);

  if (userError) throw userError;

  // Update the SUBSCRIPTIONS table
  const { error: subError } = await supabase
    .from('subscriptions')
    .update({
      plan_type: 'ultra',
      status: 'active',
      current_period_end: '2099-12-31T23:59:59Z',
    })
    .eq('user_id', userId);

  // Note: if user doesn't have a subscription record yet, we might need to upsert,
  // but let's stick to strict requirement: update SUBSCRIPTIONS table.
  if (subError) throw subError;

  // Insert billing history record for coupon upgrade
  const { error: billingError } = await supabase
    .from('billing_history')
    .insert({
      user_id: userId,
      transaction_id: `COUPON-${Date.now()}`,
      amount: 0,
      currency: 'VND',
      plan_name: 'Ultra Plan',
      status: 'paid',
      payment_method: 'Coupon',
    });

  if (billingError) throw billingError;

  return { success: true };
}

export async function cancelPlan(userId: string) {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    return { success: true };
  }

  // Update SUBSCRIPTIONS table (status = 'cancelled')
  const { error: subError } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('user_id', userId);

  if (subError) throw subError;

  // Instantly update USERS table (current_plan = 'free')
  const { error: userError } = await supabase
    .from('users')
    .update({ current_plan: 'free' })
    .eq('id', userId);

  if (userError) throw userError;

  // Insert billing history record for cancellation
  const { error: billingError } = await supabase
    .from('billing_history')
    .insert({
      user_id: userId,
      transaction_id: `CANCEL-${Date.now()}`,
      amount: 0,
      currency: 'VND',
      plan_name: 'Free Plan',
      status: 'refunded',
      payment_method: 'System',
    });

  if (billingError) throw billingError;

  return { success: true };
}

// ─── Billing History Types ───────────────────────────────────────────────────

export interface BillingRecord {
  id: string;
  user_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  plan_name: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  payment_method: string;
  created_at: string;
  next_billing_date: string | null;
}

export interface BillingFetchParams {
  userId: string;
  page: number;
  pageSize: number;
  searchTerm?: string;
  timeFilter?: 'this_week' | 'this_month' | 'this_year' | 'all';
  planFilter?: 'free' | 'pro' | 'ultra' | 'all';
  sortOrder?: 'newest' | 'oldest';
}

export interface BillingFetchResult {
  data: BillingRecord[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Fetch Billing History with Server-Side Pagination ───────────────────

export async function fetchBillingHistory({
  userId,
  page,
  pageSize,
  searchTerm,
  timeFilter = 'all',
  planFilter = 'all',
  sortOrder = 'newest',
}: BillingFetchParams): Promise<BillingFetchResult> {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    return { data: [], count: 0, page, pageSize, totalPages: 0 };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('billing_history')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Search by transaction_id
  if (searchTerm?.trim()) {
    query = query.ilike('transaction_id', `%${searchTerm.trim()}%`);
  }

  // Time filter
  if (timeFilter !== 'all') {
    const now = new Date();
    let startDate: Date;
    switch (timeFilter) {
      case 'this_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0);
    }
    query = query.gte('created_at', startDate.toISOString());
  }

  // Plan filter (map plan type to plan_name)
  if (planFilter !== 'all') {
    const planNameMap: Record<string, string> = {
      free: 'Free Plan',
      pro: 'Pro Plan',
      ultra: 'Ultra Plan',
    };
    query = query.eq('plan_name', planNameMap[planFilter] || planFilter);
  }

  // Sort order
  query = query.order('created_at', { ascending: sortOrder === 'oldest' });

  // Pagination
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: (data ?? []) as BillingRecord[],
    count: totalCount,
    page,
    pageSize,
    totalPages,
  };
}

// ─── Get Next Billing Date ─────────────────────────────────────────────────

export async function getNextBillingDate(userId: string): Promise<string | null> {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) return null;
  return data.current_period_end;
}
