// Split It's scan server: the one thing between the app and Anthropic.
//
// POST /scan  { image: <base64 JPEG> }  with header X-Install-Id
//   200 { receipt }              what Claude read, in the app's RECEIPT_SCHEMA shape
//   400/413 { error }            bad request
//   429 { error: 'limit', reason: 'device' | 'ip' | 'global' }
//   5xx/422 { error }            scanning failed; see receipt.ts
//
// The API key lives here as a Worker secret and never reaches the app. Photos
// pass straight through to Anthropic and are never stored or logged.
import { DurableObject } from 'cloudflare:workers';
import { Decision, Limits, dayKey, decide, limitFrom } from './limits';
import { readReceipt } from './receipt';
import { validateScan } from './validate';

export interface Env {
  ANTHROPIC_API_KEY?: string;
  QUOTA: DurableObjectNamespace<Quota>;
  PER_DEVICE_DAILY?: string;
  PER_IP_DAILY?: string;
  GLOBAL_DAILY?: string;
  MAX_IMAGE_BYTES?: string;
}

/**
 * Today's scan counts. One instance for the whole app keeps the global ceiling
 * exact; at a few hundred scans a day that's nowhere near its throughput.
 */
export class Quota extends DurableObject<Env> {
  /** Counts one scan if it fits today's limits; a refused scan is never counted. */
  async take(day: string, device: string, ip: string, limits: Limits): Promise<Decision> {
    const storage = this.ctx.storage;
    // Only today's counts matter, so a new day starts from an empty store.
    if ((await storage.get<string>('day')) !== day) {
      await storage.deleteAll();
      await storage.put('day', day);
    }
    const keys = { device: `d:${device}`, ip: `i:${ip}`, global: 'g' };
    const stored = await storage.get<number>([keys.device, keys.ip, keys.global]);
    const counts = {
      device: stored.get(keys.device) ?? 0,
      ip: stored.get(keys.ip) ?? 0,
      global: stored.get(keys.global) ?? 0,
    };
    const decision = decide(counts, limits);
    if (decision.ok) {
      await storage.put({
        [keys.device]: counts.device + 1,
        [keys.ip]: counts.ip + 1,
        [keys.global]: counts.global + 1,
      });
    }
    return decision;
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** IPs are personal data — only a hash is ever stored, and only for the day. */
const hash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') return new Response('ok');
    if (url.pathname !== '/scan') return json(404, { error: 'not_found' });
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!env.ANTHROPIC_API_KEY) return json(500, { error: 'server_misconfigured' });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'bad_json' });
    }

    const maxImageBytes = limitFrom(env.MAX_IMAGE_BYTES, 4_000_000);
    const checked = validateScan(request.headers.get('x-install-id'), body, maxImageBytes);
    if (!checked.ok) return json(checked.status, { error: checked.error });

    const limits: Limits = {
      perDevice: limitFrom(env.PER_DEVICE_DAILY, 20),
      perIp: limitFrom(env.PER_IP_DAILY, 40),
      global: limitFrom(env.GLOBAL_DAILY, 300),
    };
    const ip = await hash(request.headers.get('cf-connecting-ip') ?? 'unknown');
    const quota = env.QUOTA.get(env.QUOTA.idFromName('global'));
    const decision = await quota.take(dayKey(new Date()), checked.request.installId, ip, limits);
    if (!decision.ok) return json(429, { error: 'limit', reason: decision.reason });

    const result = await readReceipt(env.ANTHROPIC_API_KEY, checked.request.image);
    return result.ok ? json(200, { receipt: result.receipt }) : json(result.status, { error: result.error });
  },
} satisfies ExportedHandler<Env>;
