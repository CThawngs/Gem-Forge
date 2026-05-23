import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getTranslator } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { AppContext } from './AppContextBase';
import type { GenerationOutput, Language, Plan, RevisionMessage, User } from './AppContextBase';

function normalizePlan(plan: unknown): Plan {
  return plan === 'pro' || plan === 'ultra' ? plan : 'free';
}

async function hydrateAppUser(authUser: SupabaseUser): Promise<{ user: User; planExpired: boolean }> {
  // 1. Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('current_plan, daily_usage')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to fetch user profile:', profileError);
  }

  const basePlan = normalizePlan(profile?.current_plan);
  const dailyUsage = typeof profile?.daily_usage === 'number' ? profile.daily_usage : 0;

  // 2. Fetch latest subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let finalPlan = basePlan;
  let planExpired = false;

  if (sub) {
    const isPeriodEnded = sub.current_period_end && new Date(sub.current_period_end) < new Date();
    
    if (sub.status === 'active' && isPeriodEnded) {
      // Update subscription status to 'cancelled' (database constraint compliant)
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', sub.id);

      // Update user plan to 'free'
      await supabase
        .from('users')
        .update({ current_plan: 'free' })
        .eq('id', authUser.id);

      finalPlan = 'free';
      
      // Mark planExpired as true if not already notified
      const notifyKey = `notified_expired_sub_${sub.id}`;
      if (!localStorage.getItem(notifyKey)) {
        planExpired = true;
        localStorage.setItem(notifyKey, 'true');
      }
    } else if ((sub.status === 'expired' || sub.status === 'cancelled') && basePlan === 'free') {
      // Already expired/cancelled in DB. Check if we notified the user.
      const notifyKey = `notified_expired_sub_${sub.id}`;
      if (!localStorage.getItem(notifyKey)) {
        planExpired = true;
        localStorage.setItem(notifyKey, 'true');
      }
    }
  }

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? '',
      plan: finalPlan,
      dailyUsage,
    },
    planExpired,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('VI');
  const [user, setUser] = useState<User | null>(null);
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'forgot' | 'reset' | null>(null);
  const [pendingCheckoutPlan, setPendingCheckoutPlan] = useState<'pro' | 'ultra' | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [output, setOutput] = useState<GenerationOutput | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [revisionTurns, setRevisionTurns] = useState(0);
  const [revisionHistory, setRevisionHistory] = useState<Record<string, RevisionMessage[]>>({});
  const [revisionTokensLeft, setRevisionTokensLeft] = useState<number>(20);
  const [revisionResetAt, setRevisionResetAt] = useState<string | null>(null);
  const [currentGemId, setCurrentGemId] = useState<string | null>(null);
  const [planExpiredAlert, setPlanExpiredAlert] = useState(false);

  useEffect(() => {
    let isActive = true;
    let requestId = 0;

    const syncSession = async (authUser: SupabaseUser | null | undefined) => {
      const currentRequestId = ++requestId;

      if (!authUser) {
        if (isActive && currentRequestId === requestId) {
          setUser(null);
        }
        return;
      }

      const { user: nextUser, planExpired } = await hydrateAppUser(authUser);
      if (isActive && currentRequestId === requestId) {
        setUser(nextUser);
        setRevisionTokensLeft(nextUser.plan === 'pro' ? 10 : 20);
        if (planExpired) {
          setPlanExpiredAlert(true);
        }
      }
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        void syncSession(session?.user);
      })
      .catch((error: unknown) => {
        console.error('Failed to hydrate Supabase session:', error);
        if (isActive) setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      void syncSession(session?.user);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthModal('reset');
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const t = useMemo(() => getTranslator(lang), [lang]);

  const handleSetOutput = (o: GenerationOutput | null) => {
    setOutput(o);
    if (o !== null) {
      setRevisionTurns(0);
      setRevisionHistory({});
    }
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        t,
        user,
        setUser,
        authModal,
        setAuthModal,
        pendingCheckoutPlan,
        setPendingCheckoutPlan,
        checkoutOpen,
        setCheckoutOpen,
        output,
        setOutput: handleSetOutput,
        isGenerating,
        setIsGenerating,
        revisionTurns,
        setRevisionTurns,
        revisionHistory,
        setRevisionHistory,
        revisionTokensLeft,
        setRevisionTokensLeft,
        revisionResetAt,
        setRevisionResetAt,
        currentGemId,
        setCurrentGemId,
        planExpiredAlert,
        setPlanExpiredAlert,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
