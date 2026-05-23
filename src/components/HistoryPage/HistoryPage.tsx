import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, ArrowLeft, Trash2, Pencil, Gem, Lock, CheckCircle, AlertCircle, Wrench, ChevronDown } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { fetchUserGenerations, deleteGeneration } from '../../api/generations';
import type { Generation } from '../../api/generations';
import Navbar from '../Navbar/Navbar';
import Footer from '../Footer/Footer';
import AuthModal from '../AuthModal/AuthModal';
import CheckoutModal from '../CheckoutModal/CheckoutModal';
import './HistoryPage.css';

// Toast
interface Toast {
  type: 'success' | 'error';
  message: string;
}

// Confirm Dialog
interface ConfirmDialogProps {
  gemName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  t: (key: string) => string;
}

function ConfirmDialog({ gemName, onConfirm, onCancel, isDeleting, t }: ConfirmDialogProps) {
  return (
    <div className="history-confirm-overlay" onClick={onCancel}>
      <div className="history-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="history-confirm-title">
          <Trash2 size={18} />
          {t('history_confirm_title')}
        </div>
        <div className="history-confirm-message">
          {t('history_confirm_delete')}
          <div>
            <span className="history-confirm-gem-name">"{gemName}"</span>
          </div>
        </div>
        <div className="history-confirm-actions">
          <button className="history-confirm-cancel" onClick={onCancel} disabled={isDeleting}>
            {t('history_cancel')}
          </button>
          <button className="history-confirm-delete" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <><div className="history-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {t('history_deleting')}</>
            ) : (
              <><Trash2 size={14} /> {t('history_delete')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

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
    <div className="history-pagination">
      <div className="history-pagination-info">
        {t('billing_page_of')} {page} {t('billing_page_of_total')} {totalPages} ({totalRecords} {totalRecords === 1 ? t('billing_record') : t('billing_records')})
      </div>
      <div className="history-pagination-controls">
        <button
          className="history-page-btn"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          title={t('billing_first_page')}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button
          className="history-page-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} /> {t('billing_previous')}
        </button>

        {getVisiblePages().map((p, i) =>
          typeof p === 'string' ? (
            <span key={`ellipsis-${i}`} className="history-page-ellipsis">...</span>
          ) : (
            <button
              key={p}
              className={`history-page-btn ${p === page ? 'history-page-btn--active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          className="history-page-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {t('billing_next')} <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <button
          className="history-page-btn"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title={t('billing_last_page')}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </div>
  );
}

// Helpers
function formatDate(iso: string, lang: 'EN' | 'VI'): string {
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

// HistoryPage Component
export default function HistoryPage() {
  const { user, lang, t, authModal, checkoutOpen, setAuthModal } = useApp();
  const navigate = useNavigate();

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Generation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtered generations based on search term
  const filteredGenerations = searchTerm.trim()
    ? generations.filter(gen =>
        gen.output_result?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : generations;

  const totalRecs = filteredGenerations.length;
  const totalPgs = Math.ceil(totalRecs / PAGE_SIZE);

  // Paginated slice
  const paginatedGenerations = filteredGenerations.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Reset page to 1 on search or deletion count change
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Adjust page if total pages decreases
  useEffect(() => {
    if (totalPgs > 0 && page > totalPgs) {
      setPage(totalPgs);
    }
  }, [totalPgs, page]);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Load gems
  const loadGenerations = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchUserGenerations(user.id);
      setGenerations(data);
    } catch (err) {
      console.error('Failed to fetch generations:', err);
      setToast({ type: 'error', message: t('history_load_error') });
    } finally {
      setIsLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGenerations();
  }, [loadGenerations]);

  // Delete flow
  const handleDeleteConfirm = async () => {
    if (!confirmDelete || !user) return;
    setIsDeleting(true);
    try {
      // Delete from Supabase first
      await deleteGeneration(confirmDelete.id, user.id);

      // Verify deletion by reloading from DB
      const data = await fetchUserGenerations(user.id);
      setGenerations(data);

      setToast({ type: 'success', message: t('history_deleted') });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Delete failed:', err);
      setToast({ type: 'error', message: `${t('history_delete_error')} ${message}` });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  // Edit flow
  const handleEdit = (gen: Generation) => {
    navigate(`/?editId=${encodeURIComponent(gen.id)}`);
    // Scroll to generator after navigation
    setTimeout(() => {
      document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  // Auth wall
  if (!user) {
    return (
      <div className="app">
        <Navbar />
        <main className="app-main">
          <div className="history-page">
            <div className="container">
              <div className="history-auth-wall">
                <div className="history-auth-icon">
                  <Lock size={36} />
                </div>
                <div>
                  <h1 className="history-auth-title">{t('history_title')}</h1>
                  <p className="history-auth-sub">{t('history_auth_required')}</p>
                </div>
                <div className="history-auth-buttons">
                  <button className="btn btn-accent" onClick={() => setAuthModal('login')}>
                    {t('nav_login')}
                  </button>
                  <Link to="/" className="btn btn-ghost">
                    {t('history_back_home')}
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

  // Main Page
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <div className="history-page">
          <div className="container">

            {/* Header */}
            <div className="history-header animate-fade-in">
              <div className="history-header-row">
                <div className="history-title-group">
                  <div className="history-page-icon">
                    <History size={24} />
                  </div>
                  <div>
                    <h1 className="history-page-title">{t('history_title')}</h1>
                    <p className="history-page-subtitle">{t('history_subtitle')}</p>
                  </div>
                </div>
                <Link to="/" className="history-back-btn">
                  <ArrowLeft size={16} /> {t('history_back_home')}
                </Link>
              </div>
            </div>

            {/* Search Input */}
            <div className="history-search animate-fade-in animate-delay-1">
              <input
                type="text"
                className="history-search-input"
                placeholder={t('history_search_placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Stats Bar */}
            {!isLoading && generations.length > 0 && (
              <div className="history-stats animate-fade-in animate-delay-1">
                <div className="history-stat">
                  <Gem size={16} />
                  <span className="history-stat-value">{generations.length}</span>
                  <span>{t('history_gems_saved')}</span>
                </div>
                <div className="history-stat">
                  <span>.</span>
                  <span>{t('history_last_created')} {formatDate(generations[0].created_at, lang)}</span>
                </div>
              </div>
            )}

            {/* Table Card */}
            <div className="animate-fade-in animate-delay-2">

              {/* Loading */}
              {isLoading && (
                <div className="history-loading">
                  <div className="history-spinner" />
                  {t('history_loading')}
                </div>
              )}

              {/* Empty */}
              {!isLoading && generations.length === 0 && (
                <div className="history-table-wrapper">
                  <div className="history-empty">
                    <div className="history-empty-icon">
                      <Gem size={40} />
                    </div>
                    <h2 className="history-empty-title">{t('history_empty_title')}</h2>
                    <p className="history-empty-sub">{t('history_empty_sub')}</p>
                    <Link to="/" className="btn btn-accent" onClick={() => {
                      setTimeout(() => {
                        document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth' });
                      }, 200);
                    }}>
                      {t('history_empty_cta')}
                    </Link>
                  </div>
                </div>
              )}

              {/* Table */}
              {!isLoading && generations.length > 0 && (
                <div className="history-table-wrapper">
                  {filteredGenerations.length === 0 && searchTerm ? (
                    <div className="history-empty">
                      <div className="history-empty-icon">
                        <History size={40} />
                      </div>
                      <h2 className="history-empty-title">{t('history_no_matching_title')}</h2>
                      <p className="history-empty-sub">{t('history_no_matching_sub')}</p>
                    </div>
                  ) : (
                    <>
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th style={{ width: '50px' }}>#</th>
                            <th>{t('history_col_name')}</th>
                            <th>{t('history_col_desc')}</th>
                            <th>{t('history_col_tools')}</th>
                            <th>{t('history_col_date')}</th>
                            <th>{t('history_col_actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedGenerations.map((gen, index) => {
                            const orderNum = (page - 1) * PAGE_SIZE + index + 1;
                            return (
                              <tr key={gen.id}>
                                {/* Numerical Order */}
                                <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{orderNum}</td>

                                {/* Gem Name */}
                                <td>
                                  <div className="history-gem-name">
                                    <span className="history-gem-dot" />
                                    {gen.output_result?.name ?? '—'}
                                  </div>
                                </td>

                                {/* Description */}
                                <td>
                                  <div className="history-gem-desc">
                                    {gen.output_result?.description ?? '—'}
                                  </div>
                                </td>

                                {/* Tools */}
                                <td>
                                  <span className="history-tool-badge">
                                    <Wrench size={10} />
                                    {gen.output_result?.tools ?? '—'}
                                  </span>
                                </td>

                                {/* Date */}
                                <td>
                                  <span className="history-gem-date">
                                    {formatDate(gen.created_at, lang)}
                                  </span>
                                </td>

                                {/* Actions */}
                                <td>
                                  <div className="history-actions">
                                    <button
                                      className="history-btn history-btn--edit"
                                      onClick={() => handleEdit(gen)}
                                      title={t('history_edit')}
                                    >
                                      <Pencil size={13} /> {t('history_edit')}
                                    </button>
                                    <button
                                      className="history-btn history-btn--delete"
                                      onClick={() => setConfirmDelete(gen)}
                                      title={t('history_delete')}
                                    >
                                      <Trash2 size={13} /> {t('history_delete')}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pagination */}
                      {totalRecs > 0 && (
                        <Pagination
                          page={page}
                          totalPages={totalPgs}
                          totalRecords={totalRecs}
                          onPageChange={setPage}
                          t={t}
                        />
                      )}
                    </>
                  )}
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

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <ConfirmDialog
          gemName={confirmDelete.output_result?.name ?? t('history_this_gem')}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
          isDeleting={isDeleting}
          t={t}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`history-toast history-toast--${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

    </div>
  );
}
