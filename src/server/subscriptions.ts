import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type PlanId = '30d' | '60d' | '90d';
export type PayMethodId = 'binance' | 'bkesh' | 'nogod' | 'usdt_bep20';
export type AccountStatus = 'pending' | 'active' | 'deactivated';

export interface PlanDefinition {
  id: PlanId;
  label: string;
  regularUsd: number;
  offerUsd: number;
  durationDays: number | null;
}

export interface PayMethodDefinition {
  id: PayMethodId;
  label: string;
  accountTitle: string;
  accountValue: string;
  currency: 'USD' | 'BDT';
  qrPayload: string;
  note: string;
}

export interface SubscriptionUser {
  id: string;
  name: string;
  phoneNumber: string;
  password: string;
  plan: PlanId;
  payMethod: PayMethodId;
  promoCode: string;
  baseUsd: number;
  discountUsd: number;
  finalUsd: number;
  amountBdt: number;
  status: AccountStatus;
  createdAt: number;
  activatedAt: number | null;
  expiresAt: number | null;
  updatedAt: number;
}

export interface SubscriptionPricing {
  plan: PlanId;
  planLabel: string;
  regularUsd: number;
  offerUsd: number;
  discountUsd: number;
  finalUsd: number;
  bdtRate: number;
  amountBdt: number;
  promoApplied: boolean;
}

export const BDT_PER_USD = 121;
export const PROMO_CODE_AIUB = 'aiub';
export const PROMO_DISCOUNT_USD = 20;
export const WHATSAPP_SUPPORT_NUMBER = '01531817299';
export const PORTAL_ADMIN_USERNAME = 'Ashfaque';
export const PORTAL_ADMIN_PASS = 'Ashfaque#010';
export const OWNER_DASHBOARD_USERNAME = 'Ashfaque010';
export const OWNER_DASHBOARD_PASS = 'Ashfaque#010';
export const OWNER_SYNTHETIC_ID = '__owner_ashfaque010__';

export const PLANS: Record<PlanId, PlanDefinition> = {
  '30d': { id: '30d', label: '30 Days', regularUsd: 60, offerUsd: 30, durationDays: 30 },
  '60d': { id: '60d', label: '60 Days', regularUsd: 100, offerUsd: 50, durationDays: 60 },
  '90d': { id: '90d', label: '90 Days', regularUsd: 160, offerUsd: 80, durationDays: 90 }
};

export const PAY_METHODS: Record<PayMethodId, PayMethodDefinition> = {
  binance: {
    id: 'binance',
    label: 'Binance Pay',
    accountTitle: 'Binance UID',
    accountValue: '457399626',
    currency: 'USD',
    qrPayload: '457399626',
    note: 'Send USD via Binance Pay using UID 457399626.'
  },
  bkesh: {
    id: 'bkesh',
    label: 'Bkesh',
    accountTitle: 'Bkesh Number',
    accountValue: '01867837855',
    currency: 'BDT',
    qrPayload: '01867837855',
    note: 'Send Money in BDT (1 USD = 121 TK) to Bkesh 01867837855.'
  },
  nogod: {
    id: 'nogod',
    label: 'Nogod',
    accountTitle: 'Nogod Number',
    accountValue: '01531817299',
    currency: 'BDT',
    qrPayload: '01531817299',
    note: 'Send Money in BDT (1 USD = 121 TK) to Nogod 01531817299.'
  },
  usdt_bep20: {
    id: 'usdt_bep20',
    label: 'USDT (BEP20)',
    accountTitle: 'BEP20 Wallet Address',
    accountValue: '0xd34f7247ff68b4d3dd5d1b8f81c5a8417f4a96f9',
    currency: 'USD',
    qrPayload: '0xd34f7247ff68b4d3dd5d1b8f81c5a8417f4a96f9',
    note: 'Transfer USDT strictly on BSC / BEP20 network.'
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'data', 'subscriptions.json');

interface SubscriptionStoreShape {
  users: SubscriptionUser[];
}

function readStore(storePath: string): SubscriptionStoreShape {
  try {
    if (!fs.existsSync(storePath)) return { users: [] };
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as SubscriptionStoreShape;
    return { users: Array.isArray(parsed?.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeStore(storePath: string, data: SubscriptionStoreShape): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, storePath);
}

export function calculateSubscriptionPricing(planId: string, promoRaw = ''): SubscriptionPricing {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    throw new Error('Please select a valid plan (30 Days, 60 Days, or 90 Days).');
  }
  const normalizedPromo = String(promoRaw || '').trim().toLowerCase();
  const promoApplied = normalizedPromo === PROMO_CODE_AIUB;
  const discountUsd = promoApplied ? PROMO_DISCOUNT_USD : 0;
  const finalUsd = Math.max(0, plan.offerUsd - discountUsd);
  return {
    plan: plan.id,
    planLabel: plan.label,
    regularUsd: plan.regularUsd,
    offerUsd: plan.offerUsd,
    discountUsd,
    finalUsd,
    bdtRate: BDT_PER_USD,
    amountBdt: Math.round(finalUsd * BDT_PER_USD),
    promoApplied
  };
}

export function applyAutoExpirations(users: SubscriptionUser[], now = Date.now()): boolean {
  let changed = false;
  for (const user of users) {
    if (user.status === 'active' && typeof user.expiresAt === 'number' && now >= user.expiresAt) {
      user.status = 'deactivated';
      user.updatedAt = now;
      changed = true;
    }
  }
  return changed;
}

export function loadSyncedUsers(storePath = DEFAULT_STORE_PATH, now = Date.now()): SubscriptionUser[] {
  const store = readStore(storePath);
  if (applyAutoExpirations(store.users, now)) {
    writeStore(storePath, store);
  }
  return store.users;
}

export interface RegisterPaymentInput {
  name: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  plan: string;
  payMethod: string;
  promoCode?: string;
}

export function validatePaymentSubmission(input: RegisterPaymentInput): { ok: true } | { ok: false; error: string } {
  const name = String(input.name || '').trim();
  const phone = String(input.phoneNumber || '').trim();
  const password = String(input.password || '');
  const confirm = String(input.confirmPassword || '');

  if (name.length < 5) {
    return { ok: false, error: 'Name must be at least 5 characters.' };
  }
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 6) {
    return { ok: false, error: 'Please enter a valid contact number alongside your name.' };
  }
  if (password.length < 5) {
    return { ok: false, error: 'Password must be at least 5 characters.' };
  }
  if (password !== confirm) {
    return { ok: false, error: 'Password and Confirm Password do not match.' };
  }
  if (!PLANS[input.plan as PlanId]) {
    return { ok: false, error: 'Please choose a plan: 30 Days, 60 Days, or 90 Days.' };
  }
  if (!PAY_METHODS[input.payMethod as PayMethodId]) {
    return { ok: false, error: 'Please choose a Pay-In method: Binance, Bkesh, Nogod, or USDT (BEP20).' };
  }
  return { ok: true };
}

export function submitPaymentRequest(
  input: RegisterPaymentInput,
  storePath = DEFAULT_STORE_PATH,
  now = Date.now()
): { ok: true; user: SubscriptionUser } | { ok: false; error: string; status: number } {
  const validation = validatePaymentSubmission(input);
  if ('error' in validation) {
    return { ok: false, error: validation.error, status: 400 };
  }

  const cleanName = String(input.name).trim();
  const cleanPhone = String(input.phoneNumber).trim();
  const pricing = calculateSubscriptionPricing(input.plan, input.promoCode || '');
  const store = readStore(storePath);
  applyAutoExpirations(store.users, now);

  const duplicate = store.users.find(
    (u) => u.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    return {
      ok: false,
      error: 'An account with this Name already exists. Please login on the right panel or use another Name.',
      status: 409
    };
  }

  const user: SubscriptionUser = {
    id: `usr_${crypto.randomBytes(6).toString('hex')}`,
    name: cleanName,
    phoneNumber: cleanPhone,
    password: String(input.password),
    plan: pricing.plan,
    payMethod: input.payMethod as PayMethodId,
    promoCode: pricing.promoApplied ? PROMO_CODE_AIUB.toUpperCase() : String(input.promoCode || '').trim(),
    baseUsd: pricing.offerUsd,
    discountUsd: pricing.discountUsd,
    finalUsd: pricing.finalUsd,
    amountBdt: pricing.amountBdt,
    status: 'pending',
    createdAt: now,
    activatedAt: null,
    expiresAt: null,
    updatedAt: now
  };

  store.users.unshift(user);
  writeStore(storePath, store);
  return { ok: true, user };
}

export function authenticateSubscriber(
  nameRaw: string,
  passwordRaw: string,
  storePath = DEFAULT_STORE_PATH,
  now = Date.now()
): { ok: true; user: SubscriptionUser } | { ok: false; error: string; status: number } {
  const cleanName = String(nameRaw || '').trim();
  const password = String(passwordRaw || '');

  if (cleanName.length < 5 || password.length < 5) {
    return {
      ok: false,
      error: 'Name and Password must each be at least 5 characters.',
      status: 400
    };
  }

  const users = loadSyncedUsers(storePath, now);
  const found = users.find((u) => u.name.toLowerCase() === cleanName.toLowerCase());
  if (!found || found.password !== password) {
    return { ok: false, error: 'Invalid Name or Password.', status: 401 };
  }
  if (found.status === 'pending') {
    return {
      ok: false,
      error: `Account "${found.name}" is pending approval. Please send your payment screenshot to WhatsApp ${WHATSAPP_SUPPORT_NUMBER}.`,
      status: 403
    };
  }
  if (found.status === 'deactivated' || (typeof found.expiresAt === 'number' && now >= found.expiresAt)) {
    return {
      ok: false,
      error: `Account "${found.name}" has expired or been deactivated. Contact WhatsApp ${WHATSAPP_SUPPORT_NUMBER} to renew.`,
      status: 403
    };
  }

  return { ok: true, user: found };
}

function makeOwnerRecord(): SubscriptionUser {
  return {
    id: OWNER_SYNTHETIC_ID,
    name: OWNER_DASHBOARD_USERNAME,
    phoneNumber: WHATSAPP_SUPPORT_NUMBER,
    password: '',
    plan: '90d',
    payMethod: 'binance',
    promoCode: '',
    baseUsd: 0,
    discountUsd: 0,
    finalUsd: 0,
    amountBdt: 0,
    status: 'active',
    createdAt: 0,
    activatedAt: null,
    expiresAt: null,
    updatedAt: 0
  };
}

export function authenticatePortalLogin(
  nameRaw: string,
  passwordRaw: string,
  storePath = DEFAULT_STORE_PATH,
  now = Date.now()
):
  | { ok: true; kind: 'admin' }
  | { ok: true; kind: 'dashboard'; user: SubscriptionUser }
  | { ok: false; error: string; status: number } {
  const cleanName = String(nameRaw || '').trim();
  const password = String(passwordRaw || '');

  if (cleanName === PORTAL_ADMIN_USERNAME && password === PORTAL_ADMIN_PASS) {
    return { ok: true, kind: 'admin' };
  }
  if (cleanName === OWNER_DASHBOARD_USERNAME && password === OWNER_DASHBOARD_PASS) {
    return { ok: true, kind: 'dashboard', user: makeOwnerRecord() };
  }

  const subRes = authenticateSubscriber(cleanName, password, storePath, now);
  if ('error' in subRes) {
    return subRes;
  }
  return { ok: true, kind: 'dashboard', user: subRes.user };
}

export function findActiveSubscriberById(
  id: string,
  storePath = DEFAULT_STORE_PATH,
  now = Date.now()
): SubscriptionUser | null {
  if (!id) return null;
  if (id === OWNER_SYNTHETIC_ID) return makeOwnerRecord();
  const users = loadSyncedUsers(storePath, now);
  const found = users.find((u) => u.id === id);
  if (!found || found.status !== 'active') return null;
  if (typeof found.expiresAt === 'number' && now >= found.expiresAt) return null;
  return found;
}

export type AdminUserAction = 'activate_default' | 'activate_30d' | 'activate_60d' | 'activate_90d' | 'deactivate' | 'delete';

export function performAdminUserAction(
  userId: string,
  action: AdminUserAction,
  storePath = DEFAULT_STORE_PATH,
  now = Date.now()
): { ok: true; users: SubscriptionUser[]; target?: SubscriptionUser } | { ok: false; error: string; status: number } {
  const store = readStore(storePath);
  applyAutoExpirations(store.users, now);
  const idx = store.users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return { ok: false, error: 'User account not found.', status: 404 };
  }

  const user = store.users[idx];
  if (action === 'delete') {
    store.users.splice(idx, 1);
    writeStore(storePath, store);
    return { ok: true, users: store.users };
  }

  if (action === 'deactivate') {
    user.status = 'deactivated';
    user.updatedAt = now;
    writeStore(storePath, store);
    return { ok: true, users: store.users, target: user };
  }

  const planOverride: PlanId =
    action === 'activate_60d' ? '60d' : action === 'activate_90d' ? '90d' : '30d';
  const planSpec = PLANS[planOverride];
  user.plan = planSpec.id;
  user.status = 'active';
  user.activatedAt = now;
  user.expiresAt = planSpec.durationDays === null ? null : now + planSpec.durationDays * DAY_MS;
  user.updatedAt = now;

  writeStore(storePath, store);
  return { ok: true, users: store.users, target: user };
}
