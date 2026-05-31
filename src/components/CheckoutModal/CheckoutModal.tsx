import { useState, useCallback, useEffect } from 'react';
import { X, Gem, Check, Loader2, Copy } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { supabase } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import './CheckoutModal.css';

type PaymentMethod = 'momo' | 'payos' | 'stripe' | 'free';

interface PaymentData {
  provider: PaymentMethod;
  orderCode?: number;
  orderId?: string;
  qrCode?: string;
  amount?: number;
  description?: string;
  sessionId?: string;
  url?: string;
  message?: string;
  bin?: string;
  accountNumber?: string;
  accountName?: string;
  details?: string;
  error?: string;
}

const BANK_NAMES: Record<string, { EN: string; VI: string }> = {
  '970422': { EN: 'MB Bank (Military Bank)', VI: 'MB Bank (Ngân hàng Quân Đội)' },
  '970415': { EN: 'VietinBank (Industrial Bank)', VI: 'VietinBank (Ngân hàng Công Thương)' },
  '970436': { EN: 'Vietcombank (Foreign Trade Bank)', VI: 'Vietcombank (Ngân hàng Ngoại Thương)' },
  '970418': { EN: 'BIDV (Investment and Development Bank)', VI: 'BIDV (Ngân hàng Đầu tư và Phát triển)' },
  '970405': { EN: 'Agribank (Agriculture Bank)', VI: 'Agribank (Ngân hàng Nông nghiệp & PTNT)' },
  '970407': { EN: 'Techcombank (Technological & Commercial Bank)', VI: 'Techcombank (Ngân hàng Kỹ Thương)' },
  '970416': { EN: 'ACB (Asia Commercial Bank)', VI: 'ACB (Ngân hàng Á Châu)' },
  '970423': { EN: 'TPBank (Tien Phong Bank)', VI: 'TPBank (Ngân hàng Tiên Phong)' },
  '970432': { EN: 'VPBank (Vietnam Prosperity Bank)', VI: 'VPBank (Ngân hàng Việt Nam Thịnh Vượng)' },
  '970403': { EN: 'Sacombank (Saigon Commercial Bank)', VI: 'Sacombank (Ngân hàng Sài Gòn Thương Tín)' },
};

export default function CheckoutModal() {
  const { t, lang, pendingCheckoutPlan: plan, setCheckoutOpen, setPendingCheckoutPlan, user, setUser } = useApp();

  // Payment method selection (default MoMo)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('momo');

  // Copy state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Payment processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);

  // Derived state: calculated prices
  const basePriceVnd = plan === 'pro' ? 115000 : 345000;
  const discountedPriceVnd = Math.max(0, Math.floor(basePriceVnd * (1 - discountPercent / 100)));
  const planName = plan === 'pro' ? t('plan_pro') : t('plan_ultra');

  const handleClose = useCallback(() => {
    setCheckoutOpen(false);
    setPendingCheckoutPlan(null);
    setError('');
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setDiscountPercent(0);
    setCouponError('');
    setPaymentStatus(null);
    setPaymentData(null);
    setSelectedPaymentMethod('momo');
  }, [setCheckoutOpen, setPendingCheckoutPlan]);

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    setPaymentStatus(null);
    setPaymentData(null);
    setError('');
  };

  // Poll user subscription plan status when pending (using backend failsafe status endpoint)
  useEffect(() => {
    if (paymentStatus !== 'pending' || !user?.id || !plan || !paymentData?.orderCode) return;
    if (selectedPaymentMethod !== 'payos' && selectedPaymentMethod !== 'momo') return;

    const intervalId = setInterval(async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_BASE_URL}/api/payments/payos/status/${paymentData.orderCode}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Status API error: ${res.status} - ${text}`);
        }
        const data = await res.json();

        if (data.status === 'PAID') {
          clearInterval(intervalId);
          // Fetch updated user current_plan
          const { data: userData } = await supabase
            .from('users')
            .select('current_plan')
            .eq('id', user.id)
            .maybeSingle();

          if (userData) {
            setUser({ ...user, plan: userData.current_plan as 'free' | 'pro' | 'ultra' });
          }
          setPaymentStatus('success');
          setTimeout(handleClose, 2000);
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [paymentStatus, user, plan, paymentData, selectedPaymentMethod, setUser, handleClose]);

  // Apply coupon code
  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim()) return;

    setCouponChecking(true);
    setCouponError('');

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API_BASE_URL}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponCode: couponCodeInput.trim(),
          userId: user?.id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        setCouponError(data.error || 'coupon_invalid');
        setAppliedCoupon(null);
        setDiscountPercent(0);
        return;
      }

      setAppliedCoupon(couponCodeInput.trim().toUpperCase());
      setDiscountPercent(data.discountPercent);
      setCouponError('');
      setPaymentStatus(null);
      setPaymentData(null);
      setError('');
    } catch (error) {
      console.error('Coupon verification failed:', error);
      setCouponError('coupon_error');
    } finally {
      setCouponChecking(false);
    }
  };



  // Proceed to payment - lazy load payment data
  const handleProceedToPayment = async () => {
    if (!plan || !user) return;

    setIsProcessing(true);
    setError('');

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      // For both payos and momo, hit the '/api/payments/payos' endpoint
      const backendMethod = (discountPercent === 100) ? 'payos' : ((selectedPaymentMethod === 'momo') ? 'payos' : selectedPaymentMethod);
      const endpoint = `${API_BASE_URL}/api/payments/${backendMethod}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          userId: user.id,
          email: user.email,
          couponCode: appliedCoupon,
        }),
      });

      const data: PaymentData = await response.json();

      if (!response.ok) {
        const errCode = data?.error || '';
        if (['coupon_invalid', 'coupon_expired', 'coupon_limit', 'coupon_error', 'coupon_already_used'].includes(errCode)) {
          setCouponError(errCode);
          setAppliedCoupon(null);
          setDiscountPercent(0);
          throw new Error(errCode);
        }
        throw new Error(data?.details || data?.error || data?.message || `Payment error: ${response.status}`);
      }

      // For free/coupon 100% bypass
      if (data.provider === 'free') {
        setUser({ ...user, plan: plan });
        setPaymentStatus('success');
        setTimeout(handleClose, 2000);
        return;
      }

      // For redirect-based gateways (Stripe), redirect immediately
      if (selectedPaymentMethod === 'stripe' && data.url) {
        window.location.href = data.url;
        return;
      }

      // For PayOS & MoMo (QR code), show embedded QR screen and set up polling
      if ((selectedPaymentMethod === 'payos' || selectedPaymentMethod === 'momo') && data.qrCode) {
        setPaymentData(data);
        setPaymentStatus('pending');
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (['coupon_invalid', 'coupon_expired', 'coupon_limit', 'coupon_error', 'coupon_already_used'].includes(message)) {
        setIsProcessing(false);
        return;
      }
      setError(message || 'checkout_error');
      setPaymentStatus('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!plan) return null;

  // ─── Success State ─────────────────────────────────────────────────
  if (paymentStatus === 'success') {
    return (
      <div className="checkout-backdrop" role="dialog" aria-modal="true">
        <div className="checkout-modal glass-card">
          <div className="checkout-success">
            <div className="checkout-success-icon">
              <Check size={40} />
            </div>
            <h3>{t('checkout_success_title') || 'Payment Successful'}</h3>
            <p>
              {t('checkout_success_desc') || `Welcome to GemForge ${planName}! Your plan is now active.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pending QR State ──────────────────────────────────────────────
  if (paymentStatus === 'pending' && paymentData && (selectedPaymentMethod === 'payos' || selectedPaymentMethod === 'momo')) {
    return (
      <div
        className="checkout-backdrop"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
        role="dialog"
        aria-modal="true"
      >
        <div className="checkout-modal checkout-modal--pending glass-card">
          <button className="checkout-close" onClick={handleClose} aria-label={t('checkout_close') || 'Close'}>
            <X size={20} />
          </button>

          {/* Header */}
          <div className="checkout-header">
            <div className="checkout-logo">
              <Gem size={24} className="checkout-logo-icon" />
            </div>
            <h2 className="checkout-title">
              {selectedPaymentMethod === 'momo' ? t('checkout_momo_title') : t('checkout_vietqr_title')}
            </h2>
          </div>

          <div className="checkout-pending-content">
            <div className="checkout-qr-section">
              <div className="checkout-qr-wrapper" style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', margin: '0 auto' }}>
                <QRCodeSVG value={paymentData.qrCode || ''} size={200} />
              </div>
              <div className="checkout-qr-amount" style={{ marginTop: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                {paymentData.amount?.toLocaleString('vi-VN')} VND
              </div>
              <p className="checkout-qr-note">
                {selectedPaymentMethod === 'momo'
                  ? t('checkout_momo_note')
                  : t('checkout_vietqr_note')}
              </p>
            </div>

            <div className="checkout-manual-section">
              {paymentData.bin && (
                <div className="checkout-manual-field">
                  <span className="checkout-manual-label">{t('checkout_bank')}:</span>
                  <span className="checkout-manual-value">
                    {BANK_NAMES[paymentData.bin]?.[lang] || `${t('checkout_bank')} (BIN: ${paymentData.bin})`}
                  </span>
                  <button
                    className={`checkout-copy-btn ${copiedField === 'bankName' ? 'copied' : ''}`}
                    onClick={() => handleCopy(BANK_NAMES[paymentData.bin!]?.[lang] || paymentData.bin || '', 'bankName')}
                    title={copiedField === 'bankName' ? t('output_copied') : t('output_copy')}
                  >
                    {copiedField === 'bankName' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              {paymentData.accountNumber && (
                <div className="checkout-manual-field">
                  <span className="checkout-manual-label">{t('checkout_account_number')}:</span>
                  <span className="checkout-manual-value">
                    {paymentData.accountNumber}
                  </span>
                  <button
                    className={`checkout-copy-btn ${copiedField === 'accountNumber' ? 'copied' : ''}`}
                    onClick={() => handleCopy(paymentData.accountNumber || '', 'accountNumber')}
                    title={copiedField === 'accountNumber' ? t('output_copied') : t('output_copy')}
                  >
                    {copiedField === 'accountNumber' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              {paymentData.accountName && (
                <div className="checkout-manual-field">
                  <span className="checkout-manual-label">{t('checkout_account_owner')}:</span>
                  <span className="checkout-manual-value">
                    {paymentData.accountName}
                  </span>
                  <button
                    className={`checkout-copy-btn ${copiedField === 'accountName' ? 'copied' : ''}`}
                    onClick={() => handleCopy(paymentData.accountName || '', 'accountName')}
                    title={copiedField === 'accountName' ? t('output_copied') : t('output_copy')}
                  >
                    {copiedField === 'accountName' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              <div className="checkout-manual-field">
                <span className="checkout-manual-label">{t('checkout_amount')}:</span>
                <span className="checkout-manual-value checkout-manual-amount">
                  {paymentData.amount?.toLocaleString('vi-VN')} VND
                </span>
                <button
                  className={`checkout-copy-btn ${copiedField === 'amount' ? 'copied' : ''}`}
                  onClick={() => handleCopy(paymentData.amount?.toString() || '', 'amount')}
                  title={copiedField === 'amount' ? t('output_copied') : t('output_copy')}
                >
                  {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="checkout-manual-field">
                <span className="checkout-manual-label">{t('checkout_description')}:</span>
                <span className="checkout-manual-value" style={{ textTransform: 'uppercase' }}>
                  {paymentData.description}
                </span>
                <button
                  className={`checkout-copy-btn ${copiedField === 'description' ? 'copied' : ''}`}
                  onClick={() => handleCopy(paymentData.description || '', 'description')}
                  title={copiedField === 'description' ? t('output_copied') : t('output_copy')}
                >
                  {copiedField === 'description' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="checkout-polling">
            <div className="checkout-pulse"></div>
            <span>{t('checkout_waiting') || 'Waiting for payment confirmation...'}</span>
          </div>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <a
              href={paymentData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="checkout-action-button"
              style={{ display: 'inline-flex', textDecoration: 'none', margin: '0' }}
            >
              {selectedPaymentMethod === 'momo' ? t('checkout_momo_action') : t('checkout_payos_action')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Checkout Modal ──────────────────────────────────────────────
  return (
    <div
      className="checkout-backdrop"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="checkout-modal glass-card">
        <button className="checkout-close" onClick={handleClose} aria-label={t('checkout_close') || 'Close'}>
          <X size={20} />
        </button>

        {/* Header */}
        <div className="checkout-header">
          <div className="checkout-logo">
            <Gem size={24} className="checkout-logo-icon" />
          </div>
          <h2 className="checkout-title">{t('checkout_title') || 'Upgrade Your Plan'}</h2>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="checkout-error-box">
            <p>{t(error)}</p>
            <button className="checkout-error-close" onClick={() => setError('')} aria-label={t('checkout_error_close') || 'Close error'}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* 1. Order Summary ──────────────────────────────────────────────────*/}
        <div className="checkout-section">
          <h3 className="checkout-section-title">{t('checkout_order_summary') || 'Order Summary'}</h3>
          <div className="checkout-summary-row">
            <span className="checkout-label">{t('checkout_plan') || 'Plan'}</span>
            <span className="checkout-value">
              <span className={`plan-badge plan-badge--${plan}`}>{planName}</span>
            </span>
          </div>

          <div className="checkout-summary-row">
            <span className="checkout-label">{t('checkout_price') || 'Price'}</span>
            <span className="checkout-value">
              {discountPercent > 0 ? (
                <>
                  <span className="checkout-price-strikethrough">
                    {basePriceVnd.toLocaleString('vi-VN')} VND
                  </span>
                  <span className="checkout-price-discounted">
                    {discountedPriceVnd.toLocaleString('vi-VN')} VND
                  </span>
                </>
              ) : (
                <span>{basePriceVnd.toLocaleString('vi-VN')} VND</span>
              )}
            </span>
          </div>

          {discountPercent > 0 && (
            <div className="checkout-summary-row">
              <span className="checkout-label">{t('checkout_discount') || 'Discount'}</span>
              <span className="checkout-value checkout-discount-badge">-{discountPercent}%</span>
            </div>
          )}

          <div className="checkout-summary-divider"></div>

          <div className="checkout-summary-row checkout-summary-total">
            <span className="checkout-label">{t('checkout_total') || 'Total'}</span>
            <span className="checkout-value">
              <strong>{discountedPriceVnd.toLocaleString('vi-VN')} VND</strong>
            </span>
          </div>
        </div>

        {/* 2. Coupon Section ─────────────────────────────────────────────────*/}
        <div className="checkout-section">
          <h3 className="checkout-section-title">{t('checkout_coupon') || 'Apply Coupon (Optional)'}</h3>
          <div className="checkout-coupon-input-group">
            <input
              type="text"
              value={couponCodeInput}
              onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
              placeholder={t('checkout_coupon_placeholder') || 'Enter coupon code'}
              disabled={couponChecking || !!appliedCoupon}
              className="checkout-coupon-input"
            />
            {!appliedCoupon ? (
              <button
                onClick={handleApplyCoupon}
                disabled={couponChecking || !couponCodeInput.trim()}
                className="checkout-coupon-button checkout-coupon-apply"
              >
                {couponChecking ? (
                  <Loader2 size={16} className="checkout-spinner" />
                ) : (
                  t('checkout_coupon_apply') || 'Apply'
                )}
              </button>
            ) : (
              <button
                onClick={() => {
                  setAppliedCoupon(null);
                  setDiscountPercent(0);
                  setCouponCodeInput('');
                  setPaymentStatus(null);
                  setPaymentData(null);
                  setError('');
                }}
                className="checkout-coupon-button checkout-coupon-remove"
              >
                {t('checkout_coupon_remove') || 'Remove'}
              </button>
            )}
          </div>

          {couponError && <p className="checkout-coupon-error">{t(couponError)}</p>}
          {appliedCoupon && (
            <p className="checkout-coupon-success">
              ✓ {t('checkout_coupon_applied') || `Coupon ${appliedCoupon} applied!`}
            </p>
          )}
        </div>

        {/* 3. Payment Method Selector ────────────────────────────────────────*/}
        {discountPercent < 100 && (
          <div className="checkout-section">
            <h3 className="checkout-section-title">{t('checkout_payment_method') || 'Payment Method'}</h3>
            <div className="checkout-payment-methods">
              {/* MoMo */}
              <label className="checkout-payment-option">
                <input
                  type="radio"
                  name="payment-method"
                  value="momo"
                  checked={selectedPaymentMethod === 'momo'}
                  onChange={() => handlePaymentMethodChange('momo')}
                />
                <div className="checkout-payment-option-content">
                  <div className="checkout-payment-option-label">{t('checkout_momo_label')}</div>
                  <div className="checkout-payment-option-description">
                    {t('checkout_momo_desc')}
                  </div>
                </div>
              </label>

              {/* PayOS VietQR */}
              <label className="checkout-payment-option">
                <input
                  type="radio"
                  name="payment-method"
                  value="payos"
                  checked={selectedPaymentMethod === 'payos'}
                  onChange={() => handlePaymentMethodChange('payos')}
                />
                <div className="checkout-payment-option-content">
                  <div className="checkout-payment-option-label">{t('checkout_vietqr_label')}</div>
                  <div className="checkout-payment-option-description">
                    {t('checkout_vietqr_desc')}
                  </div>
                </div>
              </label>

              {/* Stripe Card */}
              <label className="checkout-payment-option">
                <input
                  type="radio"
                  name="payment-method"
                  value="stripe"
                  checked={selectedPaymentMethod === 'stripe'}
                  onChange={() => handlePaymentMethodChange('stripe')}
                />
                <div className="checkout-payment-option-content">
                  <div className="checkout-payment-option-label">{t('checkout_stripe_label')}</div>
                  <div className="checkout-payment-option-description">
                    {t('checkout_stripe_desc')}
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* 4. Action Button ──────────────────────────────────────────────────*/}
        <button
          onClick={handleProceedToPayment}
          disabled={isProcessing}
          className="checkout-action-button"
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="checkout-spinner" />
              {t('checkout_processing') || 'Processing...'}
            </>
          ) : discountPercent === 100 ? (
            t('checkout_done')
          ) : (
            t('checkout_proceed') || 'Proceed to Payment'
          )}
        </button>

        {/* Payment Status Message */}
        {paymentStatus === 'failed' && (
          <div className="checkout-status-message checkout-status-failed">
            <p>{t('checkout_failed') || 'Payment failed. Please try again.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

