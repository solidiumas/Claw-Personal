'use client';

// ============================================================
// Claw Personal — Landingsside (Fase 6 + 8)
// ============================================================
// Fase 8: YouTube-URL samles inn FØR betaling.
//   - Brukeren limer inn sin YouTube-URL eller @handle
//   - URL-en sendes med til POST /api/create-checkout-session
//   - Lagres i DB og Stripe metadata
//   - Etter betaling: redirect til /dashboard (ikke /magic-connect)
// ============================================================

import { useState } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // ---------------------------------------------------------
  // Validering av YouTube-input på klientsiden
  // ---------------------------------------------------------
  function validateYoutubeUrl(value) {
    if (!value.trim()) {
      return 'YouTube-kanal er påkrevd for å starte.';
    }
    // Tillat: URL med youtube.com, @Handle, eller bare et navn
    const isYoutubeUrl = value.includes('youtube.com');
    const isHandle = /^@?[\w-]+$/.test(value.trim());
    if (!isYoutubeUrl && !isHandle) {
      return 'Ugyldig format. Prøv f.eks. https://youtube.com/@KanalNavn eller @KanalNavn.';
    }
    return '';
  }

  function handleUrlChange(e) {
    const val = e.target.value;
    setYoutubeUrl(val);
    if (urlError) setUrlError(validateYoutubeUrl(val));
  }

  // ---------------------------------------------------------
  // Starter betalingsflyten via Stripe Checkout
  // ---------------------------------------------------------
  async function handleCheckout() {
    const error = validateYoutubeUrl(youtubeUrl);
    if (error) {
      setUrlError(error);
      return;
    }
    setUrlError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }),
      });

      const data = await res.json();

      if (data.success && data.url) {
        // Lagre userId og handle lokalt for bruk på dashboard etter redirect
        if (typeof window !== 'undefined') {
          localStorage.setItem('claw_userId', data.userId);
          localStorage.setItem('claw_handle', data.youtubeHandle || '');
        }
        // Redirect til Stripe hosted checkout
        window.location.href = data.url;
      } else {
        setUrlError(data.error || 'Noe gikk galt. Prøv igjen.');
      }
    } catch (err) {
      console.error('Checkout feilet:', err);
      setUrlError('Kunne ikke starte betaling. Sjekk internettilkoblingen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* --- Navigasjon --- */}
      <nav className={styles.nav}>
        <span className={styles.logo}>Claw Personal</span>
        <ul className={styles.navLinks}>
          <li><a className={styles.navLink} href="#features">Funksjoner</a></li>
          <li><a className={styles.navLink} href="#pricing">Priser</a></li>
        </ul>
      </nav>

      {/* --- Hero --- */}
      <section className={styles.hero}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          For YouTube-innholdsprodusenter
        </div>

        <h1 className={styles.title}>
          Din private{' '}
          <span className={styles.titleGradient}>AI-agent</span>
          <br />
          klar på 3 minutter
        </h1>

        <p className={styles.subtitle}>
          Claw Personal analyserer YouTube-kanalen din og gir deg daglige
          innsikter. Trygt, privat og fullstendig automatisk.
        </p>

        {/* --- YouTube URL-felt --- */}
        <div className={styles.urlWrapper}>
          <label className={styles.urlLabel} htmlFor="youtube-url">
            Din YouTube-kanal
          </label>
          <div className={styles.urlInputRow}>
            <span className={styles.urlIcon}>▶</span>
            <input
              id="youtube-url"
              type="text"
              className={`${styles.urlInput} ${urlError ? styles.urlInputError : ''}`}
              placeholder="https://youtube.com/@KanalNavn eller @KanalNavn"
              value={youtubeUrl}
              onChange={handleUrlChange}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckout()}
              disabled={loading}
              autoComplete="off"
            />
          </div>
          {urlError && (
            <p className={styles.urlError}>{urlError}</p>
          )}
          {!urlError && youtubeUrl && (
            <p className={styles.urlSuccess}>✓ Ser bra ut!</p>
          )}
        </div>

        <div className={styles.ctaGroup}>
          <button
            id="cta-start"
            className={styles.ctaPrimary}
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.spinner} />
                Starter...
              </>
            ) : (
              <>Aktiver agent — 99 kr/mnd</>
            )}
          </button>
          <a href="#features" className={styles.ctaSecondary}>
            Lær mer ↓
          </a>
        </div>

        <p className={styles.heroNote}>
          Ingen kredittkort nødvendig for å se — kun ved aktivering. Avbryt når som helst.
        </p>
      </section>

      {/* --- Features --- */}
      <section id="features" className={styles.features}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🔒</div>
          <h3 className={styles.featureTitle}>Zero-Knowledge sikkerhet</h3>
          <p className={styles.featureDesc}>
            Dine data krypteres med en unik nøkkel som bare du eier.
            Vi ser aldri innholdet av analysene dine.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>⚡</div>
          <h3 className={styles.featureTitle}>Klar på sekunder</h3>
          <p className={styles.featureDesc}>
            Etter betaling spinner vi opp din dedikerte AI-agent
            på under ett sekund. Ingen ventetid.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>📊</div>
          <h3 className={styles.featureTitle}>YouTube-innsikt</h3>
          <p className={styles.featureDesc}>
            Automatisk analyse av kanalstatistikk, videoer og trender.
            Din AI-agent gir deg daglige handlingsanbefalinger.
          </p>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className={styles.footer}>
        © {new Date().getFullYear()} Nrth AI — Claw Personal. Alle rettigheter reservert.
      </footer>
    </>
  );
}
