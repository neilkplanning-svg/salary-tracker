/**
 * excel-io.js — ייצוא/ייבוא Excel (SheetJS, vendored) — נתוני שכר/שעות/קרן-עזרה/היסטוריה בלבד.
 * settings (פרמטרים לאומיים/אישיים) אינם כלולים כאן — אלה ב-json-io.js/filesync.js (JSON מלא, כלל #4/#7).
 * Input: store state  Output: קובץ .xlsx (4 גיליונות) / ייבוא בחזרה למבנה ה-JSON
 *   (months/aidFund/inflationByYear/manualYearSummaries)
 * Deps: store.js, ui/strings.he.js, engine/attendance-hours.js (categorizeDay — תצוגה בלבד),
 *       ui/history.js (computeYearSummaries — תצוגה בלבד), vendor/xlsx.min.js (SheetJS, נטען דינמית/lazy)
 *
 * מקור-אמת יחיד לשמות עמודות: אובייקט `C` למטה. הבנייה (ייצוא), הפענוח (ייבוא) והתבנית
 * (downloadTemplate) כולם משתמשים באותם קבועים — כך ששלושתם לעולם לא ייסטו זה מזה.
 *
 * מדיניות round-trip (ראו docs/architecture.md — יומן החלטות, WP5.3, WP10.6):
 *  - גיליון "נוכחות": שדות גולמיים (תאריך/כניסה/יציאה/קוד הפסקה/היעדרות) מיובאים; עמודות "(מחושב)" ייצוא-בלבד.
 *  - גיליון "סטטוס חודשי": actual/reductions/מכסת ש"נ מיובאים; עמודות estimate (תמונה שמורה) ייצוא-בלבד —
 *    ה-estimate הקיים מקומית *נשמר* בייבוא (לא נדרס), כדי לא להפר את כלל ה-snapshot (#6 ב-CLAUDE.md).
 *  - "קרן עזרה": ייבוא = החלפה מלאה — הייצוא תמיד כולל את כל הנתונים הנוכחיים, כך שרצף
 *    ייצוא→עריכה→ייבוא שקוף.
 *  - "היסטוריה שנתית" (WP10.6): עמודת אינפלציה מיובאת תמיד לכל שנה. עמודות הסכומים
 *    (ברוטו/נטו/מענקים/מס' חודשים/הערות) מיובאות ל-manualYearSummaries רק לשנה שאין לה חודשים
 *    ב-months הסופי — derived (חודשים) תמיד גובר על ידני, גם אם עמודות הסכומים מולאו לשנה כזו.
 *    שנה שקיבלה manualYearSummaries בעבר אך עכשיו יש לה חודשים — מוסרת מהמפה הידנית בייבוא.
 *  - ייבוא כותב דרך store.setState (לא store.replace) — משנה רק
 *    months/aidFund/inflationByYear/manualYearSummaries, ללא נגיעה ב-settings/appMeta;
 *    מעדכן lastModified אוטומטית (התנהגות setState הקיימת).
 *  - תבנית ריקה (downloadTemplate): גיליון "הוראות" + 4 גיליונות עם כותרות ושורות דוגמה בלבד —
 *    כדי שהמשתמש ידע באיזה פורמט למלא לפני ייבוא. הכותרות זהות למה שהפענוח קורא (אותו `C`).
 */

import { store } from '../model/store.js';
import { STRINGS } from '../ui/strings.he.js';
import { categorizeDay } from '../engine/attendance-hours.js';
import { computeYearSummaries } from '../ui/history.js';

const IO = STRINGS.io;

const SHEET_INSTRUCTIONS = 'הוראות';
const SHEET_ATTENDANCE = 'נוכחות';
const SHEET_STATUS     = 'סטטוס חודשי';
const SHEET_AIDFUND    = 'קרן עזרה';
const SHEET_HISTORY    = 'היסטוריה שנתית';
const FILE_NAME          = 'salary-export.xlsx';
const TEMPLATE_FILE_NAME = 'salary-template.xlsx';

/**
 * מקור-אמת יחיד לשמות עמודות (עברית). מפתחות באנגלית לשימוש בקוד; ערכים = הכותרת בקובץ.
 * שינוי כותרת כאן משתקף אוטומטית בייצוא, בייבוא ובתבנית.
 */
const C = {
  // נוכחות — קלט
  month:      'חודש',
  date:       'תאריך',
  dow:        'יום',
  in:         'כניסה',
  out:        'יציאה',
  breakCode:  'קוד הפסקה',
  leaveType:  'סוג היעדרות',
  leaveHours: 'שעות היעדרות',
  // נוכחות — מחושב (ייצוא בלבד; מתעלמים בייבוא)
  cRegular:    'שעות רגילות (מחושב)',
  cOvertime:   'שעות נוספות (מחושב)',
  cZero:       'שעות אפס (מחושב)',
  cUnapproved: 'שעות ללא-אישור (מחושב)',
  // סטטוס חודשי
  otCap:         'מכסת ש"נ מאושרת',
  estGross:      'ברוטו משוער (תמונה שמורה)',
  estNet:        'נטו משוער (תמונה שמורה)',
  estComputedAt: 'תאריך חישוב התמונה',
  actGross:      'ברוטו בפועל',
  actNet:        'נטו בפועל',
  actOT:         'שעות נוספות מאושרות (בפועל)',
  actBonus:      'תוספות / מענקים',
  notes:         'הערות',
  redFromReg:    'הפחתה משכר רגיל',
  redFromOT:     'הפחתה משעות נוספות',
  redQBonus:     'מענק רבעוני',
  redBonusDed:   'ניכוי מענק',
  // קרן עזרה
  afType:    'סוג',
  afAmount:  'סכום',
  afMonthly: 'החזר חודשי',
  // היסטוריה שנתית — hTotalGross/hTotalNet/hBonusesGross/hMonthsCount/hNotes הם דו-תכליתיים:
  // בייצוא הם מציגים את הסיכום הנגזר (derived) לשנים עם חודשים; לשנה ללא חודשים אפשר להזין בהם
  // ידנית בקובץ ולייבא חזרה — ראו parseWorkbook (WP10.6). hAvgGross/hAvgNet נשארים תצוגה-בלבד.
  year:          'שנה',
  hTotalGross:   'סה"כ ברוטו',
  hTotalNet:     'סה"כ נטו',
  hBonusesGross: 'סה"כ מענקים',
  hMonthsCount:  'מספר חודשים (לשנה ידנית)',
  hNotes:        'הערות (שנה ידנית)',
  hAvgGross:     'ממוצע ברוטו חודשי (מחושב)',
  hAvgNet:       'ממוצע נטו חודשי (מחושב)',
  // WP10.7 — סה"כ תוספות קבועות: עמודת ייצוא/תצוגה בלבד (מחושב מ-snapshot שמור), ריק לשנה ידנית
  hAdditionsGross: 'סה"כ תוספות קבועות (מחושב)',
  inflation:     'אינפלציה (%)',
};

/** סדר העמודות בייצוא (כולל עמודות מחושבות) — מבטיח כותרות יציבות גם כשהנתונים ריקים */
const EXPORT_HEADERS = {
  attendance: [C.month, C.date, C.dow, C.in, C.out, C.breakCode, C.leaveType, C.leaveHours,
               C.cRegular, C.cOvertime, C.cZero, C.cUnapproved],
  status:     [C.month, C.otCap, C.estGross, C.estNet, C.estComputedAt, C.actGross, C.actNet,
               C.actOT, C.actBonus, C.notes, C.redFromReg, C.redFromOT, C.redQBonus, C.redBonusDed],
  aidFund:    [C.afType, C.date, C.afAmount, C.afMonthly, C.notes],
  history:    [C.year, C.hTotalGross, C.hTotalNet, C.hBonusesGross, C.hMonthsCount, C.hNotes,
               C.hAvgGross, C.hAvgNet, C.hAdditionsGross, C.inflation],
};

/** עמודות התבנית (קלט בלבד — ללא עמודות מחושבות/תמונה-שמורה) */
const TEMPLATE_HEADERS = {
  attendance: [C.date, C.in, C.out, C.breakCode, C.leaveType, C.leaveHours],
  status:     [C.month, C.otCap, C.actGross, C.actNet, C.actOT, C.actBonus, C.notes,
               C.redFromReg, C.redFromOT, C.redQBonus, C.redBonusDed],
  aidFund:    [C.afType, C.date, C.afAmount, C.afMonthly, C.notes],
  // hTotalGross/hTotalNet/hBonusesGross/hMonthsCount/hNotes רלוונטיים רק לשנים ללא חודשים מתועדים
  // (למשל שנים שקדמו לשימוש באפליקציה) — לשנה עם חודשים הם מתעלמים בייבוא (derived גובר).
  history:    [C.year, C.hTotalGross, C.hTotalNet, C.hBonusesGross, C.hMonthsCount, C.hNotes, C.inflation],
};

/** שורות דוגמה לתבנית — מיושרות בדיוק לסדר TEMPLATE_HEADERS של אותו גיליון */
const TEMPLATE_EXAMPLES = {
  attendance: [
    ['2026-06-01', '08:00', '17:00', '',    '',        ''],
    ['2026-06-02', '08:00', '13:00', 'ללא', '',        ''],
    ['2026-06-03', '',      '',      '',    'חופשה',   8],
    ['2026-06-04', '',      '',      '',    'השתלמות', ''],
  ],
  status: [
    ['2026-06', 30, '', '', '', '', 'שורת דוגמה — החלף/מחק', '', '', '', ''],
  ],
  aidFund: [
    ['יתרה',   '',           5000,  '',  'יתרת חיסכון נוכחית'],
    ['הפקדה',  '2026-06-01', 300,   '',  'הפקדה חודשית'],
    ['הלוואה', '2026-03-01', 10000, 500, 'החזר חודשי 500 ₪'],
  ],
  history: [
    [2024, '', '', '', '', '', 4.2],
    [2025, '', '', '', '', '', 3.1],
    [2018, 180000, 145000, 5000, 12, 'שורת דוגמה — שנה ללא חודשים מתועדים, נתונים חלקיים מותרים', ''],
  ],
};

const LEAVE_LABELS = { vacation: 'חופשה', sick: 'מחלה', training: 'השתלמות' };
const LEAVE_LABELS_REV = Object.fromEntries(Object.entries(LEAVE_LABELS).map(([k, v]) => [v, k]));
const HEB_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MAX_SHOWN_ERRORS = 15;

let _xlsxPromise = null;

/** טוען את SheetJS דינמית מ-src/vendor/xlsx.min.js (vendored, לא CDN) — פעם אחת בלבד, רק כשנדרש */
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/xlsx.min.js', import.meta.url).href;
    script.onload  = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX global missing')));
    script.onerror = () => reject(new Error('script load failed'));
    document.head.appendChild(script);
  });
  return _xlsxPromise;
}

/** הודעת אישור צפה (נספחת ל-body כדי לשרוד re-render של המסך) */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/** @param {number} n @returns {number} מעוגל ל-2 ספרות אחרי הנקודה */
function r2(n) { return Math.round((n ?? 0) * 100) / 100; }

/** @param {string} date YYYY-MM-DD @returns {string} תווית יום בשבוע קצרה */
function dowLabel(date) {
  return HEB_DOW[new Date(date + 'T12:00:00Z').getDay()];
}

/** @param {number} h שעות עשרוניות @returns {string} HH:MM */
function hhmm(h) {
  const hh = Math.floor(h).toString().padStart(2, '0');
  const mm = Math.round((h % 1) * 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** @param {number} serial מספר סידורי של תאריך באקסל @returns {string} YYYY-MM-DD (UTC) */
function excelSerialToISODate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── בניית גיליונות (ייצוא) ────────────────────────────────────────────────

function buildAttendanceRows(state) {
  const attParams = state.settings?.national?.attendanceParams ?? null;
  const rows = [];
  for (const m of state.months) {
    for (const d of (m.days ?? [])) {
      const cat = (attParams && d.start && d.end)
        ? categorizeDay(
            { start: d.start, end: d.end, breakCode: d.breakCode ?? null, dow: new Date(d.date + 'T12:00:00Z').getDay() },
            attParams,
          )
        : null;
      rows.push({
        [C.month]:      m.id,
        [C.date]:       d.date,
        [C.dow]:        dowLabel(d.date),
        [C.in]:         d.start ?? '',
        [C.out]:        d.end ?? '',
        [C.breakCode]:  d.breakCode == null ? '' : (d.breakCode === -1 ? 'ללא' : d.breakCode),
        [C.leaveType]:  LEAVE_LABELS[d.leave?.type] ?? '',
        [C.leaveHours]: d.leave?.hours ?? '',
        [C.cRegular]:    cat ? r2(cat.regularPaid)     : '',
        [C.cOvertime]:   cat ? r2(cat.overtimeHours)   : '',
        [C.cZero]:       cat ? r2(cat.zeroHours)       : '',
        [C.cUnapproved]: cat ? r2(cat.unapprovedHours) : '',
      });
    }
  }
  return rows;
}

function buildStatusRows(state) {
  return state.months.map(m => ({
    [C.month]:         m.id,
    [C.otCap]:         m.overtimeApprovedCap ?? '',
    [C.estGross]:      m.estimate?.gross ?? '',
    [C.estNet]:        m.estimate?.net   ?? '',
    [C.estComputedAt]: m.estimate?.computedAt ?? '',
    [C.actGross]:      m.actual?.gross ?? '',
    [C.actNet]:        m.actual?.net   ?? '',
    [C.actOT]:         m.actual?.approvedOT ?? '',
    [C.actBonus]:      m.actual?.bonuses ?? '',
    [C.notes]:         m.actual?.notes ?? '',
    [C.redFromReg]:    m.reductions?.fromRegular    ?? '',
    [C.redFromOT]:     m.reductions?.fromOvertime   ?? '',
    [C.redQBonus]:     m.reductions?.quarterlyBonus ?? '',
    [C.redBonusDed]:   m.reductions?.bonusDeduction ?? '',
  }));
}

function buildAidFundRows(state) {
  const af = state.aidFund ?? { deposits: [], balanceSavings: 0, loans: [] };
  const rows = [{ [C.afType]: 'יתרה', [C.date]: '', [C.afAmount]: af.balanceSavings ?? 0, [C.afMonthly]: '', [C.notes]: '' }];
  for (const d of (af.deposits ?? [])) {
    rows.push({ [C.afType]: 'הפקדה', [C.date]: d.date, [C.afAmount]: d.amount, [C.afMonthly]: '', [C.notes]: d.notes ?? '' });
  }
  for (const l of (af.loans ?? [])) {
    rows.push({ [C.afType]: 'הלוואה', [C.date]: l.date, [C.afAmount]: l.amount, [C.afMonthly]: l.monthlyRepayment ?? 0, [C.notes]: l.notes ?? '' });
  }
  return rows;
}

/** מעגל ל-2 ספרות אם קיים ערך; משאיר '' (תא ריק) כש-v הוא null/undefined — כדי לא לאבד "לא הוזן" (שנה ידנית חלקית) */
function r2OrBlank(v) {
  return v == null ? '' : r2(v);
}

function buildHistoryRows(state) {
  return computeYearSummaries(state).map(s => ({
    [C.year]:            s.year,
    [C.hTotalGross]:     r2OrBlank(s.totalGross),
    [C.hTotalNet]:       r2OrBlank(s.totalNet),
    [C.hBonusesGross]:   r2OrBlank(s.bonusesGross),
    [C.hMonthsCount]:    s.source === 'manual' ? (s.monthsCount ?? '') : '',
    [C.hNotes]:          s.source === 'manual' ? (s.notes ?? '') : '',
    [C.hAvgGross]:       r2OrBlank(s.avgMonthlyGross),
    [C.hAvgNet]:         r2OrBlank(s.avgMonthlyNet),
    [C.hAdditionsGross]: r2OrBlank(s.additionsGross), // ריק לשנה ידנית (אין snapshot) — ראו WP10.7
    [C.inflation]:       r2((s.inflationPct ?? 0) * 100),
  }));
}

/**
 * בונה worksheet משורות אובייקט עם סדר עמודות קבוע; אם אין שורות — מייצר גיליון
 * עם שורת כותרת בלבד (כדי שהייצוא תמיד יכיל כותרות, גם בגרסה ריקה).
 */
function sheetFromRows(XLSX, rows, headers) {
  return rows.length
    ? XLSX.utils.json_to_sheet(rows, { header: headers })
    : XLSX.utils.aoa_to_sheet([headers]);
}

/**
 * ייצוא המצב המלא (נוכחות/סטטוס/קרן עזרה/היסטוריה) לקובץ salary-export.xlsx (הורדה)
 * @returns {Promise<void>}
 */
export async function exportExcel() {
  let XLSX;
  try { XLSX = await loadXLSX(); } catch { alert(IO.errorVendorLoad); return; }

  const state = store.getState();
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, buildAttendanceRows(state), EXPORT_HEADERS.attendance), SHEET_ATTENDANCE);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, buildStatusRows(state),     EXPORT_HEADERS.status),     SHEET_STATUS);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, buildAidFundRows(state),    EXPORT_HEADERS.aidFund),    SHEET_AIDFUND);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, buildHistoryRows(state),    EXPORT_HEADERS.history),    SHEET_HISTORY);

  XLSX.writeFile(wb, FILE_NAME);
  toast(IO.exportExcelOk);
}

// ─── תבנית ריקה (הורדת טמפלייט) ────────────────────────────────────────────

/** שורות גיליון ההוראות (aoa דו-עמודתי: נושא | הסבר), עם מקרא הפסקות דינמי מההגדרות */
function buildInstructionRows(state) {
  const ap  = state?.settings?.national?.attendanceParams ?? null;
  const bws = ap?.breakWindows ?? [];
  const defBC = ap?.defaultBreakCode ?? null;
  const bwLegend = bws.length
    ? bws.map((bw, i) => `${i} = ${hhmm(bw[0])}–${hhmm(bw[1])}`).join('  |  ')
    : 'לא הוגדרו חלונות הפסקה בהגדרות';
  const defLabel = (defBC != null && bws[defBC])
    ? `${defBC} (${hhmm(bws[defBC][0])}–${hhmm(bws[defBC][1])})`
    : 'ללא הפסקה';

  return [
    ['תבנית העלאת נתונים — מעקב שכר', ''],
    ['', ''],
    ['כללי', 'מלא את הגיליונות הרלוונטיים והעלה את הקובץ במסך ההגדרות ‹ "ייבוא Excel". שורות הדוגמה נועדו להמחשה בלבד — מחק או החלף אותן בנתונים שלך.'],
    ['מה מתעדכן בייבוא', 'ייבוא מעדכן רק נתוני שכר / שעות / קרן-עזרה / היסטוריה — לא את ההגדרות והפרמטרים. תמונות "משוער" שמורות אינן נדרסות.'],
    ['עמודות (מחושב)', 'בקובץ הייצוא מופיעות עמודות המסומנות "(מחושב)" — הן מחושבות אוטומטית, אין צורך למלא אותן והן מתעלמות בייבוא. בתבנית זו הן הושמטו.'],
    ['', ''],
    ['— גיליון "נוכחות" —', 'שורה אחת לכל יום עבודה או היעדרות.'],
    [C.date, 'תאריך: dd/mm/yyyy (למשל 15/06/2026) או תא תאריך של Excel — גם 2026-06-15 מתקבל. החודש נגזר אוטומטית מהתאריך.'],
    [`${C.in} / ${C.out}`, 'שעה בפורמט 24 שעות HH:MM (למשל 08:00, 17:30). השאר ריק ביום היעדרות מלא.'],
    [C.breakCode, `ריק = ברירת המחדל מההגדרות (${defLabel}).  "ללא" = ללא ניכוי הפסקה.  מספר = אינדקס חלון הפסקה:  ${bwLegend}.`],
    [C.leaveType, 'אחד מ: חופשה / מחלה / השתלמות.  השאר ריק ביום עבודה רגיל.'],
    [C.leaveHours, 'מספר שעות ההיעדרות (למשל 8).  בהשתלמות ניתן להשאיר ריק — יחושב יום מלא.'],
    ['', ''],
    ['— גיליון "סטטוס חודשי" —', `שורה לכל חודש; העמודה "${C.month}" (חובה): MM/YYYY (למשל 06/2026), YYYY-MM, או תא תאריך של Excel.`],
    ['שדות "בפועל"', 'ברוטו/נטו בפועל, שעות נוספות מאושרות, תוספות/מענקים והערות — מהתלוש בפועל (אופציונלי).'],
    ['שדות הפחתות', 'הפחתה משכר רגיל / משעות נוספות / מענק רבעוני / ניכוי מענק (אופציונלי).'],
    ['', ''],
    ['— גיליון "קרן עזרה" —', `עמודת "${C.afType}": יתרה / הפקדה / הלוואה. "${C.date}" ו"${C.afAmount}" נדרשים בהפקדה/הלוואה; "${C.afMonthly}" רלוונטי להלוואה.`],
    ['', ''],
    ['— גיליון "היסטוריה שנתית" —', `העמודה "${C.year}" (YYYY) ו-"${C.inflation}" רלוונטיות לכל שנה.`],
    ['שנים עם חודשים מתועדים', 'הסיכום מחושב אוטומטית מגיליונות "נוכחות"/"סטטוס חודשי" — עמודות הסכומים (' +
      `"${C.hTotalGross}", "${C.hTotalNet}", "${C.hBonusesGross}", "${C.hMonthsCount}", "${C.hNotes}") מתעלמות לשנה כזו, גם אם מולאו.`],
    ['שנים היסטוריות ללא חודשים', `למילוי נתוני שנים שקדמו לשימוש באפליקציה — מלא את "${C.hTotalGross}" / "${C.hTotalNet}" / ` +
      `"${C.hBonusesGross}" / "${C.hMonthsCount}" / "${C.hNotes}" (כולם אופציונליים, ניתן למלא חלק בלבד — הזנה חלקית מותרת).`],
    [C.hAdditionsGross, 'עמודת ייצוא/תצוגה בלבד (כמו עמודות "מחושב") — מחושבת רק לשנה עם חודשים מתועדים, מתוך תמונות "משוער" שמורות; ריקה לשנה ידנית, ואינה מיובאת.'],
  ];
}

/** מוסיף גיליון תבנית (כותרות + שורות דוגמה) עם רוחבי עמודות סבירים */
function appendTemplateSheet(XLSX, wb, sheetName, headers, examples) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(12, String(h).length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

/**
 * מוריד קובץ תבנית ריק (salary-template.xlsx): גיליון הוראות + 4 גיליונות עם כותרות
 * ושורות דוגמה — כדי שהמשתמש ידע באיזה פורמט למלא נתונים לפני ייבוא.
 * @returns {Promise<void>}
 */
export async function downloadTemplate() {
  let XLSX;
  try { XLSX = await loadXLSX(); } catch { alert(IO.errorVendorLoad); return; }

  const state = store.getState();
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  const instrWs = XLSX.utils.aoa_to_sheet(buildInstructionRows(state));
  instrWs['!cols'] = [{ wch: 28 }, { wch: 82 }];
  XLSX.utils.book_append_sheet(wb, instrWs, SHEET_INSTRUCTIONS);

  appendTemplateSheet(XLSX, wb, SHEET_ATTENDANCE, TEMPLATE_HEADERS.attendance, TEMPLATE_EXAMPLES.attendance);
  appendTemplateSheet(XLSX, wb, SHEET_STATUS,     TEMPLATE_HEADERS.status,     TEMPLATE_EXAMPLES.status);
  appendTemplateSheet(XLSX, wb, SHEET_AIDFUND,    TEMPLATE_HEADERS.aidFund,    TEMPLATE_EXAMPLES.aidFund);
  appendTemplateSheet(XLSX, wb, SHEET_HISTORY,    TEMPLATE_HEADERS.history,    TEMPLATE_EXAMPLES.history);

  XLSX.writeFile(wb, TEMPLATE_FILE_NAME);
  toast(IO.templateOk);
}

// ─── פענוח גיליונות (ייבוא) ────────────────────────────────────────────────

function sheetRows(XLSX, wb, name) {
  const ws = wb.Sheets[name];
  return ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
}

/** @returns {string|null|false} HH:mm תקין / null (ריק) / false (לא תקין) */
function parseTimeCell(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    // אקסל אחסן כערך שעה מספרי (שבר של יממה) — למשל אחרי עריכה ידנית שגרמה להמרה אוטומטית
    if (v < 0 || v >= 1) return false;
    const totalMin = Math.round(v * 24 * 60);
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : false;
}

/** @param {number} y שנה @param {number} mo חודש (1-12) @param {number} d יום @returns {string|false} YYYY-MM-DD תקין, או false אם התאריך לא קיים בלוח השנה (למשל 31/02) */
function ymdToISO(y, mo, d) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * מפענח תאריך בפורמט עברי/ישראלי סטנדרטי dd/mm/yyyy או dd.mm.yyyy (יום-חודש-שנה — הסדר הישראלי
 * הרגיל; גם יום/חודש בספרה בודדת). לא מפרש את המספר הראשון כחודש.
 * @param {string} s @returns {string|false} YYYY-MM-DD תקין, או false אם לא תואם/לא תקין
 */
function parseIsraeliDateText(s) {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (!m) return false;
  const [, dd, mm, yyyy] = m;
  return ymdToISO(Number(yyyy), Number(mm), Number(dd));
}

/**
 * @param {*} v תא גולמי — מספר סידורי אקסל, אובייקט Date, מחרוזת ISO (YYYY-MM-DD) או ישראלית (dd/mm/yyyy, dd.mm.yyyy)
 * @returns {string} YYYY-MM-DD אם זוהה תאריך תקין; אחרת המחרוזת המקורית (כדי שהקורא יזהה "לא תקין" כפי שהיה)
 */
export function normalizeDateCell(v) {
  if (typeof v === 'number') return excelSerialToISODate(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // כבר ISO — כפי שהיה
  const heb = parseIsraeliDateText(s);
  if (heb) return heb;
  return s;
}

/**
 * @param {*} v תא גולמי של חודש — מספר סידורי אקסל, אובייקט Date, מחרוזת YYYY-MM, MM/YYYY (או M/YYYY),
 * או תאריך מלא (ISO/ישראלי) — במקרה זה נלקחת שנה-חודש בלבד
 * @returns {string} YYYY-MM אם זוהה בהצלחה; אחרת המחרוזת המקורית (הקורא יזהה "לא תקין" כפי שהיה)
 */
export function normalizeMonthCell(v) {
  if (typeof v === 'number') return excelSerialToISODate(v).slice(0, 7);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s; // כבר YYYY-MM
  const mmYyyy = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (mmYyyy) {
    const mo = Number(mmYyyy[1]);
    if (mo >= 1 && mo <= 12) return `${mmYyyy[2]}-${String(mo).padStart(2, '0')}`;
    return s;
  }
  // תאריך מלא (ISO, dd/mm/yyyy, dd.mm.yyyy) — לוקחים שנה-חודש בלבד
  const full = normalizeDateCell(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(full)) return full.slice(0, 7);
  return s;
}

/** @param {*} v @returns {number|null|false} מספר / null (ריק) / false (לא תקין) */
function numCell(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : false;
}

/**
 * מפענח workbook שנטען ל-{months, aidFund, inflationByYear, manualYearSummaries, errors}.
 * שגיאות נאספות עם הקשר גיליון+שורה+ערך כדי שהמשתמש יוכל לתקן בקובץ המקורי.
 * @param {object} XLSX ה-namespace הגלובלי שנטען
 * @param {object} wb workbook מ-XLSX.read
 * @param {object} currentState state נוכחי (לשימור estimate קיים לכל חודש)
 * @returns {{months: object[], aidFund: object|null, inflationByYear: object|null, manualYearSummaries: object|null, errors: string[]}}
 */
export function parseWorkbook(XLSX, wb, currentState) {
  const errors = [];
  const attParams = currentState.settings?.national?.attendanceParams ?? null;
  const existingEstimateByMonth = new Map(currentState.months.map(m => [m.id, m.estimate ?? null]));

  const monthMap = new Map();
  const getMonth = id => {
    if (!monthMap.has(id)) {
      monthMap.set(id, {
        id, days: [], estimate: existingEstimateByMonth.get(id) ?? null,
        actual: null, reductions: null, overtimeApprovedCap: undefined,
      });
    }
    return monthMap.get(id);
  };

  // ── נוכחות ──
  sheetRows(XLSX, wb, SHEET_ATTENDANCE).forEach((row, i) => {
    const rowNum = i + 2;
    const date = normalizeDateCell(row[C.date]);
    if (!date) return; // שורה ריקה — מדלגים
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
      errors.push(`${SHEET_ATTENDANCE} שורה ${rowNum}: תאריך לא תקין "${date}"`);
      return;
    }

    const start = parseTimeCell(row[C.in]);
    const end   = parseTimeCell(row[C.out]);
    if (start === false || end === false) {
      errors.push(`${SHEET_ATTENDANCE} שורה ${rowNum} (${date}): שעה לא תקינה — נדרש HH:MM`);
      return;
    }

    const bcRaw = row[C.breakCode];
    let breakCode = null;
    if (bcRaw !== '' && bcRaw != null) {
      if (String(bcRaw).trim() === 'ללא') breakCode = -1;
      else {
        const n = Number(bcRaw);
        if (!Number.isInteger(n) || n < 0) {
          errors.push(`${SHEET_ATTENDANCE} שורה ${rowNum} (${date}): קוד הפסקה לא תקין "${bcRaw}"`);
          return;
        }
        breakCode = n;
      }
    }

    const leaveLabel = String(row[C.leaveType] ?? '').trim();
    let leave = null;
    if (leaveLabel) {
      const type = LEAVE_LABELS_REV[leaveLabel];
      if (!type) {
        errors.push(`${SHEET_ATTENDANCE} שורה ${rowNum} (${date}): סוג היעדרות לא מוכר "${leaveLabel}"`);
        return;
      }
      const hours = numCell(row[C.leaveHours]);
      if (hours === false || (hours != null && hours < 0)) {
        errors.push(`${SHEET_ATTENDANCE} שורה ${rowNum} (${date}): שעות היעדרות לא תקינות`);
        return;
      }
      leave = { type, hours: hours ?? (type === 'training' ? (attParams?.fullDayHours ?? 0) : 0) };
    }

    const training = leave?.type === 'training';
    const month = getMonth(date.slice(0, 7));
    const dayRecord = { date, start, end, breakCode, training, present: start != null || leave != null, leave };
    const idx = month.days.findIndex(d => d.date === date);
    if (idx >= 0) month.days[idx] = dayRecord; else month.days.push(dayRecord);
  });

  // ── סטטוס חודשי ──
  sheetRows(XLSX, wb, SHEET_STATUS).forEach((row, i) => {
    const rowNum = i + 2;
    if (row[C.month] === '' || row[C.month] == null) return;
    const monthId = normalizeMonthCell(row[C.month]);
    if (!/^\d{4}-\d{2}$/.test(monthId)) {
      errors.push(`${SHEET_STATUS} שורה ${rowNum}: חודש לא תקין "${monthId}"`);
      return;
    }

    const fields = {
      cap:       numCell(row[C.otCap]),
      aGross:    numCell(row[C.actGross]),
      aNet:      numCell(row[C.actNet]),
      aOT:       numCell(row[C.actOT]),
      aBonus:    numCell(row[C.actBonus]),
      rFromReg:  numCell(row[C.redFromReg]),
      rFromOT:   numCell(row[C.redFromOT]),
      rQBonus:   numCell(row[C.redQBonus]),
      rBonusDed: numCell(row[C.redBonusDed]),
    };
    if (Object.values(fields).some(v => v === false)) {
      errors.push(`${SHEET_STATUS} שורה ${rowNum} (${monthId}): ערך מספרי לא תקין`);
      return;
    }

    const month = getMonth(monthId);
    month.overtimeApprovedCap = fields.cap;

    const notes = String(row[C.notes] ?? '').trim();
    if (fields.aGross != null || fields.aNet != null || fields.aOT != null || fields.aBonus != null || notes) {
      month.actual = { gross: fields.aGross, net: fields.aNet, approvedOT: fields.aOT, bonuses: fields.aBonus, notes };
    }
    if ([fields.rFromReg, fields.rFromOT, fields.rQBonus, fields.rBonusDed].some(v => v != null)) {
      month.reductions = {
        fromRegular: fields.rFromReg ?? 0, fromOvertime: fields.rFromOT ?? 0,
        quarterlyBonus: fields.rQBonus ?? 0, bonusDeduction: fields.rBonusDed ?? 0,
      };
    }
  });

  for (const m of monthMap.values()) {
    if (m.overtimeApprovedCap === undefined) m.overtimeApprovedCap = null;
    m.days.sort((a, b) => a.date.localeCompare(b.date));
  }
  const months = [...monthMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  // ── קרן עזרה ──
  let aidFund = null;
  const afRows = sheetRows(XLSX, wb, SHEET_AIDFUND);
  if (afRows.length) {
    aidFund = { deposits: [], balanceSavings: 0, loans: [] };
    afRows.forEach((row, i) => {
      const rowNum = i + 2;
      const type = String(row[C.afType] ?? '').trim();
      const amount = numCell(row[C.afAmount]);
      if (type === 'יתרה') {
        aidFund.balanceSavings = (amount != null && amount !== false) ? Math.max(0, r2(amount)) : 0;
      } else if (type === 'הפקדה' || type === 'הלוואה') {
        const date = normalizeDateCell(row[C.date]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !amount || amount <= 0) {
          errors.push(`${SHEET_AIDFUND} שורה ${rowNum}: ${type} עם תאריך/סכום לא תקין`);
          return;
        }
        const notes = String(row[C.notes] ?? '').trim();
        if (type === 'הפקדה') {
          aidFund.deposits.push({ id: crypto.randomUUID(), date, amount: r2(amount), notes });
        } else {
          const monthly = numCell(row[C.afMonthly]);
          aidFund.loans.push({
            id: crypto.randomUUID(), date, amount: r2(amount),
            monthlyRepayment: (monthly && monthly !== false) ? Math.max(0, r2(monthly)) : 0,
            notes,
          });
        }
      } else if (type) {
        errors.push(`${SHEET_AIDFUND} שורה ${rowNum}: סוג לא מוכר "${type}"`);
      }
    });
  }

  // ── היסטוריה שנתית ──
  // עמודת אינפלציה: תמיד מיובאת, לכל שנה. עמודות הסכומים (ברוטו/נטו/מענקים/מס' חודשים/הערות):
  // מיובאות ל-manualYearSummaries רק לשנה שאין לה חודשים ב-months (הסופי, לאחר ייבוא זה) —
  // derived גובר תמיד; שנה עם חודשים מתעלמת מהעמודות האלה גם אם מולאו (WP10.6).
  const yearsWithMonths = new Set(months.map(m => parseInt(m.id.split('-')[0], 10)));
  let inflationByYear = null;
  let manualYearSummaries = null;
  const histRows = sheetRows(XLSX, wb, SHEET_HISTORY);
  if (histRows.length) {
    inflationByYear = {};
    manualYearSummaries = {};
    histRows.forEach((row, i) => {
      const rowNum = i + 2;
      const year = String(row[C.year] ?? '').trim();
      if (!/^\d{4}$/.test(year)) { errors.push(`${SHEET_HISTORY} שורה ${rowNum}: שנה לא תקינה "${year}"`); return; }
      const pct = numCell(row[C.inflation]);
      if (pct === false) { errors.push(`${SHEET_HISTORY} שורה ${rowNum} (${year}): אינפלציה לא תקינה`); return; }
      if (pct != null) inflationByYear[year] = pct / 100;

      if (yearsWithMonths.has(Number(year))) return; // derived גובר — מתעלמים מעמודות הסכומים

      const totalGross = numCell(row[C.hTotalGross]);
      const totalNet = numCell(row[C.hTotalNet]);
      const bonusesGross = numCell(row[C.hBonusesGross]);
      const monthsCount = numCell(row[C.hMonthsCount]);
      if ([totalGross, totalNet, bonusesGross, monthsCount].some(v => v === false)) {
        errors.push(`${SHEET_HISTORY} שורה ${rowNum} (${year}): ערך מספרי לא תקין בעמודות הסיכום הידני`);
        return;
      }
      const notes = String(row[C.hNotes] ?? '').trim();
      const entry = {};
      if (totalGross != null) entry.totalGross = r2(totalGross);
      if (totalNet != null) entry.totalNet = r2(totalNet);
      if (bonusesGross != null) entry.bonusesGross = r2(bonusesGross);
      if (monthsCount != null) entry.monthsCount = monthsCount;
      if (notes) entry.notes = notes;
      if (Object.keys(entry).length) manualYearSummaries[year] = entry;
    });
  }

  return { months, aidFund, inflationByYear, manualYearSummaries, errors };
}

/**
 * ייבוא קובץ Excel דרך בורר קבצים (input[type=file]) — מעדכן months/aidFund/inflationByYear בלבד
 * (דרך store.setState; settings/appMeta לא נגעים; estimate קיים נשמר — ראו מדיניות round-trip למעלה)
 */
export function importExcel() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx,.xls' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    let XLSX;
    try { XLSX = await loadXLSX(); } catch { alert(IO.errorVendorLoad); return; }

    let wb;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    } catch {
      alert(IO.errorBadExcelFile);
      return;
    }

    const hasKnownSheet = [SHEET_ATTENDANCE, SHEET_STATUS, SHEET_AIDFUND, SHEET_HISTORY]
      .some(name => wb.SheetNames.includes(name));
    if (!hasKnownSheet) {
      alert(IO.errorBadExcelFormat);
      return;
    }

    const { months, aidFund, inflationByYear, manualYearSummaries, errors } = parseWorkbook(XLSX, wb, store.getState());
    if (errors.length) {
      const shown = errors.slice(0, MAX_SHOWN_ERRORS).join('\n');
      const more  = errors.length > MAX_SHOWN_ERRORS ? `\n… ועוד ${errors.length - MAX_SHOWN_ERRORS} שגיאות` : '';
      alert(`${IO.errorBadExcelFormat}\n${shown}${more}`);
      return;
    }

    store.setState(draft => {
      // מיזוג לפי id — לא החלפה מלאה. ייבוא חלקי (למשל תבנית עם גיליון היסטוריה בלבד, או חודש
      // בודד חדש) לא ימחק חודשים קיימים שאינם בקובץ. estimate של כל חודש כבר נשמר ב-parseWorkbook.
      if (months.length) {
        const byId = new Map(draft.months.map(m => [m.id, m]));
        for (const m of months) byId.set(m.id, m);
        draft.months = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
      }
      if (aidFund) draft.aidFund = aidFund;
      if (inflationByYear) draft.inflationByYear = { ...draft.inflationByYear, ...inflationByYear };
      if (manualYearSummaries) {
        // מיזוג עם manualYearSummaries קיים; שנים שקיבלו חודשים בייבוא זה מוסרות מהמפה הידנית
        // (derived גובר — לא משאירים ערך "רדום" לשנה שכעת יש לה months, עקבי עם computeYearSummaries)
        const yearsWithMonths = new Set(months.map(m => m.id.slice(0, 4)));
        const merged = { ...(draft.manualYearSummaries ?? {}), ...manualYearSummaries };
        for (const y of Object.keys(merged)) {
          if (yearsWithMonths.has(y)) delete merged[y];
        }
        draft.manualYearSummaries = merged;
      }
    });
    toast(IO.importExcelOk);
  };
  input.click();
}
