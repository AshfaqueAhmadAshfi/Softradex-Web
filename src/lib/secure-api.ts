/* Transparent runtime API proof & same-origin session binding for `/api/*` requests. */

function getCookie(name: string): string {
  try {
    const raw = document.cookie || '';
    const prefix = name + '=';
    for (const part of raw.split(';')) {
      const s = part.trim();
      if (s.startsWith(prefix)) return decodeURIComponent(s.slice(prefix.length));
    }
  } catch {}
  return '';
}

function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function sha256Hex(message: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(message);
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  return sha256Fallback(unescape(encodeURIComponent(message)));
}

export function installSecureApiFetch(): void {
  if (typeof window === 'undefined' || (window as any).__sxSecureFetchInstalled) return;
  (window as any).__sxSecureFetchInstalled = true;

  const origFetch = window.fetch.bind(window);
  let initPromise: Promise<void> | null = null;

  async function ensureSession(force = false): Promise<void> {
    if (!force && getCookie('sx_csrf')) return;
    if (!initPromise) {
      initPromise = origFetch('/?_sx_init=1', {
        method: 'HEAD',
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'same-origin',
      })
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          initPromise = null;
        });
    }
    await initPromise;
  }

  window.fetch = async function securedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let urlObj: URL | null = null;
    try {
      urlObj = new URL(rawUrl, window.location.href);
    } catch {
      return origFetch(input, init);
    }

    if (urlObj.origin !== window.location.origin || !urlObj.pathname.startsWith('/api/')) {
      return origFetch(input, init);
    }

    const sendWithProof = async (forceRefresh: boolean): Promise<Response> => {
      await ensureSession(forceRefresh);
      const csrf = getCookie('sx_csrf');
      const tsSec = String(Math.floor(Date.now() / 1000));
      const nonce = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      const proof = await sha256Hex(`${csrf}|${tsSec}|${nonce}|${urlObj!.pathname}|SoftradeX-Gate`);

      const headers = new Headers(
        init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined),
      );
      headers.set('X-SX-Client', 'SoftradeX-UI');
      if (csrf) headers.set('X-SX-Token', csrf);
      headers.set('X-SX-Proof', `${tsSec}.${nonce}.${proof}`);

      const nextInit: RequestInit = {
        ...init,
        headers,
        credentials: 'same-origin',
        referrerPolicy: 'same-origin',
      };
      return origFetch(input, nextInit);
    };

    const res = await sendWithProof(false);
    if (res.status === 403 && !(typeof input !== 'string' && !(input instanceof URL) && input.bodyUsed)) {
      return sendWithProof(true);
    }
    return res;
  };
}
