-- ============================================================
-- Claw Personal — Database Schema (Fase 4)
-- ============================================================
-- Databaseskjema for Orkestratoren. Inneholder tre tabeller:
--
--   1. users           — Brukerprofil, lisensstatus og container-info
--   2. user_tokens     — Krypterte OAuth-tokens (The Vault)
--   3. internal_tokens — Interne autentiseringstokens
--
-- Alle CREATE-setninger bruker IF NOT EXISTS for idempotens.
-- Trygt å kjøre flere ganger uten å miste data.
-- ============================================================

-- Aktiver UUID-generering
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------
-- 1. Brukertabell
-- -----------------------------------------------------------
-- Hver betalende bruker får en rad her. Opprettes ved
-- betalingsbekreftelse (webhook) og oppdateres ved OAuth.
--
-- license_status:
--   'pending'  — bruker opprettet, venter på betaling/onboarding
--   'active'   — betalt og aktiv
--   'expired'  — abonnement utløpt
--   'revoked'  — manuelt deaktivert
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(255) UNIQUE,
  name             VARCHAR(255),
  google_id        VARCHAR(255) UNIQUE,
  license_status   VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (license_status IN ('pending', 'active', 'expired', 'revoked')),
  container_id     VARCHAR(128),
  container_name   VARCHAR(128),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indeks for rask oppslag på lisensstatus
CREATE INDEX IF NOT EXISTS idx_users_license_status ON users (license_status);

-- -----------------------------------------------------------
-- 2. Krypterte OAuth-tokens (The Vault)
-- -----------------------------------------------------------
-- Lagrer kryptert OAuth token-data per bruker.
-- Zero-Knowledge: kolonnene iv, auth_tag og ciphertext er
-- verdiløse uten VAULT_MASTER_KEY som holdes i minnet.
--
-- Én rad per bruker (1:1 med users-tabellen).
-- Ved re-autorisering oppdateres raden med UPSERT.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  iv           TEXT         NOT NULL,
  auth_tag     TEXT         NOT NULL,
  ciphertext   TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 3. Interne autentiseringstokens
-- -----------------------------------------------------------
-- Kobling mellom bruker-ID og den interne tokenen som
-- injiseres i NanoClaw-containeren. Brukes for sikker
-- kommunikasjon mellom container og Orkestrator.
--
-- Én rad per bruker (1:1 med users-tabellen).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_tokens (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token        VARCHAR(128) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indeks for oppslag på token-verdi (container → Orkestrator)
CREATE INDEX IF NOT EXISTS idx_internal_tokens_token ON internal_tokens (token);

-- -----------------------------------------------------------
-- Trigger: Automatisk oppdatering av updated_at
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_users_updated_at'
  ) THEN
    CREATE TRIGGER trigger_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- Trigger for user_tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_user_tokens_updated_at'
  ) THEN
    CREATE TRIGGER trigger_user_tokens_updated_at
      BEFORE UPDATE ON user_tokens
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
