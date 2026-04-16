'use client';

// ============================================================
// Claw Personal — Status Page (Fase 6)
// ============================================================
// Visuell status-side som viser:
//   1. Orkestrator-status (helsesjekk)
//   2. Container-status (NanoClaw spinner opp — poller hvert 3. sek)
//   3. Google-tilkobling (OAuth-tokens i Vault)
//   4. Betalingsstatus
//
// Poller GET /api/container-status/:userId hvert 3. sek inntil
// containeren rapporterer 'running' eller timeout etter 5 min.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Maks ventetid på container-oppstart: 5 minutter
const MAX_WAIT_MS = 5 * 60 * 1000;
// Polling-intervall: 3 sekunder
const POLL_INTERVAL_MS = 3000;

function StatusInner() {
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Infrastruktur-status
  const [orchestratorStatus, setOrchestratorStatus] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [dbStatus, setDbStatus] = useState('unknown');
  const [lastChecked, setLastChecked] = useState(null);

  // Container-provisjonerings-status
  // 'provisioning' | 'running' | 'not_found' | 'error' | 'timeout'
  const [containerStatus, setContainerStatus] = useState('provisioning');
  const [containerName, setContainerName] = useState(null);
  const [provisioningSeconds, setProvisioningSeconds] = useState(0);

  const pollStartTime = useRef(null);
  const containerPollRef = useRef(null);
  const secondsTimerRef = useRef(null);

  // ---------------------------------------------------------
  // Hent userId fra URL-param eller localStorage
  // ---------------------------------------------------------
  useEffect(() => {
    const urlUserId = searchParams.get('userId');
    const storedUserId = typeof window !== 'undefined'
      ? localStorage.getItem('claw_userId')
      : null;
    setUserId(urlUserId || storedUserId);
  }, [searchParams]);

  // ---------------------------------------------------------
  // Poll container-status hvert 3. sekund inntil 'running'
  // ---------------------------------------------------------
  const pollContainerStatus = useCallback(async (uid) => {
    if (!uid) return;

    // Sjekk timeout
    if (pollStartTime.current && Date.now() - pollStartTime.current > MAX_WAIT_MS) {
      setContainerStatus('timeout');
      clearInterval(containerPollRef.current);
      clearInterval(secondsTimerRef.current);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/container-status/${uid}`);
      if (!res.ok) {
        setContainerStatus('error');
        return;
      }
      const data = await res.json();

      setContainerStatus(data.status);

      if (data.status === 'running') {
        setContainerName(data.containerName || null);
        // Container er klar — stopp polling
        clearInterval(containerPollRef.current);
        clearInterval(secondsTimerRef.current);
      }
    } catch {
      // Nettverksfeil under polling — fortsett å prøve, ikke stopp
      console.warn('[ContainerPoll] Nettverksfeil — prøver igjen...');
    }
  }, []);

  // Start container-polling når userId er kjent
  useEffect(() => {
    if (!userId) return;

    // Stopp eventuelt eksisterende polling
    clearInterval(containerPollRef.current);
    clearInterval(secondsTimerRef.current);

    pollStartTime.current = Date.now();
    setProvisioningSeconds(0);

    // Poll umiddelbart, deretter hvert 3. sek
    pollContainerStatus(userId);
    containerPollRef.current = setInterval(() => pollContainerStatus(userId), POLL_INTERVAL_MS);

    // Teller for å vise "X sekunder siden oppstart" til brukeren
    secondsTimerRef.current = setInterval(() => {
      setProvisioningSeconds(Math.floor((Date.now() - pollStartTime.current) / 1000));
    }, 1000);

    return () => {
      clearInterval(containerPollRef.current);
      clearInterval(secondsTimerRef.current);
    };
  }, [userId, pollContainerStatus]);

  // ---------------------------------------------------------
  // Poll Orkestrator-helse og Google-tilkobling hvert 5. sek
  // ---------------------------------------------------------
  const fetchHealth = useCallback(async () => {
    try {
      const healthRes = await fetch(`${API_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setOrchestratorStatus(healthData.status);
        setDbStatus(healthData.database || 'unknown');
      } else {
        setOrchestratorStatus('error');
      }

      if (userId) {
        const authRes = await fetch(`${API_URL}/auth/status/${userId}`);
        if (authRes.ok) {
          const authData = await authRes.json();
          setGoogleConnected(authData.connected);
        }
      }

      setLastChecked(new Date());
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Helse-sjekk feilet:', err);
      setError('Kunne ikke koble til Orkestratoren');
      setOrchestratorStatus('offline');
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // ---------------------------------------------------------
  // Hjelpefunksjoner
  // ---------------------------------------------------------
  function getStatusBadge(isActive, activeLabel = 'Aktiv', inactiveLabel = 'Inaktiv') {
    if (isActive) {
      return (
        <span className={`${styles.statusBadge} ${styles.badgeActive}`}>
          <span className={`${styles.pulseDot} ${styles.pulseDotGreen}`} />
          {activeLabel}
        </span>
      );
    }
    return (
      <span className={`${styles.statusBadge} ${styles.badgeInactive}`}>
        {inactiveLabel}
      </span>
    );
  }

  function getContainerBadge() {
    switch (containerStatus) {
      case 'running':
        return (
          <span className={`${styles.statusBadge} ${styles.badgeActive}`}>
            <span className={`${styles.pulseDot} ${styles.pulseDotGreen}`} />
            Kjører
          </span>
        );
      case 'provisioning':
        return (
          <span className={`${styles.statusBadge} ${styles.badgePending}`}>
            <span className={`${styles.pulseDot} ${styles.pulseDotOrange}`} />
            Spinner opp...
          </span>
        );
      case 'timeout':
        return (
          <span className={`${styles.statusBadge} ${styles.badgeInactive}`}>
            Timeout — kontakt support
          </span>
        );
      case 'error':
      default:
        return (
          <span className={`${styles.statusBadge} ${styles.badgeInactive}`}>
            Feilet
          </span>
        );
    }
  }

  function getContainerDesc() {
    switch (containerStatus) {
      case 'running':
        return containerName ? `${containerName} kjører` : 'Din AI-agent er klar';
      case 'provisioning':
        return `Klargjør din AI-agent… (${provisioningSeconds}s)`;
      case 'timeout':
        return 'Tok for lang tid — ferskstart vil hjelpe';
      case 'error':
        return 'Noe gikk galt under oppstart';
      default:
        return 'Ukjent status';
    }
  }

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.logo}>Agentstatus</span>
          <a href="/" className={styles.backLink}>← Tilbake</a>
        </div>

        {/* Innledende lasting */}
        {loading && (
          <div className={styles.loadingContainer}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingText}>Sjekker systemstatus...</p>
          </div>
        )}

        {/* Tilkoblingsfeil */}
        {error && !loading && (
          <div className={styles.errorContainer}>
            <h3 className={styles.errorTitle}>Tilkobling feilet</h3>
            <p className={styles.errorMessage}>{error}</p>
            <a href="/status" className={styles.retryLink}>Prøv igjen →</a>
          </div>
        )}

        {/* Status Grid */}
        {!loading && !error && (
          <>
            {/* Onboarding-banner: vises mens container spinner opp */}
            {containerStatus === 'provisioning' && (
              <div className={styles.onboardingBanner}>
                <div className={styles.spinnerLarge} />
                <div>
                  <p className={styles.onboardingTitle}>Klargjør din AI-agent…</p>
                  <p className={styles.onboardingSubtitle}>
                    Vi spinner opp din sikre container. Dette tar vanligvis under 10 sekunder.
                    ({provisioningSeconds}s)
                  </p>
                </div>
              </div>
            )}

            {/* Suksess-banner: vises når container er klar */}
            {containerStatus === 'running' && !googleConnected && (
              <div className={styles.successBanner}>
                <span className={styles.successIcon}>🚀</span>
                <div>
                  <p className={styles.onboardingTitle}>AI-agenten er klar!</p>
                  <p className={styles.onboardingSubtitle}>
                    Koble til Google for å starte analysen.
                  </p>
                </div>
                {userId && (
                  <a
                    href={`${API_URL}/auth/google?userId=${userId}`}
                    className={styles.connectButton}
                  >
                    Koble til Google →
                  </a>
                )}
              </div>
            )}

            {/* Alt klart */}
            {containerStatus === 'running' && googleConnected && (
              <div className={styles.successBanner}>
                <span className={styles.successIcon}>✅</span>
                <div>
                  <p className={styles.onboardingTitle}>Alt er klart!</p>
                  <p className={styles.onboardingSubtitle}>
                    Din AI-agent analyserer nå Gmail, Calendar og YouTube.
                  </p>
                </div>
              </div>
            )}

            <div className={styles.statusGrid}>
              {/* Orkestrator */}
              <div className={styles.statusItem}>
                <div className={`${styles.statusIcon} ${orchestratorStatus === 'ok' ? styles.statusIconActive : styles.statusIconInactive}`}>
                  {orchestratorStatus === 'ok' ? '🟢' : '🔴'}
                </div>
                <div className={styles.statusInfo}>
                  <div className={styles.statusLabel}>Orkestrator</div>
                  <div className={styles.statusValue}>Backend-server (Control Plane)</div>
                </div>
                {getStatusBadge(orchestratorStatus === 'ok', 'Online', 'Offline')}
              </div>

              {/* Database */}
              <div className={styles.statusItem}>
                <div className={`${styles.statusIcon} ${dbStatus === 'connected' ? styles.statusIconActive : styles.statusIconPending}`}>
                  {dbStatus === 'connected' ? '🗄️' : '⏳'}
                </div>
                <div className={styles.statusInfo}>
                  <div className={styles.statusLabel}>Database</div>
                  <div className={styles.statusValue}>PostgreSQL (sikker lagring)</div>
                </div>
                {getStatusBadge(dbStatus === 'connected', 'Tilkoblet', 'Venter')}
              </div>

              {/* NanoClaw Container — hoved-pollings-rad */}
              <div className={styles.statusItem}>
                <div className={`${styles.statusIcon} ${containerStatus === 'running' ? styles.statusIconActive : styles.statusIconLoading}`}>
                  {containerStatus === 'running' ? '🤖' : '⏳'}
                </div>
                <div className={styles.statusInfo}>
                  <div className={styles.statusLabel}>NanoClaw-agent</div>
                  <div className={styles.statusValue}>{getContainerDesc()}</div>
                </div>
                {getContainerBadge()}
              </div>

              {/* Google-tilkobling */}
              <div className={styles.statusItem}>
                <div className={`${styles.statusIcon} ${googleConnected ? styles.statusIconActive : styles.statusIconPending}`}>
                  {googleConnected ? '🔗' : '🔓'}
                </div>
                <div className={styles.statusInfo}>
                  <div className={styles.statusLabel}>Google-tilkobling</div>
                  <div className={styles.statusValue}>Gmail, Calendar, YouTube Analytics</div>
                </div>
                {googleConnected ? (
                  <span className={`${styles.statusBadge} ${styles.badgeActive}`}>
                    <span className={`${styles.pulseDot} ${styles.pulseDotGreen}`} />
                    Tilkoblet
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.badgePending}`}>
                    <span className={`${styles.pulseDot} ${styles.pulseDotOrange}`} />
                    Venter
                  </span>
                )}
              </div>
            </div>

            {lastChecked && (
              <p className={styles.lastSynced}>
                Sist oppdatert: {lastChecked.toLocaleTimeString('no-NO')}
                {' · '}Container-status oppdateres hvert 3. sekund
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <span className={styles.logo}>Agentstatus</span>
          </div>
          <div className={styles.loadingContainer}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingText}>Laster...</p>
          </div>
        </div>
      </main>
    }>
      <StatusInner />
    </Suspense>
  );
}
