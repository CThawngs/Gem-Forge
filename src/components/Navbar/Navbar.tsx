import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Gem, Menu, X, ChevronDown, CreditCard, LogOut, XCircle, History, Ticket, Activity } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { cancelPlan } from '../../api/payments';
import { supabase } from '../../lib/supabase';
import PlanConfirmationModal from '../PlanConfirmationModal/PlanConfirmationModal';
import './Navbar.css';

const NAV_LINKS = [
  { key: 'nav_features' as const, href: '#features' },
  { key: 'nav_pricing'  as const, href: '#pricing' },
  { key: 'nav_generate' as const, href: '#generator' },
  { key: 'nav_docs'     as const, href: '#results-section' },
];

const PLAN_BADGE_CLASS: Record<string, string> = {
  free: 'plan-badge--free',
  pro: 'plan-badge--pro',
  ultra: 'plan-badge--ultra',
};

export default function Navbar() {
  const { lang, setLang, t, user, setUser, setAuthModal } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const getScrollOffset = () => {
    const navbar = document.querySelector('.navbar') as HTMLElement | null;
    return (navbar?.offsetHeight ?? 64) + 16;
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSelector = (selector: string) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return;

    const targetTop = element.getBoundingClientRect().top + window.scrollY - getScrollOffset();
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  };

  const handleCancelPlan = async () => {
    if (!user || user.plan === 'free') return;
    try {
      setIsCanceling(true);
      await cancelPlan(user.id);
      setUser({ ...user, plan: 'free' });
    } catch (err) {
      console.error('Failed to cancel plan', err);
    } finally {
      setIsCanceling(false);
      setConfirmCancelOpen(false);
      setUserMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Failed to sign out', err);
    }
    setUser(null);
    setUserMenuOpen(false);
    setMobileOpen(false);
  };

  const handleSmoothScroll = (href: string) => {
    setUserMenuOpen(false);
    setMobileOpen(false);

    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => {
        scrollToSelector(href);
      }, 80);
      return;
    }

    scrollToSelector(href);
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setUserMenuOpen(false);
    setMobileOpen(false);

    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => {
        scrollToTop();
      }, 80);
      return;
    }

    scrollToTop();
  };

  return (
    <header className="navbar">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" onClick={handleLogoClick}>
          <Gem size={22} className="navbar-logo-icon" />
          <span className="navbar-logo-text">GemForge</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="navbar-links">
          {NAV_LINKS.filter((link) => link.key !== 'nav_docs' || !!user).map((link) => (
            <button
              key={link.key}
              className="navbar-link"
              onClick={() => handleSmoothScroll(link.href)}
            >
              {t(link.key)}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="navbar-actions">
          {/* Language toggle */}
          <div className="lang-toggle-group">
            <button
              className={`lang-opt ${lang === 'EN' ? 'active' : ''}`}
              onClick={() => setLang('EN')}
              aria-label="English"
            >
              EN
            </button>
            <span className="lang-sep">/</span>
            <button
              className={`lang-opt ${lang === 'VI' ? 'active' : ''}`}
              onClick={() => setLang('VI')}
              aria-label="Vietnamese"
            >
              VI
            </button>
          </div>

          {user ? (
            <div className="user-menu-wrapper">
              <button
                className="user-menu-trigger"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <span className="user-avatar">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <span className={`plan-badge ${PLAN_BADGE_CLASS[user.plan]}`}>
                  {t(`plan_${user.plan}` as const)}
                </span>
                <ChevronDown size={14} className={`user-chevron ${userMenuOpen ? 'open' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="user-dropdown w-full md:w-64">
                  <div className="user-dropdown-email">{user.email}</div>
                  <div className="user-dropdown-divider" />
                  
                  {user.email && user.email.toLowerCase() === 'nguyenchithang2804@gmail.com' && (
                    <>
                      <Link to="/admin/dashboard" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Activity size={14} /> System Tracking
                      </Link>
                      <Link to="/admin/coupons" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Ticket size={14} /> Coupon Admin
                      </Link>
                    </>
                  )}

                  {/* Pro/Ultra Feature: Gem History */}
                  {(user.plan === 'ultra' || user.plan === 'pro') && (
                    <Link to="/history" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                      <History size={14} /> {t('nav_history')}
                    </Link>
                  )}

                  <Link to="/billing" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                    <CreditCard size={14} /> {t('nav_billing')}
                  </Link>
                  
                  <div className="user-dropdown-divider" />
                  {user.plan !== 'free' && (
                    <button 
                      className="user-dropdown-item" 
                      onClick={() => setConfirmCancelOpen(true)} 
                      disabled={isCanceling}
                      style={{ color: 'var(--danger)' }}
                    >
                      <XCircle size={14} /> {isCanceling ? t('nav_canceling') : t('nav_cancel_plan')}
                    </button>
                  )}
                  <button className="user-dropdown-item user-dropdown-logout" onClick={handleLogout}>
                    <LogOut size={14} /> {t('nav_logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-buttons">
              <button className="btn btn-ghost auth-btn" onClick={() => setAuthModal('login')}>
                {t('nav_login')}
              </button>
              <button className="btn btn-accent auth-btn" onClick={() => setAuthModal('signup')}>
                {t('nav_signup')}
              </button>
            </div>
          )}
        </div>

        {/* Mobile controls */}
        <div className="navbar-mobile-controls">
          <div className="lang-toggle-group">
            <button
              className={`lang-opt ${lang === 'EN' ? 'active' : ''}`}
              onClick={() => setLang('EN')}
              aria-label="English"
            >
              EN
            </button>
            <span className="lang-sep">/</span>
            <button
              className={`lang-opt ${lang === 'VI' ? 'active' : ''}`}
              onClick={() => setLang('VI')}
              aria-label="Vietnamese"
            >
              VI
            </button>
          </div>
          <button
            className="navbar-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t('nav_toggle_menu')}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="navbar-mobile-menu">
          {NAV_LINKS.filter((link) => link.key !== 'nav_docs' || !!user).map((link) => (
            <button
              key={link.key}
              className="navbar-mobile-link"
              onClick={() => handleSmoothScroll(link.href)}
            >
              {t(link.key)}
            </button>
          ))}

          {user && (
            <div className="navbar-mobile-account glass-card">
              <div className="navbar-mobile-account-header">
                <div className="navbar-mobile-account-id">
                  <span className="user-avatar">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                  <div className="navbar-mobile-account-copy">
                    <span className="navbar-mobile-account-email">{user.email}</span>
                    <span className={`plan-badge ${PLAN_BADGE_CLASS[user.plan]}`}>
                      {t(`plan_${user.plan}` as const)}
                    </span>
                  </div>
                </div>
              </div>

              {user.email && user.email.toLowerCase() === 'nguyenchithang2804@gmail.com' && (
                <>
                  <Link
                    to="/admin/dashboard"
                    className="navbar-mobile-account-link"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Activity size={14} /> System Tracking
                  </Link>
                  <Link
                    to="/admin/coupons"
                    className="navbar-mobile-account-link"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Ticket size={14} /> Coupon Admin
                  </Link>
                </>
              )}

              {(user.plan === 'ultra' || user.plan === 'pro') && (
                <Link
                  to="/history"
                  className="navbar-mobile-account-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <History size={14} /> {t('nav_history')}
                </Link>
              )}

              <Link
                to="/billing"
                className="navbar-mobile-account-link"
                onClick={() => setMobileOpen(false)}
              >
                <CreditCard size={14} /> {t('nav_billing')}
              </Link>

              {user.plan !== 'free' && (
                <button
                  className="navbar-mobile-account-link navbar-mobile-account-link--danger"
                  onClick={() => setConfirmCancelOpen(true)}
                  disabled={isCanceling}
                >
                  <XCircle size={14} /> {isCanceling ? t('nav_canceling') : t('nav_cancel_plan')}
                </button>
              )}

              <button
                className="navbar-mobile-account-link navbar-mobile-account-link--logout"
                onClick={handleLogout}
              >
                <LogOut size={14} /> {t('nav_logout')}
              </button>
            </div>
          )}

          {!user && (
            <div className="mobile-auth-buttons">
              <button className="btn btn-ghost" onClick={() => { setAuthModal('login'); setMobileOpen(false); }}>
                {t('nav_login')}
              </button>
              <button className="btn btn-accent" onClick={() => { setAuthModal('signup'); setMobileOpen(false); }}>
                {t('nav_signup')}
              </button>
            </div>
          )}
        </div>
      )}
      <PlanConfirmationModal
        isOpen={confirmCancelOpen}
        isProcessing={isCanceling}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={handleCancelPlan}
      />
      </header>
      );
      }
