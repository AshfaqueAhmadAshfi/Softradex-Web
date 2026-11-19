import { renderQrSvg } from '../lib/qr';

type PlanId = '30d' | '60d' | '90d';
type PayMethodId = 'binance' | 'bkesh' | 'nogod' | 'usdt_bep20';
type ViewMode = 'split' | 'payment' | 'login';
type AdminFilter = 'all' | 'pending' | 'active' | 'deactivated';

interface PlanSpec {
  id: PlanId;
  label: string;
  regularUsd: number;
  offerUsd: number;
}

interface PayGatewaySpec {
  id: PayMethodId;
  label: string;
  title: string;
  value: string;
  currency: 'USD' | 'BDT';
  note: string;
}

interface AdminUserRecord {
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
  status: 'pending' | 'active' | 'deactivated';
  createdAt: number;
  activatedAt: number | null;
  expiresAt: number | null;
}

const BDT_RATE = 121;
const WHATSAPP_NUM = '01531817299';
const WHATSAPP_BASE = 'https://wa.me/8801531817299';

const PLAN_SPECS: Record<PlanId, PlanSpec> = {
  '30d': { id: '30d', label: '30 Days', regularUsd: 60, offerUsd: 30 },
  '60d': { id: '60d', label: '60 Days', regularUsd: 100, offerUsd: 50 },
  '90d': { id: '90d', label: '90 Days', regularUsd: 160, offerUsd: 80 }
};

const PAY_GATEWAYS: Record<PayMethodId, PayGatewaySpec> = {
  binance: {
    id: 'binance',
    label: 'Binance',
    title: 'Binance Pay UID',
    value: '457399626',
    currency: 'USD',
    note: 'Transfer exact USD via Binance Pay ID / UID and send screenshot on WhatsApp.'
  },
  bkesh: {
    id: 'bkesh',
    label: 'Bkesh',
    title: 'Bkesh Send Money Number',
    value: '01867837855',
    currency: 'BDT',
    note: 'Calculate 1 USD = 121 TK and Send Money to this Bkesh Personal number.'
  },
  nogod: {
    id: 'nogod',
    label: 'Nogod',
    title: 'Nogod Send Money Number',
    value: '01531817299',
    currency: 'BDT',
    note: 'Calculate 1 USD = 121 TK and Send Money to this Nogod Personal number.'
  },
  usdt_bep20: {
    id: 'usdt_bep20',
    label: 'USDT (BEP20)',
    title: 'USDT BEP20 Wallet Address',
    value: '0xd34f7247ff68b4d3dd5d1b8f81c5a8417f4a96f9',
    currency: 'USD',
    note: 'Use BNB Smart Chain (BEP20) only. Send screenshot after transfer.'
  }
};

function escapeHtml(raw: string): string {
  return String(raw || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function setAlertBox(el: HTMLElement | null, msg: string, kind: 'error' | 'success' | ''): void {
  if (!el) return;
  if (!msg) {
    el.className = 'sx-form-alert hidden';
    el.innerHTML = '';
    return;
  }
  el.className = `sx-form-alert ${kind === 'success' ? 'is-success' : 'is-error'}`;
  el.innerHTML = msg;
}

function formatDateMonth(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCountdown(expiresAt: number | null, status: AdminUserRecord['status'], now = Date.now()): string {
  if (status === 'pending') return 'Waiting Activation';
  if (status === 'deactivated') return 'Expired / Deactivated';
  if (expiresAt === null) return 'Active';
  const diff = expiresAt - now;
  if (diff <= 0) return 'Expired (Syncing...)';
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return `${days}d ${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s left`;
}

export function initAccessPortal(): void {
  if ((window as any).__sxAccessPortalBound) return;
  (window as any).__sxAccessPortalBound = true;

  const priceModal = document.getElementById('price-modal');
  const authModal = document.getElementById('access-auth-modal');
  const authCard = authModal?.querySelector('.sx-auth-card') as HTMLElement | null;

  let selectedPlan: PlanId | null = null;
  let selectedPayMethod: PayMethodId | null = null;
  let promoDiscountUsd = 0;
  let validatedPromoCode = '';

  const openModal = (modal: HTMLElement | null): void => {
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = (modal: HTMLElement | null): void => {
    if (!modal) return;
    modal.classList.add('hidden');
    const anyVisible = [priceModal, authModal].some((m) => m && !m.classList.contains('hidden'));
    if (!anyVisible) document.body.style.overflow = '';
  };

  const setViewMode = (mode: ViewMode): void => {
    if (!authCard) return;
    authCard.dataset.viewMode = mode;
    authCard.querySelectorAll<HTMLElement>('.sx-mode-btn[data-switch-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.switchMode === mode);
    });
  };

  const syncPaymentSummary = (): { finalUsd: number; amountBdt: number } => {
    const baseEl = document.getElementById('sx-sum-base');
    const totalEl = document.getElementById('sx-sum-total');
    const noteEl = document.getElementById('sx-sum-note');

    if (!selectedPlan) {
      if (baseEl) baseEl.textContent = 'Select 30 Days / 60 Days / 90 Days';
      if (totalEl) totalEl.textContent = 'Choose plan first';
      if (noteEl) noteEl.textContent = `Rate for Bkesh & Nogod: 1 USD = ${BDT_RATE} TK`;
      return { finalUsd: 0, amountBdt: 0 };
    }

    const plan = PLAN_SPECS[selectedPlan];
    const finalUsd = Math.max(0, plan.offerUsd - promoDiscountUsd);
    const amountBdt = Math.round(finalUsd * BDT_RATE);

    if (baseEl) baseEl.textContent = `${plan.label} ($${plan.offerUsd} Offer / Reg $${plan.regularUsd})`;

    if (selectedPayMethod && PAY_GATEWAYS[selectedPayMethod].currency === 'BDT') {
      if (totalEl) totalEl.textContent = `${amountBdt.toLocaleString('en-US')} TK ($${finalUsd})`;
      if (noteEl) noteEl.textContent = `Bkesh / Nogod calculation: $${finalUsd} × ${BDT_RATE} TK = ${amountBdt.toLocaleString('en-US')} TK`;
    } else {
      if (totalEl) totalEl.textContent = `$${finalUsd} USD (${amountBdt.toLocaleString('en-US')} TK)`;
      if (noteEl) noteEl.textContent = `1 USD = ${BDT_RATE} TK if paying via Bkesh or Nogod (${amountBdt.toLocaleString('en-US')} TK)`;
    }

    updateGatewayDetails(finalUsd, amountBdt);
    return { finalUsd, amountBdt };
  };

  const updateGatewayDetails = (finalUsd: number, amountBdt: number): void => {
    const placeholder = document.getElementById('sx-gateway-placeholder');
    const activeBox = document.getElementById('sx-gateway-active');
    const qrBox = document.getElementById('sx-qr-container');
    const titleEl = document.getElementById('sx-gw-title');
    const valEl = document.getElementById('sx-gw-value');
    const noteEl = document.getElementById('sx-gw-note');
    const waLink = document.getElementById('sx-wa-proof-link') as HTMLAnchorElement | null;

    if (!selectedPayMethod) {
      placeholder?.classList.remove('hidden');
      activeBox?.classList.add('hidden');
      return;
    }

    const gw = PAY_GATEWAYS[selectedPayMethod];
    placeholder?.classList.add('hidden');
    activeBox?.classList.remove('hidden');

    if (titleEl) titleEl.textContent = gw.title;
    if (valEl) valEl.textContent = gw.value;

    let amountInstruction = gw.note;
    if (selectedPlan) {
      const amountText =
        gw.currency === 'BDT'
          ? `Payable Amount: ${amountBdt.toLocaleString('en-US')} TK ($${finalUsd} × 121 TK)`
          : `Payable Amount: $${finalUsd} USD / USDT`;
      amountInstruction = `${amountText} — ${gw.note}`;
    }
    if (noteEl) noteEl.textContent = amountInstruction;

    if (qrBox) {
      qrBox.innerHTML = renderQrSvg(gw.value, `${gw.label} Payment QR`);
    }

    if (waLink) {
      const nameVal = (document.getElementById('sx-pay-name') as HTMLInputElement | null)?.value.trim() || '';
      const msgText = [
        'Hello SoftradeX Support,',
        'Here is my payment screenshot.',
        nameVal ? `Account Name: ${nameVal}` : '',
        selectedPlan ? `Plan: ${PLAN_SPECS[selectedPlan].label}` : '',
        `Method: ${gw.label}`,
        selectedPlan ? `Amount: $${finalUsd} (${amountBdt} TK)` : ''
      ].filter(Boolean).join('\n');
      waLink.href = `${WHATSAPP_BASE}?text=${encodeURIComponent(msgText)}`;
    }
  };

  const selectPlan = (planId: PlanId): void => {
    selectedPlan = planId;
    document.querySelectorAll<HTMLElement>('#sx-plan-choices [data-select-plan]').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.selectPlan === planId);
    });
    syncPaymentSummary();
  };

  const selectPayMethod = (methodId: PayMethodId): void => {
    selectedPayMethod = methodId;
    document.querySelectorAll<HTMLElement>('#sx-paymethod-choices [data-select-method]').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.selectMethod === methodId);
    });
    syncPaymentSummary();
  };

  const checkSessionState = async (): Promise<void> => {
    const bar = document.getElementById('sx-active-session-bar');
    const nameSpan = document.getElementById('sx-session-user');
    try {
      const res = await fetch('/api/user/session');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.authenticated && data?.user?.name && bar && nameSpan) {
        nameSpan.textContent = data.user.name;
        bar.classList.remove('hidden');
      } else {
        bar?.classList.add('hidden');
      }
    } catch {
      bar?.classList.add('hidden');
    }
  };

  const openAccessModal = (mode: ViewMode = 'split'): void => {
    setViewMode(mode);
    openModal(authModal);
    void checkSessionState();
  };

  document.getElementById('open-price-modal')?.addEventListener('click', () => {
    openModal(priceModal);
  });

  document.querySelectorAll('#access-dashboard, .closing-access').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openAccessModal('split');
    });
  });

  document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.closeModal;
      closeModal(id ? document.getElementById(id) : null);
    });
  });

  [priceModal, authModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(priceModal);
      closeModal(authModal);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-choose-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.choosePlan as PlanId;
      closeModal(priceModal);
      if (plan && PLAN_SPECS[plan]) selectPlan(plan);
      openAccessModal('payment');
    });
  });

  document.querySelectorAll<HTMLElement>('[data-switch-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.switchMode as ViewMode;
      if (mode) setViewMode(mode);
    });
  });

  // Auto-hide opposite panel cleanly when user focuses directly on Login vs Payment inputs
  document.getElementById('sx-login-panel')?.addEventListener('focusin', () => {
    setViewMode('login');
  });

  document.getElementById('sx-payment-panel')?.addEventListener('focusin', () => {
    if (authCard?.dataset.viewMode === 'login') {
      setViewMode('payment');
    }
  });

  document.querySelectorAll<HTMLElement>('#sx-plan-choices [data-select-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.selectPlan as PlanId;
      if (p) selectPlan(p);
    });
  });

  document.querySelectorAll<HTMLElement>('#sx-paymethod-choices [data-select-method]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.selectMethod as PayMethodId;
      if (m) selectPayMethod(m);
    });
  });

  const promoInputEl = document.getElementById('sx-promo-input') as HTMLInputElement | null;
  const promoApplyBtn = document.getElementById('sx-apply-promo-btn') as HTMLButtonElement | null;
  const promoFeedbackEl = document.getElementById('sx-promo-feedback');

  promoInputEl?.addEventListener('input', () => {
    const val = promoInputEl.value.trim();
    if (val !== validatedPromoCode) {
      promoDiscountUsd = 0;
      validatedPromoCode = '';
      promoApplyBtn?.classList.remove('is-valid');
      if (promoFeedbackEl) {
        promoFeedbackEl.textContent = '';
        promoFeedbackEl.className = 'sx-promo-feedback';
      }
      syncPaymentSummary();
    }
  });

  promoApplyBtn?.addEventListener('click', async () => {
    const code = promoInputEl?.value.trim() || '';
    if (!code) {
      promoDiscountUsd = 0;
      validatedPromoCode = '';
      promoApplyBtn.classList.remove('is-valid');
      if (promoFeedbackEl) {
        promoFeedbackEl.textContent = '';
        promoFeedbackEl.className = 'sx-promo-feedback';
      }
      syncPaymentSummary();
      return;
    }

    promoApplyBtn.disabled = true;
    try {
      const res = await fetch('/api/user/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan || '30d', promoCode: code })
      });
      const data = await res.json();
      if (res.ok && data?.valid) {
        promoDiscountUsd = 20;
        validatedPromoCode = code;
        promoApplyBtn.classList.add('is-valid');
        // Keep feedback silent per request so promo behavior isn't advertised on screen
        if (promoFeedbackEl) {
          promoFeedbackEl.textContent = '';
          promoFeedbackEl.className = 'sx-promo-feedback';
        }
      } else {
        promoDiscountUsd = 0;
        validatedPromoCode = '';
        promoApplyBtn.classList.remove('is-valid');
        if (promoFeedbackEl) {
          promoFeedbackEl.textContent = 'Invalid promo code';
          promoFeedbackEl.className = 'sx-promo-feedback is-warn';
        }
      }
      syncPaymentSummary();
    } catch {
      promoDiscountUsd = 0;
      validatedPromoCode = '';
      syncPaymentSummary();
    } finally {
      promoApplyBtn.disabled = false;
    }
  });

  document.getElementById('sx-pay-name')?.addEventListener('input', () => {
    syncPaymentSummary();
  });

  document.getElementById('sx-copy-gw-btn')?.addEventListener('click', async () => {
    const valEl = document.getElementById('sx-gw-value');
    const copyBtn = document.getElementById('sx-copy-gw-btn');
    const text = valEl?.textContent?.trim() || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      }
    } catch {
      // Fallback ignored safely
    }
  });

  // Payment Registration Submission
  const paymentForm = document.getElementById('sx-payment-form') as HTMLFormElement | null;
  const paymentMsg = document.getElementById('sx-payment-msg');
  const paymentSubmit = document.getElementById('sx-payment-submit') as HTMLButtonElement | null;

  paymentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlertBox(paymentMsg, '', '');

    const name = (document.getElementById('sx-pay-name') as HTMLInputElement)?.value.trim() || '';
    const phoneNumber = (document.getElementById('sx-pay-phone') as HTMLInputElement)?.value.trim() || '';
    const password = (document.getElementById('sx-pay-pass') as HTMLInputElement)?.value || '';
    const confirmPassword = (document.getElementById('sx-pay-confirm') as HTMLInputElement)?.value || '';
    const promoCode = (document.getElementById('sx-promo-input') as HTMLInputElement)?.value.trim() || '';

    if (name.length < 5) {
      setAlertBox(paymentMsg, 'Name must be at least 5 characters.', 'error');
      return;
    }
    if (phoneNumber.replace(/\D/g, '').length < 6) {
      setAlertBox(paymentMsg, 'Please enter a valid Number beside Name.', 'error');
      return;
    }
    if (password.length < 5) {
      setAlertBox(paymentMsg, 'Password must be at least 5 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      setAlertBox(paymentMsg, 'Password and Confirm Password do not match.', 'error');
      return;
    }
    if (!selectedPlan) {
      setAlertBox(paymentMsg, 'Please select a Plan (30 Days, 60 Days, or 90 Days).', 'error');
      return;
    }
    if (!selectedPayMethod) {
      setAlertBox(paymentMsg, 'Please select a Pay-In method (Binance, Bkesh, Nogod, or USDT BEP20).', 'error');
      return;
    }

    if (paymentSubmit) {
      paymentSubmit.disabled = true;
      paymentSubmit.textContent = 'Submitting Request...';
    }

    try {
      const res = await fetch('/api/user/register-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phoneNumber,
          password,
          confirmPassword,
          plan: selectedPlan,
          payMethod: selectedPayMethod,
          promoCode: promoDiscountUsd > 0 ? validatedPromoCode : ''
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAlertBox(paymentMsg, escapeHtml(data?.error || 'Could not submit payment request.'), 'error');
        return;
      }

      const u = data.user;
      const gwLabel = PAY_GATEWAYS[u.payMethod as PayMethodId]?.label || u.payMethod;
      const waText = encodeURIComponent(
        `Hello SoftradeX! I submitted payment for Name: ${u.name}, Number: ${u.phoneNumber}, Plan: ${u.plan}, Method: ${gwLabel}, Amount: $${u.finalUsd} (${u.amountBdt} TK). Attaching screenshot now.`
      );
      setAlertBox(
        paymentMsg,
        `<strong>Submitted for Admin Activation!</strong><br/>` +
          `Account ID: <code>${escapeHtml(u.name)}</code> &bull; Plan: <strong>${escapeHtml(PLAN_SPECS[u.plan as PlanId]?.label || u.plan)}</strong> &bull; Payable: <strong>$${u.finalUsd} (${Number(u.amountBdt).toLocaleString('en-US')} TK)</strong><br/>` +
          `Now send your Payment Screenshot to WhatsApp <a href="${WHATSAPP_BASE}?text=${waText}" target="_blank" rel="noopener noreferrer"><strong>${WHATSAPP_NUM} (Click to Send)</strong></a>`,
        'success'
      );

      (document.getElementById('sx-pay-pass') as HTMLInputElement).value = '';
      (document.getElementById('sx-pay-confirm') as HTMLInputElement).value = '';
    } catch {
      setAlertBox(paymentMsg, 'Network error while submitting request. Please try again.', 'error');
    } finally {
      if (paymentSubmit) {
        paymentSubmit.disabled = false;
        paymentSubmit.textContent = 'Submit Payment Request';
      }
    }
  });

  // Member Login Submission
  const loginForm = document.getElementById('sx-login-form') as HTMLFormElement | null;
  const loginMsg = document.getElementById('sx-login-msg');
  const loginSubmit = document.getElementById('sx-login-submit') as HTMLButtonElement | null;

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlertBox(loginMsg, '', '');
    setViewMode('login');

    const name = (document.getElementById('sx-login-name') as HTMLInputElement)?.value.trim() || '';
    const password = (document.getElementById('sx-login-pass') as HTMLInputElement)?.value || '';

    if (name.length < 5 || password.length < 5) {
      setAlertBox(loginMsg, 'Name and Password must each be at least 5 characters.', 'error');
      return;
    }

    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.textContent = 'Signing In...';
    }

    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAlertBox(loginMsg, escapeHtml(data?.error || 'Login failed.'), 'error');
        return;
      }
      setAlertBox(loginMsg, 'Login verified! Redirecting...', 'success');
      window.location.replace(data.redirect || '/dashboard');
    } catch {
      setAlertBox(loginMsg, 'Network error while signing in.', 'error');
    } finally {
      if (loginSubmit) {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Login to Dashboard';
      }
    }
  });

  // Handle query parameters when redirected from protected dashboard routes
  const params = new URLSearchParams(window.location.search);
  if (params.get('expired') === '1') {
    openAccessModal('login');
    setAlertBox(
      loginMsg,
      `Your subscription period expired or was deactivated. Please renew or contact WhatsApp ${WHATSAPP_NUM}.`,
      'error'
    );
  } else if (params.get('login') === '1') {
    openAccessModal('split');
  }
}

export function initAdminPortal(): void {
  if ((window as any).__sxAdminPortalBound) return;
  (window as any).__sxAdminPortalBound = true;

  const loginCard = document.getElementById('sx-admin-login-card');
  const dashboard = document.getElementById('sx-admin-dashboard');
  const logoutBtn = document.getElementById('sx-admin-logout-btn');
  const loginForm = document.getElementById('sx-admin-login-form') as HTMLFormElement | null;
  const loginMsg = document.getElementById('sx-admin-login-msg');
  const actionMsg = document.getElementById('sx-admin-action-msg');
  const tbody = document.getElementById('sx-admin-users-tbody');
  const searchInput = document.getElementById('sx-admin-search') as HTMLInputElement | null;

  let allUsers: AdminUserRecord[] = [];
  let activeFilter: AdminFilter = 'all';
  let countdownTimer: number | null = null;
  let reloading = false;

  const showDashboardView = (authed: boolean): void => {
    loginCard?.classList.toggle('hidden', authed);
    dashboard?.classList.toggle('hidden', !authed);
    logoutBtn?.classList.toggle('hidden', !authed);
  };

  const renderStats = (): void => {
    const total = allUsers.length;
    const pending = allUsers.filter((u) => u.status === 'pending').length;
    const active = allUsers.filter((u) => u.status === 'active').length;
    const deactivated = allUsers.filter((u) => u.status === 'deactivated').length;
    const set = (id: string, val: number): void => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    set('stat-total', total);
    set('stat-pending', pending);
    set('stat-active', active);
    set('stat-deactivated', deactivated);
  };

  const renderTable = (): void => {
    if (!tbody) return;
    const q = String(searchInput?.value || '').trim().toLowerCase();
    const filtered = allUsers.filter((u) => {
      if (activeFilter !== 'all' && u.status !== activeFilter) return false;
      if (q) {
        return (
          u.name.toLowerCase().includes(q) ||
          u.phoneNumber.toLowerCase().includes(q) ||
          u.payMethod.toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="sx-empty-cell">No matching submissions found.</td></tr>';
      return;
    }

    const now = Date.now();
    tbody.innerHTML = filtered
      .map((u) => {
        const planLabel = PLAN_SPECS[u.plan]?.label || u.plan;
        const payLabel = PAY_GATEWAYS[u.payMethod]?.label || u.payMethod;
        const statusClass =
          u.status === 'active' ? 'is-active' : u.status === 'pending' ? 'is-pending' : 'is-deactivated';
        const statusText = u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending' : 'Deactivated';
        const timerText = formatCountdown(u.expiresAt, u.status, now);
        const expDateStr = u.status === 'active' && u.expiresAt === null
          ? 'Active'
          : formatDateMonth(u.expiresAt);

        return `
          <tr data-user-id="${escapeHtml(u.id)}">
            <td>
              <div class="sx-cell-id">${escapeHtml(u.name)}</div>
              <div class="sx-cell-sub">No: ${escapeHtml(u.phoneNumber)}</div>
            </td>
            <td>
              <code class="sx-pass-chip">${escapeHtml(u.password)}</code>
            </td>
            <td>
              <div class="sx-cell-id">${escapeHtml(planLabel)}</div>
              <div class="sx-cell-sub">${escapeHtml(payLabel)}</div>
            </td>
            <td>
              <div class="sx-cell-id">$${u.finalUsd} &bull; ${Number(u.amountBdt).toLocaleString('en-US')} TK</div>
              <div class="sx-cell-sub">${u.discountUsd > 0 ? `Promo ${escapeHtml(u.promoCode)} (-$${u.discountUsd})` : 'Standard rate'}</div>
            </td>
            <td>
              <div class="sx-cell-sub">Sub: ${escapeHtml(formatDateMonth(u.createdAt))}</div>
              <div class="sx-cell-sub">Act: ${escapeHtml(formatDateMonth(u.activatedAt))}</div>
              <div class="sx-cell-sub">Exp: ${escapeHtml(expDateStr)}</div>
              <span class="sx-timer-pill ${statusClass}" data-expires-at="${u.expiresAt === null ? 'active' : String(u.expiresAt)}" data-status="${u.status}">${escapeHtml(timerText)}</span>
            </td>
            <td>
              <span class="sx-status-pill ${statusClass}">${statusText}</span>
            </td>
            <td>
              <div class="sx-act-btns">
                <button type="button" class="sx-act-btn is-primary" data-user-action="activate_default" data-target-id="${escapeHtml(u.id)}" title="Activate immediately with 30 days default">Active</button>
                <button type="button" class="sx-act-btn" data-user-action="activate_30d" data-target-id="${escapeHtml(u.id)}">30 Days</button>
                <button type="button" class="sx-act-btn" data-user-action="activate_60d" data-target-id="${escapeHtml(u.id)}">60 Days</button>
                <button type="button" class="sx-act-btn is-gold" data-user-action="activate_90d" data-target-id="${escapeHtml(u.id)}">90 Days</button>
                <button type="button" class="sx-act-btn is-warn" data-user-action="deactivate" data-target-id="${escapeHtml(u.id)}">Deactivate</button>
                <button type="button" class="sx-act-btn is-danger" data-user-action="delete" data-target-id="${escapeHtml(u.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const fetchUsers = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        showDashboardView(false);
        return;
      }
      const data = await res.json();
      if (data?.ok && Array.isArray(data.users)) {
        allUsers = data.users;
        renderStats();
        renderTable();
      }
    } catch {
      setAlertBox(actionMsg, 'Failed to load user list.', 'error');
    }
  };

  const startLiveTicker = (): void => {
    if (countdownTimer !== null) window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(() => {
      const now = Date.now();
      let needSync = false;
      document.querySelectorAll<HTMLElement>('.sx-timer-pill[data-expires-at]').forEach((el) => {
        const expAttr = el.dataset.expiresAt;
        const st = (el.dataset.status || 'pending') as AdminUserRecord['status'];
        if (st !== 'active' || !expAttr) return;
        const exp = expAttr === 'active' ? null : Number(expAttr);
        el.textContent = formatCountdown(exp, st, now);
        if (exp !== null && now >= exp) needSync = true;
      });
      if (needSync && !reloading) {
        reloading = true;
        void fetchUsers().finally(() => { reloading = false; });
      }
    }, 1000);
  };

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlertBox(loginMsg, '', '');
    const name = (document.getElementById('sx-admin-user') as HTMLInputElement)?.value.trim() || '';
    const password = (document.getElementById('sx-admin-pass') as HTMLInputElement)?.value || '';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAlertBox(loginMsg, escapeHtml(data?.error || 'Invalid Admin Name or Password.'), 'error');
        return;
      }
      showDashboardView(true);
      startLiveTicker();
      await fetchUsers();
    } catch {
      setAlertBox(loginMsg, 'Network error while signing in.', 'error');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore safely
    }
    showDashboardView(false);
  });

  document.getElementById('sx-admin-refresh-btn')?.addEventListener('click', () => {
    setAlertBox(actionMsg, '', '');
    void fetchUsers();
  });

  searchInput?.addEventListener('input', () => renderTable());

  document.querySelectorAll<HTMLElement>('#sx-admin-filters [data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = (btn.dataset.filter as AdminFilter) || 'all';
      document.querySelectorAll<HTMLElement>('#sx-admin-filters [data-filter]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderTable();
    });
  });

  tbody?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-user-action]');
    if (!btn) return;
    const action = btn.dataset.userAction;
    const userId = btn.dataset.targetId;
    if (!action || !userId) return;

    if (action === 'delete' && !window.confirm('Delete this user submission permanently?')) {
      return;
    }

    setAlertBox(actionMsg, '', '');
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin/users/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAlertBox(actionMsg, escapeHtml(data?.error || 'Action failed.'), 'error');
        return;
      }
      allUsers = data.users;
      renderStats();
      renderTable();
      if (data.target) {
        const planText = PLAN_SPECS[data.target.plan as PlanId]?.label || data.target.plan;
        setAlertBox(
          actionMsg,
          `Updated <strong>${escapeHtml(data.target.name)}</strong> &rarr; Status: <strong>${escapeHtml(data.target.status.toUpperCase())}</strong> (${escapeHtml(planText)}).`,
          'success'
        );
      } else {
        setAlertBox(actionMsg, 'Submission deleted.', 'success');
      }
    } catch {
      setAlertBox(actionMsg, 'Network error performing action.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  void (async () => {
    try {
      const res = await fetch('/api/admin/session');
      const data = await res.json();
      if (data?.authed) {
        showDashboardView(true);
        startLiveTicker();
        await fetchUsers();
      } else {
        showDashboardView(false);
      }
    } catch {
      showDashboardView(false);
    }
  })();
}
