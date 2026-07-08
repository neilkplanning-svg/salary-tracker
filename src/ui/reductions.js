/**
 * reductions.js — מסך הפחתות שכר זמני
 * Input: state (months[], settings, customDeductions[])  Output: DOM מסך הפחתות
 * Deps: store.js, engine.js, strings.he.js
 *
 * מודל: month.reductions = { fromRegular, fromOvertime, quarterlyBonus, bonusDeduction }
 * המנוע מחשב: netAfterReductions = net − fromRegular − fromOvertime + quarterlyBonus
 *             − bonusDeduction − aidFundRepayment − customDeductions
 * ראו PRD §5.3 שלב 11 ו-engine.js.
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
  const red     = stored.reductions ?? {};

  // חישוב חי כולל הפחתות וקרן עזרה — להצגת ההשפעה על netAfterReductions
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
      reductions:        stored.reductions ?? null,
      aidFundRepayment:  aidFundRepayment,
      customDeductions:  customDeductionsTotal,
    });
  } catch (_) {}

  container.innerHTML = `
    <div class="red-screen">
      ${_navHTML(monthId, y, m)}
      ${_formHTML(red)}
      ${_impactHTML(result, red, aidFundRepayment, activeCustomDeductions)}
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
 * טופס הזנת הפחתות/מענקים
 * @param {object} red — reductions שמורות (עשוי להיות ריק {})
 */
function _formHTML(red) {
  const v = key => (red[key] != null && red[key] !== 0) ? red[key] : '';
  return `
    <div class="card">
      <h3>${STRINGS.reductions.title}</h3>
      <form id="red-form" class="red-form" novalidate>
        ${_field('red-from-regular',    STRINGS.reductions.fromRegular,    v('fromRegular'),    false)}
        ${_field('red-from-overtime',   STRINGS.reductions.fromOvertime,   v('fromOvertime'),   false)}
        ${_field('red-quarterly-bonus', STRINGS.reductions.quarterlyBonus, v('quarterlyBonus'), true)}
        ${_field('red-bonus-deduction', STRINGS.reductions.bonusDeduction, v('bonusDeduction'), false)}
        <div class="red-actions">
          <button type="submit" class="btn-primary">שמור</button>
          <button type="button" id="red-clear" class="btn-sec">נקה</button>
        </div>
      </form>
    </div>`;
}

/**
 * שורת שדה בטופס ההפחתות
 * @param {string}  id        — id של ה-input
 * @param {string}  label     — תווית
 * @param {number|string} val — ערך נוכחי
 * @param {boolean} isAddition — true=תוספת (ירוק ▲), false=ניכוי (אדום ▼)
 */
function _field(id, label, val, isAddition) {
  const signCls  = isAddition ? 'red-sign-add' : 'red-sign-sub';
  const signText = isAddition ? '▲ תוספת' : '▼ ניכוי';
  return `
    <div class="red-field">
      <label class="red-lbl" for="${id}">
        ${label}
        <small class="red-sign ${signCls}">${signText}</small>
      </label>
      <div class="red-input-wrap">
        <input id="${id}" type="number" min="0" step="0.01"
               class="red-input" value="${val}" placeholder="0">
        <span class="red-unit">₪</span>
      </div>
    </div>`;
}

/**
 * כרטיס השפעה: נטו לפני ואחרי הפחתות
 * @param {object|null} result — תוצאת calculate() עם reductions
 * @param {object}      red    — reductions שמורות
 * @param {number}      aidFundRepayment — החזר קרן עזרה חודשי ששימש בחישוב (WP10.4 חלק ג')
 * @param {Array<{label:string, amount:number}>} [activeCustomDeductions] ניכויים קבועים פעילים לחודש (WP10.11)
 */
function _impactHTML(result, red, aidFundRepayment = 0, activeCustomDeductions = []) {
  if (!result) {
    return `
      <div class="card">
        <h3>השפעה על נטו</h3>
        <p class="hint">אין נתונים מספיקים לחישוב — הגדר פרמטרים אישיים במסך הגדרות.</p>
      </div>`;
  }

  const fromReg  = red.fromRegular    ?? 0;
  const fromOT   = red.fromOvertime   ?? 0;
  const quarterly = red.quarterlyBonus ?? 0;
  const bonusDed = red.bonusDeduction  ?? 0;
  const aidFund  = aidFundRepayment    ?? 0;
  const customTotal = activeCustomDeductions.reduce((s, cd) => s + (cd.amount ?? 0), 0);
  // WP10.4 חלק ג': ההלוואה מקרן עזרה משפיעה על netAfterReductions גם ללא הפחתה ידנית —
  // "יש מה להציג" כולל אותה, כדי שהשורה תופיע ושהשורות יתאזנו ל-total. WP10.11: כנ"ל לניכויים קבועים.
  const hasAny   = fromReg > 0 || fromOT > 0 || quarterly > 0 || bonusDed > 0 || aidFund > 0 || customTotal > 0;

  let rows = `
    <tr class="red-impact-row">
      <td class="red-impact-lbl">${STRINGS.estimate.net}</td>
      <td class="red-impact-val">${formatCurrency(result.net)}</td>
    </tr>`;

  if (hasAny) {
    if (fromReg  > 0) rows += _adjustRow(STRINGS.reductions.fromRegular,    -fromReg);
    if (fromOT   > 0) rows += _adjustRow(STRINGS.reductions.fromOvertime,   -fromOT);
    if (quarterly > 0) rows += _adjustRow(STRINGS.reductions.quarterlyBonus, quarterly);
    if (bonusDed > 0) rows += _adjustRow(STRINGS.reductions.bonusDeduction,  -bonusDed);
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
        הזן ערכים בטופס ולחץ <strong>שמור</strong> להצגת ההשפעה.
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

  // שמירת טופס
  container.querySelector('#red-form').addEventListener('submit', e => {
    e.preventDefault();
    const parse = id => {
      const raw = container.querySelector(`#${id}`)?.value?.trim();
      if (!raw) return 0;
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : Math.max(0, n);
    };

    const updated = {
      fromRegular:    parse('red-from-regular'),
      fromOvertime:   parse('red-from-overtime'),
      quarterlyBonus: parse('red-quarterly-bonus'),
      bonusDeduction: parse('red-bonus-deduction'),
    };

    store.setState(draft => {
      let mo = draft.months.find(m => m.id === monthId);
      if (!mo) {
        mo = { id: monthId, days: [], estimate: null, actual: null };
        draft.months.push(mo);
        draft.months.sort((a, b) => a.id.localeCompare(b.id));
      }
      mo.reductions = updated;
    });

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = 'הפחתות נשמרו ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  });

  // ניקוי הפחתות לחודש
  container.querySelector('#red-clear').addEventListener('click', () => {
    if (!confirm('למחוק את ההפחתות/מענקים לחודש זה?')) return;
    store.setState(draft => {
      const mo = draft.months.find(m => m.id === monthId);
      if (mo) mo.reductions = null;
    });
  });

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
