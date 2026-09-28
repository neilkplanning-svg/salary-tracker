/**
 * attendance.js — מסך נוכחות: שעון כניסה/יציאה + רשת חודשית (WP8.4+, WP14.3)
 * Input: state (months[])  Output: DOM מסך נוכחות
 * Deps: store.js, strings.he.js, ui-kit.js, attendance-hours.js, attendance-month.js
 *
 * שינויים WP8.4+:
 *   (1) breakCode קבוע מ-settings.national.attendanceParams.defaultBreakCode (לא בחירה יומית)
 *       ניתן לדרוס ליום ספציפי מה-modal; ברירת מחדל: defaultBreakCode
 *   (2) toggle עשרוני / HH:MM — משפיע על כל ערכי השעות בטבלה ובסיכום
 *   (3) present=true אוטומטי אם start/end קיים; אין צורך בסימון ידני
 *   (4) פיצול תאריך (dd/MM) + יום בשבוע נפרד (WP8.4)
 *   (5) עמודות מחושבות: רגיל/נוסף/אפס/ללא-אישור מ-categorizeDay
 *   (6) צביעת שורה לחיסור
 *
 * WP14.3 (מובייל):
 *   - כרטיס שעון עם פעולה ראשית אחת לפי מצב (כניסה / יציאה / סיכום) + טיימר חי
 *   - במסך צר הטבלה (10 עמודות, גלילה אופקית) מוחלפת ברשימת כרטיסי-יום; כל שורה כולה
 *     היא יעד מגע לעריכה (בדסקטופ גם לחיצה על שורת הטבלה פותחת עריכה)
 *   - modal העריכה נפתח כגיליון תחתון במובייל; נוסף "נקה יום"
 *   - אזהרת "יום פתוח" לא כוללת את היום הנוכחי (יום עבודה פתוח היום הוא מצב תקין)
 *   - החודש הנצפה משותף עם משוער/בפועל/הפחתות (ui-kit.js)
 */

import { store } from '../model/store.js';
import { STRINGS } from './strings.he.js';
import { getViewMonth, monthNavHTML, bindMonthNav, todayMonth, shiftMonth, icon, toast, ltr } from './ui-kit.js';
import { categorizeDay } from '../engine/attendance-hours.js';
import { calcMonthlyShortfall } from '../engine/attendance-month.js';

const A = STRINGS.attendance;

/** מצב תצוגה — שורד re-renders (module singleton) */
let _decimalMode  = true;   // true=עשרוני, false=HH:MM
/** טיימר חי של כרטיס השעון (מתעדכן כל 30 שניות כל עוד יום העבודה פתוח) */
let _tick = null;

const HEB_DAYS_SHORT = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];

// ─── Time / format helpers ─────────────────────────────────────────────────

/** @returns {string} YYYY-MM-DD בזמן ישראל */
function _todayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

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
  return _hhmm(h);
}

/** @param {number} h שעות עשרוניות @returns {string} "8:24" */
function _hhmm(h) {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** פורמט סיכום (תמיד עם יחידה) */
function _fmtSum(h) {
  if (_decimalMode) return h.toFixed(1) + ' ' + A.hoursUnit;
  return _hhmm(h);
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

/** @param {string} dateStr YYYY-MM-DD @returns {number} 0–6 (Sun–Sat) */
function _dow(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getDay();
}

/** @param {string} dateStr YYYY-MM-DD @returns {string} "28/9" */
function _dm(dateStr) {
  const [, mo, dd] = dateStr.split('-');
  return `${parseInt(dd)}/${parseInt(mo)}`;
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

/**
 * מידע תצוגה משותף לשורת טבלה ולכרטיס-יום: שעות מחושבות, מחלקות, תג סטטוס.
 * @param {object} day יום מועשר (_enrichDay)
 * @param {string} todayStr
 */
function _dayView(day, todayStr) {
  const dow    = _dow(day.date);
  const isShab = dow === 6;
  const isFri  = dow === 5;

  const hasComputed = day.presenceInQuota != null;
  const reg   = hasComputed ? (day.regularPaid    ?? 0) : (day.regularHours  ?? 0);
  const ot    = day.overtimeHours  ?? 0;
  const zero  = day.zeroHours      ?? 0;
  const unap  = day.unapprovedHours ?? 0;

  const isOpen = !!(day.present && day.start && !day.end);
  const isShortfall = hasComputed && !day.isFullDay && !isShab && !day.leave && !day.training
                      && (day.presenceInQuota ?? 0) > 0;

  const leaveType = day.leave?.type ?? (day.training ? 'training' : null);
  // WP8.9: יום עם שעות עבודה בפועל שהושלם בחופשה/מחלה = יום נוכחות רגיל, לא יום היעדרות
  const workedWithCompletion = day.start != null && leaveType != null && leaveType !== 'training';
  let badge = '';
  if (isShab)                       badge = '<span class="bdg bdg-shab">שבת</span>';
  else if (isOpen)                  badge = '<span class="bdg bdg-open">פתוח</span>';
  else if (workedWithCompletion)    badge = `<span class="bdg bdg-pres" title="הושלם ליום מלא (${day.leave?.hours ?? 0} ש׳ ${leaveType === 'sick' ? 'מחלה' : 'חופשה'})">נוכח+${leaveType === 'sick' ? 'מחלה' : 'חופשה'}</span>`;
  else if (leaveType === 'vacation') badge = '<span class="bdg bdg-vac">חופשה</span>';
  else if (leaveType === 'sick')     badge = '<span class="bdg bdg-sick">מחלה</span>';
  else if (leaveType === 'training') badge = '<span class="bdg bdg-train">השתלמות</span>';
  else if (day.present)              badge = '<span class="bdg bdg-pres">נוכח</span>';

  const shortfallIcon = isShortfall ? ' <span class="att-shortfall-icon" title="חיסור — לא יום מלא">⚠</span>' : '';
  // breakCode בפועל (ייחודי ליום אם הוגדר, אחרת ברירת מחדל)
  const bcOverride = (day.breakCode != null) ? ' <span class="att-bc-override" title="קוד הפסקה ייחודי ליום">📌</span>' : '';

  return { dow, isShab, isFri, isOpen, isShortfall, reg, ot, zero, unap, leaveType,
           isToday: day.date === todayStr, isFuture: day.date > todayStr,
           badge, marks: shortfallIcon + bcOverride };
}

// ─── Main render ──────────────────────────────────────────────────────────

/** @param {HTMLElement} container @param {object} state */
export function render(container, state) {
  const monthId   = getViewMonth();
  const todayStr  = _todayDate();
  const isCurrent = monthId === todayMonth();
  const stored    = state.months.find(m => m.id === monthId)?.days ?? [];
  const allDays   = _buildDays(monthId, stored);
  const attParams = state.settings?.national?.attendanceParams ?? null;

  // הפעל categorizeDay לתצוגה (לא שמור ל-store)
  const enriched  = allDays.map(d => _enrichDay(d, attParams));

  const todayDay  = isCurrent ? enriched.find(d => d.date === todayStr) : null;
  // יום פתוח *היום* הוא מצב עבודה רגיל — מזהירים רק על ימים קודמים שלא נסגרו
  const openDays  = allDays.filter(d => d.present && d.start && !d.end && d.date !== todayStr);

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
      ${monthNavHTML(monthId)}
      ${isCurrent ? _clockHTML(todayDay, todayStr) : ''}
      ${openDays.length ? _warnHTML(openDays) : ''}
      ${_summaryHTML(sumReg, sumOT, sumZero, sumUnap, sumLeave, shortfall)}
      <section class="card att-days" aria-labelledby="att-days-title">
        <div class="att-days-head">
          <h3 id="att-days-title">${A.monthDays}</h3>
          <span class="att-days-info">${A.defaultBreak}: <strong>${defBCLabel}</strong></span>
          <button type="button" class="btn-sec att-toggle-fmt" id="btn-toggle-fmt"
                  title="החלף בין תצוגה עשרונית ו-HH:MM">
            ${_decimalMode ? A.showHhmm : A.showDecimal}
          </button>
        </div>
        ${_tableHTML(enriched, todayStr)}
        ${_listHTML(enriched, todayStr)}
      </section>
      ${_leaveUtilHTML(state, monthId)}
    </div>
    ${_modalHTML(attParams)}`;

  _bind(container, monthId, allDays, todayStr, isCurrent, attParams);
  _startTick(container, todayDay);
}

// ─── HTML builders ────────────────────────────────────────────────────────

/** תווית חלון הפסקה (HH:MM–HH:MM) */
function _bwLabel(bw) {
  const f = h => {
    const hh = Math.floor(h).toString().padStart(2, '0');
    const mm = Math.round((h % 1) * 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };
  return ltr(`${f(bw[0])}–${f(bw[1])}`);
}

/**
 * כרטיס שעון — פעולה ראשית אחת לפי מצב היום:
 * idle → "כניסה" · working → טיימר חי + "יציאה" · done → סיכום + "עריכת היום".
 */
function _clockHTML(day, todayStr) {
  const started = day?.start;
  const ended   = day?.end;
  const dayLbl  = `${A.today} · יום ${HEB_DAYS_SHORT[_dow(todayStr)]} ${_dm(todayStr)}`;

  if (!started) {
    return `
      <div class="card att-clock att-clock-idle">
        <div class="att-clock-info">
          <span class="att-clock-day">${dayLbl}</span>
          <strong class="att-clock-status">${A.notClockedIn}</strong>
        </div>
        <button class="btn-primary btn-lg att-clock-main" id="btn-clock-in">${icon('play')}${A.clockIn}</button>
      </div>`;
  }
  if (!ended) {
    const elapsed = _hoursFromTimes(started, _nowTime());
    return `
      <div class="card att-clock att-clock-working">
        <div class="att-clock-info">
          <span class="att-clock-day">${dayLbl} · <span class="att-live-dot" aria-hidden="true"></span>${A.working}</span>
          <strong class="att-clock-big" id="att-elapsed" aria-live="off">${_hhmm(elapsed)}</strong>
          <span class="att-clock-sub">${A.since} ${started}</span>
        </div>
        <button class="btn-accent btn-lg att-clock-main" id="btn-clock-out">${icon('stop')}${A.clockOut}</button>
      </div>`;
  }
  const total = _hoursFromTimes(started, ended);
  return `
    <div class="card att-clock att-clock-done">
      <div class="att-clock-info">
        <span class="att-clock-day">${dayLbl} · ${A.dayDone}</span>
        <strong class="att-clock-big">${_hhmm(total)}</strong>
        <span class="att-clock-sub">${ltr(`${started} – ${ended}`)}</span>
      </div>
      <button class="btn-sec att-clock-edit" id="btn-edit-today" data-date="${todayStr}">${icon('pencil')}${A.editToday}</button>
    </div>`;
}

function _warnHTML(openDays) {
  const list = openDays.map(d => `${_dm(d.date)} (כניסה ${d.start})`).join(', ');
  return `<div class="att-warn" role="alert">${icon('alert')}<span>${A.openDayWarning}: ${list}</span></div>`;
}

/** בנה שורת טבלה (דסקטופ/טאבלט) */
function _tableRow(day, todayStr) {
  const v = _dayView(day, todayStr);
  let cls = 'att-row';
  if (v.isShab)      cls += ' att-shab';
  if (v.isFri)       cls += ' att-fri';
  if (v.isToday)     cls += ' att-today';
  if (v.isOpen)      cls += ' att-open-row';
  if (v.isShortfall) cls += ' att-shortfall-row';

  return `<tr class="${cls}" data-date="${day.date}">
    <td class="att-c-date">${_dm(day.date)}</td>
    <td class="att-c-dow">${HEB_DAYS_SHORT[v.dow]}</td>
    <td class="att-c-time">${day.start ?? ''}</td>
    <td class="att-c-time">${day.end   ?? ''}</td>
    <td class="att-c-hrs">${_fmtH(v.reg)}</td>
    <td class="att-c-hrs att-c-ot">${_fmtH(v.ot)}</td>
    <td class="att-c-hrs att-c-zero">${_fmtH(v.zero)}</td>
    <td class="att-c-hrs att-c-unappr">${_fmtH(v.unap)}</td>
    <td class="att-c-stat">${v.badge}${v.marks}</td>
    <td class="att-c-act"><button class="icon-btn btn-edit-row" data-date="${day.date}" title="${A.editManually}" aria-label="${A.editManually} ${_dm(day.date)}">${icon('pencil')}</button></td>
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
          <th title="${A.regularHours}">${A.regularShort}</th>
          <th title="${A.overtimeHours}">${A.overtimeShort}</th>
          <th title="${A.zeroHours}">${A.zeroShort}</th>
          <th title="שעות ללא אישור (לפני 06:30 / אחרי 17:00)">ללא-אישור</th>
          <th>סטטוס</th>
          <th><span class="visually-hidden">${A.editManually}</span></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * רשימת כרטיסי-יום למסך צר (WP14.3) — אותו מידע כמו הטבלה, בלי גלילה אופקית.
 * כל כרטיס הוא כפתור אחד (יעד מגע מלא) שפותח את עריכת היום.
 */
function _listHTML(enriched, todayStr) {
  const items = enriched.map(day => {
    const v = _dayView(day, todayStr);
    const hasTimes = day.start != null;
    const isEmpty = !hasTimes && !v.leaveType;
    let cls = 'att-item';
    if (v.isShab || v.isFri) cls += ' att-item-weekend';
    if (v.isToday)     cls += ' att-item-today';
    if (v.isOpen)      cls += ' att-item-open';
    if (v.isShortfall) cls += ' att-item-short';
    if (isEmpty)       cls += ' att-item-empty';

    let main;
    if (hasTimes) main = `<span class="att-item-times">${day.start} – ${day.end ?? '…'}</span>`;
    else if (v.isShab || v.isFri || v.isFuture) main = '';
    else if (isEmpty) main = `<span class="att-item-none">${A.notReported}</span>`;
    else main = '';

    const chips = [
      v.ot   > 0 ? `<span class="chip chip-ot">${A.overtimeShort} ${_fmtH(v.ot)}</span>` : '',
      v.zero > 0 ? `<span class="chip">${A.zeroShort} ${_fmtH(v.zero)}</span>` : '',
      v.unap > 0 ? `<span class="chip chip-unap">${A.unapprovedShort} ${_fmtH(v.unap)}</span>` : '',
    ].join('');
    // ברשימה הצרה "נוכח" הוא מצב ברירת המחדל של יום עם שעות — התג רק מוסיף רעש; מוצגים
    // רק מצבים חריגים (פתוח / חופשה / מחלה / השתלמות / נוכח+השלמה)
    const plainPresent = v.badge.includes('bdg-pres') && !v.leaveType;
    const statusBadge = ((v.isShab && isEmpty) || plainPresent) ? '' : v.badge;

    return `<li class="${cls}">
      <button type="button" class="att-item-btn" data-date="${day.date}" aria-label="${A.editDay} ${_dm(day.date)}">
        <span class="att-item-date"><strong>${parseInt(day.date.slice(8))}</strong><small>${HEB_DAYS_SHORT[v.dow]}</small></span>
        <span class="att-item-main">
          ${main}
          <span class="att-item-tags">${statusBadge}${chips}${v.marks}</span>
        </span>
        <span class="att-item-hrs">${v.reg > 0 ? `${_fmtH(v.reg)}<small>${A.hoursUnit}</small>` : ''}</span>
      </button>
    </li>`;
  }).join('');
  return `<ul class="att-list" aria-labelledby="att-days-title">${items}</ul>`;
}

/**
 * סיכום חודשי כרשת מדדים + מחוון חיסור מול מאגר שעות אפס (WP10.3).
 * ירוק: אין חיסור, או שכוסה כולו משעות אפס בלבד.
 * כתום: נדרשו ש"נ/ללא-אישור להשלמה (מעבר לאפס), אך אין ירידת שכר.
 * אדום: יש ירידת שכר (salaryCutHours > 0).
 * המחוון מוצג רק כשיש נתוני נוכחות מחושבים (shortfall != null).
 */
function _summaryHTML(reg, ot, zero, unap, leaveDays, shortfall) {
  const tiles = [
    [A.regularHours,  _fmtSum(reg)],
    [A.overtimeHours, _fmtSum(ot)],
    [A.zeroHours,     _fmtSum(zero)],
    [A.unapprovedShort, _fmtSum(unap)],
    [A.leaveAbsent,   leaveDays + ' ימים'],
  ];
  return `<div class="card att-summary">
    <h3 class="visually-hidden">${A.monthTotal}</h3>
    <div class="stat-grid att-stat-grid">${
      tiles.map(([lbl, val]) =>
        `<div class="stat-tile"><span class="stat-tile-lbl">${lbl}</span><strong class="stat-tile-val">${val}</strong></div>`
      ).join('')
    }</div>
    ${_shortfallIndicatorHTML(shortfall)}
  </div>`;
}

function _shortfallIndicatorHTML(shortfall) {
  if (!shortfall) return '';
  const { totalShortfall, totalZero, coveredFromOT, coveredFromUnapproved,
          salaryCutHours, zeroUtilizationPct } = shortfall;

  let statusCls, statusLbl;
  if (salaryCutHours > 0) {
    statusCls = 'att-shortfall-red';
    statusLbl = A.shortfallCut;
  } else if ((coveredFromOT + coveredFromUnapproved) > 0) {
    statusCls = 'att-shortfall-orange';
    statusLbl = A.shortfallCovered;
  } else {
    statusCls = 'att-shortfall-green';
    statusLbl = A.shortfallOk;
  }

  return `<div class="att-shortfall-ind ${statusCls}">
    <span class="att-shortfall-status">${statusLbl}</span>
    <span class="att-shortfall-facts">
      <span>${A.monthlyShortfall}: <strong>${_fmtSum(totalShortfall)}</strong></span>
      <span>${A.vsZeroPool}: <strong>${_fmtSum(totalZero)}</strong></span>
      <span>${A.zeroUtilPct}: <strong>${zeroUtilizationPct.toFixed(1)}%</strong></span>
    </span>
  </div>`;
}

/**
 * Modal עריכת יום (WP8.4+) — במובייל מוצג כגיליון תחתון (WP14.3):
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
    <dialog class="att-modal" id="att-modal" dir="rtl" aria-labelledby="att-modal-title">
      <div class="att-modal-form">
        <div class="att-modal-head">
          <h3 id="att-modal-title">${A.editDay}</h3>
          <button type="button" class="icon-btn" id="att-m-close" aria-label="${STRINGS.general.close}">${icon('x')}</button>
        </div>

        <div class="att-modal-body">
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
            <p class="att-leave-sect-lbl" id="att-leave-lbl">${A.leaveType}:</p>
            <div class="att-leave-type-group" role="group" aria-labelledby="att-leave-lbl">
              <button type="button" class="btn-leave-opt" data-type="">${A.leaveNone}</button>
              <button type="button" class="btn-leave-opt" data-type="vacation">${A.leaveVacation}</button>
              <button type="button" class="btn-leave-opt" data-type="sick">${A.leaveSick}</button>
              <button type="button" class="btn-leave-opt" data-type="training">${A.leaveTraining}</button>
            </div>
            <div class="att-leave-hrs-row" id="att-leave-hrs-row" style="display:none">
              <label>${A.leaveHours} <input type="number" inputmode="decimal" id="att-m-leave-hrs" min="0" max="24" step="0.5"></label>
              <button type="button" class="btn-sec" id="att-m-complete-day">${A.leaveCompleteFull}</button>
            </div>
          </div>
        </div>

        <div class="att-modal-acts">
          <button type="button" class="btn-danger-text" id="att-m-clear">${icon('trash')}${A.clearDay}</button>
          <span class="att-modal-acts-main">
            <button type="button" class="btn-sec"     id="att-m-cancel">${STRINGS.settings.cancel}</button>
            <button type="button" class="btn-primary" id="att-m-save">${STRINGS.settings.save}</button>
          </span>
        </div>
      </div>
    </dialog>`;
}

function _leaveUtilHTML(state, monthId) {
  const mIds = [monthId, shiftMonth(monthId, -1), shiftMonth(monthId, -2), shiftMonth(monthId, -3)];
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
    [A.leaveVacation, vacH.toFixed(1)  + ' ' + A.hoursUnit],
    [A.leaveSick,     sickH.toFixed(1) + ' ' + A.hoursUnit],
    [A.leaveTraining, trainDays + ' ימים'],
  ];
  return `<div class="card">
    <h3 class="att-leave-util-title">${A.leaveUtilTitle}</h3>
    <div class="stat-grid att-stat-grid-3">
      ${items.map(([lbl, val]) =>
        `<div class="stat-tile"><span class="stat-tile-lbl">${lbl}</span><strong class="stat-tile-val">${val}</strong></div>`
      ).join('')}
    </div>
  </div>`;
}

// ─── Live timer ────────────────────────────────────────────────────────────

/**
 * מעדכן את הטיימר של יום עבודה פתוח. מנקה את עצמו כשהמסך הוחלף (האלמנט כבר לא ב-DOM).
 * @param {HTMLElement} container @param {object|null} todayDay
 */
function _startTick(container, todayDay) {
  clearInterval(_tick);
  _tick = null;
  if (!todayDay?.start || todayDay.end) return;
  _tick = setInterval(() => {
    const el = container.querySelector('#att-elapsed');
    if (!el || !el.isConnected) { clearInterval(_tick); _tick = null; return; }
    el.textContent = _hhmm(_hoursFromTimes(todayDay.start, _nowTime()));
  }, 30000);
}

// ─── Event bindings ───────────────────────────────────────────────────────

function _bind(container, monthId, allDays, todayStr, isCurrent, attParams) {
  bindMonthNav(container, () => render(container, store.getState()));

  // (2) toggle עשרוני/HH:MM
  container.querySelector('#btn-toggle-fmt')?.addEventListener('click', () => {
    _decimalMode = !_decimalMode;
    render(container, store.getState());
  });

  if (isCurrent) {
    container.querySelector('#btn-clock-in')?.addEventListener('click', () => {
      const existing = allDays.find(d => d.date === todayStr) ?? _emptyDay(todayStr);
      const now = _nowTime();
      // present=true אוטומטי ב-_saveDay
      _saveDay(monthId, { ...existing, start: now });
      toast(`${A.clockInDone} ${now} ✓`);
    });

    container.querySelector('#btn-clock-out')?.addEventListener('click', () => {
      const existing = allDays.find(d => d.date === todayStr);
      if (!existing) return;
      const now = _nowTime();
      _saveDay(monthId, { ...existing, end: now });
      toast(`${A.clockOutDone} ${now} ✓`);
    });
  }

  const openFor = date => {
    const day = allDays.find(d => d.date === date) ?? _emptyDay(date);
    _openModal(container, monthId, day, attParams);
  };

  container.querySelector('#btn-edit-today')?.addEventListener('click', e => openFor(e.currentTarget.dataset.date));

  // טבלה (דסקטופ): כפתור העריכה או לחיצה בכל מקום בשורה
  container.querySelector('.att-tbl tbody')?.addEventListener('click', e => {
    const row = e.target.closest('tr[data-date]');
    if (row) openFor(row.dataset.date);
  });
  // רשימה (מובייל): כל כרטיס-יום הוא כפתור
  container.querySelector('.att-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.att-item-btn');
    if (btn) openFor(btn.dataset.date);
  });
}

/** פתח modal לעריכת יום */
function _openModal(container, monthId, day, attParams) {
  const modal = container.querySelector('#att-modal');
  if (!modal) return;

  const dow = _dow(day.date);
  modal.querySelector('#att-modal-title').textContent =
    `${A.editDay} ${_dm(day.date)} · יום ${HEB_DAYS_SHORT[dow]}`;

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
    leaveBtns.forEach(b => {
      const on = b.dataset.type === _leaveType;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
        { start: startEl.value, end: endEl.value, breakCode: previewBC, dow },
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

  // "נקה יום" רלוונטי רק כשיש מה לנקות
  const hasData = day.start != null || day.end != null || day.leave != null || day.training;
  modal.querySelector('#att-m-clear').hidden = !hasData;

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
    toast(A.savedDay);
  };

  modal.querySelector('#att-m-clear').onclick = () => {
    if (!confirm(A.clearDayConfirm)) return;
    modal.close();
    _saveDay(monthId, { ..._emptyDay(day.date) });
  };

  const close = () => modal.close();
  modal.querySelector('#att-m-cancel').onclick = close;
  modal.querySelector('#att-m-close').onclick = close;
  // לחיצה על הרקע (מחוץ לתוכן) סוגרת — ה-dialog עצמו הוא היעד רק כשהלחיצה מחוץ לטופס
  modal.onclick = e => { if (e.target === modal) close(); };
}
