'use client';

// ============================================================
// Claw Personal — Magic Connect (Fase 6)
// ============================================================
// Onboarding-side etter betaling. Brukeren lander her etter
// Stripe Checkout og kobler sin Google-konto.
//
// Flyten:
//   1. Hent userId fra URL-parameter eller localStorage
//   2. Vis "Koble til Google"-knappen
//   3. Redirect til Orkestratoren: GET /auth/google?userId=xxx
//   4. Etter OAuth-callback, poll GET /auth/status/:userId
//   5. Vis suksess-melding når tokens er lagret
//
// Stripe success_url redirecter hit med ?userId=<uuid>
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Google "G" SVG icon
function GoogleIcon() {
  return (
    <svg className={styles.googleIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// The inner component that uses useSearchParams
function MagicConnectInner() {
  const searchParams = useSearchParams();

  // State
  const [userId, setUserId] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); // 1=betalt, 2=koble, 3=ferdig
  const [isConnected, setIsConnected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // ---------------------------------------------------------
  // 1. Hent userId fra URL eller localStorage
  // ---------------------------------------------------------
  useEffect(() => {
    const urlUserId = searchParams.get('userId');
    const storedUserId = typeof window !== 'undefined'
      ? localStorage.getItem('claw_userId')
      : null;

    const id = urlUserId || storedUserId;
    if (id) {
      setUserId(id);
      // Lagre for å bevare gjennom OAuth-redirect
      if (typeof window !== 'undefined') {
        localStorage.setItem('claw_userId', id);
      }
    }
  }, [searchParams]);

  // ---------------------------------------------------------
  // 2. Poll status etter at brukeren returnerer fra Google
  // ---------------------------------------------------------
  const checkStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(`${API_URL}/auth/status/${userId}`);
      const data = await res.json();

      if (data.connected) {
        setIsConnected(true);
        setCurrentStep(3);
        setIsPolling(false);
      }
    } catch (err) {
      console.error('Status-sjekk feilet:', err);
    }
  }, [userId]);

  // Start polling etter OAuth redirect (hash fragment detection)
  useEffect(() => {
    // Sjekk om brukeren nettopp returnerte fra Google OAuth
    // Ved å se om det finnes en userId og vi ikke allerede poller
    if (userId && !isConnected && searchParams.get('oauth') === 'done') {
      setIsPolling(true);
      setCurrentStep(2);

      const interval = setInterval(async () => {
        await checkStatus();
      }, 2000);

      // Stopp polling etter 30 sekunder
      const timeout = setTimeout(() => {
        setIsPolling(false);
        clearInterval(interval);
      }, 30000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [userId, isConnected, searchParams, checkStatus]);

  // Sjekk status umiddelbart ved sidelast
  useEffect(() => {
    if (userId) {
      checkStatus();
    }
  }, [userId, checkStatus]);

  // ---------------------------------------------------------
  // 3. Start Google OAuth
  // ---------------------------------------------------------
  function handleGoogleConnect() {
    if (!userId) return;
    // Redirect til Orkestratoren som håndterer OAuth
    window.location.href = `${API_URL}/auth/google?userId=${userId}`;
  }

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>Claw Personal</div>

        {/* --- Stepper --- */}
        <div className={styles.stepper}>
          <div className={`${styles.step} ${currentStep >= 1 ? styles.stepDone : ''}`}>
            {currentStep > 1 ? '✓' : '1'}
          </div>
          <div className={`${styles.stepLine} ${currentStep > 1 ? styles.stepLineDone : ''}`} />
          <div className={`${styles.step} ${currentStep === 2 ? styles.stepActive : ''} ${currentStep > 2 ? styles.stepDone : ''}`}>
            {currentStep > 2 ? '✓' : '2'}
          </div>
          <div className={`${styles.stepLine} ${currentStep > 2 ? styles.stepLineDone : ''}`} />
          <div className={`${styles.step} ${currentStep === 3 ? styles.stepDone : ''}`}>
            {currentStep > 3 ? '✓' : '3'}
          </div>
        </div>

        {/* --- Step 3: Success --- */}
        {isConnected && (
          <div className={styles.successContainer}>
            <div className={styles.successIcon}>✅</div>
            <h2 className={styles.successTitle}>Du er klar!</h2>
            <p className={styles.successMessage}>
              Google-kontoen din er koblet til, og din private NanoClaw-agent
              er nå aktiv. Den analyserer allerede innboksen og kalenderen din.
            </p>
            <a
              href={`/status?userId=${userId}`}
              className={styles.statusButton}
            >
              Se agentstatus →
            </a>
          </div>
        )}

        {/* --- Step 2: Polling --- */}
        {isPolling && !isConnected && (
          <div className={styles.statusChecking}>
            <div className={styles.spinnerLarge} />
            <p className={styles.statusText}>
              Venter på at Google-tilkoblingen fullføres...<br />
              Dette tar vanligvis bare noen sekunder.
            </p>
          </div>
        )}

        {/* --- Step 1: Connect Google --- */}
        {!isConnected && !isPolling && (
          <>
            <h2 className={styles.title}>Magic Connect</h2>
            <p className={styles.description}>
              Koble Google-kontoen din for å gi NanoClaw tilgang til innboksen,
              kalenderen og YouTube-kanalen din. Vi ber kun om lesetilgang —
              vi kan aldri sende e-post eller endre noe på dine vegne.
            </p>

            {userId ? (
              <button
                id="google-connect"
                className={styles.googleButton}
                onClick={handleGoogleConnect}
              >
                <GoogleIcon />
                Koble til med Google
              </button>
            ) : (
              <p className={styles.statusText}>
                Ingen bruker-ID funnet. Start fra{' '}
                <a href="/" style={{ color: 'var(--color-accent-cyan)' }}>forsiden</a>.
              </p>
            )}

            {/* --- Scopes oversikt --- */}
            <div className={styles.scopes}>
              <p className={styles.scopesTitle}>Tilganger vi ber om</p>
              <div className={styles.scopeItem}>
                <span className={styles.scopeIcon}>📧</span>
                Gmail
                <span className={styles.scopeReadonly}>Kun lesetilgang</span>
              </div>
              <div className={styles.scopeItem}>
                <span className={styles.scopeIcon}>📅</span>
                Google Calendar
                <span className={styles.scopeReadonly}>Kun lesetilgang</span>
              </div>
              <div className={styles.scopeItem}>
                <span className={styles.scopeIcon}>📊</span>
                YouTube Analytics
                <span className={styles.scopeReadonly}>Kun lesetilgang</span>
              </div>
              <div className={styles.scopeItem}>
                <span className={styles.scopeIcon}>🎬</span>
                YouTube kanaler
                <span className={styles.scopeReadonly}>Kun lesetilgang</span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// Wrap in Suspense for useSearchParams
export default function MagicConnectPage() {
  return (
    <Suspense fallback={
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>Claw Personal</div>
          <div className={styles.statusChecking}>
            <div className={styles.spinnerLarge} />
            <p className={styles.statusText}>Laster...</p>
          </div>
        </div>
      </main>
    }>
      <MagicConnectInner />
    </Suspense>
  );
}
