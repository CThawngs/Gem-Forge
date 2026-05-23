import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { cancelPlan } from '../../api/payments';
import PlanConfirmationModal from '../PlanConfirmationModal/PlanConfirmationModal';
import './PricingCards.css';

type PlanId = 'free' | 'pro' | 'ultra';

export default function PricingCards() {
  const { t, lang, user, setUser, setAuthModal, setPendingCheckoutPlan, setCheckoutOpen } = useApp();
  const [isCanceling, setIsCanceling] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<PlanId | null>(null);

  const currentPlan = user?.plan || 'free';

  const isVI = lang === 'VI';

  const plans = [
    {
      id: 'free' as const,
      name: 'Free',
      price: isVI ? '0đ' : '$0',
      period: isVI ? '/tháng' : '/mo',
      features: [
        t('pricing_feat_free_1'),
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: isVI ? '115.000đ' : '$4.99',
      period: isVI ? '/tháng' : '/mo',
      features: [
        t('pricing_feat_pro_1'),
        t('pricing_feat_pro_2'),
        t('pricing_feat_pro_3'),
      ],
      popular: true,
    },
    {
      id: 'ultra' as const,
      name: 'Ultra',
      price: isVI ? '345.000đ' : '$14.99',
      period: isVI ? '/tháng' : '/mo',
      features: [
        t('pricing_feat_ultra_1'),
        t('pricing_feat_ultra_2'),
        t('pricing_feat_ultra_3'),
        t('pricing_feat_ultra_4'),
      ],
    },
  ];

  const handleActionClick = (planId: PlanId) => {
    if (!user) {
      if (planId === 'free') return;
      setPendingCheckoutPlan(planId as 'pro' | 'ultra');
      setAuthModal('signup');
      return;
    }

    if (planId === currentPlan) return;

    setConfirmPlan(planId);
  };

  const handleConfirmPlanChange = async () => {
    if (!user || !confirmPlan || confirmPlan === currentPlan) {
      setConfirmPlan(null);
      return;
    }

    if (confirmPlan === 'free' && currentPlan !== 'free') {
      try {
        setIsCanceling(true);
        await cancelPlan(user.id);
        setUser({ ...user, plan: 'free' });
      } catch (err) {
        console.error('Failed to cancel plan', err);
      } finally {
        setIsCanceling(false);
        setConfirmPlan(null);
      }
      return;
    }

    // Upgrade or Downgrade
    setPendingCheckoutPlan(confirmPlan as 'pro' | 'ultra');
    setCheckoutOpen(true);
    setConfirmPlan(null);
  };

  const getButtonText = (planId: PlanId) => {
    if (planId === currentPlan) return t('pricing_current');
    if (planId === 'free') return t('pricing_cancel_to_free');
    if (planId === 'pro' && currentPlan === 'ultra') return t('pricing_downgrade_pro');
    if (planId === 'ultra') return t('pricing_upgrade_ultra');
    return t('pricing_upgrade_pro');
  };

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <div className="pricing-grid grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, i) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <div
                key={plan.id}
                className={`pricing-card glass-card animate-fade-in animate-delay-${i + 1} ${
                  plan.popular ? 'pricing-card--popular' : ''
                }`}
              >
                {plan.popular && (
                  <span className="pricing-badge">{t('pricing_popular')}</span>
                )}
                <h3 className={`pricing-name ${plan.popular ? 'pricing-name--accent' : ''}`}>
                  {plan.name}
                </h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{plan.price}</span>
                  <span className="pricing-period">{plan.period}</span>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((f) => (
                    <li key={f} className="pricing-feature">
                      <Check size={16} className="pricing-check" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`btn pricing-cta ${
                    plan.popular
                      ? 'btn-accent'
                      : isCurrent
                      ? 'btn-ghost'
                      : 'btn-ghost'
                  }`}
                  onClick={() => handleActionClick(plan.id)}
                  disabled={isCurrent || (plan.id === 'free' && isCanceling)}
                >
                  {plan.id === 'free' && isCanceling ? t('pricing_canceling') : getButtonText(plan.id)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <PlanConfirmationModal
        isOpen={confirmPlan !== null}
        isProcessing={isCanceling}
        onCancel={() => setConfirmPlan(null)}
        onConfirm={handleConfirmPlanChange}
      />
    </section>
  );
}
