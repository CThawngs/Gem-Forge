import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import { AppProvider } from './context/AppContext';
import { useApp } from './hooks/useApp';
import { X } from 'lucide-react';
import { supabase } from './lib/supabase';
import Navbar from './components/Navbar/Navbar';
import Hero from './components/Hero/Hero';
import WhatIsGem from './components/WhatIsGem/WhatIsGem';
import PricingCards from './components/PricingCards/PricingCards';
import Generator from './components/Generator/Generator';
import ResultsTabs from './components/OutputCards/OutputCards';
import Footer from './components/Footer/Footer';
import AuthModal from './components/AuthModal/AuthModal';
import CheckoutModal from './components/CheckoutModal/CheckoutModal';
import HistoryPage from './components/HistoryPage/HistoryPage';
import BillingPage from './components/BillingPage/BillingPage';
import AdminCouponsPage from './pages/admin/coupons/page';
import AdminDashboardPage from './pages/admin/dashboard/page';


// ─── Home Page ────────────────────────────────────────────────────────────────

function HomePage() {
  const { authModal, checkoutOpen } = useApp();

  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Hero />
        <WhatIsGem />
        <PricingCards />
        <Generator />
        <ResultsTabs />
      </main>
      <Footer />

      {/* Global modals — rendered outside main layout */}
      {authModal && <AuthModal />}
      {checkoutOpen && <CheckoutModal />}
    </div>
  );
}

// ─── Global Expiration Toast ──────────────────────────────────────────────────

function GlobalToast() {
  const { planExpiredAlert, setPlanExpiredAlert, t } = useApp();

  if (!planExpiredAlert) return null;

  return (
    <div className="plan-expired-toast">
      <span>{t('subscription_expired_toast')}</span>
      <button 
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          padding: '2px',
          marginLeft: '8px',
          display: 'inline-flex',
          alignItems: 'center'
        }}
        onClick={() => setPlanExpiredAlert(false)}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ─── Analytics Pageview Tracker ───────────────────────────────────────────────

function AnalyticsTracker() {
  const location = useLocation();
  const { user } = useApp();

  useEffect(() => {
    const trackPageVisit = async () => {
      try {
        let visitorId = localStorage.getItem('gemforge_visitor_id');
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem('gemforge_visitor_id', visitorId);
        }

        await supabase.from('page_visits').insert({
          visitor_id: visitorId,
          email: user?.email || null,
          path: location.pathname,
          user_agent: navigator.userAgent
        });
      } catch (err) {
        console.error('Failed to log page visit:', err);
      }
    };

    void trackPageVisit();
  }, [location.pathname, user?.email]);

  return null;
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AppProvider>
      <GlobalToast />
      <AnalyticsTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin/coupons" element={<AdminCouponsPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        {/* Catch-all: redirect unknown routes to home */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </AppProvider>
  );
}
