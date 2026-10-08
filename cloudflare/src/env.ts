// Bindings and settings of the Worker. Secrets are set by the pipeline (wrangler deploy --secrets-file), never in git.
export interface Env {
  ASSETS: Fetcher;
  /**
   * Supabase Postgres through Cloudflare Hyperdrive (created and kept up to date by the pipeline from the GitHub secret
   * SUPABASE_DB_URL; the password lives in Hyperdrive, not in the Worker). Hyperdrive is needed because Supabase's
   * certificates come from Supabase's own CA, which a Worker's direct TCP connection does not accept.
   */
  HYPERDRIVE?: Hyperdrive;
  /** Local test / rehearsal only: a database on this computer, used when there is no Hyperdrive binding. */
  DATABASE_URL?: string;
  /** https://<ref>.supabase.co - login tokens are checked against its signing keys (JWKS). */
  SUPABASE_URL?: string;
  /** Secret, optional: Supabase secret (service_role) key. Only Staff mapping > Create login needs it. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Commit being deployed (wrangler deploy --var BUILD_SHA:...). */
  BUILD_SHA?: string;
  /** Rehearsal only ("1"): serves /api/_contract and /api/_schema-check. Never set in production. */
  EXPOSE_CONTRACT?: string;
  /** Local test only ("off"): no login, user is ADMIN. Refused unless DATABASE_URL points at this computer. */
  AUTH_MODE?: string;
  /**
   * System Tracker — the standalone, cross-project issue/health tracker (see src/systemTracker.ts).
   * TRACKER_URL is a plain setting (set in wrangler.jsonc vars); TRACKER_KEY is a secret, set once as the
   * GitHub secret TRACKER_KEY (same value System Tracker itself uses), uploaded by the pipeline like
   * SUPABASE_SERVICE_ROLE_KEY above.
   */
  TRACKER_URL?: string;
  TRACKER_KEY?: string;
}
