'use client';

// ============================================================
// Claw Personal — Status Page (Fase 6)
// ============================================================
// Visuell status-side som viser:
//   1. Orkestrator-status (helsesjekk)
//   2. Google-tilkobling (OAuth-tokens i Vault)
//   3. Container-status (NanoClaw kjører)
//   4. Betalingsstatus
//
// Poller GET /health og GET /auth/status/:userId hvert 5. sek
// for å gi brukeren sanntids-oppdatering.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function StatusInner() {
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status data
  const [orchestratorStatus, setOrchestratorStatus] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [dbStatus, setDbStatus] = useState('unknown');
  const [lastChecked, setLastChecked] = useState(null);

  // ---------------------------------------------------------
  // Hent userId
  // ---------------------------------------------------------
  useEffect(() => {
    const urlUserId = searchParams.get('userId');
    const storedUserId = typeof window !== 'undefined'
      ? localStorage.getItem('claw_userId')
      : null;
    setUserId(urlUserId || storedUserId);
  }, [searchParams]);

  // ---------------------------------------------------------
  // Poll status
  // ---------------------------------------------------------
  const fetchStatus = useCallback(async () => {
    try {
      // 1. Orkestrator health
      const healthRes = await fetch(`${API_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setOrchestratorStatus(healthData.status);
        setDbStatus(healthData.database || 'unknown');
      } else {
        setOrchestratorStatus('error');
      }

      // 2. Google-tilkobling
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
      console.error('Status-henting feilet:', err);
      setError('Kunne ikke koble til Orkestratoren');
      setOrchestratorStatus('offline');
      setLoading(false);
    }
  }, [userId]);

  // Initial henting + polling hvert 5. sekund
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ---------------------------------------------------------
  // Hjelpefunksjoner for badge-rendering
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

        {/* Loading */}
        {loading && (
          <div className={styles.loadingContainer}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingText}>Sjekker systemstatus...</p>
          </div>
        )}

        {/* Error */}
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

              {/* NanoClaw Container */}
              <div className={styles.statusItem}>
                <div className={`${styles.statusIcon} ${googleConnected && orchestratorStatus === 'ok' ? styles.statusIconActive : styles.statusIconLoading}`}>
                  {googleConnected && orchestratorStatus === 'ok' ? '🤖' : '⏳'}
                </div>
                <div className={styles.statusInfo}>
                  <div className={styles.statusLabel}>NanoClaw-agent</div>
                  <div className={styles.statusValue}>
                    {googleConnected
                      ? 'Din AI-agent analyserer data'
                      : 'Venter på Google-tilkobling'}
                  </div>
                </div>
                {googleConnected && orchestratorStatus === 'ok' ? (
                  <span className={`${styles.statusBadge} ${styles.badgeActive}`}>
                    <span className={`${styles.pulseDot} ${styles.pulseDotGreen}`} />
                    Kjører
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.badgeLoading}`}>
                    Standby
                  </span>
                )}
              </div>
            </div>

            {/* Last checked */}
            {lastChecked && (
              <p className={styles.lastSynced}>
                Sist oppdatert: {lastChecked.toLocaleTimeString('no-NO')}
                {' · '}Oppdateres automatisk hvert 5. sekund
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
