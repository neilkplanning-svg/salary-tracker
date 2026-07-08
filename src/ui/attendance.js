/**
 * attendance.js — מסך נוכחות: שעון כניסה/יציאה + רשת חודשית (WP8.4+)
 * Input: state (months[])  Output: DOM מסך נוכחות
 * Deps: store.js, strings.he.js, attendance-hours.js
 *
 * שינויים WP8.4+:
 *   (1) breakCode קבוע מ-settings.national.attendanceParams.defaultBreakCode (לא בחירה יומית)
 *       ניתן לדרוס ליום ספציפי מה-modal; ברירת מחדל: defaultBreakCode
 *   (2) toggle עשרוני / HH:MM בראש העמוד — משפיע על כל ערכי השעות בטבלה ובסיכום
 *   (3) present=true אוטומטי אם start/end קיים; אין צורך בסימון ידני
 *   (4) פיצול תאריך (dd/MM) + יום בשבוע נפרד (WP8.4)
 *   (5) עמודות מחושבות: רגיל/נוסף/אפס/ללא-אישור מ-categorizeDay
 *   (6) צביעת שורה לחיסור
 */

import { store } from '../model/store.js';
import { STRINGS } from './strings.he.js';
import { categorizeDay } from '../engine/attendance-hours.js';
import { calcMonthlyShortfall } from '../engine/attendance-month.js';

/** חודש נצפה + מצב תצוגה — שורדים re-renders (module singletons) */
let _viewMonthId  = null;
let _decimalMode  = true;   // true=עשרוני, false=HH:MM

const HEB_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];
const HEB_DAYS_SHORT = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];

// ─── Time / format helpers ─────────────────────────────────────────────────

/** @returns {string} YYYY-MM-DD בזמן ישראל */
function _todayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

/** @returns {string} YYYY-MM */
function _todayMonth() { return _todayDate().slice(0, 7); }

/** @returns {string} HH:mm בזמן ישראל */
function _nowTime() {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

/**
 * פורמט שעות לפי מצב התצוגה.
 * @param {number} h שעות עשרוניות
 * @returns {string} "8.40" או "8:24"
 */
function _fmtH(h) {
  if (!h || h <= 0) return '';
  if (_decimalMode) return h.toFixed(2).replace(/\.?0+$/, '');
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** פורמט סיכום (תמיד עם יחידה) */
function _fmtSum(h) {
  if (_decimalMode) return h.toFixed(1) + ' ש׳';
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * @param {string|null} s "HH:mm"  @param {string|null} e "HH:mm"
 * @returns {number} hours ≥ 0
 */
function _hoursFromTimes(s, e) {
  if (!s || !e) return 0;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 0;
}

/** @param {string} monthId @param {number} delta @returns {string} YYYY-MM */
function _shiftMonth(monthId, delta) {
  const [y, m] = monthId.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {string} dateStr YYYY-MM-DD @returns {number} 0–6 (Sun–Sat) */
function _dow(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getDay();
}

// ─── Day helpers ──────────────────────────────────────────────────────────

/** @param {string} date @returns {object} יום ריק */
function _emptyDay(date) {
  return {
    date, start: null, end: null,
    breakCode: null,        // null = השתמש ב-defaultBreakCode מהגדרות
    regularHours: 0, zeroHours: 0, overtimeHours: 0,
    training: false, present: false, leave: null,
  };
}

/** בנה ימי חודש, מזוג עם הנתונים השמורים */
function _buildDays(monthId, storedDays) {
  const [y, m] = monthId.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const date = `${monthId}-${String(i + 1).padStart(2, '0')}`;
    return storedDays.find(sd => sd.date === date) ?? _emptyDay(date);
  });
}

/**
 * הפעל categorizeDay על יום בודד.
 * breakCode: אם לא הוגדר ביום (null) — משתמש ב-defaultBreakCode מהגדרות.
 * @param {object} day @param {object|null} attParams
 */
function _enrichDay(day, attParams) {
  if (!attParams || !day.start || !day.end) return day;
  // breakCode: ייחודי ליום (אם הוגדר), אחרת defaultBreakCode
  const bc = (day.breakCode != null) ? day.breakCode
           : (attParams.defaultBreakCode ?? null);
  const cat = categorizeDay(
    { start: day.start, end: day.end, breakCode: bc, dow: _dow(day.date) },
    attParams,
  );
  return { ...day, ...cat, _effectiveBreakCode: bc };
}

/** שמור יום ל-store; נוכחות אוטומטית אם יש start */
function _saveDay(monthId, dayData) {
  // (3) present=true אוטומטי כשיש start (ללא תלות בסימון ידני)
  const withPresence = {
    ...dayData,
    present: dayData.start != null || dayData.leave != null || dayData.training === true,
  };
  store.setState(draft => {
    let month = draft.months.find(m => m.id === monthId);
    if (!month) {
      month = { id: monthId, days: [], estimate: null, actual: null };
      draft.months.push(month);
      draft.months.sort((a, b) => a.id.localeCompare(b.id));
    }
    const idx = month.days.findIndex(d => d.date === withPresence.date);
    if (idx >= 0) month.days[idx] = withPresence;
    else {
      month.days.push(withPresence);
      month.days.sort((a, b) => a.date.localeCompare(b.date));
    }
  });
}

// ─── Main render ──────────────────────────────────────────────────────────

/** @param {HTMLElement} container @param {object} state */
export function render(container, state) {
  if (!_viewMonthId) _viewMonthId = _todayMonth();

  const monthId   = _viewMonthId;
  const todayStr  = _todayDate();
  const isCurrent = monthId === _todayMonth();
  const stored    = state.months.find(m => m.id === monthId)?.days ?? [];
  const allDays   = _buildDays(monthId, stored);
  const attParams = state.settings?.national?.attendanceParams ?? null;

  // הפעל categorizeDay לתצוגה (לא שמור ל-store)
  const enriched  = allDays.map(d => _enrichDay(d, attParams));

  const todayDay  = isCurrent ? enriched.find(d => d.date === todayStr) : null;
  const openDays  = allDays.filter(d => d.present && d.start && !d.end);

  // סיכומים מחושבים
  const sumReg   = enriched.reduce((s, d) => s + (d.regularPaid   ?? d.regularHours  ?? 0), 0);
  const sumOT    = enriched.reduce((s, d) => s + (d.overtimeHours ?? 0), 0);
  const sumZero  = enriched.reduce((s, d) => s + (d.zeroHours     ?? 0), 0);
  const sumUnap  = enriched.reduce((s, d) => s + (d.unapprovedHours ?? 0), 0);
  // WP8.9: יום שעבדו בו והושלם בחופשה/מחלה אינו נספר כיום היעדרות (רק היעדרות מלאה)
  const sumLeave = allDays.filter(d => (d.leave || d.training) && d.start == null).length;

  // WP10.3: חיסור חודשי מול מאגר שעות אפס — מחושב לתצוגה בלבד (לא נשמר)
  const hasPresenceData = enriched.some(d => d.presenceInQuota != null);
  const shortfall = (attParams && hasPresenceData)
    ? calcMonthlyShortfall(enriched, attParams)
    : null;

  const defBC = attParams?.defaultBreakCode ?? null;
  const defBCLabel = defBC != null && attParams?.breakWindows?.[defBC]
    ? _bwLabel(attParams.breakWindows[defBC])
    : 'ללא';

  container.innerHTML = `
    <div class="att-screen">
      ${_navHTML(monthId)}
      <div class="att-toolbar card">
        <span class="att-toolbar-info">הפסקה ברירת מחדל: <strong>${defBCLabel}</strong></span>
        <div class="att-toolbar-right">
          <button class="btn-sec att-toggle-fmt" id="btn-toggle-fmt"
                  title="החלף בין תצוגה עשרונית ו-HH:MM">
            ${_decimalMode ? '⏱ HH:MM' : '# עשרוני'}
          </button>
        </div>
      </div>
      ${isCurrent ? _clockHTML(todayDay) : ''}
      ${openDays.length ? _warnHTML(openDays) : ''}
      ${_tableHTML(enriched, todayStr)}
      ${_summaryHTML(sumReg, sumOT, sumZero, sumUnap, sumLeave)}
      ${_shortfallIndicatorHTML(shortfall)}
      ${_leaveUtilHTML(state, monthId)}
    </div>
    ${_modalHTML(attParams)}`;

  _bind(container, monthId, allDays, enriched, todayStr, isCurrent, attParams);
}

// ─── HTML builders ────────────────────────────────────────────────────────

/** תווית חלון הפסקה (HH:MM–HH:MM) */
function _bwLabel(bw) {
  const f = h => {
    const hh = Math.floor(h).toString().padStart(2, '0');
    const mm = Math.round((h % 1) * 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };
  return `${f(bw[0])}–${f(bw[1])}`;
}

function _navHTML(monthId) {
  const [y, m] = monthId.split('-').map(Number);
  return `
    <div class="card att-nav">
      <button class="btn-nav" id="att-prev">‹ קודם</button>
      <h2 class="att-month-title">${HEB_MONTHS[m - 1]} ${y}</h2>
      <button class="btn-nav" id="att-next">הבא ›</button>
    </div>`;
}

function _clockHTML(day) {
  const started = day?.start;
  const ended   = day?.end;
  let status;
  if (!started) {
    status = 'לא נרשמה כניסה היום';
  } else if (!ended) {
    const elapsed = _hoursFromTimes(started, _nowTime());
    status = `כניסה: <strong>${started}</strong> | <span class="att-open-tag">יציאה: פתוח ⚠</span> | ${elapsed.toFixed(1)} ש׳ בינתיים`;
  } else {
    const total = _hoursFromTimes(started, ended);
    status = `כניסה: <strong>${started}</strong> | יציאה: <strong>${ended}</strong> | סה"כ: <strong>${total.toFixed(2)} ש׳</strong>`;
  }
  return `
    <div class="card att-clock">
      <p class="att-clock-status">${status}</p>
      <div class="att-clock-btns">
        <button class="btn-primary att-btn-lg" id="btn-clock-in" ${started ? 'disabled' : ''}>⏱ ${STRINGS.attendance.clockIn}</button>
        <button class="btn-sec att-btn-lg"     id="btn-clock-out" ${!started || ended ? 'disabled' : ''}>⏹ ${STRINGS.attendance.clockOut}</button>
      </div>
    </div>`;
}

function _warnHTML(openDays) {
  const list = openDays.map(d => {
    const [, mo, dd] = d.date.split('-');
    return `${parseInt(dd)}/${parseInt(mo)} (כניסה ${d.start})`;
  }).join(', ');
  return `<div class="att-warn">⚠ ${STRINGS.attendance.openDayWarning}: ${list}</div>`;
}

/** בנה שורת טבלה */
function _tableRow(day, todayStr) {
  const dow    = _dow(day.date);
  const isShab = dow === 6;
  const isFri  = dow === 5;
  const [, mo, dd] = day.date.split('-');

  const hasComputed = day.presenceInQuota != null;
  const reg   = hasComputed ? (day.regularPaid    ?? 0) : (day.regularHours  ?? 0);
  const ot    = day.overtimeHours  ?? 0;
  const zero  = day.zeroHours      ?? 0;
  const unap  = day.unapprovedHours ?? 0;

  const isShortfall = hasComputed && !day.isFullDay && !isShab && !day.leave && !day.training
                      && (day.presenceInQuota ?? 0) > 0;

  let cls = 'att-row';
  if (isShab)      cls += ' att-shab';
  if (isFri)       cls += ' att-fri';
  if (day.date === todayStr) cls += ' att-today';
  if (day.present && day.start && !day.end) cls += ' att-open-row';
  if (isShortfall) cls += ' att-shortfall-row';

  const leaveType = day.leave?.type ?? (day.training ? 'training' : null);
  // WP8.9: יום עם שעות עבודה בפועל שהושלם בחופשה/מחלה = יום נוכחות רגיל, לא יום היעדרות
  const workedWithCompletion = day.start != null && leaveType != null && leaveType !== 'training';
  let badge = '';
  if (isShab)                       badge = '<span class="bdg bdg-shab">שבת</span>';
  else if (day.present && day.start && !day.end) badge = '<span class="bdg bdg-open">פתוח</span>';
  else if (workedWithCompletion)     badge = `<span class="bdg bdg-pres" title="הושלם ליום מלא (${day.leave?.hours ?? 0} ש׳ ${leaveType === 'sick' ? 'מחלה' : 'חופשה'})">נוכח</span>`;
  else if (leaveType === 'vacation') badge = '<span class="bdg bdg-vac">חופשה</span>';
  else if (leaveType === 'sick')     badge = '<span class="bdg bdg-sick">מחלה</span>';
  else if (leaveType === 'training') badge = '<span class="bdg bdg-train">השתלמות</span>';
  else if (day.present)              badge = '<span class="bdg bdg-pres">נוכח</span>';

  const shortfallIcon = isShortfall ? ' <span class="att-shortfall-icon" title="חיסור — לא יום מלא">⚠</span>' : '';

  // breakCode בפועל (ייחודי ליום אם הוגדר, אחרת ברירת מחדל מוצגת בטולבר)
  const bcOverride = (day.breakCode != null) ? ' <span class="att-bc-override" title="קוד הפסקה ייחודי ליום">📌</span>' : '';

  return `<tr class="${cls}" data-date="${day.date}">
    <td class="att-c-date">${parseInt(dd)}/${parseInt(mo)}</td>
    <td class="att-c-dow">${HEB_DAYS_SHORT[dow]}</td>
    <td class="att-c-time">${day.start ?? ''}</td>
    <td class="att-c-time">${day.end   ?? ''}</td>
    <td class="att-c-hrs">${_fmtH(reg)}</td>
    <td class="att-c-hrs att-c-ot">${_fmtH(ot)}</td>
    <td class="att-c-hrs att-c-zero">${_fmtH(zero)}</td>
    <td class="att-c-hrs att-c-unappr">${_fmtH(unap)}</td>
    <td class="att-c-stat">${badge}${shortfallIcon}${bcOverride}</td>
    <td class="att-c-act"><button class="btn-edit-row" data-date="${day.date}" title="${STRINGS.attendance.editManually}" aria-label="${STRINGS.attendance.editManually}">✎</button></td>
  </tr>`;
}

function _tableHTML(enriched, todayStr) {
  const rows = enriched.map(d => _tableRow(d, todayStr)).join('');
  return `
    <div class="att-tbl-wrap">
      <table class="att-tbl">
        <thead><tr>
          <th class="att-c-date" title="תאריך (יום/חודש)">תאריך</th>
          <th class="att-c-dow" title="יום בשבוע">יום</th>
          <th>כניסה</th>
          <th>יציאה</th>
          <th title="${STRINGS.attendance.regularHours}">רגיל</th>
          <th title="${STRINGS.attendance.overtimeHours}">נוסף</th>
          <th title="${STRINGS.attendance.zeroHours}">אפס</th>
          <th title="שעות ללא אישור (לפני 06:30 / אחרי 17:00)">ללא-אישור</th>
          <th>סטטוס</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _summaryHTML(reg, ot, zero, unap, leaveDays) {
  const items = [
    [STRINGS.attendance.regularHours,  _fmtSum(reg)],
    [STRINGS.attendance.overtimeHours, _fmtSum(ot)],
    [STRINGS.attendance.zeroHours,     _fmtSum(zero)],
    ['ללא אישור',                      _fmtSum(unap)],
    [STRINGS.attendance.leaveAbsent,   leaveDays + ' ימים'],
  ];
  return `<div class="card att-sum">${
    items.map(([lbl, val]) =>
      `<div class="att-sum-item"><span class="att-sum-lbl">${lbl}</span><strong>${val}</strong></div>`
    ).join('')
  }</div>`;
}

/**
 * מחוון חיסור חודשי מול מאגר שעות אפס (WP10.3).
 * ירוק: אין חיסור, או שכוסה כולו משעות אפס בלבד.
 * כתום: נדרשו ש"נ/ללא-אישור להשלמה (מעבר לאפס), אך אין ירידת שכר.
 * אדום: יש ירידת שכר (salaryCutHours > 0).
 * מוצג רק כשיש נתוני נוכחות מחושבים (shortfall != null).
 */
function _shortfallIndicatorHTML(shortfall) {
  if (!shortfall) return '';
  const { totalShortfall, totalZero, coveredFromOT, coveredFromUnapproved,
          salaryCutHours, zeroUtilizationPct } = shortfall;

  let statusCls, statusLbl;
  if (salaryCutHours > 0) {
    statusCls = 'att-shortfall-red';
    statusLbl = STRINGS.attendance.shortfallCut;
  } else if ((coveredFromOT + coveredFromUnapproved) > 0) {
    statusCls = 'att-shortfall-orange';
    statusLbl = STRINGS.attendance.shortfallCovered;
  } else {
    statusCls = 'att-shortfall-green';
    statusLbl = STRINGS.attendance.shortfallOk;
  }

  return `<div class="card att-sum att-shortfall-ind ${statusCls}">
    <div class="att-sum-item">
      <span class="att-sum-lbl">${STRINGS.attendance.monthlyShortfall}</span>
      <strong>${_fmtSum(totalShortfall)}</strong>
    </div>
    <div class="att-sum-item">
      <span class="att-sum-lbl">${STRINGS.attendance.vsZeroPool}</span>
      <strong>${_fmtSum(totalZero)}</strong>
    </div>
    <div class="att-sum-item">
      <span class="att-sum-lbl">${STRINGS.attendance.zeroUtilPct}</span>
      <strong>${zeroUtilizationPct.toFixed(1)}%</strong>
    </div>
    <div class="att-sum-item">
      <span class="att-sum-lbl att-shortfall-status">${statusLbl}</span>
    </div>
  </div>`;
}

/**
 * Modal עריכת יום (WP8.4+):
 * - start / end
 * - breakCode ייחודי ליום (אופציונלי — null = השתמש בברירת מחדל)
 * - leave (חופשה/מחלה/השתלמות)
 * - אין checkbox נוכחות (אוטומטי מ-start/end)
 * - אין שדות reg/ot/zero ידניים (מחושבים)
 * - preview מחושב בזמן אמת
 */
function _modalHTML(attParams) {
  const bws = attParams?.breakWindows ?? [];
  const defBC = attParams?.defaultBreakCode ?? null;
  const breakOptions = [
    `<option value="">ברירת מחדל (${defBC != null && bws[defBC] ? _bwLabel(bws[defBC]) : 'ללא'})</option>`,
    `<option value="none">ללא הפסקה ליום זה</option>`,
    ...bws.map((bw, i) => `<option value="${i}">${_bwLabel(bw)}</option>`)
  ].join('');

  return `
    <dialog class="att-modal" id="att-modal" dir="rtl">
      <h3 id="att-modal-title">עריכת יום</h3>

      <div class="att-modal-times">
        <label>כניסה<input type="time" id="att-m-start"></label>
        <label>יציאה<input type="time" id="att-m-end"></label>
        <p id="att-m-total" class="att-m-total"></p>
      </div>

      <div class="att-modal-break">
        <label>הפסקה ליום זה (דרוס ברירת מחדל)
          <select id="att-m-break">${breakOptions}</select>
        </label>
      </div>

      <div id="att-m-computed-preview" class="att-computed-preview" style="display:none">
        <p class="att-computed-title">שעות מחושבות:</p>
        <div class="att-computed-grid" id="att-m-computed-grid"></div>
      </div>

      <div class="att-modal-leave">
        <p class="att-leave-sect-lbl">${STRINGS.attendance.leaveType}:</p>
        <div class="att-leave-type-group">
          <button type="button" class="btn-leave-opt" data-type="">${STRINGS.attendance.leaveNone}</button>
          <button type="button" class="btn-leave-opt" data-type="vacation">${STRINGS.attendance.leaveVacation}</button>
          <button type="button" class="btn-leave-opt" data-type="sick">${STRINGS.attendance.leaveSick}</button>
          <button type="button" class="btn-leave-opt" data-type="training">${STRINGS.attendance.leaveTraining}</button>
        </div>
        <div class="att-leave-hrs-row" id="att-leave-hrs-row" style="display:none">
          <label>${STRINGS.attendance.leaveHours} <input type="number" id="att-m-leave-hrs" min="0" max="24" step="0.5"></label>
          <button type="button" class="btn-sec" id="att-m-complete-day">${STRINGS.attendance.leaveCompleteFull}</button>
        </div>
      </div>

      <div class="att-modal-acts">
        <button class="btn-primary" id="att-m-save">${STRINGS.settings.save}</button>
        <button class="btn-sec"     id="att-m-cancel">${STRINGS.settings.cancel}</button>
      </div>
    </dialog>`;
}

function _leaveUtilHTML(state, monthId) {
  const mIds = [monthId, _shiftMonth(monthId, -1), _shiftMonth(monthId, -2), _shiftMonth(monthId, -3)];
  let vacH = 0, sickH = 0, trainDays = 0;
  for (const mId of mIds) {
    for (const d of state.months.find(m => m.id === mId)?.days ?? []) {
      const lt = d.leave?.type;
      if (lt === 'vacation')     vacH += d.leave.hours ?? 0;
      else if (lt === 'sick')    sickH += d.leave.hours ?? 0;
      else if (lt === 'training') trainDays++;
      else if (d.training && !d.leave) trainDays++;
    }
  }
  const items = [
    [STRINGS.attendance.leaveVacation, vacH.toFixed(1)  + ' ש׳'],
    [STRINGS.attendance.leaveSick,     sickH.toFixed(1) + ' ש׳'],
    [STRINGS.attendance.leaveTraining, trainDays + ' ימים'],
  ];
  return `<div class="card att-sum">
    <div class="att-leave-util-title">${STRINGS.attendance.leaveUtilTitle}</div>
    ${items.map(([lbl, val]) =>
      `<div class="att-sum-item"><span class="att-sum-lbl">${lbl}</span><strong>${val}</strong></div>`
    ).join('')}
  </div>`;
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container, monthId, allDays, enriched, todayStr, isCurrent, attParams) {
  // ניווט חודש
  container.querySelector('#att-prev').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, -1);
    render(container, store.getState());
  });
  container.querySelector('#att-next').addEventListener('click', () => {
    _viewMonthId = _shiftMonth(monthId, 1);
    render(container, store.getState());
  });

  // (2) toggle עשרוני/HH:MM
  container.querySelector('#btn-toggle-fmt')?.addEventListener('click', () => {
    _decimalMode = !_decimalMode;
    render(container, store.getState());
  });

  if (isCurrent) {
    container.querySelector('#btn-clock-in')?.addEventListener('click', () => {
      const existing = allDays.find(d => d.date === todayStr) ?? _emptyDay(todayStr);
      // present=true אוטומטי ב-_saveDay
      _saveDay(monthId, { ...existing, start: _nowTime() });
    });

    container.querySelector('#btn-clock-out')?.addEventListener('click', () => {
      const existing = allDays.find(d => d.date === todayStr);
      if (!existing) return;
      _saveDay(monthId, { ...existing, end: _nowTime() });
    });
  }

  // כפתורי עריכה
  container.querySelector('.att-tbl tbody')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-edit-row');
    if (!btn) return;
    const day = allDays.find(d => d.date === btn.dataset.date) ?? _emptyDay(btn.dataset.date);
    _openModal(container, monthId, day, attParams);
  });
}

/** פתח modal לעריכת יום */
function _openModal(container, monthId, day, attParams) {
  const modal = container.querySelector('#att-modal');
  if (!modal) return;

  const [, mo, dd] = day.date.split('-');
  modal.querySelector('#att-modal-title').textContent =
    `עריכת יום ${parseInt(dd)}/${parseInt(mo)}`;

  const startEl     = modal.querySelector('#att-m-start');
  const endEl       = modal.querySelector('#att-m-end');
  const breakEl     = modal.querySelector('#att-m-break');
  const totalEl     = modal.querySelector('#att-m-total');
  const leaveHrsEl  = modal.querySelector('#att-m-leave-hrs');
  const leaveHrsRow = modal.querySelector('#att-leave-hrs-row');
  const leaveBtns   = modal.querySelectorAll('.btn-leave-opt');
  const previewDiv  = modal.querySelector('#att-m-computed-preview');
  const previewGrid = modal.querySelector('#att-m-computed-grid');

  startEl.value = day.start ?? '';
  endEl.value   = day.end   ?? '';

  // breakCode ייחודי ליום: null=ברירת מחדל, 'none'=ללא, מספר=ייחודי
  if (day.breakCode === null || day.breakCode == null) {
    breakEl.value = '';       // ברירת מחדל
  } else if (day.breakCode === -1) {
    breakEl.value = 'none';   // ללא הפסקה מפורש
  } else {
    breakEl.value = String(day.breakCode);
  }

  let _leaveType = day.leave?.type ?? (day.training ? 'training' : '');
  leaveHrsEl.value = day.leave?.hours ?? '';

  const _syncLeaveUI = () => {
    leaveBtns.forEach(b => b.classList.toggle('active', b.dataset.type === _leaveType));
    leaveHrsRow.style.display = (_leaveType && _leaveType !== 'training') ? '' : 'none';
  };
  _syncLeaveUI();
  leaveBtns.forEach(btn => {
    btn.onclick = () => { _leaveType = btn.dataset.type; _syncLeaveUI(); };
  });

  modal.querySelector('#att-m-complete-day').onclick = () => {
    const fullDay = attParams?.fullDayHours ?? 8.9;
    const worked  = _hoursFromTimes(startEl.value, endEl.value);
    leaveHrsEl.value = Math.max(0, fullDay - worked).toFixed(2);
  };

  // preview מחושב — מריץ categorizeDay בזמן אמת
  const updatePreview = () => {
    const total = _hoursFromTimes(startEl.value, endEl.value);
    totalEl.textContent = (startEl.value && endEl.value) ? `סה"כ: ${total.toFixed(2)} ש׳` : '';

    if (attParams && startEl.value && endEl.value) {
      // קוד הפסקה בפועל לפריוויו
      let previewBC;
      if (breakEl.value === '') previewBC = attParams.defaultBreakCode ?? null;
      else if (breakEl.value === 'none') previewBC = null;
      else previewBC = parseInt(breakEl.value, 10);

      const cat = categorizeDay(
        { start: startEl.value, end: endEl.value, breakCode: previewBC, dow: _dow(day.date) },
        attParams,
      );
      const fmt = v => v > 0 ? v.toFixed(2) : '0';
      previewGrid.innerHTML = `
        <span>רגיל:</span><span>${fmt(cat.regularPaid)} ש׳</span>
        <span>נוסף:</span><span>${fmt(cat.overtimeHours)} ש׳</span>
        <span>אפס:</span><span>${fmt(cat.zeroHours)} ש׳</span>
        <span>ללא-אישור:</span><span>${fmt(cat.unapprovedHours)} ש׳</span>
        <span>הפסקה ניכוי:</span><span>${fmt(cat.breakDeducted)} ש׳</span>
      `;
      previewDiv.style.display = '';
    } else {
      previewDiv.style.display = 'none';
    }
  };

  startEl.oninput  = updatePreview;
  endEl.oninput    = updatePreview;
  breakEl.onchange = updatePreview;
  updatePreview();

  modal.showModal();

  modal.querySelector('#att-m-save').onclick = () => {
    const fullDay = attParams?.fullDayHours ?? 8.9;
    let leave = null;
    if (_leaveType === 'training') {
      leave = { type: 'training', hours: fullDay };
    } else if (_leaveType) {
      leave = { type: _leaveType, hours: parseFloat(leaveHrsEl.value) || 0 };
    }

    // המרת breakCode: '' = null (ברירת מחדל), 'none' = -1 (ללא), מספר = ייחודי
    let bc;
    if (breakEl.value === '') bc = null;            // ברירת מחדל מהגדרות
    else if (breakEl.value === 'none') bc = -1;     // ללא הפסקה ליום זה
    else bc = parseInt(breakEl.value, 10);

    const updated = {
      ...day,
      start:     startEl.value || null,
      end:       endEl.value   || null,
      breakCode: bc,
      training:  _leaveType === 'training',
      leave,
      // present אוטומטי ב-_saveDay
    };
    modal.close();
    _saveDay(monthId, updated);
  };

  modal.querySelector('#att-m-cancel').onclick = () => modal.close();
}
