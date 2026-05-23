import './Footer.css';
import { useApp } from '../../hooks/useApp';

export default function Footer() {
  const { t } = useApp();

  return (
    <footer className="footer" id="docs">
      <div className="container footer-inner">
        <p className="footer-text">{t('footer_copy')}</p>
        <div className="footer-text">
          {t('footer_email')}: <a href="mailto:nguyenchithang2804@gmail.com" className="footer-link">nguyenchithang2804@gmail.com</a>
        </div>
      </div>
    </footer>
  );
}
