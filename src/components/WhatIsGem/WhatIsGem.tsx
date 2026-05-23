import { Brain, Zap, Target, Layers } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import './WhatIsGem.css';

export default function WhatIsGem() {
  const { t } = useApp();

  const features = [
    { icon: Brain,  titleKey: 'wig_feat1_title' as const, descKey: 'wig_feat1_desc' as const },
    { icon: Target, titleKey: 'wig_feat2_title' as const, descKey: 'wig_feat2_desc' as const },
    { icon: Layers, titleKey: 'wig_feat3_title' as const, descKey: 'wig_feat3_desc' as const },
    { icon: Zap,    titleKey: 'wig_feat4_title' as const, descKey: 'wig_feat4_desc' as const },
  ];

  return (
    <section className="what-is-gem" id="features">
      <div className="container">
        <div className="wig-header animate-fade-in">
          <span className="wig-tag">{t('wig_tag')}</span>
          <h2 className="wig-title text-2xl md:text-3xl lg:text-4xl">
            {t('wig_title1')}<br />
            <span className="wig-title-accent">{t('wig_title2')}</span>
          </h2>
          <p className="wig-subtitle">{t('wig_subtitle')}</p>
          <p className="wig-links">
            {t('wig_subtitle_links')}{' '}
            <a
              href="https://blog.google/products-and-platforms/products/gemini/google-gems-tips/"
              target="_blank"
              rel="noopener noreferrer"
              className="wig-link"
            >
              {t('wig_google_blog')}
            </a>
            {' '}{t('wig_or')}{' '}
            <a
              href="https://support.google.com/gemini/answer/15236321?hl=vi"
              target="_blank"
              rel="noopener noreferrer"
              className="wig-link"
            >
              {t('wig_gems_guide')}
            </a>
            .
          </p>
        </div>

        <div className="wig-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feat, i) => (
            <div
              key={feat.titleKey}
              className={`wig-card glass-card animate-fade-in animate-delay-${i + 1}`}
            >
              <div className="wig-card-icon">
                <feat.icon size={20} />
              </div>
              <h3 className="wig-card-title">{t(feat.titleKey)}</h3>
              <p className="wig-card-desc">{t(feat.descKey)}</p>
            </div>
          ))}
        </div>

        {/* Highlight banner */}
        <div className="wig-banner animate-fade-in animate-delay-4">
          <div className="wig-banner-glow" />
          <div className="wig-banner-content">
            <span className="wig-banner-label">{t('wig_banner_label')}</span>
            <p className="wig-banner-text">{t('wig_banner_text')}</p>
          </div>
        </div>


      </div>
    </section>
  );
}
