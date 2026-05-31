import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Lock, Sparkles, MessageSquare, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { diffWords } from 'diff';
import { useApp } from '../../hooks/useApp';
import type { RevisionMessage } from '../../context/AppContextBase';
import { reviseWithOpenRouter } from '../../api/revise';
import { deductRevisionToken, updateGeneration } from '../../api/generations';
import { supabase } from '../../lib/supabase';
import './RevisionChat.css';

interface RevisionChatProps {
  tabId: string;          // 'description' | 'instructions'
  tabContent: string;     // current content of the active tab
  onContentUpdate: (newContent: string) => void;
  onPendingChange?: (isPending: boolean) => void;
}

// ── Diff Viewer Component ──────────────────────────────────────────────────────
function DiffViewer({
  original,
  revised,
  onAccept,
  onReject,
}: {
  original: string;
  revised: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useApp();
  const changes = diffWords(original, revised);

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <h4 className="diff-title">{t('diff_proposed_title')}</h4>
        <p className="diff-subtitle">{t('diff_proposed_subtitle')}</p>
      </div>

      <div className="diff-content">
        {changes.map((part, i) => {
          if (part.added) {
            return (
              <span key={i} className="bg-green-500/20 text-green-400 whitespace-pre-wrap break-words">
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span key={i} className="bg-red-500/20 text-red-400 line-through whitespace-pre-wrap break-words">
                {part.value}
              </span>
            );
          }
          return <span key={i} className="whitespace-pre-wrap break-words">{part.value}</span>;
        })}
      </div>

      <div className="diff-actions flex-col sm:flex-col md:flex-row">
        <button
          className="diff-btn diff-btn--accept"
          onClick={onAccept}
          title={t('diff_accept_title')}
        >
          <Check size={16} />
          <span>{t('diff_accept')}</span>
        </button>
        <button
          className="diff-btn diff-btn--reject"
          onClick={onReject}
          title={t('diff_reject_title')}
        >
          <X size={16} />
          <span>{t('diff_reject')}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Expandable Message Component ────────────────────────────────────────────
const TRUNCATE_LENGTH = 200;

function ExpandableMessage({ msg }: { msg: RevisionMessage }) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const isTruncatable = msg.content.length > TRUNCATE_LENGTH;
  const displayContent = isTruncatable && !expanded
    ? msg.content.substring(0, TRUNCATE_LENGTH)
    : msg.content;

  return (
    <div className={`revision-msg revision-msg--${msg.role}`}>
      {msg.role === 'assistant' && (
        <span className="revision-msg-icon"><Sparkles size={10} /></span>
      )}
      <div className="revision-msg-content-wrap">
        <p className="revision-msg-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {displayContent}{isTruncatable && !expanded ? '…' : ''}
        </p>
        {isTruncatable && (
          <button
            className="revision-expand-btn"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? t('revision_show_less') : t('revision_show_more')}
          >
            {expanded ? (
              <><ChevronUp size={12} /> {t('revision_show_less')}</>
            ) : (
              <><ChevronDown size={12} /> {t('revision_show_more')}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RevisionChat({ tabId, tabContent, onContentUpdate, onPendingChange }: RevisionChatProps) {
  const {
    t, user, setRevisionTurns,
    revisionHistory, setRevisionHistory, currentGemId,
    revisionTokensLeft, setRevisionTokensLeft,
    revisionResetAt, setRevisionResetAt
  } = useApp();
  const [inputText, setInputText] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [pendingRevision, setPendingRevisionState] = useState<string | null>(null);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [timeLeftString, setTimeLeftString] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const syncTokensFromDB = useCallback(async () => {
    if (!currentGemId || !user) return;
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('revision_tokens_left, revision_reset_at')
        .eq('id', currentGemId)
        .eq('user_id', user.id)
        .single();
      if (!error && data) {
        const limit = user.plan === 'pro' ? 10 : 20;
        const tokens = Math.min(data.revision_tokens_left ?? limit, limit);
        setRevisionTokensLeft(tokens);
        setRevisionTurns(limit - tokens);
        setRevisionResetAt(data.revision_reset_at || null);
      }
    } catch (err) {
      console.error('Failed to sync tokens from DB:', err);
    }
  }, [currentGemId, user, setRevisionTokensLeft, setRevisionTurns, setRevisionResetAt]);

  useEffect(() => {
    syncTokensFromDB();
  }, [syncTokensFromDB]);

  const setPendingRevision = (val: string | null) => {
    setPendingRevisionState(val);
    if (onPendingChange) onPendingChange(!!val);
  };

  const isLocked = !user || user.plan === 'free';
  const isCooldownActive = !!revisionResetAt && new Date(revisionResetAt).getTime() > Date.now();
  const isExhausted = revisionTokensLeft === 0 || isCooldownActive;
  const history: RevisionMessage[] = revisionHistory[tabId] ?? [];
  const planLimit = user?.plan === 'pro' ? 10 : 20;

  useEffect(() => {
    if (!revisionResetAt) {
      setTimeLeftString('');
      return;
    }

    const targetTime = new Date(revisionResetAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeftString('');
        const limit = user?.plan === 'pro' ? 10 : 20;
        setRevisionTokensLeft(limit);
        setRevisionResetAt(null);
        setToast({ type: 'success', message: t('revision_cooldown_reset_toast') });
        
        if (currentGemId && user) {
          supabase
            .from('generations')
            .update({
              revision_tokens_left: limit,
              revision_reset_at: null
            })
            .eq('id', currentGemId)
            .eq('user_id', user.id)
            .then(({ error }) => {
              if (error) console.error('Failed to reset cooldown in database:', error);
            });
        }
        return true; // finished
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (num: number) => String(num).padStart(2, '0');
      setTimeLeftString(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      return false; // not finished
    };

    const isFinished = updateTimer();
    if (isFinished) return;

    const interval = setInterval(() => {
      updateTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [revisionResetAt, user?.plan, currentGemId, setRevisionTokensLeft, setRevisionResetAt]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [revisionHistory, tabId, isRevising, pendingRevision]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isRevising || isExhausted || pendingRevision) return;

    // Capture selected text from the page
    const selectedText = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() || '' : '';

    const updatedHistory: RevisionMessage[] = [
      ...history,
      { role: 'user', content: text },
    ];

    // Optimistically update history & clear input
    setRevisionHistory({ ...revisionHistory, [tabId]: updatedHistory });
    setInputText('');
    setIsRevising(true);
    setRevisionError(null);
    setPendingRevision(null);

    try {
      // Call OpenRouter API for revision
      const revised = await reviseWithOpenRouter({
        currentContent: tabContent,
        activeTab: tabId,
        userPrompt: text,
        chatHistory: updatedHistory,
        selectedText: selectedText || undefined,
      });

      // Deduct revision token immediately after successful AI call
      if (currentGemId && user) {
        try {
          const newTokensLeft = await deductRevisionToken(currentGemId, user.id);
          setRevisionTokensLeft(newTokensLeft);
          setRevisionTurns(planLimit - newTokensLeft);

          if (newTokensLeft === 0) {
            const resetAtDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
            await supabase
              .from('generations')
              .update({ revision_reset_at: resetAtDate })
              .eq('id', currentGemId)
              .eq('user_id', user.id);
            setRevisionResetAt(resetAtDate);
          }
        } catch (tokenErr: unknown) {
          console.error('Failed to deduct revision token:', tokenErr);
          const message = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
          setRevisionError(`${t('revision_token_error_prefix')}${message}`);
          
          const fallbackTokens = Math.max(0, revisionTokensLeft - 1);
          setRevisionTokensLeft(fallbackTokens);
          setRevisionTurns(planLimit - fallbackTokens);
        }
      } else {
        // Fallback for when no gem ID is set (local only)
        const fallbackTokens = Math.max(0, revisionTokensLeft - 1);
        setRevisionTokensLeft(fallbackTokens);
        setRevisionTurns(planLimit - fallbackTokens);
      }

      // Store revised content in pendingRevision (do NOT update main content yet)
      setPendingRevision(revised);

      // Add assistant message to history
      const finalHistory: RevisionMessage[] = [
        ...updatedHistory,
        { role: 'assistant', content: t('revision_proposed') },
      ];
      setRevisionHistory({ ...revisionHistory, [tabId]: finalHistory });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Revision error:', err);
      setRevisionError(message || t('revision_failed'));
      
      // Still add to history so user sees the error
      const finalHistory: RevisionMessage[] = [
        ...updatedHistory,
        { role: 'assistant', content: `${t('revision_error_prefix')}${message}` },
      ];
      setRevisionHistory({ ...revisionHistory, [tabId]: finalHistory });
    } finally {
      setIsRevising(false);
    }
  };

  const handleAcceptRevision = async () => {
    if (!pendingRevision || !currentGemId || !user) return;

    // Update main content with revised version
    onContentUpdate(pendingRevision);

    // Save updated content to Supabase
    try {
      const updatedContent: Record<string, string> = {};
      updatedContent[tabId] = pendingRevision;
      await updateGeneration(currentGemId, user.id, updatedContent);
      await syncTokensFromDB();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to save revision:', err);
      setRevisionError(`${t('revision_save_error_prefix')}${message}`);
    }

    // Clear pending revision
    setPendingRevision(null);
    setRevisionError(null);
  };

  const handleRejectRevision = async () => {
    // Discard the pending revision without updating content
    setPendingRevision(null);
    setRevisionError(null);
    await syncTokensFromDB();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Paywall state ─────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="revision-paywall">
        <div className="revision-paywall-icon">
          <Lock size={20} />
        </div>
        <h4 className="revision-paywall-title">{t('revision_locked_title')}</h4>
        <p className="revision-paywall-desc">{t('revision_locked_desc')}</p>
        <button
          className="btn btn-accent revision-paywall-cta"
          onClick={() => {
            document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          {t('revision_locked_cta')}
        </button>
      </div>
    );
  }

  const turnsLeft = revisionTokensLeft !== null ? Math.min(revisionTokensLeft, planLimit) : planLimit;

  return (
    <div className="revision-chat">
      {/* Header with token counter */}
      <div className="revision-header">
        <div className="revision-title-row">
          <MessageSquare size={14} />
          <span className="revision-title">{t('revision_title')}</span>
        </div>
        <div className={`revision-counter ${turnsLeft <= 5 ? 'revision-counter--warn' : ''}`}>
          <Sparkles size={11} />
          <span>
            {t('revision_counter')}: <strong>{turnsLeft}/{planLimit}</strong> {t('revision_left')}
          </span>
        </div>
      </div>

      {/* Exhausted banner */}
      {isExhausted && (
        <div className="revision-exhausted">
          {isCooldownActive ? (
            <>
              <div className="revision-cooldown-timer font-bold mb-1">
                {t('revision_cooldown_active').replace('{time}', timeLeftString)}
              </div>
              <div className="revision-cooldown-desc opacity-90">
                {t('revision_cooldown_desc').replace('{time}', timeLeftString)}
              </div>
            </>
          ) : (
            t('revision_exhausted')
          )}
        </div>
      )}

      {/* Diff Viewer (when revision pending) */}
      {pendingRevision && (
        <DiffViewer
          original={tabContent}
          revised={pendingRevision}
          onAccept={handleAcceptRevision}
          onReject={handleRejectRevision}
        />
      )}

      {/* Error message */}
      {revisionError && (
        <div className="revision-error">
          <p>{revisionError}</p>
          <button
            className="revision-error-dismiss"
            onClick={() => setRevisionError(null)}
          >
            {t('diff_dismiss')}
          </button>
        </div>
      )}

      {/* Chat messages */}
      {history.length > 0 && !pendingRevision && (
        <div className="revision-messages">
          {history.map((msg, i) => (
            <ExpandableMessage key={i} msg={msg} />
          ))}
          {isRevising && (
            <div className="revision-msg revision-msg--assistant revision-msg--thinking">
              <span className="revision-msg-icon"><Sparkles size={10} /></span>
              <span className="revision-thinking-dots">
                <span /><span /><span />
              </span>
              <p className="revision-msg-content">{t('revision_thinking')}</p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="revision-input-row">
        <textarea
          className="revision-input"
          placeholder={isExhausted ? t('revision_exhausted') : t('revision_ph')}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isRevising || isExhausted || !!pendingRevision}
        />
        <button
          className={`revision-send-btn ${isRevising || !inputText.trim() || isExhausted || pendingRevision ? 'revision-send-btn--disabled' : ''}`}
          onClick={handleSend}
          disabled={isRevising || !inputText.trim() || isExhausted || !!pendingRevision}
          aria-label={t('revision_send')}
        >
          <Send size={14} />
        </button>
      </div>
      {toast && (
        <div className={`revision-toast revision-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
