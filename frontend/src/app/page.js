'use client';

// ============================================================
// Claw Personal — Landingsside (Fase 6)
// ============================================================
// Hovedsiden brukerne ser. Inneholder:
//   - Navigasjon med logo
//   - Hero med USP og "Kom i gang"-knapp (Stripe Checkout)
//   - Feature-kort med produktfordeler
//   - Footer
//
// API-integrasjon:
//   POST /api/create-checkout-session → Stripe Checkout URL
// ============================================================

import { useState } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  // ---------------------------------------------------------
  // Starter betalingsflyten via Stripe Checkout
  // ---------------------------------------------------------
  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      });

      const data = await res.json();

      if (data.success && data.url) {
        // Lagre userId for bruk i Magic Connect etter betaling
        if (typeof window !== 'undefined') {
          localStorage.setItem('claw_userId', data.userId);
        }
        // Redirect til Stripe hosted checkout
        window.location.href = data.url;
      } else {
        alert('Noe gikk galt. Prøv igjen.');
      }
    } catch (err) {
      console.error('Checkout feilet:', err);
      alert('Kunne ikke starte betaling. Sjekk internettilkoblingen.');
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
          Claw Personal analyserer innboksen, kalenderen og YouTube-kanalen din.
          Trygt, privat og fullstendig automatisk — dine data forblir alltid dine.
        </p>

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
              <>Kom i gang — 99 kr/mnd</>
            )}
          </button>
          <a href="#features" className={styles.ctaSecondary}>
            Lær mer ↓
          </a>
        </div>
      </section>

      {/* --- Features --- */}
      <section id="features" className={styles.features}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🔒</div>
          <h3 className={styles.featureTitle}>Zero-Knowledge sikkerhet</h3>
          <p className={styles.featureDesc}>
            Dine data krypteres med en unik nøkkel som bare du eier.
            Selv vi kan ikke lese innboksen eller kalenderen din.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>⚡</div>
          <h3 className={styles.featureTitle}>Klar på sekunder</h3>
          <p className={styles.featureDesc}>
            Etter betaling spinnner vi opp din dedikerte AI-container
            på under ett sekund. Koble til Google — ferdig!
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
