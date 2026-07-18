/**
 * estimate.js — מסך משוער: נטו משוער + פירוט רכיבים + snapshot
 * Input: state (months[], settings)  Output: DOM מסך משוער
 * Deps: store.js, engine.js, strings.he.js
 *
 * זרימה: חישוב חי (calculate()) בכל render → פירוט שורות → שמירת snapshot
 * Snapshot: month.estimate = { ...engineResult } (paramsSnapshot + computedAt מוטמעים במנוע)
 * כלל #6: snapshot נשמר ידנית; לא מחושב מחדש אוטומטית.
 */

import { store } from '../model/store.js';
import { calculate, isActiveInMonth } from '../engine/engine.js';
import { STRINGS, formatCurrency } from './strings.he.js';
import { categorizeDay } from '../engine/attendance-hours.js';
import { EARNING_COMPONENTS } from '../engine/defaults.js';

const HEB_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

/** חודש נצפה כ-UI state — שורד re-renders (module singleton) */
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
  const days    = stored.days ?? [];
  const attParams = state.settings?.national?.attendanceParams ?? null;

  // WP8.4: הפעל categorizeDay לסיכום שעות עדכני (אם יש attParams + start/end)
  // fallback ל-regularHours ידני אם אין
  const enrichedForDisplay = days.map(d => {
    if (attParams && d.start && d.end) {
      const dow = new Date((d.date ?? '2000-01-01') + 'T12:00:00Z').getDay();
      const cat = categorizeDay(
        { start: d.start, end: d.end, breakCode: d.breakCode ?? null, dow },
        attParams,
      );
      return { ...d, ...cat };
    }
    return d;
  });

  // שעות מנוכחות — regularPaid (מחושב) עם fallback ל-regularHours ידני
  const sumReg   = enrichedForDisplay.reduce((s, d) => s + (d.regularPaid   ?? d.regularHours  ?? 0), 0);
  const sumOT    = enrichedForDisplay.reduce((s, d) => s + (d.overtimeHours ?? 0), 0);
  const sumZero  = enrichedForDisplay.reduce((s, d) => s + (d.zeroHours     ?? 0), 0);
  const sumUnap  = enrichedForDisplay.reduce((s, d) => s + (d.unapprovedHours ?? 0), 0);
  const cap      = stored.overtimeApprovedCap ?? null;

  // חישוב חי — כולל הפחתות וקרן עזרה (WP3.4, WP3.5)
  // WP10.11: הלוואות/ניכויים קבועים מסוננים לפי טווח startMonth/endMonth של החודש המוצג
  const aidFundRepayment = (state.aidFund?.loans ?? [])
    .filter(l => isActiveInMonth(l, monthId))
    .reduce((s, l) => s + (l.monthlyRepayment ?? 0), 0);
  const customDeductionsList = state.customDeductions ?? [];
  const customDeductionsTotal = customDeductionsList
    .filter(cd => isActiveInMonth(cd, monthId))
    .reduce((s, cd) => s + (cd.amount ?? 0), 0);
  let result;
  try {
    result = calculate({
      national:          state.settings.national,
      personal:          state.settings.personal,
      month:             stored,
      reductions:        null, // WP12.5: הפחתות שכר זמניות הוסרו
      aidFundRepayment:  aidFundRepayment,
      customDeductions:  customDeductionsTotal,
    });
  } catch (err) {
    container.innerHTML = `<div class="card"><p class="error-list">שגיאה בחישוב: ${err.message}</p></div>`;
    return;
  }

  const snapshot = stored.estimate ?? null;
  // snapshot "מיושן" אם הנטו השתנה ביותר מ-₪0.50 מאז השמירה
  const stale = snapshot && (
    Math.abs((snapshot.gross ?? 0) - result.gross) > 0.5 ||
    Math.abs((snapshot.net   ?? 0) - result.net)   > 0.5
  );

  container.innerHTML = `
    <div class="est-screen">
      ${_navHTML(monthId, y, m)}
      ${_hoursHTML(sumReg, sumOT, sumZero, sumUnap, cap, attParams != null)}
      ${_shortfallHTML(result)}
      ${_breakdownHTML(result, state.settings.personal, aidFundRepayment, customDeductionsList.filter(cd => isActiveInMonth(cd, monthId)))}
      ${_snapshotHTML(snapshot, stale)}
    </div>`;

  _bind(container, monthId, result);
}

// ─── HTML builders ────────────────────────────────────────────────────────

/**
 * הצגת נתוני השלמת חיסורים חודשית (WP8.2).
 * מוצג רק כשיש נתוני נוכחות מחושבים (shortfallComputed=true).
 */
function _shortfallHTML(r) {
  if (!r.shortfallComputed) return '';

  const salaryCut = r.salaryCutHours    ?? 0;
  const zeroUtil  = r.zeroUtilizationPct ?? 0;
  const covOT     = r.coveredFromOT     ?? 0;
  const covZero   = r.coveredFromZero   ?? 0;
  const covUnap   = r.coveredFromUnapproved ?? 0;

  const hasAlert    = salaryCut > 0;
  const hasCoverage = covOT > 0 || covZero > 0 || covUnap > 0;
  if (!hasAlert && !hasCoverage && zeroUtil === 0) return '';

  let rows = '';
  if (covZero > 0)
    rows += `<div class="est-h-row"><span class="est-h-lbl">כוסה משעות אפס</span><span class="est-h-val">${covZero.toFixed(2)} ש׳</span></div>`;
  if (covOT > 0)
    rows += `<div class="est-h-row"><span class="est-h-lbl">כוסה מש"נ (מוריד מתשלום ש"נ)</span><span class="est-h-val">${covOT.toFixed(2)} ש׳</span></div>`;
  if (covUnap > 0)
    rows += `<div class="est-h-row"><span class="est-h-lbl">כוסה משעות ללא אישור</span><span class="est-h-val">${covUnap.toFixed(2)} ש׳</span></div>`;
  if (hasCoverage || zeroUtil > 0)
    rows += `<div class="est-h-row"><span class="est-h-lbl">ניצול שעות אפס</span><span class="est-h-val">${zeroUtil.toFixed(1)}%</span></div>`;

  return `
    ${hasAlert ? `<div class="card est-salary-cut-alert">
      <strong>⚠ חיסור לא מכוסה — ירידת שכר!</strong>
      <p>${salaryCut.toFixed(2)} שעות חיסור לא מכוסות עלולות להפחית מהשכר.</p>
    </div>` : ''}
    ${hasCoverage || zeroUtil > 0 ? `<div class="card">
      <h3>השלמת חיסורים</h3>
      <div class="est-hours-list">${rows}</div>
    </div>` : ''}`;
}

function _navHTML(monthId, y, m) {
  return `
    <div class="card est-nav">
      <button class="btn-nav" id="est-prev">‹ קודם</button>
      <h2 class="est-month-title">${HEB_MONTHS[m - 1]} ${y}</h2>
      <button class="btn-nav" id="est-next">הבא ›</button>
    </div>`;
}

function _hoursHTML(sumReg, sumOT, sumZero, sumUnap, cap, hasComputed) {
  const usedOT   = cap != null ? Math.min(sumOT, cap) : sumOT;
  const capped   = cap != null && sumOT > cap;
  return `
    <div class="card">
      <h3>שעות חודשי</h3>
      <div class="est-hours-list">
        <div class="est-h-row">
          <span class="est-h-lbl">${STRINGS.attendance.regularHours}</span>
          <span class="est-h-val">${sumReg.toFixed(1)} ש׳</span>
        </div>
        <div class="est-h-row">
          <span class="est-h-lbl">${STRINGS.attendance.overtimeHours} (מנוכחות)</span>
          <span class="est-h-val">${sumOT.toFixed(1)} ש׳</span>
        </div>
        ${hasComputed && sumZero > 0 ? `
        <div class="est-h-row">
          <span class="est-h-lbl">${STRINGS.attendance.zeroHours}</span>
          <span class="est-h-val">${sumZero.toFixed(1)} ש׳</span>
        </div>` : ''}
        ${hasComputed && sumUnap > 0 ? `
        <div class="est-h-row">
          <span class="est-h-lbl" style="color:var(--color-warning)">שעות ללא אישור</span>
          <span class="est-h-val" style="color:var(--color-warning)">${sumUnap.toFixed(1)} ש׳</span>
        </div>` : ''}
        <div class="est-h-row est-cap-row">
          <label class="est-h-lbl" for="est-ot-cap">מכסת ש"נ מאושרת</label>
          <span class="est-cap-wrap">
            <input id="est-ot-cap" type="number" min="0" step="0.5"
                   class="est-cap-input"
                   value="${cap != null ? cap : ''}"
                   placeholder="ריק = כולן">
            <span class="est-h-hint">ש׳</span>
          </span>
        </div>
        ${capped ? `
        <div class="est-h-row">
          <span class="est-h-lbl" style="color:var(--color-warning)">ש"נ לחישוב (מוגבל למכסה)</span>
          <span class="est-h-val" style="color:var(--color-warning)">${usedOT.toFixed(1)} ש׳</span>
        </div>` : ''}
      </div>
    </div>`;
}

/**
 * בנה שורה בטבלת הפירוט
 * @param {string} lbl תיאור
 * @param {number} n סכום (שלילי = ניכוי)
 * @param {string} [extra] CSS class נוסף
 */
function _row(lbl, n, extra = '') {
  return `
    <tr class="est-row ${extra}">
      <td class="est-td-lbl">${lbl}</td>
      <td class="est-td-amt ${n < 0 ? 'est-neg' : 'est-pos'}">${formatCurrency(n)}</td>
    </tr>`;
}

/** שורת הסבר קטנה מוזחת מתחת לשורה הראשית */
function _sub(txt) {
  return `
    <tr class="est-subrow">
      <td colspan="2" class="est-sublbl">${txt}</td>
    </tr>`;
}

/** מפריד */
function _sep(lbl = '') {
  return `<tr class="est-sep-row"><td colspan="2" class="est-sep-lbl">${lbl}</td></tr>`;
}

/** שורת נטו (גדולה ובולטת) */
function _netRow(lbl, n) {
  return `
    <tr class="est-net-row">
      <td class="est-td-lbl"><strong>${lbl}</strong></td>
      <td class="est-td-amt est-net-val"><strong>${formatCurrency(n)}</strong></td>
    </tr>`;
}

/**
 * בונה רשימת רכיבי הברוטו לתצוגה (WP10.4 חלק א') — מחושב ב-UI בלבד, אינו נוגע במנוע.
 * חייב לסכם בדיוק ל-r.gross (אותה נוסחה כמו engine.js: grossFromEarnings + carAllowance + overtimePay + trainingComplement + standbyPay).
 * @param {object} r תוצאת calculate() (live)
 * @param {object} personal settings.personal (live) — מקור earnings/car להצגה
 * @returns {Array<{label:string, amount:number}>}
 */
function _grossBreakdown(r, personal) {
  const rows = [];
  const earnings = Array.isArray(personal?.earnings) ? personal.earnings : [];
  for (const e of earnings) {
    const amount = e.amount ?? 0;
    if (amount === 0) continue;
    const cat = EARNING_COMPONENTS.find(c => c.id === e.id);
    rows.push({ label: e.label ?? cat?.label ?? e.id, amount });
  }
  const car = personal?.car ?? null;
  if (car && !car.hasCompanyCar && (car.allowance ?? 0) !== 0) {
    rows.push({ label: 'תוספת רכב', amount: car.allowance });
  }
  if ((r.overtimePay ?? 0) !== 0) {
    rows.push({ label: STRINGS.attendance.overtimeHours, amount: r.overtimePay });
  }
  if ((r.trainingComplement ?? 0) !== 0) {
    rows.push({ label: 'השלמת קה"ש (מעסיק)', amount: r.trainingComplement });
  }
  if ((r.standbyPay ?? 0) !== 0) {
    rows.push({ label: STRINGS.estimate.standbyPay, amount: r.standbyPay });
  }
  return rows;
}

/** פירוט ברוטו מתקפל (details) — מציג את השורות מ-_grossBreakdown, סוכם ל-gross */
function _grossDetailsRow(r, personal) {
  const rows = _grossBreakdown(r, personal);
  if (rows.length === 0) return '';
  const items = rows.map(row =>
    `<li style="display:flex;justify-content:space-between;gap:0.75rem">
       <span>${row.label}</span><span style="font-variant-numeric:tabular-nums">${formatCurrency(row.amount)}</span>
     </li>`,
  ).join('');
  return `
    <tr class="est-subrow">
      <td colspan="2">
        <details class="est-bases">
          <summary class="hint">פירוט רכיבי הברוטו</summary>
          <ul class="est-bases-list">${items}</ul>
        </details>
      </td>
    </tr>`;
}

/**
 * שורות התאמה בין "נטו" ל"נטו לאחר הפחתות" (WP10.4 חלק ב') — מציגות כל רכיב שאינו אפס
 * כדי שהשורות יתאזנו בדיוק בין net ל-netAfterReductions (אותה נוסחה כמו engine.js).
 * @param {object} r תוצאת calculate()
 * @param {number} aidFundRepayment סכום החזר קרן עזרה חודשי ששימש בחישוב
 * @param {Array<{label:string, amount:number}>} [activeCustomDeductions] ניכויים קבועים פעילים לחודש (WP10.11)
 */
function _reductionItemRows(r, aidFundRepayment, activeCustomDeductions = []) {
  const aidFund = aidFundRepayment ?? 0;
  let html = '';
  // WP12.5: הפחתות שכר זמניות (month.reductions) הוסרו — נותרו קרן עזרה + ניכויים קבועים.
  if (aidFund !== 0) html += _row(STRINGS.estimate.aidFundRepayment, -aidFund, 'est-red-item-row');
  for (const cd of activeCustomDeductions) {
    if ((cd.amount ?? 0) !== 0) html += _row(cd.label, -cd.amount, 'est-red-item-row');
  }
  return html;
}

function _breakdownHTML(r, personal, aidFundRepayment, activeCustomDeductions = []) {
  let html = '';

  // ── ברוטו ──
  html += _row('ברוטו', r.gross, 'est-gross-row');
  html += _grossDetailsRow(r, personal);
  if (r.overtimePay > 0)
    html += _sub(`מתוכם שעות נוספות: ${formatCurrency(r.overtimePay)}`);
  if ((r.trainingComplement ?? 0) > 0)
    html += _sub(`מתוכם השלמת קה"ש (מעסיק): ${formatCurrency(r.trainingComplement)}`);

  // ── ניכויים ──
  html += _sep('ניכויים');
  html += _row(STRINGS.estimate.incomeTax, -r.incomeTax);
  html += _sub(`זיכוי נקודות שנוכה: ${formatCurrency(r.creditCredit)}`);
  html += _row(STRINGS.estimate.nationalIns,  -r.nationalInsurance);
  html += _row(STRINGS.estimate.healthTax,    -r.healthTax);
  html += _row(STRINGS.estimate.pension,      -r.pension);
  if ((r.pension2 ?? 0) > 0)
    html += _row(STRINGS.estimate.pension2, -r.pension2);
  html += _row(STRINGS.estimate.trainingFund, -r.trainingFund);
  if ((r.otherDeductions ?? 0) > 0)
    html += _row('ניכויים אחרים', -r.otherDeductions);

  // ── נטו ──
  html += _sep();
  html += _netRow(STRINGS.estimate.net, r.net);
  if (Math.abs(r.netAfterReductions - r.net) > 0.01) {
    html += _reductionItemRows(r, aidFundRepayment, activeCustomDeductions);
    html += _netRow(STRINGS.estimate.netAfterRed, r.netAfterReductions);
    html += `
      <tr class="est-subrow">
        <td colspan="2" class="est-sublbl">
          <a href="#reductions">${STRINGS.estimate.editReductionsHint}</a>
        </td>
      </tr>`;
  }

  return `
    <div class="card">
      <h3>${STRINGS.estimate.title}</h3>
      <table class="est-table"><tbody>${html}</tbody></table>
      <details class="est-bases" style="margin-top:0.75rem">
        <summary class="hint">בסיסי חישוב (לבדיקה מול תלוש)</summary>
        <ul class="est-bases-list">
          <li>בסיס פנסיה: ${formatCurrency(r.pensionBase ?? 0)}</li>
          <li>בסיס קה"ש: ${formatCurrency(r.trainingFundBase ?? 0)}</li>
          <li>בסיס ב"ל / בריאות: ${formatCurrency(r.niBase ?? 0)}</li>
        </ul>
      </details>
    </div>`;
}

function _snapshotHTML(snapshot, stale) {
  if (!snapshot) {
    return `
      <div class="card est-snap-card">
        <p class="hint">אין תמונה שמורה לחודש זה.</p>
        <p class="hint">${STRINGS.estimate.snapshotHint}</p>
        <button class="btn-primary" id="btn-save-snap">${STRINGS.estimate.saveSnapshot}</button>
      </div>`;
  }
  const savedAt = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(snapshot.computedAt));

  return `
    <div class="card est-snap-card">
      <div class="est-snap-info">
        <span>תמונה שנשמרה: <strong>${savedAt}</strong></span>
        <span>נטו שמור: <strong class="est-saved-net">${formatCurrency(snapshot.net)}</strong></span>
      </div>
      ${stale ? `<p class="est-stale-warn">⚠ הנתונים השתנו מאז השמירה — החישוב הנוכחי שונה מהתמונה.</p>` : ''}
      <p class="hint">${STRINGS.estimate.snapshotHint}</p>
      <button class="btn-${stale ? 'primary' : 'sec'}" id="btn-save-snap">
        ${stale ? 'עדכן תמונה' : STRINGS.estimate.saveSnapshot}
      </button>
    </div>`;
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container, monthId, liveResult) {
  // ניווט חודש
  container.querySelector('#est-prev').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, -1);
    render(container, store.getState());
  });
  container.querySelector('#est-next').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, 1);
    render(container, store.getState());
  });

  // שינוי מכסת ש"נ — שמירה ל-store (pub/sub → re-render אוטומטי)
  container.querySelector('#est-ot-cap')?.addEventListener('change', e => {
    const raw = e.target.value.trim();
    const val = raw === '' ? null : Math.max(0, parseFloat(raw) || 0);
    store.setState(draft => {
      let mo = draft.months.find(m => m.id === monthId);
      if (!mo) {
        mo = { id: monthId, days: [], estimate: null, actual: null };
        draft.months.push(mo);
        draft.months.sort((a, b) => a.id.localeCompare(b.id));
      }
      mo.overtimeApprovedCap = val;
    });
  });

  // שמירת snapshot (כלל #6: paramsSnapshot + computedAt מוטמעים כבר ב-liveResult מהמנוע)
  container.querySelector('#btn-save-snap')?.addEventListener('click', () => {
    store.setState(draft => {
      let mo = draft.months.find(m => m.id === monthId);
      if (!mo) {
        mo = { id: monthId, days: [], estimate: null, actual: null };
        draft.months.push(mo);
        draft.months.sort((a, b) => a.id.localeCompare(b.id));
      }
      mo.estimate = { ...liveResult };
    });
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = 'תמונה נשמרה — תשמש להשוואה מול התלוש ולהיסטוריה ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  });
}
