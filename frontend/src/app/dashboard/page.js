'use client';

// ============================================================
// Claw Personal — Dashboard / Suksess-side (Fase 8)
// ============================================================
// Brukeren lander her etter vellykket Stripe-betaling.
// Stripe success_url → /dashboard?userId=xxx&handle=@Janovich
//
// Viser:
//   - Provisjonerings-banner mens container spinner opp
//   - "Din agent for @Janovich er nå aktivert!" når container er klar
//   - Live container-status polling hvert 3. sekund
//   - "Koble til YouTube for dypere innsikt"-CTA (Fase 8, Oppgave 4)
//     → Valgfri Google-tilkobling med fremheving av premium-funksjoner
//     → Viser tilkoblingsstatus (koblet/ikke koblet)
//   - Link til full status-side
//
// Fase 8 Task 4: Google Auth er IKKE obligatorisk i onboarding.
// Det er et premium tilvalg inne i dashbordet. Brukeren kan koble
// til Google når de er klare. Dette trigger /auth/google-flyten.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Polling-intervall og maks ventetid
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 3 * 60 * 1000; // 3 minutter

// Premium-funksjoner som låses opp ved Google-tilkobling
const PREMIUM_FEATURES = [
  { icon: '💬', label: 'Automatisk kommentarhåndtering', desc: 'NanoClaw kan svare på kommentarer i ditt navn' },
  { icon: '📊', label: 'YouTube Analytics', desc: 'Tilgang til privat kanalstatistikk og inntektsdata' },
  { icon: '📥', label: 'YouTube Studio-synkronisering', desc: 'Les og administrer videoer, titler og beskrivelser' },
  { icon: '🔔', label: 'Varsler og community-posts', desc: 'Publiser innlegg og administrer fellesskapet ditt' },
];

function DashboardInner() {
  const searchParams = useSearchParams();

  const [userId, setUserId]     = useState(null);
  const [handle, setHandle]     = useState(null);

  // Container-provisjonerings-status
  // 'provisioning' | 'running' | 'not_found' | 'error' | 'timeout'
  const [containerStatus, setContainerStatus] = useState('provisioning');
  const [provisioningSeconds, setProvisioningSeconds] = useState(0);

  // Google OAuth-tilkoblingsstatus
  // 'unknown' | 'checking' | 'connected' | 'not_connected'
  const [googleStatus, setGoogleStatus] = useState('unknown');
  const [isConnecting, setIsConnecting] = useState(false);

  const pollStartTime    = useRef(null);
  const containerPollRef = useRef(null);
  const secondsTimerRef  = useRef(null);

  // ---------------------------------------------------------
  // Hent userId og handle fra URL eller localStorage
  // ---------------------------------------------------------
  useEffect(() => {
    const urlUserId = searchParams.get('userId');
    const urlHandle = searchParams.get('handle');
    const oauthDone = searchParams.get('oauth');
    const storedId  = typeof window !== 'undefined' ? localStorage.getItem('claw_userId') : null;
    const storedHandle = typeof window !== 'undefined' ? localStorage.getItem('claw_handle') : null;

    const id  = urlUserId || storedId;
    const hdl = urlHandle || storedHandle;

    if (id) {
      setUserId(id);
      if (typeof window !== 'undefined') localStorage.setItem('claw_userId', id);
    }
    if (hdl) {
      setHandle(decodeURIComponent(hdl));
      if (typeof window !== 'undefined') localStorage.setItem('claw_handle', hdl);
    }

    // Hvis brukeren nettopp kom tilbake fra Google OAuth, marker umiddelbart
    if (oauthDone === 'done' && id) {
      setGoogleStatus('connected');
    }
  }, [searchParams]);

  // ---------------------------------------------------------
  // Sjekk Google OAuth-status fra backend
  // ---------------------------------------------------------
  const checkGoogleStatus = useCallback(async (uid) => {
    if (!uid) return;
    setGoogleStatus('checking');
    try {
      const res = await fetch(`${API_URL}/auth/status/${uid}`);
      if (!res.ok) throw new Error('Nettverksfeil');
      const data = await res.json();
      setGoogleStatus(data.connected ? 'connected' : 'not_connected');
    } catch {
      setGoogleStatus('not_connected');
    }
  }, []);

  // Sjekk OAuth-status når userId er kjent (med mindre oauth=done allerede satte den)
  useEffect(() => {
    if (!userId) return;
    const oauthDone = searchParams.get('oauth');
    if (oauthDone === 'done') return; // Allerede satt til 'connected' ovenfor
    checkGoogleStatus(userId);
  }, [userId, checkGoogleStatus, searchParams]);

  // ---------------------------------------------------------
  // Poll container-status hvert 3. sekund inntil 'running'
  // ---------------------------------------------------------
  const pollContainerStatus = useCallback(async (uid) => {
    if (!uid) return;

    // Sjekk timeout (3 min)
    if (pollStartTime.current && Date.now() - pollStartTime.current > MAX_WAIT_MS) {
      setContainerStatus('timeout');
      clearInterval(containerPollRef.current);
      clearInterval(secondsTimerRef.current);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/container-status/${uid}`);
      if (!res.ok) {
        // Ikke stopp polling ved midlertidige nettverksfeil
        console.warn('[Dashboard] container-status feil, prøver igjen...');
        return;
      }
      const data = await res.json();
      setContainerStatus(data.status);

      if (data.status === 'running') {
        // Container er klar — stopp polling
        clearInterval(containerPollRef.current);
        clearInterval(secondsTimerRef.current);
      }
    } catch {
      // Nettverksfeil under polling — fortsett å prøve
      console.warn('[Dashboard] Nettverksfeil under container-poll, prøver igjen...');
    }
  }, []);

  // Start polling når userId er kjent
  useEffect(() => {
    if (!userId) return;

    clearInterval(containerPollRef.current);
    clearInterval(secondsTimerRef.current);

    pollStartTime.current = Date.now();
    setProvisioningSeconds(0);
    setContainerStatus('provisioning');

    // Poll umiddelbart, deretter hvert 3. sek
    pollContainerStatus(userId);
    containerPollRef.current = setInterval(() => pollContainerStatus(userId), POLL_INTERVAL_MS);

    // Sekundteller for "X sekunder siden oppstart"
    secondsTimerRef.current = setInterval(() => {
      setProvisioningSeconds(Math.floor((Date.now() - pollStartTime.current) / 1000));
    }, 1000);

    return () => {
      clearInterval(containerPollRef.current);
      clearInterval(secondsTimerRef.current);
    };
  }, [userId, pollContainerStatus]);

  // ---------------------------------------------------------
  // Håndter Google-tilkobling
  // ---------------------------------------------------------
  const handleConnectGoogle = () => {
    if (!userId || googleStatus === 'connected' || isConnecting) return;
    setIsConnecting(true);
    // Redirect til OAuth-flyten — siden vil komme tilbake med ?oauth=done
    window.location.href = `${API_URL}/auth/google?userId=${userId}`;
  };

  // ---------------------------------------------------------
  // Render visningsnavn for kanalen
  // ---------------------------------------------------------
  const cleanHandle = handle?.startsWith('@') ? handle : handle ? `@${handle}` : 'din kanal';
  const isProvisioning = containerStatus === 'provisioning';
  const isError = containerStatus === 'timeout' || containerStatus === 'error';
  const isGoogleConnected = googleStatus === 'connected';
  const isGoogleChecking  = googleStatus === 'checking' || googleStatus === 'unknown';

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>Claw Personal</div>

        {/* --- Provisjonerings-banner (synlig mens container spinner opp) --- */}
        {isProvisioning && (
          <div className={styles.provisioningBanner}>
            <div className={styles.spinnerSmall} />
            <div>
              <p className={styles.provisioningTitle}>Klargjør din AI-agent…</p>
              <p className={styles.provisioningSubtitle}>
                Vi spinner opp din sikre container for {cleanHandle}.
                Dette tar vanligvis under 15 sekunder. ({provisioningSeconds}s)
              </p>
            </div>
          </div>
        )}

        {/* --- Feil/timeout-banner --- */}
        {isError && (
          <div className={styles.errorBanner}>
            <span className={styles.errorBannerIcon}>⚠️</span>
            <div>
              <p className={styles.provisioningTitle}>
                {containerStatus === 'timeout' ? 'Provisjonering tok for lang tid' : 'Noe gikk galt'}
              </p>
              <p className={styles.provisioningSubtitle}>
                Agenten din er satt opp, men containeren brukte lengre tid enn forventet.
                Sjekk{' '}
                <a href={`/status?userId=${userId || ''}`} className={styles.inlineLink}>
                  status-siden
                </a>{' '}
                for detaljer, eller kontakt support.
              </p>
            </div>
          </div>
        )}

        {/* --- Suksess-hero (vises når container er klar) --- */}
        {containerStatus === 'running' && (
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
        )}

        {/* --- Status-liste (vises alltid, dotfarge endres etter state) --- */}
        <div className={styles.statusList}>
          <div className={styles.statusItem}>
            <div className={`${styles.statusDot} ${containerStatus === 'running' ? styles.dotGreen : styles.dotOrange}`} />
            <p className={styles.statusText}>
              <strong>AI-agent</strong>{' '}
              {containerStatus === 'running'
                ? `NanoClaw kjører og analyserer ${cleanHandle}`
                : `Provisjonerer din dedikerte container… (${provisioningSeconds}s)`}
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

        {/* ============================================================
            FASE 8 — OPPGAVE 4: Premium YouTube-integrasjon (tilvalg)
            ============================================================
            Google Auth er ikke obligatorisk i onboarding — brukeren
            kan koble til YouTube-kontoen sin her inne i dashbordet
            når de er klare for dypere integrasjon.
            ============================================================ */}
        <div className={`${styles.googleCtaCard} ${isGoogleConnected ? styles.googleCtaConnected : ''}`}>
          {/* Header */}
          <div className={styles.googleCtaHeader}>
            <div className={styles.googleCtaIconWrapper}>
              {isGoogleConnected ? (
                <span className={styles.googleCtaIconConnected}>✅</span>
              ) : (
                <span className={styles.googleCtaIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </span>
              )}
            </div>
            <div className={styles.googleCtaTitleBlock}>
              <h2 className={styles.googleCtaTitle}>
                {isGoogleConnected ? 'YouTube koblet til ✓' : 'Koble til YouTube for dypere innsikt'}
              </h2>
              <p className={styles.googleCtaSubtitle}>
                {isGoogleConnected
                  ? `${cleanHandle} er koblet til. NanoClaw har nå tilgang til alle premium-funksjoner.`
                  : 'Du er allerede i gang med offentlig analyse. Koble til YouTube-kontoen for å låse opp premium-funksjoner.'}
              </p>
            </div>
            {isGoogleConnected && (
              <div className={styles.googleCtaBadge}>Premium</div>
            )}
          </div>

          {/* Premium-funksjoner (kun synlig om ikke tilkoblet) */}
          {!isGoogleConnected && (
            <ul className={styles.googleFeatureList}>
              {PREMIUM_FEATURES.map((f, i) => (
                <li key={i} className={styles.googleFeatureItem} style={{ animationDelay: `${i * 0.07}s` }}>
                  <span className={styles.googleFeatureIcon}>{f.icon}</span>
                  <div>
                    <span className={styles.googleFeatureLabel}>{f.label}</span>
                    <span className={styles.googleFeatureDesc}>{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* CTA-knapp */}
          {!isGoogleConnected && (
            <button
              id="connect-youtube-google"
              className={`${styles.googleCtaButton} ${isConnecting ? styles.googleCtaButtonLoading : ''}`}
              onClick={handleConnectGoogle}
              disabled={!userId || isConnecting || isGoogleChecking}
              aria-label="Koble til YouTube via Google"
            >
              {isConnecting ? (
                <>
                  <div className={styles.spinnerInline} />
                  Kobler til…
                </>
              ) : isGoogleChecking ? (
                <>
                  <div className={styles.spinnerInline} />
                  Sjekker status…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" opacity="0.9"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" opacity="0.9"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="currentColor" opacity="0.9"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor" opacity="0.9"/>
                  </svg>
                  Koble til YouTube-konto
                </>
              )}
            </button>
          )}

          <p className={styles.googleCtaNote}>
            {isGoogleConnected
              ? 'Tilkoblingen er sikret og kryptert. Du kan trekke tilbake tilgangen når som helst fra Google-kontoen din.'
              : 'Valgfritt. Du kan alltid koble til senere. Tilkoblingen er kryptert og du kan trekke tilbake tilgangen når som helst.'}
          </p>
        </div>

        {/* --- Lenke til status-side --- */}
        <div className={styles.actions}>
          <a
            href={`/status?userId=${userId || ''}`}
            className={styles.actionSecondary}
            id="view-status"
          >
            📊 Se full agentstatus
          </a>
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
