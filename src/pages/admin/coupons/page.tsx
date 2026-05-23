import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../hooks/useApp';
import {
  ArrowLeft,
  Ticket,
  Percent,
  Calendar,
  Users,
  Search,
  RefreshCw,
  Trash2,
  Edit3,
  AlertCircle,
  PlusCircle,
  CheckCircle,
  Tag,
  Ban
} from 'lucide-react';
import './page.css';

type CouponRow = {
  id: string;
  code: string;
  discount_percent: number;
  duration_days: number;
  expires_at: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
};

const ADMIN_EMAIL = 'nguyenchithang2804@gmail.com';

export default function AdminCouponsPage() {
  const { user } = useApp();

  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [maxUses, setMaxUses] = useState<number>(100);
  const [expiresAt, setExpiresAt] = useState<string>('');

  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');

  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user?.email]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void loadCoupons();
  }, [isAdmin]);

  // Auto-dismiss alerts
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  async function loadCoupons() {
    setCouponsLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('coupons')
        .select('id, code, discount_percent, duration_days, expires_at, max_uses, used_count, is_active')
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;
      setCoupons((data ?? []) as CouponRow[]);
    } catch (err) {
      console.error('Failed to load coupons:', err);
      setError('Unable to fetch coupons at this time. Please try again later.');
    } finally {
      setCouponsLoading(false);
    }
  }

  const startEdit = (c: CouponRow) => {
    setError('');
    setSuccessMessage('');
    setEditingCouponId(c.id);
    setCode(c.code);
    setDiscountPercent(c.discount_percent);
    setDurationDays(c.duration_days);
    setMaxUses(c.max_uses);
    if (c.expires_at) {
      const dateStr = new Date(c.expires_at).toISOString().split('T')[0];
      setExpiresAt(dateStr);
    } else {
      setExpiresAt('');
    }
    // Scroll to form on mobile devices smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const generateRandomCode = () => {
    if (editingCouponId) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'GEM-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  };

  const cancelEdit = () => {
    setEditingCouponId(null);
    setCode('');
    setDiscountPercent(20);
    setDurationDays(30);
    setMaxUses(100);
    setExpiresAt('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      setError('Coupon code is required');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        code: code.trim().toUpperCase(),
        discount_percent: Math.max(0, Math.min(100, Math.floor(discountPercent))),
        duration_days: Math.max(1, Math.floor(durationDays)),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_uses: Math.max(1, Math.floor(maxUses)),
      };

      if (editingCouponId) {
        // Update
        const { error: upErr } = await supabase
          .from('coupons')
          .update(payload)
          .eq('id', editingCouponId);

        if (upErr) throw upErr;
        setSuccessMessage(`Coupon "${payload.code}" updated successfully!`);
        cancelEdit();
      } else {
        // Create
        const newPayload = {
          ...payload,
          used_count: 0,
          is_active: true,
        };
        const { error: insErr } = await supabase.from('coupons').insert(newPayload);
        if (insErr) throw insErr;
        setSuccessMessage(`Coupon "${payload.code}" created successfully!`);

        setCode('');
        setDiscountPercent(20);
        setDurationDays(30);
        setMaxUses(100);
        setExpiresAt('');
      }

      await loadCoupons();
    } catch (err) {
      console.error('Failed to save coupon:', err);
      setError(`Failed to save coupon. ${editingCouponId ? 'Please verify inputs.' : 'Make sure the code is unique.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (couponId: string, nextActive: boolean) => {
    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      const { error: upErr } = await supabase
        .from('coupons')
        .update({ is_active: nextActive })
        .eq('id', couponId);

      if (upErr) throw upErr;

      setCoupons((prev) =>
        prev.map((c) => (c.id === couponId ? { ...c, is_active: nextActive } : c))
      );
      setSuccessMessage(`Coupon status updated to ${nextActive ? 'active' : 'inactive'}.`);
    } catch (err) {
      console.error('Failed to toggle coupon:', err);
      setError('Failed to update coupon status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (couponId: string) => {
    const ok = window.confirm('Are you sure you want to permanently delete this coupon?');
    if (!ok) return;

    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      const { error: delErr } = await supabase.from('coupons').delete().eq('id', couponId);
      if (delErr) throw delErr;
      
      setSuccessMessage('Coupon deleted successfully!');
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      if (editingCouponId === couponId) {
        cancelEdit();
      }
    } catch (err) {
      console.error('Failed to delete coupon:', err);
      setError('Failed to delete coupon.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter logic
  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      // Code search filter
      const codeMatch = c.code.toLowerCase().includes(searchTerm.toLowerCase());

      // Expiry calculation
      const isExpired = c.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;

      // Status filter
      let statusMatch = true;
      if (statusFilter === 'active') {
        statusMatch = c.is_active && !isExpired;
      } else if (statusFilter === 'inactive') {
        statusMatch = !c.is_active;
      } else if (statusFilter === 'expired') {
        statusMatch = isExpired;
      }

      return codeMatch && statusMatch;
    });
  }, [coupons, searchTerm, statusFilter]);

  // Deny access view
  if (!user || !isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="glass-card" style={{ maxWidth: '400px', width: '100%', padding: '32px', textAlign: 'center' }}>
          <Ban size={48} style={{ color: 'var(--danger)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '24px', lineHeight: 1.5 }}>
            You do not have permission to view the Coupon Management dashboard.
          </p>
          <Link to="/" className="btn btn-accent" style={{ width: '100%' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="coupon-container">
      {/* Header section with back button */}
      <Link to="/" className="coupon-back-link">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="coupon-header">
        <h1 className="coupon-title">Coupon Management</h1>
        <p className="coupon-subtitle">Create, view, update, and manage promotional discount codes for subscription plans.</p>
      </div>

      {/* Main Grid */}
      <div className="coupon-grid">
        {/* Left: Create / Edit Form */}
        <div className="glass-card coupon-form-card">
          <h2 className="coupon-form-title">
            <Ticket size={20} style={{ color: 'var(--text-accent)' }} />
            {editingCouponId ? 'Edit Coupon' : 'Create New Coupon'}
          </h2>

          {error && (
            <div className="coupon-error-alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="coupon-success-alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} style={{ flexShrink: 0 }} />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="coupon-form">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="field-label" htmlFor="coupon-code" style={{ marginBottom: '6px' }}>Coupon Code</label>
                {!editingCouponId && (
                  <button
                    type="button"
                    onClick={generateRandomCode}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-accent)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={12} /> Auto-generate
                  </button>
                )}
              </div>
              <div className="input-icon-wrapper">
                <Tag size={16} />
                <input
                  id="coupon-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SUMMER50"
                  className="input-field"
                  disabled={!!editingCouponId} // Keep code immutable on edit to preserve uniqueness reference
                  required
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="coupon-discount">Discount (%)</label>
              <div className="input-icon-wrapper">
                <Percent size={16} />
                <input
                  id="coupon-discount"
                  type="number"
                  value={discountPercent}
                  min={0}
                  max={100}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div className="coupon-form-row">
              <div>
                <label className="field-label" htmlFor="coupon-duration">Duration (days)</label>
                <div className="input-icon-wrapper">
                  <Calendar size={16} />
                  <input
                    id="coupon-duration"
                    type="number"
                    value={durationDays}
                    min={1}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="coupon-uses">Max Uses</label>
                <div className="input-icon-wrapper">
                  <Users size={16} />
                  <input
                    id="coupon-uses"
                    type="number"
                    value={maxUses}
                    min={1}
                    onChange={(e) => setMaxUses(Number(e.target.value))}
                    className="input-field"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="coupon-expiry">Expiry Date (optional)</label>
              <div className="input-icon-wrapper">
                <Calendar size={16} />
                <input
                  id="coupon-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-accent coupon-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={16} /> Saving...
                </>
              ) : editingCouponId ? (
                'Save Changes'
              ) : (
                <>
                  <PlusCircle size={16} /> Generate Coupon
                </>
              )}
            </button>

            {editingCouponId && (
              <button
                type="button"
                className="btn coupon-cancel-btn"
                onClick={cancelEdit}
                disabled={isLoading}
              >
                Cancel Edit
              </button>
            )}
          </form>
        </div>

        {/* Right: Coupon List */}
        <div className="glass-card coupon-list-card">
          <div className="coupon-list-header">
            <h2 className="coupon-list-title">
              Active Coupons
              <span className="coupon-list-badge">{filteredCoupons.length}</span>
            </h2>

            <div className="coupon-list-actions">
              {/* Search input */}
              <div className="coupon-search-wrapper">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field"
                />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="select-field coupon-filter-select"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="expired">Expired Only</option>
              </select>

              {/* Refresh list */}
              <button
                type="button"
                onClick={() => void loadCoupons()}
                disabled={couponsLoading}
                className="btn btn-ghost coupon-refresh-btn"
                title="Refresh coupon list"
              >
                <RefreshCw size={14} className={couponsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {couponsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--text-secondary)', gap: '16px' }}>
              <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--accent-primary)' }} />
              <span>Loading coupons...</span>
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="empty-coupons">
              <Ticket size={40} className="empty-coupons-icon" />
              <div className="empty-coupons-title">No coupons found</div>
              <p className="empty-coupons-sub">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Get started by creating your first promotional coupon on the left.'}
              </p>
            </div>
          ) : (
            <div className="coupon-items-container">
              {filteredCoupons.map((c) => {
                const isExpired = c.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
                const percentUsed = Math.min(100, Math.floor((c.used_count / c.max_uses) * 100));

                let statusClass = 'active';
                let statusLabel = 'Active';
                if (isExpired) {
                  statusClass = 'expired';
                  statusLabel = 'Expired';
                } else if (!c.is_active) {
                  statusClass = 'inactive';
                  statusLabel = 'Inactive';
                }

                return (
                  <div
                    key={c.id}
                    className={`coupon-item-card ${!c.is_active ? 'inactive' : ''} ${isExpired ? 'expired' : ''}`}
                  >
                    <div className="coupon-item-main">
                      <div className="coupon-item-info">
                        <div className="coupon-item-meta">
                          <span className="coupon-code-badge">{c.code}</span>
                          <span className="coupon-discount-tag">{c.discount_percent}% OFF</span>
                          <span className={`coupon-status-tag ${statusClass}`}>{statusLabel}</span>
                        </div>

                        {/* Usage Progress Bar */}
                        <div className="coupon-usage-container">
                          <div className="coupon-usage-labels">
                            <span>Redemptions</span>
                            <span>{c.used_count} / {c.max_uses} ({percentUsed}%)</span>
                          </div>
                          <div className="coupon-usage-bar-bg">
                            <div
                              className={`coupon-usage-bar-fill ${percentUsed >= 100 ? 'full' : ''}`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>

                        {/* Coupon Details Grid */}
                        <div className="coupon-details-grid">
                          <div className="coupon-detail-item">
                            <span className="coupon-detail-label">Duration</span>
                            <span className="coupon-detail-value">{c.duration_days} Days</span>
                          </div>
                          <div className="coupon-detail-item">
                            <span className="coupon-detail-label">Expires At</span>
                            <span className="coupon-detail-value">
                              {c.expires_at
                                ? new Date(c.expires_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : 'Never'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Item Actions */}
                      <div className="coupon-item-actions">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleToggleActive(c.id, !c.is_active)}
                          className={`coupon-toggle ${c.is_active ? 'active' : ''}`}
                          title={c.is_active ? 'Deactivate Coupon' : 'Activate Coupon'}
                        >
                          <span className="coupon-toggle-thumb" />
                        </button>

                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => startEdit(c)}
                          className="coupon-action-btn edit"
                          title="Edit Coupon"
                        >
                          <Edit3 size={16} />
                        </button>

                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleDelete(c.id)}
                          className="coupon-action-btn delete"
                          title="Delete Coupon"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
