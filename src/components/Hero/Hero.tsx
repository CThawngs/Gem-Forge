import { useApp } from '../../hooks/useApp';
import './Hero.css';

export default function Hero() {
  const { t } = useApp();
  
  return (
    <section className="hero">
      <div className="container hero-inner">
        <h1 className="hero-title animate-fade-in text-3xl md:text-4xl lg:text-5xl">
          {t('hero_title')}
        </h1>
        <p className="hero-subtitle animate-fade-in animate-delay-1 text-base md:text-lg" style={{ whiteSpace: 'pre-line' }}>
          {t('hero_sub')}
        </p>
        <button 
          className="btn btn-accent animate-fade-in animate-delay-2" 
          style={{ marginTop: '32px', padding: '16px 32px', fontSize: '1.1rem' }}
          onClick={() => {
            document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {t('hero_cta')}
        </button>

        <div className="hero-questions animate-fade-in animate-delay-3">
          <div className="hero-questions-divider">
            <span className="line" />
            <span className="dot" />
            <span className="line" />
          </div>
          <div className="hero-questions-grid">
            <div className="hero-question-card">
              <div className="hero-question-icon-wrapper">
                <span className="hero-question-icon">?</span>
              </div>
              <p className="hero-question-text">{t('hero_q1')}</p>
            </div>
            <div className="hero-question-card">
              <div className="hero-question-icon-wrapper">
                <span className="hero-question-icon">?</span>
              </div>
              <p className="hero-question-text">{t('hero_q2')}</p>
            </div>
            <div className="hero-question-card">
              <div className="hero-question-icon-wrapper">
                <span className="hero-question-icon">?</span>
              </div>
              <p className="hero-question-text">{t('hero_q3')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
