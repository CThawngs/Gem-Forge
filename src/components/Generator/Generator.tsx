import { useState, useRef, useEffect } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import type { GenerationOutput } from '../../context/AppContextBase';
import OtherSelect from '../OtherSelect/OtherSelect';
import { checkUsageLimit } from '../../api/limits';
import { fetchGenerationById, saveGeneration } from '../../api/generations';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './Generator.css';

// ─── Field State ──────────────────────────────────────────────────────────────

interface GeneratorInput {
  mainGoal: string;
  expertRole: string;
  targetAudience: string;
  toneOfVoice: string;
  toneOfVoiceOther: string;
  outputFormat: string;
  outputFormatOther: string;
  constraints: string;
}

const INITIAL_INPUT: GeneratorInput = {
  mainGoal: '',
  expertRole: '',
  targetAudience: '',
  toneOfVoice: 'tone_formal',
  toneOfVoiceOther: '',
  outputFormat: 'fmt_markdown',
  outputFormatOther: '',
  constraints: '',
};

// Required fields for validation
const REQUIRED_FIELDS: (keyof GeneratorInput)[] = ['mainGoal', 'expertRole', 'targetAudience'];

// ─── Language Detection ──────────────────────────────────────────────────────────

function detectLanguage(text: string): 'EN' | 'VI' {
  const viChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẴẶÈÉẸẺẼÊỀẾỆỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨỪỨỨỨỨ]/
  return viChars.test(text) ? 'VI' : 'EN';
}

// ─── Rate Limit Error ─────────────────────────────────────────────────────────

class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super('rate_limit');
    this.retryAfter = retryAfter;
    this.name = 'RateLimitError';
  }
}

// ─── OpenRouter Generation (via Backend API) ───────────────────────────────────

async function generateWithOpenRouter(
  input: GeneratorInput,
  lang: 'EN' | 'VI'
): Promise<GenerationOutput> {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, lang, outputFormat: input.outputFormat }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      throw new RateLimitError(errorData.retryAfter || 30);
    }
    throw new Error(errorData.error || errorData.details || `Server error: ${response.statusText}`);
  }

  return response.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Generator() {
  const {
    t,
    setOutput,
    setIsGenerating,
    user,
    setAuthModal,
    setCurrentGemId,
    setRevisionTurns,
    setRevisionHistory,
    setRevisionTokensLeft,
    setRevisionResetAt,
  } = useApp();
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState<GeneratorInput>(INITIAL_INPUT);
  const [errors, setErrors] = useState<Partial<Record<keyof GeneratorInput, string>>>({});
  const [authError, setAuthError] = useState<string>('');
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState<number>(0);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);
  const rateLimitRetryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (authError !== 'gen_err_limit_exceeded') return;

    const calculateSeconds = () => {
      const now = new Date();
      const nextUtcReset = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      return Math.max(0, Math.floor((nextUtcReset.getTime() - now.getTime()) / 1000));
    };

    setCooldownTimeLeft(calculateSeconds());

    const timer = setInterval(() => {
      const remaining = calculateSeconds();
      setCooldownTimeLeft(remaining);
      if (remaining <= 0) {
        setAuthError('');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [authError]);

  const formatDuration = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const [isHydratingEdit, setIsHydratingEdit] = useState(false);
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const editId = searchParams.get('editId');
  const userId = user?.id;
  const hydrationRef = useRef({
    setCurrentGemId,
    setOutput,
    setRevisionTurns,
    setRevisionHistory,
    setRevisionTokensLeft,
    setRevisionResetAt,
  });

  useEffect(() => {
    hydrationRef.current = {
      setCurrentGemId,
      setOutput,
      setRevisionTurns,
      setRevisionHistory,
      setRevisionTokensLeft,
      setRevisionResetAt,
    };
  }, [setCurrentGemId, setOutput, setRevisionHistory, setRevisionTurns, setRevisionTokensLeft, setRevisionResetAt]);



  // Handle editing existing gem from history
  useEffect(() => {
    if (!editId || !userId) return;

    let isActive = true;

    const hydrateEditedGem = async () => {
      setIsHydratingEdit(true);
      setAuthError('');

      try {
        const generation = await fetchGenerationById(editId, userId);
        if (!isActive) return;

        const {
          setCurrentGemId,
          setOutput,
          setRevisionTurns,
          setRevisionHistory,
          setRevisionTokensLeft,
          setRevisionResetAt,
        } = hydrationRef.current;

        const planLimit = user?.plan === 'pro' ? 10 : 20;
        let tokensLeft = generation.revision_tokens_left ?? planLimit;
        tokensLeft = Math.min(tokensLeft, planLimit);
        let resetAt = generation.revision_reset_at ?? null;

        if (resetAt) {
          const resetTime = new Date(resetAt).getTime();
          const now = Date.now();
          if (now >= resetTime) {
            tokensLeft = user?.plan === 'pro' ? 10 : 20;
            resetAt = null;

            await supabase
              .from('generations')
              .update({
                revision_tokens_left: tokensLeft,
                revision_reset_at: null
              })
              .eq('id', generation.id);
          }
        }

        setInput({
          ...INITIAL_INPUT,
          ...generation.input_context,
        });
        setCurrentGemId(generation.id);
        setOutput(generation.output_result);
        setRevisionTurns(Math.max(0, planLimit - tokensLeft));
        setRevisionTokensLeft(tokensLeft);
        setRevisionResetAt(resetAt);
        setRevisionHistory({});

        setTimeout(() => {
          document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to load generation for editing:', err);
        if (isActive) {
          setAuthError(message || 'gen_error_load_edit');
        }
      } finally {
        if (isActive) {
          setIsHydratingEdit(false);
          document.body.style.overflow = 'auto';
          document.documentElement.style.overflow = 'auto';
        }
      }
    };

    hydrateEditedGem();

    return () => {
      isActive = false;
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };
  }, [editId, userId, user?.plan]);

  // Dropdown option keys
  const TONE_OPTIONS = [
    'tone_formal', 'tone_casual', 'tone_professional',
    'tone_friendly', 'tone_authoritative', 'tone_other',
  ];

  const FORMAT_OPTIONS = [
    'fmt_text', 'fmt_markdown', 'fmt_table', 'fmt_code',
    'fmt_image', 'fmt_video', 'fmt_audio', 'fmt_other',
  ];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setInput((prev) => ({ ...prev, [name]: value }));
    // Clear error on change
    if (errors[name as keyof GeneratorInput]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSelectChange = (field: keyof GeneratorInput, value: string) => {
    setInput((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleGenerate = async () => {
    if (!user) {
      setAuthError('auth_err_fill');
      setAuthModal('signup');
      return;
    }
    setAuthError('');

    const newErrors: Partial<Record<keyof GeneratorInput, string>> = {};
    REQUIRED_FIELDS.forEach((field) => {
      if (!input[field].trim()) {
        newErrors[field] = 'gen_err_required';
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsGeneratingLocal(true);
    setAuthError('');

    try {
      await checkUsageLimit(user.id, user.plan);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Usage limit exceeded')) {
        setAuthError('gen_err_limit_exceeded');
      } else {
        setAuthError(message);
      }
      setIsGeneratingLocal(false);
      return;
    }

    setIsGenerating(true);
    setOutput(null);

    const combinedText = `${input.mainGoal} ${input.expertRole} ${input.targetAudience} ${input.constraints}`;
    const detectedLang = detectLanguage(combinedText);
    const errorCopy = {
      name: t('gen_error_openrouter_title'),
      description: t('gen_error_openrouter_desc'),
      instructions: t('gen_error_openrouter_instructions'),
    };

    // Retry loop — handles 429 rate limit with countdown
    let result: GenerationOutput | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        result = await generateWithOpenRouter(input, detectedLang);
        setRateLimitCountdown(0);
        break; // success
      } catch (err: unknown) {
        if (err instanceof RateLimitError) {
          const waitSecs = Math.min(err.retryAfter, 60);
          // Show countdown in overlay
          setRateLimitCountdown(waitSecs);
          await new Promise<void>((resolve) => {
            rateLimitRetryRef.current = resolve;
            let remaining = waitSecs;
            const tick = setInterval(() => {
              remaining -= 1;
              setRateLimitCountdown(remaining);
              if (remaining <= 0) {
                clearInterval(tick);
                resolve();
              }
            }, 1000);
          });
          setRateLimitCountdown(0);
          continue; // retry
        }
        // Non-rate-limit error — show as result
        const message = err instanceof Error ? err.message : String(err);
        const msgLower = message.toLowerCase();
        const isNetworkError = 
          msgLower.includes('failed to fetch') || 
          msgLower.includes('fetch') || 
          msgLower.includes('timeout') || 
          msgLower.includes('time out') || 
          msgLower.includes('504') || 
          msgLower.includes('gateway') || 
          msgLower.includes('aborted') || 
          msgLower.includes('abort') || 
          msgLower.includes('unreachable') || 
          msgLower.includes('network') ||
          !message.trim() ||
          message === 'Server error:';

        if (isNetworkError) {
          console.warn('Generation network/timeout warning:', message);
        } else {
          console.error('Generation error:', err);
        }

        result = {
          name: errorCopy.name,
          description: isNetworkError
            ? (t('revision_network_error') || 'The AI server timed out or is temporarily unreachable. Please try again.')
            : (message || errorCopy.description),
          instructions: errorCopy.instructions,
          tools: 'No default tool',
          knowledgeBase: null,
        };
        break;
      }
    }

    if (!result) {
      result = {
        name: errorCopy.name,
        description: 'AI is too busy right now. Please try again in a few minutes.',
        instructions: errorCopy.instructions,
        tools: 'No default tool',
        knowledgeBase: null,
      };
    }

    setOutput(result);
    setIsGeneratingLocal(false);
    setIsGenerating(false);

    // Auto-save to Supabase and set currentGemId
    if (user) {
      if (user.plan === 'free') {
        setCurrentGemId(null);
        setRevisionTokensLeft(0);
        setRevisionResetAt(null);
        setRevisionTurns(0);
      } else {
        try {
          const initialTokens = user.plan === 'pro' ? 10 : 20;
          const gemId = await saveGeneration(user.id, input, result, initialTokens);
          setCurrentGemId(gemId);
          setRevisionTokensLeft(initialTokens);
          setRevisionResetAt(null);
          setRevisionTurns(0);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('Failed to save generation:', err);
          setAuthError('gen_error_save_prefix::' + message);
        }
      }
    }

    setTimeout(() => {
      document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const fieldClass = (field: keyof GeneratorInput) =>
    errors[field] ? 'input-field input-field--error' : 'input-field';

  const textareaClass = (field: keyof GeneratorInput) =>
    errors[field] ? 'textarea-field textarea-field--error' : 'textarea-field';

  return (
    <section className="generator" id="generator" ref={sectionRef}>
      <div className="container">
        <div className={`generator-card glass-card ${isHydratingEdit || isGeneratingLocal ? 'generator-card--loading' : ''}`}>

          {/* AI Loading overlay */}
          {isGeneratingLocal && (
            <div className="generator-overlay">
              <div className="generator-overlay-inner">
                <div className="ai-loader">
                  <div className="ai-loader-ring" />
                  <div className="ai-loader-ring ai-loader-ring--2" />
                  <div className="ai-loader-ring ai-loader-ring--3" />
                  <Sparkles size={24} className="ai-loader-icon" />
                </div>

                {rateLimitCountdown > 0 ? (
                  <>
                    <p className="ai-loader-text" style={{ marginBottom: '8px', color: '#f59e0b' }}>
                      ⚡ AI server is busy — auto-retrying...
                    </p>
                    <div style={{
                      background: 'rgba(245,158,11,0.15)',
                      border: '1px solid rgba(245,158,11,0.4)',
                      borderRadius: '12px',
                      padding: '16px 24px',
                      textAlign: 'center',
                      marginBottom: '20px',
                    }}>
                      <div style={{ fontSize: '3rem', fontWeight: 700, color: '#fbbf24', lineHeight: 1 }}>
                        {rateLimitCountdown}s
                      </div>
                      <div style={{ color: '#d1d5db', fontSize: '0.82rem', marginTop: '6px' }}>
                        Free AI rate limit — retrying automatically
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '4px' }}>
                        Giới hạn AI miễn phí — tự động thử lại
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="ai-loader-text" style={{ marginBottom: '8px' }}>{t('loading_text')}</p>
                    <p style={{ color: '#a78bfa', fontSize: '0.9rem', textAlign: 'center', maxWidth: '85%', marginBottom: '24px', lineHeight: 1.5 }}>
                      {t('gen_wait_warning')}
                    </p>
                  </>
                )}

                <div className="ai-skeleton">
                  <div className="ai-skeleton-bar ai-skeleton-bar--wide" />
                  <div className="ai-skeleton-bar ai-skeleton-bar--mid" />
                  <div className="ai-skeleton-bar ai-skeleton-bar--narrow" />
                </div>
              </div>
            </div>
          )}

          <div className="generator-header">
            <Sparkles size={20} className="generator-icon" />
            <h2 className="generator-title">{t('gen_title')}</h2>
          </div>

          {/* Main Goal — required */}
          <div className="generator-field generator-field--full">
            <label className="field-label" htmlFor="mainGoal">
              {t('gen_main_goal')} <span className="required-star">*</span>
            </label>
            <textarea
              id="mainGoal"
              name="mainGoal"
              className={`${textareaClass('mainGoal')} textarea-field--goal`}
              placeholder={t('gen_main_goal_ph')}
              value={input.mainGoal}
              onChange={handleChange}
              rows={5}
            />
            {errors.mainGoal && (
              <span className="field-error">
                <AlertCircle size={12} /> {t(errors.mainGoal)}
              </span>
            )}
          </div>

          {/* Expert Role + Target Audience */}
          <div className="generator-row flex flex-col md:flex-row gap-4">
            <div className="generator-field">
              <label className="field-label" htmlFor="expertRole">
                {t('gen_expert_role')} <span className="required-star">*</span>
              </label>
              <input
                id="expertRole"
                name="expertRole"
                className={fieldClass('expertRole')}
                placeholder={t('gen_expert_role_ph')}
                value={input.expertRole}
                onChange={handleChange}
              />
              {errors.expertRole && (
                <span className="field-error">
                  <AlertCircle size={12} /> {t(errors.expertRole)}
                </span>
              )}
            </div>
            <div className="generator-field">
              <label className="field-label" htmlFor="targetAudience">
                {t('gen_audience')} <span className="required-star">*</span>
              </label>
              <input
                id="targetAudience"
                name="targetAudience"
                className={fieldClass('targetAudience')}
                placeholder={t('gen_audience_ph')}
                value={input.targetAudience}
                onChange={handleChange}
              />
              {errors.targetAudience && (
                <span className="field-error">
                  <AlertCircle size={12} /> {t(errors.targetAudience)}
                </span>
              )}
            </div>
          </div>

          {/* Tone selector */}
          <div className="generator-field generator-field--full">
            <OtherSelect
              id="toneOfVoice"
              label={t('gen_tone')}
              options={TONE_OPTIONS}
              value={input.toneOfVoice}
              otherValue={input.toneOfVoiceOther}
              onChange={(v) => handleSelectChange('toneOfVoice', v)}
              onOtherChange={(v) => handleSelectChange('toneOfVoiceOther', v)}
              otherPlaceholder={t('gen_other_ph_tone')}
            />
          </div>

          {/* Output Format selector */}
          <div className="generator-field generator-field--full">
            <OtherSelect
              id="outputFormat"
              label={t('gen_format')}
              options={FORMAT_OPTIONS}
              value={input.outputFormat}
              otherValue={input.outputFormatOther}
              onChange={(v) => handleSelectChange('outputFormat', v)}
              onOtherChange={(v) => handleSelectChange('outputFormatOther', v)}
              otherPlaceholder={t('gen_other_ph_fmt')}
            />
          </div>

          {/* Constraints */}
          <div className="generator-field generator-field--full">
            <label className="field-label" htmlFor="constraints">
              {t('gen_constraints')}
            </label>
            <textarea
              id="constraints"
              name="constraints"
              className="textarea-field"
              placeholder={t('gen_constraints_ph')}
              value={input.constraints}
              onChange={handleChange}
              rows={3}
            />
          </div>

          {authError && (
            <div className="field-error" style={{ marginBottom: '16px', textAlign: 'center', fontSize: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px' }}>
              <AlertCircle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
              {authError === 'gen_err_limit_exceeded' 
                ? t('gen_err_limit_exceeded').replace('{time}', formatDuration(cooldownTimeLeft))
                : authError.startsWith('gen_error_save_prefix::')
                  ? t('gen_error_save_prefix') + authError.replace('gen_error_save_prefix::', '')
                  : t(authError)}
            </div>
          )}

          <div className="generator-field generator-field--full" style={{ marginTop: '16px' }}>
            <button
              className="btn btn-cta generator-cta"
              onClick={handleGenerate}
              disabled={isHydratingEdit || isGeneratingLocal}
              style={{ width: '100%', height: '56px', fontSize: '1.2rem' }}
            >
              {t('gen_cta')}
            </button>
          </div>

        </div>
      </div>
    </section>
  );
}
