/**
 * ui-kit.js — עזרי UI משותפים לכל המסכים (WP14.1)
 * Input: none  Output: toast, חודש-נצפה משותף, בורר חודשים, אייקוני SVG
 * Deps: strings.he.js
 *
 * למה מודול משותף: לפני WP14 כל מסך החזיק `_viewMonthId` משלו (מעבר בין "נוכחות" ל"משוער"
 * החזיר לחודש הנוכחי), ו-6 עותקים של פונקציית toast יצרו הודעות נערמות זו על זו.
 */

import { STRINGS } from './strings.he.js';

export const HEB_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

/** @returns {string} YYYY-MM בזמן ישראל */
export function todayMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(new Date()).slice(0, 7);
}

/** @param {string} monthId YYYY-MM @param {number} delta @returns {string} YYYY-MM */
export function shiftMonth(monthId, delta) {
  const [y, m] = monthId.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {string} monthId YYYY-MM @returns {string} "ספטמבר 2026" */
export function monthLabel(monthId) {
  const [y, m] = monthId.split('-').map(Number);
  return `${HEB_MONTHS[m - 1]} ${y}`;
}

/**
 * עוטף טקסט LTR (טווח שעות "12:00–12:30", תאריך) בבידוד כיווני (LRI…PDI), כדי שבהקשר RTL
 * הסדר לא יתהפך ל-"12:30–12:00" (המקף בין שני מספרים מקבל כיוון RTL מהפסקה). עובד גם
 * בתוך <option>, שם אי אפשר לעטוף ב-<bdi>.
 * @param {string} str
 * @returns {string}
 */
export function ltr(str) {
  return `⁦${str}⁩`;
}

// ─── חודש נצפה משותף (נוכחות / משוער / בפועל / הפחתות) ────────────────────

let _viewMonthId = null;

/** @returns {string} החודש הנצפה (ברירת מחדל: החודש הנוכחי) */
export function getViewMonth() {
  return _viewMonthId ?? todayMonth();
}

/** @param {string} monthId YYYY-MM */
export function setViewMonth(monthId) {
  _viewMonthId = monthId;
}

/**
 * בורר חודשים: חודש קודם מימין, הבא משמאל (כיוון קריאה RTL — הזמן "זורם" שמאלה).
 * כשהחודש המוצג אינו הנוכחי, מוצג קישור חזרה מהיר.
 * @param {string} monthId YYYY-MM
 * @returns {string} HTML
 */
export function monthNavHTML(monthId) {
  const U = STRINGS.ui;
  const isCurrent = monthId === todayMonth();
  return `
    <div class="month-nav" role="group" aria-label="${U.monthPicker}">
      <button type="button" class="month-nav-btn" data-month-step="-1" aria-label="${U.prevMonth}" title="${U.prevMonth}">
        ${icon('chevronRight')}<span class="month-nav-btn-lbl">${U.prev}</span>
      </button>
      <div class="month-nav-center">
        <h2 class="month-nav-title">${monthLabel(monthId)}</h2>
        ${isCurrent
          ? `<span class="month-nav-sub">${U.currentMonth}</span>`
          : `<button type="button" class="month-nav-today" data-month-today>${U.backToCurrent}</button>`}
      </div>
      <button type="button" class="month-nav-btn" data-month-step="1" aria-label="${U.nextMonth}" title="${U.nextMonth}">
        <span class="month-nav-btn-lbl">${U.next}</span>${icon('chevronLeft')}
      </button>
    </div>`;
}

/**
 * קושר את כפתורי בורר החודשים שבתוך container.
 * @param {HTMLElement} container
 * @param {function(): void} onChange נקרא אחרי עדכון החודש הנצפה (בד"כ render מחדש)
 */
export function bindMonthNav(container, onChange) {
  container.querySelectorAll('[data-month-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      setViewMonth(shiftMonth(getViewMonth(), Number(btn.dataset.monthStep)));
      onChange();
    });
  });
  container.querySelector('[data-month-today]')?.addEventListener('click', () => {
    setViewMonth(todayMonth());
    onChange();
  });
}

// ─── Toast ──────────────────────────────────────────────────────────────────

let _toastEl = null;
let _toastTimer = null;

/**
 * הודעה צפה קצרה. הודעה חדשה מחליפה את הקודמת (לא נערמות).
 * @param {string} msg
 * @param {{type?: 'success'|'error'|'info', ms?: number}} [opts]
 */
export function toast(msg, { type = 'success', ms = 2500 } = {}) {
  if (_toastEl) _toastEl.remove();
  clearTimeout(_toastTimer);
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.textContent = msg;
  document.body.appendChild(el);
  _toastEl = el;
  _toastTimer = setTimeout(() => {
    el.remove();
    if (_toastEl === el) _toastEl = null;
  }, ms);
}

// ─── אייקונים (SVG inline, stroke=currentColor — יורשים צבע מהטקסט) ─────────

const ICON_PATHS = {
  clock:        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calculator:   '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3.5M8.5 18h.01M12 18h.01"/>',
  receipt:      '<path d="M15 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7Z"/><path d="M14.5 2.5V7h5M9 10h6M9 14h6M9 18h4"/>',
  chart:        '<path d="M3.5 3.5v17h17"/><path d="M8 16.5v-4M12.5 16.5V7M17 16.5v-7"/>',
  more:         '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  minusCircle:  '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  wallet:       '<path d="M19 7.5V5a1.5 1.5 0 0 0-1.5-1.5H5.5a2 2 0 0 0 0 4H20a1 1 0 0 1 1 1V12h-3.5a2 2 0 0 0 0 4H21v3a1.5 1.5 0 0 1-1.5 1.5h-14a2 2 0 0 1-2-2v-13"/>',
  dollar:       '<path d="M12 2.5v19M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7"/>',
  sliders:      '<path d="M20.5 5h-7M9.5 5h-6M20.5 12h-9M7.5 12h-4M20.5 19h-5M11.5 19h-8M13.5 3v4M7.5 10v4M15.5 17v4"/>',
  chevronLeft:  '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  folderOpen:   '<path d="m6 14 1.4-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6a2 2 0 0 1-2 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2"/>',
  save:         '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  sun:          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon:         '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  pencil:       '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  x:            '<path d="M18 6 6 18M6 6l12 12"/>',
  trash:        '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  plus:         '<path d="M5 12h14M12 5v14"/>',
  play:         '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5Z"/>',
  stop:         '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  alert:        '<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  check:        '<path d="M20 6 9 17l-5-5"/>',
};

/**
 * @param {keyof ICON_PATHS} name
 * @param {string} [cls] class נוסף
 * @returns {string} SVG (aria-hidden — התווית הנגישה שייכת לכפתור/קישור העוטף)
 */
export function icon(name, cls = '') {
  const p = ICON_PATHS[name];
  if (!p) return '';
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}
