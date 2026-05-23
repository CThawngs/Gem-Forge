import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../hooks/useApp';
import {
  ArrowLeft,
  Users,
  Activity,
  DollarSign,
  Gem,
  Search,
  RefreshCw,
  Ban,
  TrendingUp,
  Server,
  Cpu,
  MousePointer,
  RotateCcw,
  Check,
  Calendar,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import './page.css';

const ADMIN_EMAIL = 'nguyenchithang2804@gmail.com';

type UserRow = {
  id: string;
  email: string;
  current_plan: string;
  daily_usage: number;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  user_email?: string;
  plan_type: string;
  status: string;
  current_period_end: string;
  provider: string;
  created_at: string;
};

type BillingRow = {
  id: string;
  user_id: string;
  user_email?: string;
  amount: number;
  status: string;
  transaction_id: string;
  plan_name: string;
  currency: string;
  payment_method: string;
  created_at: string;
};

type SystemLog = {
  id: number;
  type: string;
  source: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
};

type PageVisit = {
  id: string;
  visitor_id: string;
  email: string | null;
  path: string;
  user_agent: string;
  created_at: string;
};

type GenerationRow = {
  id: string;
  created_at: string;
};

// ─── Dashboard Pagination Component ──────────────────────────────────────────
interface DashboardPaginationProps {
  page: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
}

function DashboardPagination({ page, totalPages, totalRecords, onPageChange }: DashboardPaginationProps) {
  if (totalPages <= 1) return null;

  const getVisiblePages = (): (number | string)[] => {
    const delta = 2;
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > delta + 2) pages.push('...');

      const start = Math.max(2, page - delta);
      const end = Math.min(totalPages - 1, page + delta);

      for (let i = start; i <= end; i++) pages.push(i);

      if (page < totalPages - delta - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="admin-pagination">
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
        Page {page} of {totalPages} ({totalRecords} records)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          className="plan-select-dropdown"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          style={{ padding: '6px 12px', opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
        >
          Previous
        </button>

        {getVisiblePages().map((p, i) =>
          typeof p === 'string' ? (
            <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px' }}>…</span>
          ) : (
            <button
              key={p}
              className="plan-select-dropdown"
              style={{
                padding: '6px 12px',
                background: p === page ? 'var(--accent-primary)' : 'rgba(255,255,255,0.03)',
                borderColor: p === page ? 'var(--accent-primary)' : 'var(--border-card)',
                color: p === page ? '#ffffff' : 'var(--text-primary)',
                fontWeight: p === page ? 700 : 500,
              }}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          className="plan-select-dropdown"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{ padding: '6px 12px', opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useApp();
  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user?.email]
  );

  // Tabs
  const [activeTab, setActiveTab] = useState<'customers' | 'subscriptions' | 'logs' | 'openrouter' | 'visits'>('customers');

  // Loaders
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Data States
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<SubscriptionRow[]>([]);
  const [billingList, setBillingList] = useState<BillingRow[]>([]);
  const [logsList, setLogsList] = useState<SystemLog[]>([]);
  const [visitsList, setPageVisits] = useState<PageVisit[]>([]);
  const [generationsList, setGenerationsList] = useState<GenerationRow[]>([]);

  // Search & Global Time Range Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // Tab-Specific Filters
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro' | 'ultra'>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'info' | 'error' | 'warning'>('all');
  const [openRouterResultFilter, setOpenRouterResultFilter] = useState<'all' | 'success' | 'error'>('all');
  const [visitPathFilter, setVisitPathFilter] = useState<'all' | '/' | '/history' | '/billing' | '/admin/dashboard'>('all');

  // Tab-Specific Sort Options
  const [usersSort, setUsersSort] = useState<'newest' | 'oldest' | 'usage_high' | 'usage_low' | 'email'>('newest');
  const [subsSort, setSubsSort] = useState<'newest' | 'oldest' | 'expiry'>('newest');
  const [logsSort, setLogsSort] = useState<'newest' | 'oldest'>('newest');
  const [openRouterSort, setOpenRouterSort] = useState<'newest' | 'oldest' | 'size_high' | 'size_low'>('newest');
  const [visitsSort, setVisitsSort] = useState<'newest' | 'oldest' | 'path'>('newest');

  // Pagination Page States
  const [pageCustomers, setPageCustomers] = useState(1);
  const [pageSubscriptions, setPageSubscriptions] = useState(1);
  const [pageLogs, setPageLogs] = useState(1);
  const [pageOpenRouter, setPageOpenRouter] = useState(1);
  const [pageVisits, setPageVisitsState] = useState(1);

  const PAGE_SIZE = 20;

  // Real-time syncing indicators
  const [liveSyncing, setLiveSyncing] = useState(false);

  // Chart interactivity states
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Reset page numbers when any filter changes
  useEffect(() => {
    setPageCustomers(1);
    setPageSubscriptions(1);
    setPageLogs(1);
    setPageOpenRouter(1);
    setPageVisitsState(1);
  }, [
    searchQuery,
    timeFilter,
    planFilter,
    subStatusFilter,
    logTypeFilter,
    openRouterResultFilter,
    visitPathFilter,
    usersSort,
    subsSort,
    logsSort,
    openRouterSort,
    visitsSort
  ]);

  // Load everything
  const loadDashboardData = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      // 1. Fetch Users
      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (uErr) throw uErr;
      setUsersList((users ?? []) as UserRow[]);

      // 2. Fetch Subscriptions
      const { data: subs, error: sErr } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (sErr) throw sErr;
      setSubscriptionsList((subs ?? []) as SubscriptionRow[]);

      // 3. Fetch Billing History
      const { data: billings, error: bErr } = await supabase
        .from('billing_history')
        .select('*')
        .order('created_at', { ascending: false });
      if (bErr) throw bErr;
      setBillingList((billings ?? []) as BillingRow[]);

      // 4. Fetch System Logs
      const { data: logs, error: lErr } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500); // Expanded limit to give room for filtering
      if (lErr) throw lErr;
      setLogsList((logs ?? []) as SystemLog[]);

      // 5. Fetch Page Visits
      const { data: visits, error: vErr } = await supabase
        .from('page_visits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500); // Expanded limit
      if (vErr) throw vErr;
      setPageVisits((visits ?? []) as PageVisit[]);

      // 6. Fetch Generations
      const { data: gens, error: genErr } = await supabase
        .from('generations')
        .select('id, created_at')
        .order('created_at', { ascending: false });
      if (genErr) throw genErr;
      setGenerationsList((gens ?? []) as GenerationRow[]);

    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadDashboardData();
    }
  }, [isAdmin]);

  // Periodic background refresh (realtime updates every 10 seconds)
  useEffect(() => {
    if (!isAdmin) return;

    const interval = setInterval(async () => {
      try {
        const { data: users } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        if (users) setUsersList(users as UserRow[]);

        const { data: subs } = await supabase
          .from('subscriptions')
          .select('*')
          .order('created_at', { ascending: false });
        if (subs) setSubscriptionsList(subs as SubscriptionRow[]);

        const { data: billings } = await supabase
          .from('billing_history')
          .select('*')
          .order('created_at', { ascending: false });
        if (billings) setBillingList(billings as BillingRow[]);

        const { data: logs } = await supabase
          .from('system_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (logs) setLogsList(logs as SystemLog[]);

        const { data: visits } = await supabase
          .from('page_visits')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (visits) setPageVisits(visits as PageVisit[]);

        const { data: gens } = await supabase
          .from('generations')
          .select('id, created_at')
          .order('created_at', { ascending: false });
        if (gens) setGenerationsList(gens as GenerationRow[]);

        setLiveSyncing(true);
        setTimeout(() => setLiveSyncing(false), 800);
      } catch (err) {
        console.error('Failed to run periodic background sync:', err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isAdmin]);

  // Admin Actions
  const handleUpdatePlan = async (userId: string, newPlan: string) => {
    setActionLoadingId(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ current_plan: newPlan })
        .eq('id', userId);
      if (error) throw error;

      // Update in-memory user list
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, current_plan: newPlan } : u));
      
      // Also write log
      const affectedUser = usersList.find(u => u.id === userId);
      await supabase.from('system_logs').insert({
        type: 'info',
        source: 'server',
        message: `Admin manually updated plan for ${affectedUser?.email || userId} to ${newPlan}`,
        details: { adminEmail: ADMIN_EMAIL, userId, newPlan }
      });

      // Reload logs
      const { data: newLogs } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (newLogs) setLogsList(newLogs as SystemLog[]);

    } catch (err) {
      console.error('Failed to update plan:', err);
      alert('Failed to update user plan');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetUsage = async (userId: string) => {
    setActionLoadingId(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ daily_usage: 0 })
        .eq('id', userId);
      if (error) throw error;

      // Update in-memory user list
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, daily_usage: 0 } : u));

      // Also write log
      const affectedUser = usersList.find(u => u.id === userId);
      await supabase.from('system_logs').insert({
        type: 'info',
        source: 'server',
        message: `Admin manually reset daily usage count for ${affectedUser?.email || userId}`,
        details: { adminEmail: ADMIN_EMAIL, userId }
      });

      // Reload logs
      const { data: newLogs } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (newLogs) setLogsList(newLogs as SystemLog[]);

    } catch (err) {
      console.error('Failed to reset usage:', err);
      alert('Failed to reset daily usage');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 1. First, apply time range filter to all datasets
  const timeFilteredData = useMemo(() => {
    const filterFn = <T extends { created_at: string }>(items: T[]) => {
      if (timeFilter === 'all') return items;
      const now = Date.now();
      let ms = 0;
      if (timeFilter === '24h') ms = 24 * 60 * 60 * 1000;
      else if (timeFilter === '7d') ms = 7 * 24 * 60 * 60 * 1000;
      else if (timeFilter === '30d') ms = 30 * 24 * 60 * 60 * 1000;
      const cutOff = now - ms;
      return items.filter(item => new Date(item.created_at).getTime() >= cutOff);
    };

    return {
      users: filterFn(usersList),
      subscriptions: filterFn(subscriptionsList),
      billings: filterFn(billingList),
      logs: filterFn(logsList),
      visits: filterFn(visitsList),
      generations: filterFn(generationsList)
    };
  }, [usersList, subscriptionsList, billingList, logsList, visitsList, generationsList, timeFilter]);

  // KPI Calculations (based on time filtered data!)
  const metrics = useMemo(() => {
    const totalUsers = timeFilteredData.users.length;
    const totalViews = timeFilteredData.visits.length;
    const uniqueVisitors = new Set(timeFilteredData.visits.map(v => v.visitor_id)).size;

    let totalUSD = 0;
    let totalVND = 0;
    timeFilteredData.billings.forEach(b => {
      if (b.status === 'paid') {
        if (b.currency === 'USD') {
          totalUSD += b.amount;
        } else {
          totalVND += b.amount;
        }
      }
    });

    const activeSubs = timeFilteredData.subscriptions.filter(s => s.status === 'active').length;
    const totalGenerations = timeFilteredData.generations.length;

    return {
      totalUsers,
      totalViews,
      uniqueVisitors,
      totalUSD,
      totalVND,
      activeSubs,
      totalGenerations
    };
  }, [timeFilteredData]);

  // Filters & Search & Sort logic per tab
  const filteredUsers = useMemo(() => {
    let result = timeFilteredData.users.filter(u => 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (planFilter !== 'all') {
      result = result.filter(u => u.current_plan === planFilter);
    }

    return result.sort((a, b) => {
      if (usersSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (usersSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (usersSort === 'usage_high') return b.daily_usage - a.daily_usage;
      if (usersSort === 'usage_low') return a.daily_usage - b.daily_usage;
      if (usersSort === 'email') return a.email.localeCompare(b.email);
      return 0;
    });
  }, [timeFilteredData.users, searchQuery, planFilter, usersSort]);

  const filteredSubscriptions = useMemo(() => {
    let result = timeFilteredData.subscriptions.filter(s => {
      const userObj = usersList.find(u => u.id === s.user_id);
      const email = userObj?.email || '';
      return email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.user_id.toLowerCase().includes(searchQuery.toLowerCase());
    });

    if (subStatusFilter !== 'all') {
      result = result.filter(s => s.status === subStatusFilter);
    }

    return result.sort((a, b) => {
      if (subsSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (subsSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (subsSort === 'expiry') {
        const tA = a.current_period_end ? new Date(a.current_period_end).getTime() : 0;
        const tB = b.current_period_end ? new Date(b.current_period_end).getTime() : 0;
        return tA - tB; // Expiring soonest first
      }
      return 0;
    });
  }, [timeFilteredData.subscriptions, usersList, searchQuery, subStatusFilter, subsSort]);

  const filteredSystemLogs = useMemo(() => {
    let result = timeFilteredData.logs.filter(l => 
      l.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (logTypeFilter !== 'all') {
      result = result.filter(l => l.type === logTypeFilter);
    }

    return result.sort((a, b) => {
      if (logsSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (logsSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return 0;
    });
  }, [timeFilteredData.logs, searchQuery, logTypeFilter, logsSort]);

  const filteredOpenRouterLogs = useMemo(() => {
    let result = timeFilteredData.logs.filter(l => l.source === 'openrouter');

    result = result.filter(l => 
      l.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(l.details || {}).toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (openRouterResultFilter !== 'all') {
      if (openRouterResultFilter === 'success') {
        result = result.filter(l => l.type === 'info');
      } else {
        result = result.filter(l => l.type === 'error');
      }
    }

    return result.sort((a, b) => {
      if (openRouterSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (openRouterSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (openRouterSort === 'size_high') {
        const sA = typeof a.details?.responseLength === 'number' ? a.details.responseLength : 0;
        const sB = typeof b.details?.responseLength === 'number' ? b.details.responseLength : 0;
        return sB - sA;
      }
      if (openRouterSort === 'size_low') {
        const sA = typeof a.details?.responseLength === 'number' ? a.details.responseLength : 0;
        const sB = typeof b.details?.responseLength === 'number' ? b.details.responseLength : 0;
        return sA - sB;
      }
      return 0;
    });
  }, [timeFilteredData.logs, searchQuery, openRouterResultFilter, openRouterSort]);

  const filteredVisits = useMemo(() => {
    let result = timeFilteredData.visits.filter(v => 
      v.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.email && v.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.visitor_id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (visitPathFilter !== 'all') {
      result = result.filter(v => v.path === visitPathFilter);
    }

    return result.sort((a, b) => {
      if (visitsSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (visitsSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (visitsSort === 'path') return a.path.localeCompare(b.path);
      return 0;
    });
  }, [timeFilteredData.visits, searchQuery, visitPathFilter, visitsSort]);

  // Paginated Slices for all Tab Panels
  const totalRecsCustomers = filteredUsers.length;
  const totalPgsCustomers = Math.ceil(totalRecsCustomers / PAGE_SIZE);
  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice((pageCustomers - 1) * PAGE_SIZE, pageCustomers * PAGE_SIZE);
  }, [filteredUsers, pageCustomers]);

  const totalRecsSubscriptions = filteredSubscriptions.length;
  const totalPgsSubscriptions = Math.ceil(totalRecsSubscriptions / PAGE_SIZE);
  const paginatedSubscriptions = useMemo(() => {
    return filteredSubscriptions.slice((pageSubscriptions - 1) * PAGE_SIZE, pageSubscriptions * PAGE_SIZE);
  }, [filteredSubscriptions, pageSubscriptions]);

  const totalRecsLogs = filteredSystemLogs.length;
  const totalPgsLogs = Math.ceil(totalRecsLogs / PAGE_SIZE);
  const paginatedLogs = useMemo(() => {
    return filteredSystemLogs.slice((pageLogs - 1) * PAGE_SIZE, pageLogs * PAGE_SIZE);
  }, [filteredSystemLogs, pageLogs]);

  const totalRecsOpenRouter = filteredOpenRouterLogs.length;
  const totalPgsOpenRouter = Math.ceil(totalRecsOpenRouter / PAGE_SIZE);
  const paginatedOpenRouter = useMemo(() => {
    return filteredOpenRouterLogs.slice((pageOpenRouter - 1) * PAGE_SIZE, pageOpenRouter * PAGE_SIZE);
  }, [filteredOpenRouterLogs, pageOpenRouter]);

  const totalRecsVisits = filteredVisits.length;
  const totalPgsVisits = Math.ceil(totalRecsVisits / PAGE_SIZE);
  const paginatedVisits = useMemo(() => {
    return filteredVisits.slice((pageVisits - 1) * PAGE_SIZE, pageVisits * PAGE_SIZE);
  }, [filteredVisits, pageVisits]);

  // Line Chart Aggregations
  const chartData = useMemo(() => {
    const now = new Date();
    const points: { date: Date; label: string; views: number; gems: number; users: number }[] = [];

    if (timeFilter === '24h') {
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        d.setMinutes(0, 0, 0);
        const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        points.push({ date: d, label, views: 0, gems: 0, users: 0 });
      }
    } else if (timeFilter === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        d.setHours(0, 0, 0, 0);
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        points.push({ date: d, label, views: 0, gems: 0, users: 0 });
      }
    } else if (timeFilter === '30d' || timeFilter === 'all') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        d.setHours(0, 0, 0, 0);
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        points.push({ date: d, label, views: 0, gems: 0, users: 0 });
      }
    }

    const getPointIndex = (dateStr: string) => {
      const itemDate = new Date(dateStr);
      if (timeFilter === '24h') {
        const itemHour = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate(), itemDate.getHours()).getTime();
        return points.findIndex(p => {
          const pHour = new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate(), p.date.getHours()).getTime();
          return pHour === itemHour;
        });
      } else {
        const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();
        return points.findIndex(p => {
          const pDay = new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate()).getTime();
          return pDay === itemDay;
        });
      }
    };

    // Populate data
    visitsList.forEach(v => {
      const idx = getPointIndex(v.created_at);
      if (idx !== -1) points[idx].views++;
    });

    generationsList.forEach(g => {
      const idx = getPointIndex(g.created_at);
      if (idx !== -1) points[idx].gems++;
    });

    usersList.forEach(u => {
      const idx = getPointIndex(u.created_at);
      if (idx !== -1) points[idx].users++;
    });

    return points;
  }, [visitsList, generationsList, usersList, timeFilter]);

  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const svgWidth = 800;
  const svgHeight = 260;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const { yMax, viewsPath, gemsPath, usersPath, viewsAreaPath, gemsAreaPath, usersAreaPath } = useMemo(() => {
    const vals = chartData.map(p => Math.max(p.views, p.gems, p.users));
    const maxVal = vals.length > 0 ? Math.max(5, ...vals) : 5;
    const yMax = Math.ceil(maxVal / 5) * 5;

    const generatePath = (key: 'views' | 'gems' | 'users') => {
      if (chartData.length === 0) return '';
      return chartData.map((p, idx) => {
        const x = paddingLeft + (idx / (chartData.length - 1)) * chartWidth;
        const y = paddingTop + chartHeight - (p[key] / yMax) * chartHeight;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ');
    };

    const generateAreaPath = (key: 'views' | 'gems' | 'users') => {
      if (chartData.length === 0) return '';
      const pointsStr = chartData.map((p, idx) => {
        const x = paddingLeft + (idx / (chartData.length - 1)) * chartWidth;
        const y = paddingTop + chartHeight - (p[key] / yMax) * chartHeight;
        return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ');
      
      const startX = paddingLeft;
      const startY = paddingTop + chartHeight;
      const endX = paddingLeft + chartWidth;
      const endY = startY;
      
      const firstPointX = paddingLeft;
      const firstPointY = paddingTop + chartHeight - (chartData[0][key] / yMax) * chartHeight;
      
      return `M ${startX} ${startY} L ${firstPointX.toFixed(1)} ${firstPointY.toFixed(1)} ${pointsStr} L ${endX} ${endY} Z`;
    };

    return {
      yMax,
      viewsPath: generatePath('views'),
      gemsPath: generatePath('gems'),
      usersPath: generatePath('users'),
      viewsAreaPath: generateAreaPath('views'),
      gemsAreaPath: generateAreaPath('gems'),
      usersAreaPath: generateAreaPath('users')
    };
  }, [chartData, chartWidth, chartHeight]);

  // Deny access view
  if (!user || !isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="glass-card" style={{ maxWidth: '400px', width: '100%', padding: '32px', textAlign: 'center' }}>
          <Ban size={48} style={{ color: 'var(--danger)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '24px', lineHeight: 1.5 }}>
            You do not have admin permissions to access the system tracking dashboard.
          </p>
          <Link to="/" className="btn btn-accent" style={{ width: '100%' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Back Button */}
      <Link to="/" className="admin-back-link">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      {/* Header */}
      <div className="admin-header">
        <div className="admin-title-row">
          <div>
            <h1 className="admin-title">System & Performance Dashboard</h1>
            <p className="admin-subtitle">Real-time statistics for users, page views, AI generation metrics, and system logging.</p>
          </div>
          <div className="admin-header-actions" style={{ gap: '16px', flexWrap: 'wrap' }}>
            {/* Live syncing indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)', borderRadius: '8px', fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'inline-block',
                boxShadow: '0 0 8px #22c55e',
                transition: 'all 0.3s ease',
                animation: liveSyncing ? 'pulse-sync 0.8s ease' : 'pulse-slow 2s infinite'
              }} />
              Live Sync
            </div>

            {/* Global Time Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '4px 10px' }}>
              <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as typeof timeFilter)}
                className="plan-select-dropdown"
                style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.8125rem', fontWeight: 600 }}
              >
                <option value="all">All Time</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>

            <button
              onClick={() => void loadDashboardData()}
              disabled={loading}
              className="btn btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.8125rem' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Data
            </button>
            <Link to="/admin/coupons" className="btn btn-accent" style={{ padding: '8px 16px', fontSize: '0.8125rem' }}>
              Manage Coupons
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="admin-kpi-grid">
        <div className="glass-card admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Accounts Created</span>
            <Users size={18} className="admin-kpi-icon" />
          </div>
          <div className="admin-kpi-value">{metrics.totalUsers}</div>
          <div className="admin-kpi-trend">
            <TrendingUp size={12} style={{ color: 'var(--success)' }} />
            <span>{timeFilter === 'all' ? 'Registered users' : 'New signups in range'}</span>
          </div>
        </div>

        <div className="glass-card admin-kpi-card kpi-visits">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Unique Visitors</span>
            <MousePointer size={18} className="admin-kpi-icon" />
          </div>
          <div className="admin-kpi-value">{metrics.uniqueVisitors}</div>
          <div className="admin-kpi-trend">
            <Activity size={12} style={{ color: 'var(--warning)' }} />
            <span>Active browser sessions</span>
          </div>
        </div>

        <div className="glass-card admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Page Views</span>
            <Activity size={18} className="admin-kpi-icon" />
          </div>
          <div className="admin-kpi-value">{metrics.totalViews}</div>
          <div className="admin-kpi-trend">
            <span>Aggregated hits</span>
          </div>
        </div>

        <div className="glass-card admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">AI Gems Forged</span>
            <Cpu size={18} className="admin-kpi-icon" />
          </div>
          <div className="admin-kpi-value">{metrics.totalGenerations}</div>
          <div className="admin-kpi-trend">
            <span>Successful completions</span>
          </div>
        </div>

        <div className="glass-card admin-kpi-card kpi-revenue">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Revenue</span>
            <DollarSign size={18} className="admin-kpi-icon" />
          </div>
          <div className="admin-kpi-value">
            {metrics.totalVND.toLocaleString('vi-VN')} đ
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }}>
              + ${metrics.totalUSD.toFixed(2)} USD
            </div>
          </div>
          <div className="admin-kpi-trend">
            <Gem size={12} style={{ color: 'var(--success)' }} />
            <span>{metrics.activeSubs} Active plans</span>
          </div>
        </div>
      </div>

      {/* SVG Line Chart Card */}
      <div className="glass-card admin-chart-card" style={{ marginBottom: '32px', padding: '24px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Performance Metrics & Trends
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
              Visualizing system activity relative to the selected timeframe.
            </p>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.8125rem', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#7c3aed', borderRadius: '2px', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Page Views</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#06b6d4', borderRadius: '2px', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Gems Forged</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#ec4899', borderRadius: '2px', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)' }}>New Users</span>
            </div>
          </div>
        </div>

        <div className="admin-svg-chart-container" style={{ position: 'relative', width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            height="100%"
            style={{ minWidth: '700px', display: 'block', overflow: 'visible' }}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="gemsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ec4899" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ec4899" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = paddingTop + ratio * chartHeight;
              const val = Math.round(yMax * (1 - ratio));
              return (
                <g key={`grid-${idx}`}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={paddingLeft + chartWidth}
                    y2={y}
                    stroke="var(--border-subtle)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* X Axis Labels */}
            {chartData.map((p, idx) => {
              const modValue = chartData.length > 15 ? Math.ceil(chartData.length / 6) : 2;
              if (idx % modValue !== 0 && idx !== chartData.length - 1) return null;
              const x = paddingLeft + (idx / (chartData.length - 1)) * chartWidth;
              return (
                <text
                  key={`x-lbl-${idx}`}
                  x={x}
                  y={paddingTop + chartHeight + 20}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontWeight="600"
                >
                  {p.label}
                </text>
              );
            })}

            {/* Area Fills under Lines */}
            {viewsAreaPath && <path d={viewsAreaPath} fill="url(#viewsGrad)" />}
            {gemsAreaPath && <path d={gemsAreaPath} fill="url(#gemsGrad)" />}
            {usersAreaPath && <path d={usersAreaPath} fill="url(#usersGrad)" />}

            {/* Lines */}
            {viewsPath && (
              <path
                d={viewsPath}
                fill="none"
                stroke="#7c3aed"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0px 0px 4px rgba(124,58,237,0.5))' }}
              />
            )}
            {gemsPath && (
              <path
                d={gemsPath}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0px 0px 4px rgba(6,182,212,0.5))' }}
              />
            )}
            {usersPath && (
              <path
                d={usersPath}
                fill="none"
                stroke="#ec4899"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0px 0px 4px rgba(236,72,153,0.5))' }}
              />
            )}

            {/* Hover Guides and Dots */}
            {hoveredIndex !== null && chartData[hoveredIndex] && (
              <>
                <line
                  x1={paddingLeft + (hoveredIndex / (chartData.length - 1)) * chartWidth}
                  y1={paddingTop}
                  x2={paddingLeft + (hoveredIndex / (chartData.length - 1)) * chartWidth}
                  y2={paddingTop + chartHeight}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />

                {[
                  { key: 'views', color: '#7c3aed' },
                  { key: 'gems', color: '#06b6d4' },
                  { key: 'users', color: '#ec4899' }
                ].map(({ key, color }) => {
                  const val = chartData[hoveredIndex][key as 'views' | 'gems' | 'users'];
                  const cx = paddingLeft + (hoveredIndex / (chartData.length - 1)) * chartWidth;
                  const cy = paddingTop + chartHeight - (val / yMax) * chartHeight;
                  return (
                    <circle
                      key={`dot-${key}`}
                      cx={cx}
                      cy={cy}
                      r="6"
                      fill={color}
                      stroke="#0a0b1a"
                      strokeWidth="2"
                      style={{ filter: `drop-shadow(0px 0px 6px ${color})` }}
                    />
                  );
                })}
              </>
            )}

            {/* Transparent hover interactive columns */}
            {chartData.map((_, idx) => {
              const columnWidth = chartWidth / (chartData.length - 1 || 1);
              const x = paddingLeft + idx * columnWidth - columnWidth / 2;
              return (
                <rect
                  key={`interactive-${idx}`}
                  x={x}
                  y={paddingTop}
                  width={columnWidth}
                  height={chartHeight}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                />
              );
            })}
          </svg>

          {/* Interactive Tooltip Card Overlay */}
          {hoveredIndex !== null && chartData[hoveredIndex] && (
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: `${Math.min(
                  svgWidth - 160,
                  Math.max(
                    60,
                    paddingLeft + (hoveredIndex / (chartData.length - 1)) * chartWidth - 75
                  )
                )}px`,
                backgroundColor: 'rgba(10, 11, 26, 0.95)',
                border: '1px solid var(--border-card)',
                borderRadius: '8px',
                padding: '10px 14px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                zIndex: 10,
                minWidth: '150px',
                backdropFilter: 'blur(8px)'
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
                {chartData[hoveredIndex].label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#a78bfa', fontWeight: 500 }}>Views:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{chartData[hoveredIndex].views}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#22d3ee', fontWeight: 500 }}>Gems:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{chartData[hoveredIndex].gems}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#f472b6', fontWeight: 500 }}>Users:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{chartData[hoveredIndex].users}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => { setActiveTab('customers'); setSearchQuery(''); }}
        >
          Customers ({filteredUsers.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => { setActiveTab('subscriptions'); setSearchQuery(''); }}
        >
          Subscriptions ({filteredSubscriptions.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => { setActiveTab('logs'); setSearchQuery(''); }}
        >
          System Logs ({filteredSystemLogs.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'openrouter' ? 'active' : ''}`}
          onClick={() => { setActiveTab('openrouter'); setSearchQuery(''); }}
        >
          OpenRouter LLM ({filteredOpenRouterLogs.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'visits' ? 'active' : ''}`}
          onClick={() => { setActiveTab('visits'); setSearchQuery(''); }}
        >
          Visitor Hits ({filteredVisits.length})
        </button>
      </div>

      {/* Panels */}
      <div className="glass-card admin-panel">
        <div className="panel-header-row">
          <h2 className="panel-title">
            {activeTab === 'customers' && <><Users size={18} /> Customer Accounts Management</>}
            {activeTab === 'subscriptions' && <><Gem size={18} /> Subscription Plans Logs</>}
            {activeTab === 'logs' && <><Server size={18} /> Server Transaction Logs</>}
            {activeTab === 'openrouter' && <><Cpu size={18} /> OpenRouter Request Logs</>}
            {activeTab === 'visits' && <><Activity size={18} /> Live Visitor Hits Tracker</>}
          </h2>

          <div className="panel-actions">
            {/* Search Input */}
            <div className="coupon-search-wrapper" style={{ minWidth: '240px' }}>
              <Search size={14} />
              <input
                type="text"
                placeholder={
                  activeTab === 'customers' ? 'Search email or ID...' :
                  activeTab === 'subscriptions' ? 'Search user...' :
                  activeTab === 'logs' ? 'Search logs message...' :
                  activeTab === 'openrouter' ? 'Search parameters...' :
                  'Search path or email...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Tab-Specific Filters & Sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* FILTER DROPDOWN */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '4px 10px' }}>
                <Filter size={12} style={{ color: 'var(--text-muted)' }} />
                {activeTab === 'customers' && (
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Plans</option>
                    <option value="free">Free Plan</option>
                    <option value="pro">Pro Plan</option>
                    <option value="ultra">Ultra Plan</option>
                  </select>
                )}
                {activeTab === 'subscriptions' && (
                  <select
                    value={subStatusFilter}
                    onChange={(e) => setSubStatusFilter(e.target.value as typeof subStatusFilter)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="expired">Expired Only</option>
                  </select>
                )}
                {activeTab === 'logs' && (
                  <select
                    value={logTypeFilter}
                    onChange={(e) => setLogTypeFilter(e.target.value as typeof logTypeFilter)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Logs</option>
                    <option value="info">Info Logs</option>
                    <option value="error">Errors Only</option>
                    <option value="warning">Warnings Only</option>
                  </select>
                )}
                {activeTab === 'openrouter' && (
                  <select
                    value={openRouterResultFilter}
                    onChange={(e) => setOpenRouterResultFilter(e.target.value as typeof openRouterResultFilter)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Responses</option>
                    <option value="success">Success Only</option>
                    <option value="error">Errors Only</option>
                  </select>
                )}
                {activeTab === 'visits' && (
                  <select
                    value={visitPathFilter}
                    onChange={(e) => setVisitPathFilter(e.target.value as typeof visitPathFilter)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Paths</option>
                    <option value="/">Home (/)</option>
                    <option value="/history">History (/history)</option>
                    <option value="/billing">Billing (/billing)</option>
                    <option value="/admin/dashboard">Dashboard</option>
                  </select>
                )}
              </div>

              {/* SORT DROPDOWN */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '4px 10px' }}>
                <ArrowUpDown size={12} style={{ color: 'var(--text-muted)' }} />
                {activeTab === 'customers' && (
                  <select
                    value={usersSort}
                    onChange={(e) => setUsersSort(e.target.value as typeof usersSort)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="newest">Newest User</option>
                    <option value="oldest">Oldest User</option>
                    <option value="usage_high">Highest Usage</option>
                    <option value="usage_low">Lowest Usage</option>
                    <option value="email">Email (A-Z)</option>
                  </select>
                )}
                {activeTab === 'subscriptions' && (
                  <select
                    value={subsSort}
                    onChange={(e) => setSubsSort(e.target.value as typeof subsSort)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="newest">Newest Subscription</option>
                    <option value="oldest">Oldest Subscription</option>
                    <option value="expiry">Expiry (Soonest)</option>
                  </select>
                )}
                {activeTab === 'logs' && (
                  <select
                    value={logsSort}
                    onChange={(e) => setLogsSort(e.target.value as typeof logsSort)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="newest">Newest Log</option>
                    <option value="oldest">Oldest Log</option>
                  </select>
                )}
                {activeTab === 'openrouter' && (
                  <select
                    value={openRouterSort}
                    onChange={(e) => setOpenRouterSort(e.target.value as typeof openRouterSort)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="newest">Newest Request</option>
                    <option value="oldest">Oldest Request</option>
                    <option value="size_high">Largest Response</option>
                    <option value="size_low">Smallest Response</option>
                  </select>
                )}
                {activeTab === 'visits' && (
                  <select
                    value={visitsSort}
                    onChange={(e) => setVisitsSort(e.target.value as typeof visitsSort)}
                    className="plan-select-dropdown"
                    style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '0.78rem' }}
                  >
                    <option value="newest">Newest Hit</option>
                    <option value="oldest">Oldest Hit</option>
                    <option value="path">Path (A-Z)</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
            <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Syncing real-time records...</span>
          </div>
        ) : (
          <>
            {/* 1. CUSTOMERS TAB */}
            {activeTab === 'customers' && (
              filteredUsers.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-title">No customers found</div>
                  <span>There are no registered accounts matching your filters or search query.</span>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>User ID</th>
                        <th>Email</th>
                        <th>Current Plan</th>
                        <th>Daily Usage</th>
                        <th>Registered Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((u, idx) => {
                        const orderNum = (pageCustomers - 1) * PAGE_SIZE + idx + 1;
                        return (
                          <tr key={u.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{orderNum}</td>
                            <td className="admin-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.id}</td>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{u.email}</td>
                            <td>
                              <select
                                value={u.current_plan}
                                onChange={(e) => void handleUpdatePlan(u.id, e.target.value)}
                                disabled={actionLoadingId === u.id}
                                className="plan-select-dropdown"
                              >
                                <option value="free">Free Plan</option>
                                <option value="pro">Pro Plan</option>
                                <option value="ultra">Ultra Plan</option>
                              </select>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{u.daily_usage} Forges</span>
                                <button
                                  onClick={() => void handleResetUsage(u.id)}
                                  disabled={actionLoadingId === u.id || u.daily_usage === 0}
                                  className="action-icon-btn"
                                  title="Reset Usage to 0"
                                  style={{ display: 'inline-flex', alignItems: 'center' }}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              </div>
                            </td>
                            <td>{new Date(u.created_at).toLocaleString()}</td>
                            <td>
                              {actionLoadingId === u.id ? (
                                <RefreshCw className="animate-spin" size={14} />
                              ) : (
                                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Check size={14} /> Synced
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <DashboardPagination
                    page={pageCustomers}
                    totalPages={totalPgsCustomers}
                    totalRecords={totalRecsCustomers}
                    onPageChange={setPageCustomers}
                  />
                </div>
              )
            )}

            {/* 2. SUBSCRIPTIONS TAB */}
            {activeTab === 'subscriptions' && (
              filteredSubscriptions.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-title">No subscriptions found</div>
                  <span>There are no subscription records matching your filters.</span>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>User Email</th>
                        <th>Plan Type</th>
                        <th>Status</th>
                        <th>Expiration Date</th>
                        <th>Gateway Provider</th>
                        <th>Created Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSubscriptions.map((s, idx) => {
                        const associatedUser = usersList.find(u => u.id === s.user_id);
                        const orderNum = (pageSubscriptions - 1) * PAGE_SIZE + idx + 1;
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{orderNum}</td>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                              {associatedUser?.email || `ID: ${s.user_id.slice(0, 8)}...`}
                            </td>
                            <td>
                              <span className={`plan-badge plan-badge--${s.plan_type}`}>
                                {s.plan_type}
                              </span>
                            </td>
                            <td>
                              <span className={`log-badge ${s.status === 'active' ? 'log-info' : 'log-error'}`}>
                                {s.status}
                              </span>
                            </td>
                            <td>
                              {s.current_period_end 
                                ? new Date(s.current_period_end).toLocaleString()
                                : 'Never'}
                            </td>
                            <td>
                              <span className="log-source">{s.provider}</span>
                            </td>
                            <td>{new Date(s.created_at).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <DashboardPagination
                    page={pageSubscriptions}
                    totalPages={totalPgsSubscriptions}
                    totalRecords={totalRecsSubscriptions}
                    onPageChange={setPageSubscriptions}
                  />
                </div>
              )
            )}

            {/* 3. SYSTEM LOGS TAB */}
            {activeTab === 'logs' && (
              filteredSystemLogs.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-title">No system logs found</div>
                  <span>No log entries match your filter query.</span>
                </div>
              ) : (
                <div className="log-list">
                  {paginatedLogs.map((log, idx) => {
                    const isExpanded = expandedLogId === log.id;
                    const orderNum = (pageLogs - 1) * PAGE_SIZE + idx + 1;
                    return (
                      <div key={log.id} className="log-item">
                        <div className="log-header" onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                          <div className="log-left">
                            <span style={{ marginRight: '6px', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{orderNum}</span>
                            <span className={`log-badge ${log.type === 'error' ? 'log-error' : log.type === 'warning' ? 'log-warning' : 'log-info'}`}>
                              {log.type}
                            </span>
                            <span className="log-source">{log.source}</span>
                            <span className="log-message" title={log.message}>{log.message}</span>
                          </div>
                          <div className="log-right">
                            <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                            <span>{new Date(log.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {isExpanded && log.details && (
                          <div className="log-detail-box">
                            <pre className="log-detail-pre">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <DashboardPagination
                    page={pageLogs}
                    totalPages={totalPgsLogs}
                    totalRecords={totalRecsLogs}
                    onPageChange={setPageLogs}
                  />
                </div>
              )
            )}

            {/* 4. OPENROUTER TAB */}
            {activeTab === 'openrouter' && (
              filteredOpenRouterLogs.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-title">No OpenRouter logs found</div>
                  <span>No AI generation request payloads match your query.</span>
                </div>
              ) : (
                <div className="log-list">
                  {paginatedOpenRouter.map((log, idx) => {
                    const isExpanded = expandedLogId === log.id;
                    const orderNum = (pageOpenRouter - 1) * PAGE_SIZE + idx + 1;
                    return (
                      <div key={log.id} className="log-item">
                        <div className="log-header" onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                          <div className="log-left">
                            <span style={{ marginRight: '6px', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{orderNum}</span>
                            <span className={`log-badge ${log.type === 'error' ? 'log-error' : 'log-info'}`}>
                              {log.type === 'error' ? 'FAIL' : 'COMPLETED'}
                            </span>
                            <span className="log-source" style={{ color: 'var(--accent-primary)' }}><Cpu size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{log.source}</span>
                            <span className="log-message" title={log.message}>{log.message}</span>
                          </div>
                          <div className="log-right">
                            {typeof log.details?.responseLength === 'number' && (
                              <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px' }}>
                                {log.details.responseLength as number} chars
                              </span>
                            )}
                            <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="log-detail-box">
                            <pre className="log-detail-pre">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <DashboardPagination
                    page={pageOpenRouter}
                    totalPages={totalPgsOpenRouter}
                    totalRecords={totalRecsOpenRouter}
                    onPageChange={setPageOpenRouter}
                  />
                </div>
              )
            )}

            {/* 5. VISITOR HITS TAB */}
            {activeTab === 'visits' && (
              filteredVisits.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-title">No visitor hits recorded</div>
                  <span>No visitor hits match your search query or path filters.</span>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>Visitor UUID</th>
                        <th>Account Email</th>
                        <th>Page Path</th>
                        <th>User Agent (Device)</th>
                        <th>Time Hit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedVisits.map((v, idx) => {
                        const orderNum = (pageVisits - 1) * PAGE_SIZE + idx + 1;
                        return (
                          <tr key={v.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{orderNum}</td>
                            <td className="admin-mono" style={{ fontSize: '0.75rem' }}>{v.visitor_id.slice(0, 16)}...</td>
                            <td style={{ color: v.email ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: v.email ? 600 : 400 }}>
                              {v.email || 'Anonymous Guest'}
                            </td>
                            <td>
                              <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>{v.path}</span>
                            </td>
                            <td style={{ fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.user_agent}>
                              {v.user_agent}
                            </td>
                            <td>{new Date(v.created_at).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <DashboardPagination
                    page={pageVisits}
                    totalPages={totalPgsVisits}
                    totalRecords={totalRecsVisits}
                    onPageChange={setPageVisitsState}
                  />
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
