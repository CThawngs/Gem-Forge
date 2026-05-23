import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useApp } from '../../hooks/useApp';
import './PlanConfirmationModal.css';

interface PlanConfirmationModalProps {
  isOpen: boolean;
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PlanConfirmationModal({
  isOpen,
  isProcessing = false,
  onCancel,
  onConfirm,
}: PlanConfirmationModalProps) {
  const { t } = useApp();

  if (!isOpen) return null;

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing) onCancel();
  };

  return createPortal(
    <div className="plan-confirm-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true">
      <div className="plan-confirm-modal glass-card">
        <div className="plan-confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <h2 className="plan-confirm-title">{t('plan_confirm_title')}</h2>
        <p className="plan-confirm-message">
          {t('plan_confirm_message')}
        </p>
        <div className="plan-confirm-actions">
          <button
            className="btn btn-ghost plan-confirm-btn"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {t('plan_confirm_cancel')}
          </button>
          <button
            className="btn btn-cta plan-confirm-btn"
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? t('plan_confirm_processing') : t('plan_confirm_confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
