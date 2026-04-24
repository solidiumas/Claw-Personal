// ============================================================
// Claw Personal — Docker Service
// ============================================================
// Dockerode-integrasjon for å spinne opp isolerte
// NanoClaw-containere per bruker.
//
// Hver brukercontainer:
//   - Kobles til det lukkede "claw-internal"-nettverket
//   - Kan KUN nå litellm-proxy:4000 (ingen direkte internett)
//   - Mottar en intern token for autentisering
//   - Mottar en Virtual Key for LLM-tilgang
//   - Kjører NanoClaw-motoren i isolasjon
//
// Containeren startes på under 1 sekund — "Zero Delay".
// ============================================================

const Dockerode = require('dockerode');
const config = require('../config');

class DockerService {
  constructor() {
    // Kobler til Docker daemon via Unix socket (standard)
    this._docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Spinner opp en isolert NanoClaw-container for en bruker.
   *
   * @param {string} userId        - Unik brukeridentifikator
   * @param {string} internalToken - Generert intern token for autentisering
   * @param {string} virtualKey    - LiteLLM Virtual Key for LLM-tilgang
   * @param {string} [youtubeHandle] - YouTube-handle (f.eks. '@Janovich') (Fase 8)
   * @returns {Promise<object>}    - Container-info { containerId, containerName, status }
   * @throws {Error} Hvis containeren ikke kan opprettes
   */
  async spawnUserContainer(userId, internalToken, virtualKey, youtubeHandle = null) {
    const containerName = `claw-user-${userId}`;

    // Sjekk om containeren allerede eksisterer og fjern den
    await this._removeExistingContainer(containerName);

    console.log(`[Docker] Starter NanoClaw-container for bruker: ${userId}`);
    console.log(`[Docker]   Container: ${containerName}`);
    console.log(`[Docker]   Image:     ${config.docker.nanoclawImage}`);
    console.log(`[Docker]   Nettverk:  ${config.docker.networkName}`);

    // Opprett containeren
    const container = await this._docker.createContainer({
      name: containerName,
      Image: config.docker.nanoclawImage,
      Env: [
        // Intern token for autentisering mot Orkestratoren
        `INTERNAL_TOKEN=${internalToken}`,
        // Virtual Key for LLM-tilgang via LiteLLM proxy
        `OPENAI_API_KEY=${virtualKey}`,
        // LiteLLM proxy base URL (tilgjengelig via claw-internal nettverk)
        `OPENAI_API_BASE=${config.litellm.internalUrl}`,
        // Orkestrator URL for Vault API (Fase 7)
        `ORCHESTRATOR_URL=http://claw-orchestrator:3000`,
        // Standard modell
        `MODEL_NAME=${config.litellm.defaultModel}`,
        // Bruker-ID for logging og sporing
        `USER_ID=${userId}`,
        // Fase 8: YouTube-kanal for NanoClaw-agenten
        // Injiseres alltid — tom streng om handle ikke er satt
        `YOUTUBE_CHANNEL=${youtubeHandle || ''}`,
      ],
      HostConfig: {
        // Ressursbegrensninger
        Memory: config.docker.memoryLimit,
        CpuQuota: config.docker.cpuQuota,
        CpuPeriod: config.docker.cpuPeriod,
        // Restart-policy
        RestartPolicy: config.docker.restartPolicy,
        // Nettverk konfigureres etter opprettelse
      },
    });

    // Koble containeren til det lukkede interne nettverket
    const network = this._docker.getNetwork(config.docker.networkName);
    await network.connect({ Container: container.id });

    // Start containeren
    await container.start();

    // Hent status
    const inspectData = await container.inspect();
    const status = inspectData.State.Status;

    console.log(`[Docker] Container '${containerName}' startet!`);
    console.log(`[Docker]   Status: ${status}`);

    return {
      containerId: container.id,
      containerName,
      status,
    };
  }

  /**
   * Fjerner en eksisterende container hvis den finnes.
   * @param {string} containerName - Navn på containeren
   */
  async _removeExistingContainer(containerName) {
    try {
      const existing = this._docker.getContainer(containerName);
      const inspectData = await existing.inspect();
      if (inspectData) {
        console.log(`[Docker] Container '${containerName}' eksisterer allerede. Fjerner...`);
        try { await existing.stop(); } catch { /* Allerede stoppet */ }
        await existing.remove();
        console.log(`[Docker] Eksisterende container fjernet.`);
      }
    } catch {
      // Container finnes ikke — alt OK
    }
  }

  // ---------------------------------------------------------
  // Wake-signal (Fase 3: Magic Connect)
  // ---------------------------------------------------------

  /**
   * Sender et wake-signal til en brukers NanoClaw-container
   * for å informere om at OAuth-tokens er klare i The Vault.
   *
   * Etter at brukeren har fullført OAuth-flyten og tokenene er
   * kryptert i Vault, kaller Orkestratoren denne metoden for å
   * «vekke» containeren: "Du har fått tilgang. Start
   * initialiserings-protokoll."
   *
   * Containeren kan da:
   *   1. Gjøre et internt API-kall til Orkestratoren for å
   *      hente (dekrypterte) tokens
   *   2. Koble seg til Gmail, Calendar og YouTube
   *   3. Starte sin første analyse-runde
   *
   * Teknisk gjennomføring: Vi bruker Docker exec for å sende
   * et signal til containeren. Alternativt kan vi bruke et
   * internt HTTP-kall eller en meldingskø (Redis pub/sub).
   *
   * PRODUKSJON: Vurder å bruke Redis pub/sub eller en intern
   * webhook for mer robust signalering, f.eks.:
   *   POST http://claw-user-{userId}:8080/wake
   *
   * @param {string} userId - Bruker-ID
   * @returns {Promise<object>} - { containerId, containerName, signalSent }
   * @throws {Error} Hvis containeren ikke finnes eller er stoppet
   */
  async wakeContainer(userId) {
    const containerName = `claw-user-${userId}`;

    console.log(`[Docker] Sender wake-signal til container: ${containerName}`);

    try {
      const container = this._docker.getContainer(containerName);
      const inspectData = await container.inspect();

      // Sjekk at containeren kjører
      if (inspectData.State.Status !== 'running') {
        throw new Error(
          `Container '${containerName}' er ikke i kjørende tilstand ` +
          `(status: ${inspectData.State.Status})`
        );
      }

      // Kjør et wake-kommando inne i containeren.
      // Dette sender et signal til NanoClaw-motoren om at den
      // skal starte initialiserings-protokollen.
      //
      // NanoClaw-containeren forventes å ha et skript eller en
      // prosess som lytter på dette signalet, f.eks.:
      //   - En fil /tmp/wake.signal som overvåkes
      //   - En intern HTTP-server på port 8080
      //   - En Redis pub/sub listener
      //
      // For MVP bruker vi en enkel tilnærming: skriv en fil
      // som NanoClaw-motoren overvåker.
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'echo "OAUTH_TOKENS_READY" > /tmp/wake.signal'],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({ Detach: false });

      console.log(`[Docker] Wake-signal sendt til container: ${containerName}`);
      console.log(`[Docker]   Signal: OAUTH_TOKENS_READY → /tmp/wake.signal`);

      return {
        containerId: inspectData.Id,
        containerName,
        signalSent: true,
      };

    } catch (err) {
      console.error(`[Docker] Kunne ikke sende wake-signal til '${containerName}': ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DockerService();
