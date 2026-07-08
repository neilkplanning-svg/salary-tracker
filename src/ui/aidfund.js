/**
 * aidfund.js — מסך קרן עזרה: הפקדות, יתרת חיסכון, הלוואות, החזרים
 * Input: state (aidFund, months[], settings)  Output: DOM
 * Deps: store.js, engine.js, strings.he.js
 *
 * מודל (state.aidFund):
 *   deposits: [{ id, date, amount, notes }]
 *   balanceSavings: number   — יתרה ידנית
 *   loans:    [{ id, date, amount, monthlyRepayment, notes, startMonth?, endMonth? }]
 *     — startMonth/endMonth (WP10.11, 'YYYY-MM', אופציונליים): טווח החודשים שבו ההחזר פעיל.
 *       חסר = פתוח-קצה (תמיד פעיל, תואם התנהגות ישנה — loans ללא תאריכים ממשיכים לפעול בכל חודש).
 *
 * ההחזר הכולל לחודש מסוים (Σ loans[].monthlyRepayment עבור הלוואות פעילות ב-monthId, ראו
 * isActiveInMonth ב-engine.js) → engine כ-aidFundRepayment
 * → netAfterReductions = net − reductions + quarterlyBonus − aidFundRepayment − customDeductions
 *
 * מסך זה עצמו מציג את ההשפעה על החודש הנוכחי בלבד (ללא ניווט חודשים) — הסינון לפי טווח
 * עדיין מיושם כדי שתצוגת "השפעה על נטו חודשי" תשקף רק הלוואות פעילות החודש.
 */

import { store } from '../model/store.js';
import { calculate, isActiveInMonth } from '../engine/engine.js';
import { STRINGS, formatCurrency } from './strings.he.js';

/** @returns {string} YYYY-MM בזמן ישראל */
function _todayMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(new Date()).slice(0, 7);
}

/** @returns {string} YYYY-MM-DD בזמן ישראל */
function _todayDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** @param {object} af @returns {number} */
function _totalRepayment(af) {
  return (af?.loans ?? []).reduce((s, l) => s + (l.monthlyRepayment ?? 0), 0);
}

/**
 * סה"כ החזר חודשי להלוואות הפעילות בחודש נתון בלבד (WP10.11 — טווח startMonth/endMonth).
 * @param {object} af state.aidFund
 * @param {string} monthId 'YYYY-MM'
 * @returns {number}
 */
function _activeRepayment(af, monthId) {
  return (af?.loans ?? [])
    .filter(l => isActiveInMonth(l, monthId))
    .reduce((s, l) => s + (l.monthlyRepayment ?? 0), 0);
}

/** @param {string|null} iso — YYYY-MM-DD @returns {string} DD/MM/YYYY */
function _fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} state — מצב האפליקציה הנוכחי
 */
export function render(container, state) {
  const af             = state.aidFund ?? { deposits: [], balanceSavings: 0, loans: [] };
  const deposits       = af.deposits  ?? [];
  const loans          = af.loans     ?? [];
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalRepayment = _totalRepayment(af);

  // חישוב השפעה על החודש הנוכחי — WP10.11: רק הלוואות פעילות ב-monthId (טווח startMonth/endMonth)
  const monthId     = _todayMonth();
  const stored      = state.months.find(m => m.id === monthId) ?? { id: monthId, days: [] };
  const activeRepaymentThisMonth = _activeRepayment(af, monthId);
  const customDeductionsTotal = (state.customDeductions ?? [])
    .filter(cd => isActiveInMonth(cd, monthId))
    .reduce((s, cd) => s + (cd.amount ?? 0), 0);
  let impactResult  = null;
  try {
    impactResult = calculate({
      national:          state.settings.national,
      personal:          state.settings.personal,
      month:             stored,
      reductions:        stored.reductions ?? null,
      aidFundRepayment:  activeRepaymentThisMonth,
      customDeductions:  customDeductionsTotal,
    });
  } catch (_) {}

  container.innerHTML = `
    <div class="aid-screen">
      ${_summaryHTML(af, totalDeposited, totalRepayment)}
      ${_depositsHTML(deposits)}
      ${_loansHTML(loans)}
      ${_impactHTML(impactResult, activeRepaymentThisMonth)}
    </div>`;

  _bind(container);
}

// ─── HTML builders ────────────────────────────────────────────────────────

/** כרטיס סיכום: יתרה (נערכת), סה"כ הופקד, החזר חודשי */
function _summaryHTML(af, totalDeposited, totalRepayment) {
  const bal = af.balanceSavings ?? 0;
  return `
    <div class="card">
      <h3>${STRINGS.aidFund.title}</h3>
      <div class="aid-summary-grid">
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">${STRINGS.aidFund.balance}</span>
          <div class="aid-balance-edit">
            <input id="aid-balance" type="number" min="0" step="0.01"
                   class="aid-bal-input" value="${bal}" placeholder="0">
            <button id="aid-save-balance" class="btn-sec aid-bal-btn">שמור יתרה</button>
          </div>
        </div>
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">סה"כ הופקד</span>
          <strong class="aid-sum-val">${formatCurrency(totalDeposited)}</strong>
        </div>
        <div class="aid-sum-item">
          <span class="aid-sum-lbl">${STRINGS.aidFund.repayment} כולל</span>
          <strong class="aid-sum-val ${totalRepayment > 0 ? 'aid-repayment-active' : ''}">
            ${totalRepayment > 0 ? formatCurrency(totalRepayment) : '—'}
          </strong>
        </div>
      </div>
    </div>`;
}

/** כרטיס הפקדות: רשימה + טופס הוספה */
function _depositsHTML(deposits) {
  const today    = _todayDate();
  const listHTML = deposits.length === 0
    ? `<p class="hint" style="margin:0.35rem 0">אין הפקדות רשומות.</p>`
    : `<div class="aid-tbl-wrap"><table class="aid-table">
        <thead><tr>
          <th>תאריך</th><th>סכום</th><th>הערות</th><th></th>
        </tr></thead>
        <tbody>
          ${deposits.map(d => `
            <tr class="aid-row">
              <td class="aid-c-date">${_fmtDate(d.date)}</td>
              <td class="aid-c-amt">${formatCurrency(d.amount ?? 0)}</td>
              <td class="aid-c-notes">${_esc(d.notes ?? '')}</td>
              <td class="aid-c-del">
                <button class="aid-del" data-type="deposit" data-id="${d.id}" title="מחק" aria-label="מחק הפקדה">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="card">
      <h3>${STRINGS.aidFund.deposits}</h3>
      ${listHTML}
      <details class="aid-add-details">
        <summary class="aid-add-summary">+ הוסף הפקדה</summary>
        <form id="aid-dep-form" class="aid-add-form">
          <div class="aid-add-row">
            <label class="aid-add-lbl">תאריך
              <input id="aid-dep-date" type="date" class="aid-input" value="${today}">
            </label>
            <label class="aid-add-lbl">סכום (₪)
              <input id="aid-dep-amount" type="number" min="0" step="0.01"
                     class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">הערות
              <input id="aid-dep-notes" type="text" class="aid-input" placeholder="">
            </label>
          </div>
          <button type="submit" class="btn-primary" style="margin-top:0.5rem">הוסף הפקדה</button>
        </form>
      </details>
    </div>`;
}

/** כרטיס הלוואות: רשימה + טופס הוספה */
function _loansHTML(loans) {
  const today    = _todayDate();
  const listHTML = loans.length === 0
    ? `<p class="hint" style="margin:0.35rem 0">אין הלוואות רשומות.</p>`
    : `<div class="aid-tbl-wrap"><table class="aid-table">
        <thead><tr>
          <th>תאריך</th><th>סכום הלוואה</th><th>החזר/חודש</th><th>${STRINGS.aidFund.loanFrom}</th><th>${STRINGS.aidFund.loanTo}</th><th>הערות</th><th></th>
        </tr></thead>
        <tbody>
          ${loans.map(l => `
            <tr class="aid-row">
              <td class="aid-c-date">${_fmtDate(l.date)}</td>
              <td class="aid-c-amt">${formatCurrency(l.amount ?? 0)}</td>
              <td class="aid-c-amt aid-repayment-cell">${formatCurrency(l.monthlyRepayment ?? 0)}</td>
              <td>${l.startMonth ?? '—'}</td>
              <td>${l.endMonth ?? '—'}</td>
              <td class="aid-c-notes">${_esc(l.notes ?? '')}</td>
              <td class="aid-c-del">
                <button class="aid-del" data-type="loan" data-id="${l.id}" title="מחק" aria-label="מחק הלוואה">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="card">
      <h3>${STRINGS.aidFund.loans}</h3>
      ${listHTML}
      <details class="aid-add-details">
        <summary class="aid-add-summary">+ הוסף הלוואה</summary>
        <form id="aid-loan-form" class="aid-add-form">
          <div class="aid-add-row">
            <label class="aid-add-lbl">תאריך
              <input id="aid-loan-date" type="date" class="aid-input" value="${today}">
            </label>
            <label class="aid-add-lbl">סכום הלוואה (₪)
              <input id="aid-loan-amount" type="number" min="0" step="0.01"
                     class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">החזר חודשי (₪)
              <input id="aid-loan-rep" type="number" min="0" step="0.01"
                     class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">${STRINGS.aidFund.loanFrom}
              <input id="aid-loan-start" type="month" class="aid-input">
            </label>
            <label class="aid-add-lbl">${STRINGS.aidFund.loanTo}
              <input id="aid-loan-end" type="month" class="aid-input">
            </label>
            <label class="aid-add-lbl">הערות
              <input id="aid-loan-notes" type="text" class="aid-input" placeholder="">
            </label>
          </div>
          <p class="hint" style="margin:0.25rem 0 0">${STRINGS.aidFund.loanFromToHint}</p>
          <button type="submit" class="btn-primary" style="margin-top:0.5rem">הוסף הלוואה</button>
        </form>
      </details>
    </div>`;
}

/**
 * כרטיס השפעה על הנטו החודשי
 * מציג: נטו לאחר הפחתות (ללא קרן עזרה) → ניכוי → נטו סופי
 */
function _impactHTML(result, totalRepayment) {
  if (!result) {
    return `
      <div class="card">
        <h3>השפעה על נטו חודשי</h3>
        <p class="hint">אין נתונים מספיקים לחישוב — הגדר פרמטרים אישיים.</p>
      </div>`;
  }

  if (totalRepayment <= 0) {
    return `
      <div class="card">
        <h3>השפעה על נטו חודשי</h3>
        <p class="hint">אין החזרי הלוואות פעילים. הוסף הלוואה כדי לראות את ההשפעה.</p>
      </div>`;
  }

  // result.netAfterReductions כולל את aidFundRepayment; ה"לפני" הוא result.netAfterReductions + totalRepayment
  const netBeforeAid = result.netAfterReductions + totalRepayment;

  return `
    <div class="card">
      <h3>השפעה על נטו חודשי</h3>
      <table class="aid-impact-table"><tbody>
        <tr class="aid-impact-row">
          <td class="aid-impact-lbl">נטו (לאחר הפחתות)</td>
          <td class="aid-impact-val">${formatCurrency(netBeforeAid)}</td>
        </tr>
        <tr class="aid-impact-row">
          <td class="aid-impact-lbl aid-impact-detail">החזר קרן עזרה</td>
          <td class="aid-impact-val aid-neg">▼ ${formatCurrency(totalRepayment)}</td>
        </tr>
        <tr class="aid-net-row">
          <td class="aid-impact-lbl"><strong>נטו סופי</strong></td>
          <td class="aid-impact-val aid-net-val">
            <strong>${formatCurrency(result.netAfterReductions)}</strong>
          </td>
        </tr>
      </tbody></table>
    </div>`;
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container) {
  // שמירת יתרת חיסכון ידנית
  container.querySelector('#aid-save-balance')?.addEventListener('click', () => {
    const raw = container.querySelector('#aid-balance')?.value;
    const val = parseFloat(raw);
    store.setState(draft => {
      draft.aidFund.balanceSavings = isNaN(val) ? 0 : Math.max(0, val);
    });
    _toast('יתרת חיסכון עודכנה ✓');
  });

  // הוספת הפקדה
  container.querySelector('#aid-dep-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const date   = container.querySelector('#aid-dep-date')?.value;
    const amount = parseFloat(container.querySelector('#aid-dep-amount')?.value);
    const notes  = container.querySelector('#aid-dep-notes')?.value?.trim() ?? '';
    if (!date || isNaN(amount) || amount <= 0) return;

    store.setState(draft => {
      draft.aidFund.deposits.push({
        id:     crypto.randomUUID(),
        date,
        amount: Math.round(amount * 100) / 100,
        notes,
      });
    });
    _toast('הפקדה נוספה ✓');
  });

  // הוספת הלוואה
  container.querySelector('#aid-loan-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const date    = container.querySelector('#aid-loan-date')?.value;
    const amount  = parseFloat(container.querySelector('#aid-loan-amount')?.value);
    const monthly = parseFloat(container.querySelector('#aid-loan-rep')?.value);
    const notes   = container.querySelector('#aid-loan-notes')?.value?.trim() ?? '';
    const startMonth = container.querySelector('#aid-loan-start')?.value || null;
    const endMonth   = container.querySelector('#aid-loan-end')?.value || null;
    if (!date || isNaN(amount) || amount <= 0) return;

    store.setState(draft => {
      draft.aidFund.loans.push({
        id:               crypto.randomUUID(),
        date,
        amount:           Math.round(amount * 100) / 100,
        monthlyRepayment: isNaN(monthly) ? 0 : Math.max(0, Math.round(monthly * 100) / 100),
        notes,
        startMonth,
        endMonth,
      });
    });
    _toast('הלוואה נוספה ✓');
  });

  // מחיקת הפקדה או הלוואה (event delegation)
  container.addEventListener('click', e => {
    const btn = e.target.closest('.aid-del');
    if (!btn) return;
    if (!confirm('למחוק?')) return;
    const { type, id } = btn.dataset;
    store.setState(draft => {
      if (type === 'deposit') {
        draft.aidFund.deposits = draft.aidFund.deposits.filter(d => d.id !== id);
      } else if (type === 'loan') {
        draft.aidFund.loans = draft.aidFund.loans.filter(l => l.id !== id);
      }
    });
  });
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
