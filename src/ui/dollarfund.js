/**
 * dollarfund.js — מסך קרן דולרית: מעקב עצמאי (USD) על הפקדות ופדיונות
 * Input: state (dollarFund, settings.personal.dollarFundRules)  Output: DOM
 * Deps: store.js, strings.he.js
 *
 * WP10.10 — USER-DECIDED: הקרן הדולרית אינה מופיעה בתלוש — נעקבת בנפרד לגמרי.
 * מודול זה הוא TRACKING בלבד — אינו מייבא/קורא ל-calculate() ואינו משפיע על
 * הברוטו/נטו של מנוע השכר.
 *
 * מודל (state.dollarFund):
 *   deposits:    [{ id, date, amountUsd, notes }]
 *   redemptions: [{ id, date, amountUsd, type: 'research-travel'|'personal'|'retirement', notes }]
 *
 * יתרה נגזרת בזמן render (לא נשמרת): Σ deposits.amountUsd − Σ redemptions.amountUsd.
 *
 * כללי הקרן (settings.personal.dollarFundRules — ניתנים לעריכה, לא hard-coded בקוד):
 *   minBalanceUsd      — רצפה: פדיון לא יכול להוריד את היתרה מתחתיה (למעט 'retirement')
 *   personalYearCapUsd — תקרת משיכה אישית לשנה קלנדרית (type='personal' בלבד)
 *   personalTaxRate    — מס על משיכה אישית/פרישה (research-travel פטור לגמרי)
 */

import { store } from '../model/store.js';
import { STRINGS, formatUsd } from './strings.he.js';

const S = STRINGS.dollarFund;

/** @returns {string} YYYY-MM-DD בזמן ישראל */
function _todayDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** @param {string|null} iso — YYYY-MM-DD @returns {string} DD/MM/YYYY */
function _fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** @param {object} df state.dollarFund @returns {number} */
function _balance(df) {
  const deposited = (df.deposits ?? []).reduce((s, d) => s + (d.amountUsd ?? 0), 0);
  const redeemed  = (df.redemptions ?? []).reduce((s, r) => s + (r.amountUsd ?? 0), 0);
  return deposited - redeemed;
}

/**
 * סה"כ נטו שהתקבל בפועל עד כה: research-travel פטור (מלא); personal/retirement — אחרי מס.
 * @param {object} df state.dollarFund @param {number} taxRate
 * @returns {number}
 */
function _netReceived(df, taxRate) {
  return (df.redemptions ?? []).reduce((s, r) => {
    const amt = r.amountUsd ?? 0;
    if (r.type === 'research-travel') return s + amt;
    return s + amt * (1 - taxRate);
  }, 0);
}

/** @param {object} df @param {string} year 'YYYY' @returns {number} סה"כ משיכה אישית בשנה קלנדרית */
function _personalYtd(df, year) {
  return (df.redemptions ?? [])
    .filter(r => r.type === 'personal' && (r.date ?? '').slice(0, 4) === year)
    .reduce((s, r) => s + (r.amountUsd ?? 0), 0);
}

/**
 * @param {HTMLElement} container
 * @param {object} state — מצב האפליקציה הנוכחי
 */
export function render(container, state) {
  const df    = state.dollarFund ?? { deposits: [], redemptions: [] };
  const rules = state.settings?.personal?.dollarFundRules
    ?? { minBalanceUsd: 2000, personalYearCapUsd: 5000, personalTaxRate: 0.47 };

  const deposits    = df.deposits ?? [];
  const redemptions = df.redemptions ?? [];
  const balance     = _balance(df);
  const netReceived = _netReceived(df, rules.personalTaxRate);
  const thisYear    = _todayDate().slice(0, 4);
  const personalYtd = _personalYtd(df, thisYear);

  container.innerHTML = `
    <div class="aid-screen">
      ${_summaryHTML(balance, netReceived, personalYtd, rules)}
      ${_depositsHTML(deposits)}
      ${_redemptionsHTML(redemptions, rules)}
    </div>`;

  _bind(container, rules);
}

// ─── HTML builders ────────────────────────────────────────────────────────

/** כרטיס סיכום: יתרה נגזרת, נטו שהתקבל, משיכה אישית השנה */
function _summaryHTML(balance, netReceived, personalYtd, rules) {
  return `
    <div class="card">
      <h3>${S.title}</h3>
      <p class="hint">${S.hint}</p>
      <div class="aid-summary-grid">
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">${S.balance}</span>
          <strong class="aid-sum-val">${formatUsd(balance)}</strong>
        </div>
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">${S.netReceived}</span>
          <strong class="aid-sum-val">${formatUsd(netReceived)}</strong>
        </div>
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">${S.personalYtd}</span>
          <strong class="aid-sum-val ${personalYtd > 0 ? 'aid-repayment-active' : ''}">
            ${formatUsd(personalYtd)} / ${formatUsd(rules.personalYearCapUsd)}
          </strong>
        </div>
      </div>
    </div>`;
}

/** כרטיס הפקדות: רשימה + טופס הוספה */
function _depositsHTML(deposits) {
  const today    = _todayDate();
  const listHTML = deposits.length === 0
    ? `<p class="hint" style="margin:0.35rem 0">${S.depositsEmpty}</p>`
    : `<div class="aid-tbl-wrap"><table class="aid-table">
        <thead><tr>
          <th>${S.date}</th><th>${S.amountUsd}</th><th>${S.notes}</th><th></th>
        </tr></thead>
        <tbody>
          ${deposits.map(d => `
            <tr class="aid-row">
              <td class="aid-c-date">${_fmtDate(d.date)}</td>
              <td class="aid-c-amt">${formatUsd(d.amountUsd ?? 0)}</td>
              <td class="aid-c-notes">${_esc(d.notes ?? '')}</td>
              <td class="aid-c-del">
                <button class="aid-del" data-type="deposit" data-id="${d.id}" title="מחק" aria-label="מחק הפקדה">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="card">
      <h3>${S.deposits}</h3>
      ${listHTML}
      <details class="aid-add-details">
        <summary class="aid-add-summary">${S.addDeposit}</summary>
        <form id="df-dep-form" class="aid-add-form">
          <div class="aid-add-row">
            <label class="aid-add-lbl">${S.date}
              <input id="df-dep-date" type="date" class="aid-input" value="${today}">
            </label>
            <label class="aid-add-lbl">${S.amountUsd}
              <input id="df-dep-amount" type="number" min="0" step="0.01"
                     class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">${S.notes}
              <input id="df-dep-notes" type="text" class="aid-input" placeholder="">
            </label>
          </div>
          <button type="submit" class="btn-primary" style="margin-top:0.5rem">${S.addDeposit}</button>
        </form>
      </details>
    </div>`;
}

/** כרטיס פדיונות: רשימה + טופס הוספה + כפתור פדיון פרישה */
function _redemptionsHTML(redemptions, rules) {
  const today    = _todayDate();
  const typeLabel = t => t === 'research-travel' ? S.typeResearchTravel
                       : t === 'personal'        ? S.typePersonal
                       : t === 'retirement'       ? S.typeRetirement
                       : t;
  const netAfterTaxOf = r => {
    if (r.type === 'research-travel') return null;
    return (r.amountUsd ?? 0) * (1 - rules.personalTaxRate);
  };

  const listHTML = redemptions.length === 0
    ? `<p class="hint" style="margin:0.35rem 0">${S.redemptionsEmpty}</p>`
    : `<div class="aid-tbl-wrap"><table class="aid-table">
        <thead><tr>
          <th>${S.date}</th><th>${S.amountUsd}</th><th>${S.type}</th><th>${S.netAfterTax}</th><th>${S.notes}</th><th></th>
        </tr></thead>
        <tbody>
          ${redemptions.map(r => {
            const net = netAfterTaxOf(r);
            return `
            <tr class="aid-row">
              <td class="aid-c-date">${_fmtDate(r.date)}</td>
              <td class="aid-c-amt">${formatUsd(r.amountUsd ?? 0)}</td>
              <td>${typeLabel(r.type)}</td>
              <td class="aid-c-amt">${net == null ? '—' : formatUsd(net)}</td>
              <td class="aid-c-notes">${_esc(r.notes ?? '')}</td>
              <td class="aid-c-del">
                <button class="aid-del" data-type="redemption" data-id="${r.id}" title="מחק" aria-label="מחק פדיון">✕</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="card">
      <h3>${S.redemptions}</h3>
      ${listHTML}
      <details class="aid-add-details">
        <summary class="aid-add-summary">${S.addRedemption}</summary>
        <form id="df-red-form" class="aid-add-form">
          <div class="aid-add-row">
            <label class="aid-add-lbl">${S.date}
              <input id="df-red-date" type="date" class="aid-input" value="${today}">
            </label>
            <label class="aid-add-lbl">${S.amountUsd}
              <input id="df-red-amount" type="number" min="0" step="0.01"
                     class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">${S.type}
              <select id="df-red-type" class="aid-input">
                <option value="research-travel">${S.typeResearchTravel}</option>
                <option value="personal">${S.typePersonal}</option>
                <option value="retirement">${S.typeRetirement}</option>
              </select>
            </label>
            <label class="aid-add-lbl">${S.notes}
              <input id="df-red-notes" type="text" class="aid-input" placeholder="">
            </label>
          </div>
          <button type="submit" class="btn-primary" style="margin-top:0.5rem">${S.addRedemption}</button>
        </form>
      </details>
      <button type="button" id="df-retirement-btn" class="btn-sec" style="margin-top:0.6rem">${S.retirementBtn}</button>
    </div>`;
}

// ─── Event bindings ───────────────────────────────────────────────────────

/**
 * מבטיח ש-draft.dollarFund קיים לפני כתיבה (מסמכים ישנים מלפני WP10.10 חסרים אותו לגמרי —
 * fillNationalDefaults ממלא רק settings.national, לא שדות רמת-שורש חדשים).
 * @param {object} draft
 */
function _ensureDollarFund(draft) {
  if (!draft.dollarFund) draft.dollarFund = { deposits: [], redemptions: [] };
  if (!Array.isArray(draft.dollarFund.deposits)) draft.dollarFund.deposits = [];
  if (!Array.isArray(draft.dollarFund.redemptions)) draft.dollarFund.redemptions = [];
}

function _bind(container, rules) {
  // הוספת הפקדה
  container.querySelector('#df-dep-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const date   = container.querySelector('#df-dep-date')?.value;
    const amount = parseFloat(container.querySelector('#df-dep-amount')?.value);
    const notes  = container.querySelector('#df-dep-notes')?.value?.trim() ?? '';
    if (!date || isNaN(amount) || amount <= 0) return;

    store.setState(draft => {
      _ensureDollarFund(draft);
      draft.dollarFund.deposits.push({
        id:        crypto.randomUUID(),
        date,
        amountUsd: Math.round(amount * 100) / 100,
        notes,
      });
    });
    _toast(`${S.depositAdded} ✓`);
  });

  // הוספת פדיון — עם אכיפת הכללים (רצפת יתרה + תקרה שנתית אישית)
  container.querySelector('#df-red-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const date   = container.querySelector('#df-red-date')?.value;
    const amount = parseFloat(container.querySelector('#df-red-amount')?.value);
    const type   = container.querySelector('#df-red-type')?.value;
    const notes  = container.querySelector('#df-red-notes')?.value?.trim() ?? '';
    if (!date || isNaN(amount) || amount <= 0) return;

    if (!_tryAddRedemption(date, amount, type, notes, rules)) return;
    _toast(`${S.redemptionAdded} ✓`);
  });

  // כפתור "פדיון פרישה" — פדיון של כל היתרה הנוכחית
  container.querySelector('#df-retirement-btn')?.addEventListener('click', () => {
    const state   = store.getState();
    const df      = state.dollarFund ?? { deposits: [], redemptions: [] };
    const balance = _balance(df);
    if (balance <= 0) {
      alert('אין יתרה לפדיון.');
      return;
    }
    const today = _todayDate();
    store.setState(draft => {
      _ensureDollarFund(draft);
      draft.dollarFund.redemptions.push({
        id:        crypto.randomUUID(),
        date:      today,
        amountUsd: Math.round(balance * 100) / 100,
        type:      'retirement',
        notes:     '',
      });
    });
    _toast(`${S.redemptionAdded} ✓`);
  });

  // מחיקת הפקדה או פדיון (event delegation)
  container.addEventListener('click', e => {
    const btn = e.target.closest('.aid-del');
    if (!btn) return;
    if (!confirm('למחוק?')) return;
    const { type, id } = btn.dataset;
    store.setState(draft => {
      _ensureDollarFund(draft);
      if (type === 'deposit') {
        draft.dollarFund.deposits = draft.dollarFund.deposits.filter(d => d.id !== id);
      } else if (type === 'redemption') {
        draft.dollarFund.redemptions = draft.dollarFund.redemptions.filter(r => r.id !== id);
      }
    });
  });
}

/**
 * מנסה להוסיף פדיון תוך אכיפת כללי הקרן; חוסם ומתריע אם מפר כלל.
 * @returns {boolean} true אם נוסף בהצלחה
 */
function _tryAddRedemption(date, amount, type, notes, rules) {
  const state   = store.getState();
  const df      = state.dollarFund ?? { deposits: [], redemptions: [] };
  const balance = _balance(df);

  // (a) רצפת יתרה מינימלית — חלה רק על משיכה אישית ('personal'); 'research-travel' הוא
  // שימוש הליבה של הקרן (אינו מוגבל), ו-'retirement' מרוקן את הקרן בכוונה (גם הוא פטור).
  if (type === 'personal' && (balance - amount) < rules.minBalanceUsd) {
    alert(`${S.blockedFloor} ${formatUsd(rules.minBalanceUsd)}`);
    return false;
  }

  // (b) תקרת משיכה אישית לשנה קלנדרית — רק type='personal'
  if (type === 'personal') {
    const year = (date || _todayDate()).slice(0, 4);
    const ytd  = _personalYtd(df, year);
    if (ytd + amount > rules.personalYearCapUsd) {
      alert(`${S.blockedYearCap} ${formatUsd(rules.personalYearCapUsd)}`);
      return false;
    }
  }

  store.setState(draft => {
    _ensureDollarFund(draft);
    draft.dollarFund.redemptions.push({
      id:        crypto.randomUUID(),
      date,
      amountUsd: Math.round(amount * 100) / 100,
      type,
      notes,
    });
  });
  return true;
}

/** escaping למניעת HTML injection בטקסט משתמש */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
