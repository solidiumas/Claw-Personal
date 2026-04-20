'use client';

// ============================================================
// Claw Personal — Dashboard / Suksess-side (Fase 8)
// ============================================================
// Brukeren lander her etter vellykket Stripe-betaling.
// Stripe success_url → /dashboard?userId=xxx&handle=@Janovich
//
// Viser:
//   - "Din agent for @Janovich er nå aktivert!"
//   - Provisjoneringsstatus (agent, database, container)
//   - Valgfri "Koble til Google"-knapp (ikke obligatorisk)
//   - Link til full status-side
// ============================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function DashboardInner() {
  const searchParams = useSearchParams();

  const [userId, setUserId]     = useState(null);
  const [handle, setHandle]     = useState(null);
  const [isActive, setIsActive] = useState(false);

  // ---------------------------------------------------------
  // Hent userId og handle fra URL eller localStorage
  // ---------------------------------------------------------
  useEffect(() => {
    const urlUserId = searchParams.get('userId');
    const urlHandle = searchParams.get('handle');
    const storedId  = typeof window !== 'undefined' ? localStorage.getItem('claw_userId') : null;
    const storedHandle = typeof window !== 'undefined' ? localStorage.getItem('claw_handle') : null;

    const id  = urlUserId || storedId;
    const hdl = urlHandle || storedHandle;

    if (id) setUserId(id);
    if (hdl) setHandle(decodeURIComponent(hdl));
  }, [searchParams]);

  // ---------------------------------------------------------
  // Poll lisensstatus for å bekrefte at provisjonering er ferdig
  // ---------------------------------------------------------
  useEffect(() => {
    if (!userId) return;

    async function checkLicense() {
      try {
        const res  = await fetch(`${API_URL}/auth/status/${userId}`);
        const data = await res.json();
        // Bruk "active" fra license_status — agenten kjører
        if (data.licenseStatus === 'active' || data.connected) {
          setIsActive(true);
        }
      } catch (err) {
        console.error('Kunne ikke sjekke lisensstatus:', err);
      }
    }

    checkLicense();
    const interval = setInterval(checkLicense, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  // ---------------------------------------------------------
  // Render visningsnavn for kanalen
  // ---------------------------------------------------------
  const displayHandle = handle || 'kanalen din';
  const cleanHandle   = handle?.startsWith('@') ? handle : handle ? `@${handle}` : 'din kanal';

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>Claw Personal</div>

        {/* --- Suksess-hero --- */}
        <div className={styles.successHero}>
          <div className={styles.successIconWrapper}>
            <div className={styles.successRing} />
            <div className={styles.successRingInner} />
            <span className={styles.successEmoji}>🤖</span>
          </div>

          <h1 className={styles.successTitle}>
            Din agent for{' '}
            <span className={styles.successHandle}>{cleanHandle}</span>
            <br />
            er nå aktivert!
          </h1>

          <p className={styles.successSubtitle}>
            NanoClaw begynner å analysere videoene dine nå.
            Du vil motta daglige innsikter og anbefalinger basert på kanalens utvikling.
          </p>
        </div>

        {/* --- Status --- */}
        <div className={styles.statusList}>
          <div className={styles.statusItem}>
            <div className={`${styles.statusDot} ${styles.dotGreen}`} />
            <p className={styles.statusText}>
              <strong>Agent aktiv</strong> — NanoClaw kjører og analyserer {cleanHandle}
            </p>
          </div>
          <div className={styles.statusItem}>
            <div className={`${styles.statusDot} ${styles.dotBlue}`} />
            <p className={styles.statusText}>
              <strong>Abonnement aktivert</strong> — 99 kr/mnd, avbryt når som helst
            </p>
          </div>
          <div className={styles.statusItem}>
            <div className={`${styles.statusDot} ${styles.dotPurple}`} />
            <p className={styles.statusText}>
              <strong>Privat container</strong> — Dine data er isolert og kryptert
            </p>
          </div>
        </div>

        {/* --- Actions --- */}
        <div className={styles.actions}>
          {/* Valgfri Google-kobling for dypere integrasjon */}
          <a
            href={userId ? `${API_URL}/auth/google?userId=${userId}` : '#'}
            className={styles.actionPrimary}
            id="connect-google"
          >
            🔗 Koble til Google for dyp YouTube-integrasjon
          </a>

          <a
            href={`/status?userId=${userId || ''}`}
            className={styles.actionSecondary}
            id="view-status"
          >
            📊 Se full agentstatus
          </a>

          <p className={styles.actionNote}>
            Google-tilkobling er valgfritt, men gir agenten tilgang til YouTube Analytics,
            innboks og kalender for enda bedre anbefalinger.
          </p>
        </div>
      </div>
    </main>
  );
}

// Wrap in Suspense for useSearchParams
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>Claw Personal</div>
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-secondary)' }}>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: 'var(--color-accent-purple)', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
            Laster...
          </div>
        </div>
      </main>
    }>
      <DashboardInner />
    </Suspense>
  );
}
