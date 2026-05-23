import { createContext } from 'react';

export type Language = 'EN' | 'VI';
export type Plan = 'free' | 'pro' | 'ultra';

export interface User {
  id: string;
  email: string;
  plan: Plan;
  dailyUsage: number;
}

export interface GenerationOutput {
  name: string;
  description: string;
  instructions: string;
  tools: string;
  knowledgeBase?: { title: string; url: string }[] | null;
}

export interface RevisionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;

  user: User | null;
  setUser: (user: User | null) => void;

  authModal: 'login' | 'signup' | 'forgot' | 'reset' | null;
  setAuthModal: (mode: 'login' | 'signup' | 'forgot' | 'reset' | null) => void;

  pendingCheckoutPlan: 'pro' | 'ultra' | null;
  setPendingCheckoutPlan: (plan: 'pro' | 'ultra' | null) => void;

  checkoutOpen: boolean;
  setCheckoutOpen: (v: boolean) => void;

  output: GenerationOutput | null;
  setOutput: (output: GenerationOutput | null) => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;

  revisionTurns: number;
  setRevisionTurns: (n: number) => void;
  revisionHistory: Record<string, RevisionMessage[]>;
  setRevisionHistory: (h: Record<string, RevisionMessage[]>) => void;

  revisionTokensLeft: number;
  setRevisionTokensLeft: (n: number) => void;
  revisionResetAt: string | null;
  setRevisionResetAt: (s: string | null) => void;

  currentGemId: string | null;
  setCurrentGemId: (id: string | null) => void;

  planExpiredAlert: boolean;
  setPlanExpiredAlert: (v: boolean) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);
