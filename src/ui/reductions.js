/**
 * reductions.js — מסך ניכויים קבועים + קרן עזרה (השפעה על נטו)
 * Input: state (months[], settings, customDeductions[])  Output: DOM המסך
 * Deps: store.js, engine.js, strings.he.js
 *
 * WP12.5: טופס "הפחתות שכר זמניות" (month.reductions) הוסר — המנוע כבר לא מקבל reductions.
 * netAfterReductions = net − aidFundRepayment − customDeductions.
 *
 * WP10.11: state.customDeductions[] — ניכויים קבועים מותאמים-אישית (חברות בוועד/הלוואה וכו'),
 * כל איבר { id, label, amount, startMonth?, endMonth? }. הסינון לפי טווח החודש נעשה כאן ב-UI
 * (isActiveInMonth מ-engine.js) ומסוכם לפני מסירה ל-calculate() כ-customDeductions (סקלר).
 */

import { store } from '../model/store.js';
import { calculate, isActiveInMonth } from '../engine/engine.js';
import { STRINGS, formatCurrency } from './strings.he.js';

const HEB_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

let _viewMonthId = null;

/** @returns {string} YYYY-MM בזמן ישראל */
function _todayMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(new Date()).slice(0, 7);
}

/** @param {string} monthId @param {number} delta @returns {string} YYYY-MM */
function _shiftMonth(monthId, delta) {
  const [y, m] = monthId.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} state — מצב האפליקציה הנוכחי
 */
export function render(container, state) {
  if (!_viewMonthId) _viewMonthId = _todayMonth();

  const monthId = _viewMonthId;
  const [y, m]  = monthId.split('-').map(Number);
  const stored  = state.months.find(mo => mo.id === monthId) ?? { id: monthId, days: [] };

  // חישוב חי כולל קרן עזרה וניכויים קבועים — להצגת ההשפעה על netAfterReductions
  // WP10.11: הלוואות/ניכויים קבועים מסוננים לפי טווח startMonth/endMonth של החודש המוצג
  const aidFundRepayment = (state.aidFund?.loans ?? [])
    .filter(l => isActiveInMonth(l, monthId))
    .reduce((s, l) => s + (l.monthlyRepayment ?? 0), 0);
  const activeCustomDeductions = (state.customDeductions ?? [])
    .filter(cd => isActiveInMonth(cd, monthId));
  const customDeductionsTotal = activeCustomDeductions
    .reduce((s, cd) => s + (cd.amount ?? 0), 0);
  let result = null;
  try {
    result = calculate({
      national:          state.settings.national,
      personal:          state.settings.personal,
      month:             stored,
      reductions:        null, // WP12.5: הפחתות שכר זמניות הוסרו; לא מוחלות עוד
      aidFundRepayment:  aidFundRepayment,
      customDeductions:  customDeductionsTotal,
    });
  } catch (_) {}

  container.innerHTML = `
    <div class="red-screen">
      ${_navHTML(monthId, y, m)}
      ${_impactHTML(result, aidFundRepayment, activeCustomDeductions)}
      ${_customDeductionsHTML(state.customDeductions ?? [])}
    </div>`;

  _bind(container, monthId);
}

// ─── HTML builders ────────────────────────────────────────────────────────

function _navHTML(monthId, y, m) {
  return `
    <div class="card red-nav">
      <button class="btn-nav" id="red-prev">‹ קודם</button>
      <h2 class="red-month-title">${HEB_MONTHS[m - 1]} ${y}</h2>
      <button class="btn-nav" id="red-next">הבא ›</button>
    </div>`;
}

/**
 * כרטיס השפעה: נטו לפני ואחרי ניכויים (קרן עזרה + ניכויים קבועים)
 * @param {object|null} result — תוצאת calculate()
 * @param {number}      aidFundRepayment — החזר קרן עזרה חודשי ששימש בחישוב
 * @param {Array<{label:string, amount:number}>} [activeCustomDeductions] ניכויים קבועים פעילים לחודש (WP10.11)
 */
function _impactHTML(result, aidFundRepayment = 0, activeCustomDeductions = []) {
  if (!result) {
    return `
      <div class="card">
        <h3>השפעה על נטו</h3>
        <p class="hint">אין נתונים מספיקים לחישוב — הגדר פרמטרים אישיים במסך הגדרות.</p>
      </div>`;
  }

  const aidFund  = aidFundRepayment    ?? 0;
  const customTotal = activeCustomDeductions.reduce((s, cd) => s + (cd.amount ?? 0), 0);
  const hasAny   = aidFund > 0 || customTotal > 0;

  let rows = `
    <tr class="red-impact-row">
      <td class="red-impact-lbl">${STRINGS.estimate.net}</td>
      <td class="red-impact-val">${formatCurrency(result.net)}</td>
    </tr>`;

  if (hasAny) {
    if (aidFund  > 0) rows += _adjustRow(STRINGS.estimate.aidFundRepayment,  -aidFund);
    for (const cd of activeCustomDeductions) {
      if ((cd.amount ?? 0) > 0) rows += _adjustRow(cd.label, -cd.amount);
    }
    rows += `
    <tr class="red-net-row">
      <td class="red-impact-lbl"><strong>${STRINGS.estimate.netAfterRed}</strong></td>
      <td class="red-impact-val red-net-val"><strong>${formatCurrency(result.netAfterReductions)}</strong></td>
    </tr>`;
  } else {
    rows += `
    <tr class="red-impact-row">
      <td colspan="2" class="red-impact-lbl hint" style="padding-top:0.5rem">
        הוסף ניכוי קבוע או הלוואת קרן עזרה כדי לראות את ההשפעה.
      </td>
    </tr>`;
  }

  return `
    <div class="card">
      <h3>השפעה על נטו</h3>
      <table class="red-impact-table"><tbody>${rows}</tbody></table>
    </div>`;
}

/**
 * שורת התאמה בטבלת ההשפעה
 * @param {string} lbl     — תיאור
 * @param {number} amount  — חיובי=תוספת, שלילי=ניכוי
 */
function _adjustRow(lbl, amount) {
  const isPos  = amount > 0.005;
  const cls    = isPos ? 'red-pos' : 'red-neg';
  const arrow  = isPos ? '▲' : '▼';
  const prefix = isPos ? '+' : '';
  const fmt    = formatCurrency(Math.abs(amount));
  return `
    <tr class="red-impact-row">
      <td class="red-impact-lbl red-impact-detail">${lbl}</td>
      <td class="red-impact-val ${cls}">${arrow} ${prefix}${fmt}</td>
    </tr>`;
}

/**
 * כרטיס "ניכויים קבועים" (WP10.11) — רשימת state.customDeductions + טופס הוספה.
 * כל איבר: { id, label, amount, startMonth?, endMonth? } — startMonth/endMonth 'YYYY-MM', אופציונליים.
 * @param {Array<object>} customDeductions — state.customDeductions (כל הרשימה, לא רק הפעילים לחודש)
 */
function _customDeductionsHTML(customDeductions) {
  const S = STRINGS.reductions;
  const listHTML = customDeductions.length === 0
    ? `<p class="hint" style="margin:0.35rem 0">${S.customEmpty}</p>`
    : `<div class="aid-tbl-wrap"><table class="aid-table">
        <thead><tr>
          <th>${S.customLabel}</th><th>${S.customAmount}</th><th>${S.customFrom}</th><th>${S.customTo}</th><th></th>
        </tr></thead>
        <tbody>
          ${customDeductions.map(cd => `
            <tr class="aid-row">
              <td>${_esc(cd.label ?? '')}</td>
              <td class="aid-c-amt">${formatCurrency(cd.amount ?? 0)}</td>
              <td>${cd.startMonth ?? '—'}</td>
              <td>${cd.endMonth ?? '—'}</td>
              <td class="aid-c-del">
                <button class="cd-del" data-id="${cd.id}" title="${S.customRemove}" aria-label="${S.customRemove}">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="card">
      <h3>${S.customTitle}</h3>
      <p class="hint">${S.customHint}</p>
      ${listHTML}
      <details class="aid-add-details">
        <summary class="aid-add-summary">+ ${S.customAdd}</summary>
        <form id="cd-add-form" class="aid-add-form">
          <div class="aid-add-row">
            <label class="aid-add-lbl">${S.customLabel}
              <input id="cd-label" type="text" class="aid-input" placeholder="${S.customLabelPlaceholder}">
            </label>
            <label class="aid-add-lbl">${S.customAmount}
              <input id="cd-amount" type="number" min="0" step="0.01" class="aid-input" placeholder="0">
            </label>
            <label class="aid-add-lbl">${S.customFrom}
              <input id="cd-start" type="month" class="aid-input">
            </label>
            <label class="aid-add-lbl">${S.customTo}
              <input id="cd-end" type="month" class="aid-input">
            </label>
          </div>
          <p class="hint" style="margin:0.25rem 0 0">${S.customFromToHint}</p>
          <button type="submit" class="btn-primary" style="margin-top:0.5rem">${S.customAdd}</button>
        </form>
      </details>
    </div>`;
}

/** escaping למניעת HTML injection בטקסט משתמש */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container, monthId) {
  // ניווט חודש
  container.querySelector('#red-prev').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, -1);
    render(container, store.getState());
  });
  container.querySelector('#red-next').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, 1);
    render(container, store.getState());
  });

  // WP12.5: טופס ההפחתות הזמניות הוסר — נותרו ניווט חודש + ניכויים קבועים בלבד.

  // הוספת ניכוי קבוע מותאם-אישית (WP10.11)
  container.querySelector('#cd-add-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const label  = container.querySelector('#cd-label')?.value?.trim();
    const amount = parseFloat(container.querySelector('#cd-amount')?.value);
    const start  = container.querySelector('#cd-start')?.value || null;
    const end    = container.querySelector('#cd-end')?.value || null;
    if (!label || isNaN(amount) || amount <= 0) return;

    store.setState(draft => {
      if (!Array.isArray(draft.customDeductions)) draft.customDeductions = [];
      draft.customDeductions.push({
        id:     crypto.randomUUID(),
        label,
        amount: Math.round(amount * 100) / 100,
        startMonth: start,
        endMonth:   end,
      });
    });
  });

  // מחיקת ניכוי קבוע
  container.addEventListener('click', e => {
    const btn = e.target.closest('.cd-del');
    if (!btn) return;
    if (!confirm('למחוק ניכוי קבוע זה?')) return;
    const { id } = btn.dataset;
    store.setState(draft => {
      draft.customDeductions = (draft.customDeductions ?? []).filter(cd => cd.id !== id);
    });
  });
}
