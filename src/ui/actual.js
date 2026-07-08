/**
 * actual.js — מסך בפועל: הזנת תלוש + השוואה משוער↔בפועל
 * Input: state (months[], settings)  Output: DOM מסך בפועל
 * Deps: store.js, strings.he.js
 *
 * מודל: month.actual = { gross, net, approvedOT, bonuses, notes }
 * השוואה מול month.estimate (snapshot שנשמר ב-WP3.2)
 */

import { store } from '../model/store.js';
import { STRINGS, formatCurrency, escapeHtml } from './strings.he.js';

const HEB_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

/** חודש נצפה כ-UI state — שורד re-renders */
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
 * @param {object} state
 */
export function render(container, state) {
  if (!_viewMonthId) _viewMonthId = _todayMonth();

  const monthId = _viewMonthId;
  const [y, m]  = monthId.split('-').map(Number);
  const stored  = state.months.find(mo => mo.id === monthId) ?? { id: monthId, days: [] };
  const actual  = stored.actual  ?? {};
  const snap    = stored.estimate ?? null;

  container.innerHTML = `
    <div class="act-screen">
      ${_navHTML(monthId, y, m)}
      ${_formHTML(actual)}
      ${_diffHTML(actual, snap)}
    </div>`;

  _bind(container, monthId, actual);
}

// ─── HTML builders ────────────────────────────────────────────────────────

function _navHTML(monthId, y, m) {
  return `
    <div class="card act-nav">
      <button class="btn-nav" id="act-prev">‹ קודם</button>
      <h2 class="act-month-title">${HEB_MONTHS[m - 1]} ${y}</h2>
      <button class="btn-nav" id="act-next">הבא ›</button>
    </div>`;
}

/**
 * טופס הזנת נתוני תלוש בפועל
 * @param {object} a — actual נוכחי (עשוי להיות ריק {})
 */
function _formHTML(a) {
  const v = (key, def = '') => a[key] != null ? a[key] : def;
  return `
    <div class="card">
      <h3>${STRINGS.actual.title}</h3>
      <form id="act-form" class="act-form" novalidate>
        <div class="act-field">
          <label class="act-lbl" for="act-gross">${STRINGS.actual.gross}</label>
          <div class="act-input-wrap">
            <input id="act-gross" name="gross" type="number" min="0" step="0.01"
                   class="act-input" value="${v('gross')}" placeholder="0">
            <span class="act-unit">₪</span>
          </div>
        </div>
        <div class="act-field">
          <label class="act-lbl" for="act-net">${STRINGS.actual.net}</label>
          <div class="act-input-wrap">
            <input id="act-net" name="net" type="number" min="0" step="0.01"
                   class="act-input" value="${v('net')}" placeholder="0">
            <span class="act-unit">₪</span>
          </div>
        </div>
        <div class="act-field">
          <label class="act-lbl" for="act-ot">${STRINGS.actual.approvedOT}</label>
          <div class="act-input-wrap">
            <input id="act-ot" name="approvedOT" type="number" min="0" step="0.5"
                   class="act-input" value="${v('approvedOT')}" placeholder="0">
            <span class="act-unit">ש׳</span>
          </div>
        </div>
        <div class="act-field">
          <label class="act-lbl" for="act-bonuses">${STRINGS.actual.bonuses}</label>
          <div class="act-input-wrap">
            <input id="act-bonuses" name="bonuses" type="number" min="0" step="0.01"
                   class="act-input" value="${v('bonuses')}" placeholder="0">
            <span class="act-unit">₪</span>
          </div>
        </div>
        <div class="act-field act-field-notes">
          <label class="act-lbl" for="act-notes">${STRINGS.actual.notes}</label>
          <textarea id="act-notes" name="notes" class="act-textarea"
                    rows="2" placeholder="הערות חופשיות...">${escapeHtml(v('notes'))}</textarea>
        </div>
        <div class="act-actions">
          <button type="submit" class="btn-primary">שמור</button>
          <button type="button" id="act-clear" class="btn-sec">נקה</button>
        </div>
      </form>
    </div>`;
}

/**
 * תצוגת פערים משוער↔בפועל
 * @param {object} a — actual
 * @param {object|null} snap — estimate snapshot
 */
function _diffHTML(a, snap) {
  const hasActual = a.gross != null || a.net != null;

  if (!hasActual && !snap) {
    return `
      <div class="card act-diff-empty">
        <p class="hint">הזן נתוני תלוש ושמור כדי לראות השוואה מול המשוער.</p>
      </div>`;
  }

  if (!snap) {
    return `
      <div class="card act-diff-empty">
        <p class="hint">אין תמונה משוערת לחודש זה — שמור תמונה במסך <strong>משוער</strong> תחילה.</p>
      </div>`;
  }

  if (!hasActual) {
    return `
      <div class="card act-diff-empty">
        <p class="hint">הזן נתוני תלוש בפועל ושמור כדי לראות השוואה.</p>
      </div>`;
  }

  // הערה: diffOT משווה שעות↔שעות; snap.overtimeApprovedHours נוסף ל-estimate (WP8.7)
  const rows = [
    { lbl: STRINGS.actual.diffGross, est: snap.gross,                 act: a.gross,      unit: '₪'  },
    { lbl: STRINGS.actual.diffNet,   est: snap.net,                   act: a.net,        unit: '₪'  },
    { lbl: STRINGS.actual.diffOT,    est: snap.overtimeApprovedHours, act: a.approvedOT, unit: 'ש׳' },
  ];

  const rowsHTML = rows.map(({ lbl, est, act, unit }) => {
    const hasEst = est != null;
    const hasAct = act != null && act !== '';
    const diff   = (hasEst && hasAct) ? (Number(act) - Number(est)) : null;

    const estCell = hasEst  ? (unit === '₪' ? formatCurrency(est)  : `${Number(est).toFixed(1)}  ${unit}`) : '—';
    const actCell = hasAct  ? (unit === '₪' ? formatCurrency(act)  : `${Number(act).toFixed(1)} ${unit}`)  : '—';

    let diffCell = '—';
    let diffClass = '';
    if (diff !== null) {
      const fmt = unit === '₪' ? formatCurrency(Math.abs(diff)) : `${Math.abs(diff).toFixed(1)} ${unit}`;
      const sign = diff > 0.005 ? '▲ +' : diff < -0.005 ? '▼ ' : '';
      diffClass = diff > 0.005 ? 'act-diff-pos' : diff < -0.005 ? 'act-diff-neg' : 'act-diff-zero';
      diffCell = diff > 0.005 ? `▲ +${fmt}` : diff < -0.005 ? `▼ ${fmt}` : `≈ 0`;
    }

    return `
      <tr class="act-diff-row">
        <td class="act-diff-lbl">${lbl}</td>
        <td class="act-diff-val">${estCell}</td>
        <td class="act-diff-val">${actCell}</td>
        <td class="act-diff-val ${diffClass}">${diffCell}</td>
      </tr>`;
  }).join('');

  const otPayNote = snap.overtimePay != null
    ? `<p class="hint" style="margin-top:0.5rem">שווי ש"נ משוער: <strong>${formatCurrency(snap.overtimePay)}</strong></p>`
    : '';

  return `
    <div class="card">
      <h3>${STRINGS.actual.diffTitle}</h3>
      <table class="act-diff-table">
        <thead>
          <tr class="act-diff-head">
            <th class="act-diff-th"></th>
            <th class="act-diff-th">משוער</th>
            <th class="act-diff-th">בפועל</th>
            <th class="act-diff-th">פער</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      ${otPayNote}
    </div>`;
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container, monthId, currentActual) {
  // ניווט חודש
  container.querySelector('#act-prev').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, -1);
    render(container, store.getState());
  });
  container.querySelector('#act-next').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, 1);
    render(container, store.getState());
  });

  // שמירת טופס
  container.querySelector('#act-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const parse = key => {
      const raw = fd.get(key)?.trim();
      if (raw === '' || raw == null) return null;
      const n = parseFloat(raw);
      return isNaN(n) ? null : Math.max(0, n);
    };

    const updated = {
      gross:      parse('gross'),
      net:        parse('net'),
      approvedOT: parse('approvedOT'),
      bonuses:    parse('bonuses'),
      notes:      fd.get('notes')?.trim() || '',
    };

    store.setState(draft => {
      let mo = draft.months.find(m => m.id === monthId);
      if (!mo) {
        mo = { id: monthId, days: [], estimate: null, actual: null };
        draft.months.push(mo);
        draft.months.sort((a, b) => a.id.localeCompare(b.id));
      }
      mo.actual = updated;
    });

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = 'תלוש בפועל נשמר ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  });

  // נקה נתוני תלוש
  container.querySelector('#act-clear').addEventListener('click', () => {
    if (!confirm('למחוק את נתוני התלוש בפועל לחודש זה?')) return;
    store.setState(draft => {
      const mo = draft.months.find(m => m.id === monthId);
      if (mo) mo.actual = null;
    });
  });
}
