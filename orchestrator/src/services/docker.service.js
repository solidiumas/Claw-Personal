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
   * @returns {Promise<object>}    - Container-info { containerId, containerName, status }
   * @throws {Error} Hvis containeren ikke kan opprettes
   */
  async spawnUserContainer(userId, internalToken, virtualKey) {
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
        // Standard modell
        `MODEL_NAME=${config.litellm.defaultModel}`,
        // Bruker-ID for logging og sporing
        `USER_ID=${userId}`,
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
}

module.exports = new DockerService();
