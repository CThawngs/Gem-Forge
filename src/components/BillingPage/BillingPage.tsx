import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, ArrowLeft, Search, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Calendar, Gem, Lock } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { supabase } from '../../lib/supabase';
import { fetchBillingHistory, getNextBillingDate } from '../../api/payments';
import type { BillingRecord } from '../../api/payments';
import Navbar from '../Navbar/Navbar';
import Footer from '../Footer/Footer';
import AuthModal from '../AuthModal/AuthModal';
import CheckoutModal from '../CheckoutModal/CheckoutModal';
import './BillingPage.css';

const PAGE_SIZE = 20;

// Helpers
function formatDateShort(iso: string, lang: 'EN' | 'VI'): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'VI' ? 'vi-VN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string, lang: 'EN' | 'VI'): string {
  try {
    return new Date(iso).toLocaleString(lang === 'VI' ? 'vi-VN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount: number, currency: string, lang: 'EN' | 'VI'): string {
  try {
    return new Intl.NumberFormat(lang === 'VI' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

const PLAN_LABELS: Record<string, string> = {
  free: 'plan_free',
  pro: 'plan_pro',
  ultra: 'plan_ultra',
};

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  paid: { label: 'billing_paid', className: 'status--paid' },
  pending: { label: 'billing_pending', className: 'status--pending' },
  failed: { label: 'billing_failed', className: 'status--failed' },
  refunded: { label: 'billing_refunded', className: 'status--refunded' },
};

// Pagination Component
interface PaginationProps {
  page: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
  t: (key: string) => string;
}

function Pagination({ page, totalPages, totalRecords, onPageChange, t }: PaginationProps) {
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
    <div className="billing-pagination">
      <div className="billing-pagination-info">
        {t('billing_page_of')} {page} {t('billing_page_of_total')} {totalPages} ({totalRecords} {totalRecords === 1 ? t('billing_record') : t('billing_records')})
      </div>
      <div className="billing-pagination-controls">
        <button
          className="billing-page-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
          <span className="btn-label-mobile-hide">{t('billing_previous')}</span>
        </button>

        {getVisiblePages().map((p, i) =>
          typeof p === 'string' ? (
            <span key={`ellipsis-${i}`} className="billing-page-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`billing-page-btn ${p === page ? 'billing-page-btn--active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          className="billing-page-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <span className="btn-label-mobile-hide">{t('billing_next')}</span>
          <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </div>
  );
}

// BillingPage Component
export default function BillingPage() {
  const { user, setUser, lang, t, authModal, checkoutOpen, setCheckoutOpen, setAuthModal, setPendingCheckoutPlan } = useApp();

  // Search parameters for billing status polling
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const sessionIdParam = searchParams.get('session_id');

  // Data state
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalRecs, setTotalRecs] = useState(0);
  const [totalPgs, setTotalPgs] = useState(0);

  // Pagination
  const [page, setPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<'this_week' | 'this_month' | 'this_year' | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<'free' | 'pro' | 'ultra' | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Next billing date
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);

  // Expanded row for inline details (accordion)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Load billing data
  const loadBilling = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await fetchBillingHistory({
        userId: user.id,
        page,
        pageSize: PAGE_SIZE,
        searchTerm,
        timeFilter,
        planFilter,
        sortOrder,
      });
      setRecords(result.data || []);
      setTotalRecs(result.count || 0);
      setTotalPgs(result.totalPages || 0);

      // Adjust page if out of bounds
      if (result.totalPages > 0 && page > result.totalPages) {
        setPage(result.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch billing history:', err);
      setToast({ type: 'error', message: t('billing_load_error') });
    } finally {
      setIsLoading(false);
    }
  }, [user, page, searchTerm, timeFilter, planFilter, sortOrder, t]);

  // Load next billing date
  const loadNextBilling = useCallback(async () => {
    if (!user) return;
    try {
      const date = await getNextBillingDate(user.id);
      setNextBillingDate(date);
    } catch (err) {
      console.error('Failed to fetch next billing date:', err);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      loadBilling();
      loadNextBilling();
    }
  }, [loadBilling, loadNextBilling, user]);

  // Real-time polling when status parameter or session_id is present
  useEffect(() => {
    if (!user) return;
    const isSuccess = statusParam === 'success' || !!sessionIdParam;
    if (!isSuccess) return;

    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total
    const startPlan = user.plan;

    const checkAndComplete = (currentPlan: string, dailyUsage: number) => {
      setUser({
        ...user,
        plan: currentPlan as 'free' | 'pro' | 'ultra',
        dailyUsage: dailyUsage
      });
      setToast({ type: 'success', message: t('toast_updated') || 'Plan updated successfully!' });
      loadBilling();
      loadNextBilling();
      setSearchParams({}, { replace: true });
    };

    const interval = setInterval(async () => {
      attempts++;
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('current_plan, daily_usage')
          .eq('id', user.id)
          .maybeSingle();

        if (!userError && userData) {
          if (userData.current_plan !== startPlan) {
            checkAndComplete(userData.current_plan, userData.daily_usage || 0);
            clearInterval(interval);
            return;
          }

          const { data: billingData } = await supabase
            .from('billing_history')
            .select('id, created_at')
            .eq('user_id', user.id)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })
            .limit(1);

          if (billingData && billingData.length > 0) {
            const recordTime = new Date(billingData[0].created_at).getTime();
            const now = new Date().getTime();
            if (now - recordTime < 120000) {
              checkAndComplete(userData.current_plan, userData.daily_usage || 0);
              clearInterval(interval);
              return;
            }
          }
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setSearchParams({}, { replace: true });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [user, statusParam, sessionIdParam, setUser, loadBilling, loadNextBilling, setSearchParams, t]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [searchTerm, timeFilter, planFilter, sortOrder]);

  // Toggle row expansion
  const toggleRow = (id: string) => {
    setExpandedRowId(prev => prev === id ? null : id);
  };

  // Auth wall
  if (!user) {
    return (
      <div className="app">
        <Navbar />
        <main className="app-main">
          <div className="billing-page">
            <div className="container">
              <div className="billing-auth-wall">
                <div className="billing-auth-icon">
                  <Lock size={36} />
                </div>
                <div>
                  <h1 className="billing-auth-title">{t('billing_history_title')}</h1>
                  <p className="billing-auth-sub">{t('billing_auth_required')}</p>
                </div>
                <div className="billing-auth-buttons">
                  <button className="btn btn-accent" onClick={() => setAuthModal('login')}>
                    {t('nav_login')}
                  </button>
                  <Link to="/" className="btn btn-ghost">
                    {t('billing_back_home')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
        {authModal && <AuthModal />}
        {checkoutOpen && <CheckoutModal />}
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <div className="billing-page">
          <div className="container">

            {/* Header */}
            <div className="billing-header animate-fade-in">
              <div className="billing-header-row">
                <div className="billing-title-group">
                  <div className="billing-page-icon">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h1 className="billing-page-title">{t('billing_history_title')}</h1>
                    <p className="billing-page-subtitle">{t('billing_history_subtitle')}</p>
                  </div>
                </div>
                <Link to="/" className="billing-back-btn">
                  <ArrowLeft size={16} /> {t('billing_back_home')}
                </Link>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="billing-stats animate-fade-in animate-delay-1">
              <div className="billing-stat">
                <Gem size={16} />
                <span className="billing-stat-label">{t('billing_current_plan')}</span>
                <span className={`plan-badge plan-badge--${user.plan}`}>
                  {t(PLAN_LABELS[user.plan] || 'plan_free')}
                </span>
              </div>
              <div className="billing-stat">
                <Calendar size={16} />
                <span className="billing-stat-label">{t('billing_next_billing')}</span>
                <span className="billing-stat-value">
                  {nextBillingDate
                    ? formatDateShort(nextBillingDate, lang)
                    : '—'}
                </span>
              </div>
              <div className="billing-stat">
                <button
                  className="btn btn-accent btn-sm"
                  onClick={() => {
                    // Set the upgrade plan based on current plan before opening checkout
                    const targetPlan = user?.plan === 'ultra' ? 'ultra' : user?.plan === 'pro' ? 'ultra' : 'pro';
                    setPendingCheckoutPlan(targetPlan);
                    setCheckoutOpen(true);
                  }}
                >
                  {t('billing_manage_payment')}
                </button>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="billing-filters animate-fade-in animate-delay-1">
              {/* Search */}
              <div className="billing-search">
                <Search size={14} className="billing-search-icon" />
                <input
                  type="text"
                  className="billing-search-input"
                  placeholder={t('billing_search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Time Filter */}
              <div className="billing-filter-group">
                <label className="billing-filter-label">{t('billing_time_filter')}</label>
                <select
                  className="billing-select"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value as 'this_week' | 'this_month' | 'this_year' | 'all')}
                >
                  <option value="all">{t('billing_time_all')}</option>
                  <option value="this_week">{t('billing_time_week')}</option>
                  <option value="this_month">{t('billing_time_month')}</option>
                  <option value="this_year">{t('billing_time_year')}</option>
                </select>
              </div>

              {/* Plan Filter */}
              <div className="billing-filter-group">
                <label className="billing-filter-label">{t('billing_plan_filter')}</label>
                <select
                  className="billing-select"
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value as 'free' | 'pro' | 'ultra' | 'all')}
                >
                  <option value="all">{t('billing_plan_all')}</option>
                  <option value="free">{t('plan_free')}</option>
                  <option value="pro">{t('plan_pro')}</option>
                  <option value="ultra">{t('plan_ultra')}</option>
                </select>
              </div>

              {/* Sort Order */}
              <div className="billing-filter-group">
                <label className="billing-filter-label">{t('billing_sort_order')}</label>
                <select
                  className="billing-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                >
                  <option value="newest">{t('billing_sort_newest')}</option>
                  <option value="oldest">{t('billing_sort_oldest')}</option>
                </select>
              </div>
            </div>

            {/* Table Card */}
            <div className="animate-fade-in animate-delay-2">

              {/* Loading */}
              {isLoading && (
                <div className="billing-loading">
                  <div className="billing-spinner" />
                  {t('billing_loading')}
                </div>
              )}

              {/* Empty */}
              {!isLoading && records.length === 0 && (
                <div className="billing-table-wrapper">
                  <div className="billing-empty">
                    <div className="billing-empty-icon">
                      <CreditCard size={40} />
                    </div>
                    <h2 className="billing-empty-title">
                      {searchTerm || timeFilter !== 'all' || planFilter !== 'all'
                        ? t('billing_no_matching')
                        : t('billing_no_records')}
                    </h2>
                    <p className="billing-empty-sub">
                      {searchTerm || timeFilter !== 'all' || planFilter !== 'all'
                        ? t('billing_no_matching_sub')
                        : t('billing_no_records_sub')}
                    </p>
                  </div>
                </div>
              )}

              {/* Table with Inline Expansion */}
              {!isLoading && records.length > 0 && (
                <div className="billing-table-wrapper">
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th style={{ width: '50px' }}>#</th>
                        <th>{t('billing_col_transaction_id')}</th>
                        <th>{t('billing_col_amount')}</th>
                        <th>{t('billing_col_plan')}</th>
                        <th>{t('billing_col_method')}</th>
                        <th>{t('billing_col_date')}</th>
                        <th>{t('billing_col_status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record, index) => {
                        const isExpanded = expandedRowId === record.id;
                        const status = STATUS_INFO[record.status] || STATUS_INFO.pending;
                        const orderNum = (page - 1) * PAGE_SIZE + index + 1;

                        return (
                          <Fragment key={record.id}>
                            <tr
                              className="billing-row-clickable"
                              onClick={() => toggleRow(record.id)}
                            >
                              <td className="billing-expand-cell">
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </td>
                              <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{orderNum}</td>
                              <td>
                                <span className="billing-mono">{record.transaction_id}</span>
                              </td>
                              <td>
                                <span className="billing-amount">
                                  {formatCurrency(record.amount, record.currency, lang)}
                                </span>
                              </td>
                              <td>
                                <span className={`plan-badge plan-badge--${record.plan_name.toLowerCase().split(' ')[0]}`}>
                                  {record.plan_name}
                                </span>
                              </td>
                              <td>
                                <span className="billing-method">{record.payment_method}</span>
                              </td>
                              <td>
                                <span className="billing-date">
                                  {formatDateShort(record.created_at, lang)}
                                </span>
                              </td>
                              <td>
                                <span className={`billing-status ${status.className}`}>
                                  {t(status.label)}
                                </span>
                              </td>
                            </tr>
                            {/* Inline expanded details (accordion row) */}
                            {isExpanded && (
                              <tr className="billing-detail-row">
                                <td colSpan={8}>
                                  <div className="billing-detail-grid">
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_transaction_id')}</span>
                                      <span className="billing-detail-value billing-mono">{record.transaction_id}</span>
                                    </div>
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_amount')}</span>
                                      <span className="billing-detail-value billing-detail-amount">
                                        {formatCurrency(record.amount, record.currency, lang)}
                                      </span>
                                    </div>
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_plan')}</span>
                                      <span className="billing-detail-value">
                                        <span className={`plan-badge plan-badge--${record.plan_name.toLowerCase().split(' ')[0]}`}>
                                          {record.plan_name}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_method')}</span>
                                      <span className="billing-detail-value">{record.payment_method}</span>
                                    </div>
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_status')}</span>
                                      <span className="billing-detail-value">
                                        <span className={`billing-status ${status.className}`}>
                                          {t(status.label)}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="billing-detail-item">
                                      <span className="billing-detail-label">{t('billing_detail_date')}</span>
                                      <span className="billing-detail-value">
                                        {formatDateTime(record.created_at, lang)}
                                      </span>
                                    </div>
                                    {record.next_billing_date && (
                                      <div className="billing-detail-item">
                                        <span className="billing-detail-label">{t('billing_detail_next_billing')}</span>
                                        <span className="billing-detail-value">
                                          {formatDateShort(record.next_billing_date, lang)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <Pagination
                    page={page}
                    totalPages={totalPgs}
                    totalRecords={totalRecs}
                    onPageChange={setPage}
                    t={t}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Global modals */}
      {authModal && <AuthModal />}
      {checkoutOpen && <CheckoutModal />}

      {/* Toast */}
      {toast && (
        <div className={`billing-toast billing-toast--${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
