import { useState, useEffect, useRef } from 'react';
import { X, Gem, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { supabase } from '../../lib/supabase';
import { sendWelcomeEmail } from '../../api/email';
import type { Plan } from '../../context/AppContextBase';
import './AuthModal.css';

function normalizePlan(plan: unknown): Plan {
  return plan === 'pro' || plan === 'ultra' ? plan : 'free';
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export default function AuthModal() {
  const {
    t, authModal, setAuthModal,
    setUser, pendingCheckoutPlan, setCheckoutOpen
  } = useApp();

  const isLogin = authModal === 'login';
  const isForgot = authModal === 'forgot';
  const isReset = authModal === 'reset';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [cooldownTime, setCooldownTime] = useState(0);
  const cooldownRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = (seconds: number) => {
    setCooldownTime(seconds);
    cooldownRef.current = seconds;
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(() => {
      if (cooldownRef.current <= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCooldownTime(0);
        cooldownRef.current = 0;
        setError('');
      } else {
        const nextVal = cooldownRef.current - 1;
        setCooldownTime(nextVal);
        cooldownRef.current = nextVal;
        setError(t('auth_rate_limit').replace('{time}', String(nextVal)));
      }
    }, 1000);
    
    setError(t('auth_rate_limit').replace('{time}', String(seconds)));
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!authModal) return null;

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setAuthModal(null);
  };

  const handleSubmit = async () => {
    if (loading) return;

    setError('');
    setSuccessMessage('');

    if (isForgot) {
      if (!email.trim()) {
        setError(t('auth_err_fill'));
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError(t('auth_err_email'));
        return;
      }
      setLoading(true);
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + '/',
        });
        if (resetError) {
          const isRateLimit = (resetError as any).status === 429 || 
            resetError.message.includes('429') || 
            resetError.message.toLowerCase().includes('rate limit') || 
            resetError.message.toLowerCase().includes('too many requests');
          if (isRateLimit) {
            startCooldown(60);
          } else {
            setError(resetError.message);
          }
        } else {
          setSuccessMessage(t('auth_forgot_success'));
        }
      } catch (err) {
        setError(getErrorMessage(err, t('auth_err_generic')));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isReset) {
      if (!password.trim() || password.length < 6) {
        setError(t('auth_err_pw'));
        return;
      }
      setLoading(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          setError(updateError.message);
        } else {
          setSuccessMessage(t('auth_reset_success'));
          setTimeout(() => {
            setAuthModal(null);
            setSuccessMessage('');
            setPassword('');
          }, 2000);
        }
      } catch (err) {
        setError(getErrorMessage(err, t('auth_err_generic')));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError(t('auth_err_fill'));
      return;
    }
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError(t('auth_err_email'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth_err_pw'));
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        // Real Supabase Login flow
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) {
          if (authError.message.includes('Invalid login credentials')) {
             setError(t('auth_err_invalid_credentials'));
          } else {
             setError(authError.message);
          }
          return;
        }

        // Fetch user plan from our custom public.users table
        const { data: userData } = await supabase
          .from('users')
          .select('current_plan, daily_usage')
          .eq('id', data.user.id)
          .maybeSingle();

        setUser({
          id: data.user.id,
          email: data.user.email || '',
          plan: normalizePlan(userData?.current_plan),
          dailyUsage: userData?.daily_usage || 0,
        });
      } else {
        // Explicitly check for existing email
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();

        if (existingUser) {
          setError(t('auth_err_email_registered'));
          return;
        }

        // Real Supabase Signup flow
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (authError) {
          if (authError.message.includes('User already registered')) {
            setError(t('auth_err_email_in_use'));
          } else {
            setError(authError.message);
          }
          return;
        }

        if (!data.user) {
          setError(t('auth_err_create_user'));
          return;
        }

        // Add user to custom public.users table
        const { error: insertError } = await supabase
          .from('users')
          .insert([
            { id: data.user.id, current_plan: 'free', daily_usage: 0 }
          ]);

        if (insertError) {
          console.error('Error inserting user to public table:', insertError);
        }

        // Send Welcome Email
        if (data.user.email) {
          // Fire and forget, don't await to not block UI
          sendWelcomeEmail(data.user.email).catch(console.error);
        }

        setUser({
          id: data.user.id,
          email: data.user.email || '',
          plan: 'free',
          dailyUsage: 0,
        });
      }

      // Success: close modal and proceed with checkout if pending
      setAuthModal(null);
      if (pendingCheckoutPlan) {
        setTimeout(() => {
          setCheckoutOpen(true);
        }, 300);
      }
    } catch (err: unknown) {
      console.error('Auth error:', err);
      setError(getErrorMessage(err, t('auth_err_generic')));
    } finally {
      // CRITICAL: Always unlock the button, regardless of success or error
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const getTitle = () => {
    if (isForgot) return t('auth_forgot_title');
    if (isReset) return t('auth_reset_title');
    return isLogin ? t('auth_welcome') : t('auth_create');
  };

  const getSubtitle = () => {
    if (isForgot) return t('auth_forgot_subtitle');
    if (isReset) return t('auth_reset_subtitle');
    return isLogin ? t('auth_subtitle_login') : t('auth_subtitle_signup');
  };

  return (
    <div className="auth-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true">
      <div className="auth-modal glass-card">
        <button className="auth-close" onClick={() => setAuthModal(null)} aria-label={t('auth_close')}>
          <X size={18} />
        </button>

        {/* Logo */}
        <div className="auth-logo">
          <Gem size={24} className="auth-logo-icon" />
        </div>

        {/* Title */}
        <h2 className="auth-title">
          {getTitle()}
        </h2>
        <p className="auth-subtitle">
          {getSubtitle()}
        </p>

        {/* Error */}
        {error && <div className="auth-error">{error}</div>}

        {/* Success Message */}
        {successMessage && <div className="auth-success">{successMessage}</div>}

        {/* Email */}
        {!isReset && (
          <div className="auth-field">
            <label className="field-label" htmlFor="auth-email">
              {t('auth_email')}
            </label>
            <div className="auth-input-wrap">
              <Mail size={15} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                className="input-field auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="email"
                disabled={(isForgot && !!successMessage) || cooldownTime > 0}
              />
            </div>
          </div>
        )}

        {/* Password */}
        {!isForgot && (
          <div className="auth-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="field-label" htmlFor="auth-password" style={{ marginBottom: 0 }}>
                {t('auth_password')}
              </label>
              {isLogin && (
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => {
                    setError('');
                    setSuccessMessage('');
                    setAuthModal('forgot');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 600
                  }}
                >
                  {t('auth_forgot_password_link')}
                </button>
              )}
            </div>
            <div className="auth-input-wrap">
              <Lock size={15} className="auth-input-icon" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                className="input-field auth-input"
                placeholder={t('auth_pw_min')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                style={{ paddingRight: '40px' }}
                disabled={isReset && !!successMessage}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={t('auth_toggle_password')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}

        {/* CTA */}
        {(!successMessage || !isForgot) && (
          <button
            className="btn btn-accent auth-cta"
            onClick={handleSubmit}
            disabled={loading || (isReset && !!successMessage) || cooldownTime > 0}
          >
            {loading
              ? t('auth_waiting')
              : isForgot ? t('auth_forgot_send')
              : isReset ? t('auth_reset_button')
              : isLogin ? t('auth_signin') : t('auth_create_account')
            }
          </button>
        )}

        {/* Plan note for signup */}
        {!(isForgot || isReset) && !isLogin && (
          <p className="auth-plan-note">✓ {t('auth_plan_text')}</p>
        )}

        {/* Toggle */}
        <div className="auth-toggle">
          {isForgot ? (
            <button
              className="auth-toggle-link"
              onClick={() => {
                setError('');
                setSuccessMessage('');
                setAuthModal('login');
              }}
              style={{ marginLeft: 0 }}
            >
              {t('auth_back_to_login')}
            </button>
          ) : isReset ? (
            <button
              className="auth-toggle-link"
              onClick={() => {
                setError('');
                setSuccessMessage('');
                setAuthModal('login');
              }}
              style={{ marginLeft: 0 }}
            >
              {t('auth_back_to_login')}
            </button>
          ) : (
            <>
              {isLogin ? t('auth_no_account') : t('auth_have_account')}{' '}
              <button
                className="auth-toggle-link"
                onClick={() => {
                  setError('');
                  setSuccessMessage('');
                  setAuthModal(isLogin ? 'signup' : 'login');
                }}
              >
                {isLogin ? t('nav_signup') : t('auth_signin')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
