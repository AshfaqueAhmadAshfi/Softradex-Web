import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PORTAL_ADMIN_PASS, PORTAL_ADMIN_USERNAME } from './subscriptions';

const SESSION_COOKIE = 'sx_sess';
const CSRF_COOKIE = 'sx_csrf';
const LOCK_COOKIE = 'sx_lock';
const USER_COOKIE = 'sx_user';
const PORTAL_ADMIN_COOKIE = 'sx_admin';
const SESSION_TTL_SEC = 12 * 3600;
const PROOF_SKEW_SEC = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_VALID_REQ = 1200;
const RATE_MAX_FAILED_REQ = 45;

const g = globalThis as any;
if (!g.__sxApiSecret) {
  g.__sxApiSecret = process.env.SOFTRADEX_API_SECRET || crypto.randomBytes(32).toString('hex');
}
if (!g.__sxApiRateBuckets) {
  g.__sxApiRateBuckets = new Map<string, number[]>();
}

function getSecret(): string {
  return String(g.__sxApiSecret);
}

function hmacHex(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function sha256Hex(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function safeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = String(req.headers.cookie || '');
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getRequestHost(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
}

function isHttpsReq(req: IncomingMessage): boolean {
  const xf = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (xf.includes('https')) return true;
  return Boolean((req.socket as any)?.encrypted);
}

function appendSetCookie(res: ServerResponse, cookieStr: string): void {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev.map(String), cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookieStr]);
  }
}

function verifySessionToken(sessVal: string): { valid: boolean; ageSec: number } {
  const parts = String(sessVal || '').split('.');
  if (parts.length !== 3) return { valid: false, ageSec: 0 };
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || !/^[a-f0-9]{16,32}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(sig)) {
    return { valid: false, ageSec: 0 };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - ts;
  if (ageSec < -30 || ageSec > SESSION_TTL_SEC) return { valid: false, ageSec };
  const expected = hmacHex(`sess|${tsStr}|${nonce}`);
  return { valid: safeEq(sig, expected), ageSec };
}

function expectedCsrfForSession(sessVal: string): string {
  return hmacHex(`csrf|${sessVal}`).slice(0, 32);
}

export function isAdminKeyRequired(): boolean {
  return Boolean(String(process.env.SOFTRADEX_LOCK_KEY || '').trim());
}

export function isAdminAuthed(req: IncomingMessage): boolean {
  const key = String(process.env.SOFTRADEX_LOCK_KEY || '').trim();
  if (!key) return true;
  const cookies = parseCookies(req);
  const raw = cookies[LOCK_COOKIE] || '';
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || nowSec - ts > SESSION_TTL_SEC || ts - nowSec > 30) return false;
  const expected = hmacHex(`lock|${tsStr}|${nonce}|${sha256Hex(key)}`);
  return safeEq(sig, expected);
}

export function issueAdminLockCookie(req: IncomingMessage, res: ServerResponse, password: string): boolean {
  const key = String(process.env.SOFTRADEX_LOCK_KEY || '').trim();
  if (!key) return true;
  if (!safeEq(sha256Hex(String(password || '')), sha256Hex(key))) return false;
  const tsStr = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(10).toString('hex');
  const sig = hmacHex(`lock|${tsStr}|${nonce}|${sha256Hex(key)}`);
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(res, `${LOCK_COOKIE}=${encodeURIComponent(`${tsStr}.${nonce}.${sig}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secure}`);
  return true;
}

export function clearAdminLockCookie(req: IncomingMessage, res: ServerResponse): void {
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(res, `${LOCK_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function issueUserSessionCookie(req: IncomingMessage, res: ServerResponse, userId: string): void {
  const tsStr = String(Math.floor(Date.now() / 1000));
  const b64Id = Buffer.from(String(userId), 'utf8').toString('base64url');
  const nonce = crypto.randomBytes(10).toString('hex');
  const sig = hmacHex(`user|${tsStr}|${b64Id}|${nonce}`);
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${USER_COOKIE}=${encodeURIComponent(`${tsStr}.${b64Id}.${nonce}.${sig}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secure}`
  );
}

export function getUserSessionFromReq(req: IncomingMessage): { id: string } | null {
  const cookies = parseCookies(req);
  const raw = cookies[USER_COOKIE] || '';
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [tsStr, b64Id, nonce, sig] = parts;
  const ts = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || nowSec - ts > SESSION_TTL_SEC || ts - nowSec > 30) return null;
  if (!safeEq(sig, hmacHex(`user|${tsStr}|${b64Id}|${nonce}`))) return null;
  try {
    const id = Buffer.from(b64Id, 'base64url').toString('utf8');
    return id ? { id } : null;
  } catch {
    return null;
  }
}

export function clearUserSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(res, `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function issuePortalAdminCookie(
  req: IncomingMessage,
  res: ServerResponse,
  username: string,
  password: string
): boolean {
  const userMatch = safeEq(sha256Hex(String(username || '').trim()), sha256Hex(PORTAL_ADMIN_USERNAME));
  const passMatch = safeEq(sha256Hex(String(password || '')), sha256Hex(PORTAL_ADMIN_PASS));
  if (!userMatch || !passMatch) return false;
  const tsStr = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(10).toString('hex');
  const sig = hmacHex(`portal_admin|${tsStr}|${nonce}|${sha256Hex(PORTAL_ADMIN_USERNAME)}`);
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${PORTAL_ADMIN_COOKIE}=${encodeURIComponent(`${tsStr}.${nonce}.${sig}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secure}`
  );
  return true;
}

export function isPortalAdminAuthed(req: IncomingMessage): boolean {
  const cookies = parseCookies(req);
  const raw = cookies[PORTAL_ADMIN_COOKIE] || '';
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || nowSec - ts > SESSION_TTL_SEC || ts - nowSec > 30) return false;
  return safeEq(sig, hmacHex(`portal_admin|${tsStr}|${nonce}|${sha256Hex(PORTAL_ADMIN_USERNAME)}`));
}

export function clearPortalAdminCookie(req: IncomingMessage, res: ServerResponse): void {
  const secure = isHttpsReq(req) ? '; Secure' : '';
  appendSetCookie(res, `${PORTAL_ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

/**
 * Mint signed HttpOnly session + CSRF cookies ONLY on genuine same-site document requests.
 * Returns true if request was the synthetic `?_sx_init=1` handshake and already ended.
 */
export function applyDocumentSessionMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
  const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = urlObj.pathname;
  const method = (req.method || 'GET').toUpperCase();
  const normalizedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const isDocRoute = normalizedPath === '/' || normalizedPath === '/index.html' || normalizedPath === '/access' || normalizedPath === '/dashboard' || normalizedPath === '/admin';
  const isInitPing = urlObj.searchParams.get('_sx_init') === '1' && isDocRoute && method === 'HEAD';

  if (method !== 'GET' && method !== 'HEAD') return false;
  if (!isDocRoute) return false;

  const secSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (isInitPing && secSite && secSite !== 'same-origin') {
    res.statusCode = 403;
    res.end();
    return true;
  }

  const cookies = parseCookies(req);
  const existingSess = cookies[SESSION_COOKIE] || '';
  const check = verifySessionToken(existingSess);
  const shouldRotate = isInitPing || !check.valid || check.ageSec > SESSION_TTL_SEC / 2 || !cookies[CSRF_COOKIE];

  let sessVal = existingSess;
  if (shouldRotate) {
    const tsStr = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(12).toString('hex');
    const sig = hmacHex(`sess|${tsStr}|${nonce}`);
    sessVal = `${tsStr}.${nonce}.${sig}`;
  }
  const csrfVal = expectedCsrfForSession(sessVal);
  const secure = isHttpsReq(req) ? '; Secure' : '';

  if (shouldRotate || cookies[CSRF_COOKIE] !== csrfVal) {
    appendSetCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(sessVal)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secure}`);
    appendSetCookie(res, `${CSRF_COOKIE}=${encodeURIComponent(csrfVal)}; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secure}`);
  }

  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (isInitPing) {
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store, private');
    res.end();
    return true;
  }
  return false;
}

function getClientIp(req: IncomingMessage): string {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.socket?.remoteAddress || 'unknown');
}

function checkRateLimit(bucketKey: string, maxReq: number): boolean {
  const buckets: Map<string, number[]> = g.__sxApiRateBuckets;
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const list = (buckets.get(bucketKey) || []).filter((t) => t > cutoff);
  if (list.length >= maxReq) {
    buckets.set(bucketKey, list);
    return false;
  }
  list.push(now);
  buckets.set(bucketKey, list);
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (!v.length || v[v.length - 1] < cutoff) buckets.delete(k);
    }
  }
  return true;
}

function rejectLocked(res: ServerResponse, status: number, message: string, ip?: string): void {
  if (ip && status === 403 && !checkRateLimit('fail:' + ip, RATE_MAX_FAILED_REQ)) {
    res.statusCode = 429;
  } else {
    res.statusCode = status;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.end(JSON.stringify({ ok: false, locked: true, error: res.statusCode === 429 ? 'API locked: too many blocked attempts.' : message }));
}

function urlMatchesHost(rawUrl: string, expectedHost: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

/**
 * Hard lock on ALL `/api/*` endpoints:
 * - Blocks direct URL bar navigation, external origins/CORS, curl/Postman/scripts without valid signed session & runtime SHA-256 proof.
 * - Rate-limits excessive API scraping.
 */
export function enforceApiLock(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    rejectLocked(res, 403, 'API locked: cross-origin preflight denied.');
    return false;
  }

  // 1. Strict Browser Fetch Metadata & Same-Origin Check (blocks direct browser address bar & external sites)
  const reqHost = getRequestHost(req);
  const secSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const secMode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
  const secDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();

  const ip = getClientIp(req);
  if (secSite && secSite !== 'same-origin') {
    rejectLocked(res, 403, 'API locked: external or direct request blocked.', ip);
    return false;
  }
  if (secMode === 'navigate' || secDest === 'document' || secDest === 'iframe') {
    rejectLocked(res, 403, 'API locked: direct browser access disabled.', ip);
    return false;
  }

  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();
  if (origin && (!reqHost || !urlMatchesHost(origin, reqHost))) {
    rejectLocked(res, 403, 'API locked: untrusted origin.', ip);
    return false;
  }
  if (referer && (!reqHost || !urlMatchesHost(referer, reqHost))) {
    rejectLocked(res, 403, 'API locked: untrusted referer.', ip);
    return false;
  }
  if (!origin && !referer && secSite !== 'same-origin') {
    rejectLocked(res, 403, 'API locked: missing same-origin application context.', ip);
    return false;
  }

  // 2. Per-IP Sliding Window Rate Limit (high limit for valid dashboard traffic; failed probes tightly capped)
  if (!checkRateLimit('ok:' + ip, RATE_MAX_VALID_REQ)) {
    rejectLocked(res, 429, 'API locked: rate limit exceeded.');
    return false;
  }

  // 3. HttpOnly HMAC Session Cookie + Double-Submit CSRF Header + Timestamped SHA-256 Runtime Proof
  const cookies = parseCookies(req);
  const sessVal = cookies[SESSION_COOKIE] || '';
  const sessCheck = verifySessionToken(sessVal);
  if (!sessCheck.valid) {
    rejectLocked(res, 403, 'API locked: active application session required.', ip);
    return false;
  }

  const clientHeader = String(req.headers['x-sx-client'] || '');
  const tokenHeader = String(req.headers['x-sx-token'] || '');
  const expectedCsrf = expectedCsrfForSession(sessVal);
  if (clientHeader !== 'SoftradeX-UI' || !safeEq(tokenHeader, expectedCsrf)) {
    rejectLocked(res, 403, 'API locked: invalid session token.', ip);
    return false;
  }

  const proofHeader = String(req.headers['x-sx-proof'] || '');
  const proofParts = proofHeader.split('.');
  if (proofParts.length !== 3) {
    rejectLocked(res, 403, 'API locked: missing runtime proof.', ip);
    return false;
  }
  const [tsStr, pNonce, pHash] = proofParts;
  const pTs = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(pTs) || Math.abs(nowSec - pTs) > PROOF_SKEW_SEC || !/^[a-z0-9]{6,24}$/i.test(pNonce)) {
    rejectLocked(res, 403, 'API locked: expired request proof.', ip);
    return false;
  }
  const expectedProof = sha256Hex(`${expectedCsrf}|${tsStr}|${pNonce}|${pathname}|SoftradeX-Gate`);
  if (!safeEq(pHash, expectedProof)) {
    rejectLocked(res, 403, 'API locked: proof verification failed.', ip);
    return false;
  }

  // 4. Optional admin lock key (if SOFTRADEX_LOCK_KEY env var is set)
  if (
    isAdminKeyRequired() &&
    pathname !== '/api/login' &&
    pathname !== '/api/auth' &&
    pathname !== '/api/logout' &&
    pathname !== '/api/config' &&
    !pathname.startsWith('/api/user/') &&
    !pathname.startsWith('/api/admin/')
  ) {
    if (!isAdminAuthed(req)) {
      rejectLocked(res, 401, 'API locked: password authentication required.');
      return false;
    }
  }

  return true;
}
