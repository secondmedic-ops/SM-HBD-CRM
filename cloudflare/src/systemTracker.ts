// Reports errors and health checks to System Tracker — the one place that
// collects issues/health from every secondmedic-ops project (see
// https://system-tracker.secondmedic.workers.dev and its README.md for the
// full API). Best-effort, never throws: a failure to reach System Tracker
// must never break the real request that triggered it.
import { Env } from './env';

const PROJECT = 'sm-hbd-crm';

export function reportIssue(
  env: Env,
  entry: {
    component: string;
    title: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    errorMessage?: string | null;
    context?: unknown;
    createdBy?: string;
  },
): Promise<void> {
  return send(env, '/api/issues', {
    project: PROJECT,
    component: entry.component,
    title: entry.title,
    severity: entry.severity ?? 'medium',
    source: 'auto',
    error_message: entry.errorMessage ?? null,
    context: entry.context ?? null,
    created_by: entry.createdBy ?? 'system',
  });
}

export function reportHealth(
  env: Env,
  entry: { component: string; status: 'up' | 'down'; latencyMs?: number | null; detail?: string | null },
): Promise<void> {
  return send(env, '/api/health', {
    project: PROJECT,
    component: entry.component,
    status: entry.status,
    latency_ms: entry.latencyMs ?? null,
    detail: entry.detail ?? null,
  });
}

async function send(env: Env, path: string, body: unknown): Promise<void> {
  try {
    const url = env.TRACKER_URL;
    const key = env.TRACKER_KEY;
    if (!url || !key) {
      console.error('[system-tracker] TRACKER_URL/TRACKER_KEY not configured — not reported:', path);
      return;
    }
    await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'x-tracker-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[system-tracker] failed to report:', (err as Error)?.message);
  }
}
