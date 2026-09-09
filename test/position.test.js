/**
 * position.test.js — אחוז משרה חודשי/שנתי (engine/position.js)
 * Input: ימי חודש סינתטיים  Output: PASS/FAIL תחת node --test
 * Deps: engine/position.js
 *
 * ההגדרה הנבדקת: (שעות נוכחות בפועל, כולל ש"נ + שעות היעדרות בתשלום)
 *                 ÷ (ימי א'–ה' באותו חודש × fullDayHours).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calcMonthPosition, calcYearPosition, countWorkDays, isWorkDay, monthPositionOf }
  from '../src/engine/position.js';

const PARAMS = { fullDayHours: 8.9, defaultBreakCode: 1, breakWindows: [[11.5, 12], [12, 12.5], [12.5, 13]] };

/** יום נוכחות: כניסה→יציאה */
const day = (date, start, end) => ({ date, start, end, breakCode: null, leave: null, training: false });
/** יום היעדרות בתשלום */
const leaveDay = (date, type, hours) =>
  ({ date, start: null, end: null, breakCode: null, leave: { type, hours }, training: false });

/** כל ימי א'–ה' של חודש, כל אחד לפי בונה שניתן */
function workDaysOf(monthId, build) {
  const [y, m] = monthId.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let i = 1; i <= last; i++) {
    const date = `${monthId}-${String(i).padStart(2, '0')}`;
    if (isWorkDay(date)) out.push(build(date));
  }
  return out;
}

// ─── ימי עבודה אפשריים ────────────────────────────────────────────────────

test('countWorkDays — סופר א׳–ה׳ בלבד (ללא שישי ושבת)', () => {
  assert.equal(countWorkDays('2026-01'), 21); // ינואר 2026
  assert.equal(countWorkDays('2026-02'), 20);
  assert.equal(countWorkDays('2026-09'), 22);
});

test('countWorkDays — asOf חותך את הספירה באמצע החודש', () => {
  // 2026-01-01 חמישי; עד 2026-01-08 (חמישי) — 6 ימי א׳–ה׳
  assert.equal(countWorkDays('2026-01', '2026-01-08'), 6);
  assert.equal(countWorkDays('2026-01', '2025-12-31'), 0); // חודש עתידי כולו
  assert.equal(countWorkDays('2026-01', '2026-02-15'), 21); // asOf אחרי סוף החודש
});

test('countWorkDays — monthId לא תקין מחזיר 0 (ולא נופל)', () => {
  assert.equal(countWorkDays(null), 0);
  assert.equal(countWorkDays('2026'), 0);
});

// ─── אחוז משרה חודשי ──────────────────────────────────────────────────────

test('חודש מלא של ימי נוכחות מלאים = 100%', () => {
  const days = workDaysOf('2026-01', d => day(d, '06:30', '15:24')); // 8.9 ש׳
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });

  assert.equal(pos.workDays, 21);
  assert.equal(pos.potentialHours, 186.9); // 21 × 8.9
  assert.equal(pos.positionPct, 100);
  assert.equal(pos.leaveHours, 0);
  assert.equal(pos.hasData, true);
});

test('שעות נוספות מעלות את האחוז מעל 100', () => {
  const days = workDaysOf('2026-01', d => day(d, '06:30', '17:24')); // 10.9 ש׳ ליום
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });
  assert.equal(pos.positionPct, +(((21 * 10.9) / 186.9) * 100).toFixed(2));
});

test('חופשה/מחלה/השתלמות נספרות כשעות שעבדתי', () => {
  const days = [
    day('2026-01-05', '06:30', '15:24'),           // 8.9
    leaveDay('2026-01-06', 'vacation', 8.9),       // 8.9
    leaveDay('2026-01-07', 'sick', 8.9),           // 8.9
    { date: '2026-01-08', start: null, end: null, leave: null, training: true }, // יום השתלמות מלא
  ];
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });

  assert.equal(pos.presenceHours, 8.9);
  assert.equal(pos.leaveHours, 26.7); // 3 × 8.9
  assert.equal(pos.countedHours, 35.6);
  assert.equal(pos.positionPct, +((35.6 / 186.9) * 100).toFixed(2));
});

test('יום חלקי שהושלם בחופשה נספר כיום מלא', () => {
  const days = [{
    date: '2026-01-05', start: '06:30', end: '11:00', breakCode: null,
    leave: { type: 'vacation', hours: 4.4 }, training: false,
  }];
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });
  assert.equal(pos.countedHours, 8.9); // 4.5 נוכחות + 4.4 חופשה
});

test('שישי: נוכחות נספרת במונה, אך היעדרות שנרשמה על שישי/שבת אינה נספרת', () => {
  const friday = '2026-01-02';
  const saturday = '2026-01-03';
  const withWork = calcMonthPosition({
    monthId: '2026-01', params: PARAMS,
    days: [day(friday, '07:00', '12:00')],
  });
  assert.equal(withWork.presenceHours, 5);
  assert.equal(withWork.workDays, 21); // שישי אינו מוסיף למכנה

  const withLeave = calcMonthPosition({
    monthId: '2026-01', params: PARAMS,
    days: [leaveDay(friday, 'vacation', 8.9), leaveDay(saturday, 'vacation', 8.9)],
  });
  assert.equal(withLeave.leaveHours, 0);
  assert.equal(withLeave.hasData, false);
});

test('חודש ריק — hasData=false ואחוז 0 (לא "לא ידוע"): המכנה קיים, המונה ריק', () => {
  const pos = calcMonthPosition({ monthId: '2026-01', days: [], params: PARAMS });
  assert.equal(pos.hasData, false);
  assert.equal(pos.positionPct, 0);
});

test('חודש לא ידוע (ללא id וללא תאריכים) — positionPct=null, לא 0', () => {
  const pos = calcMonthPosition({ days: [], params: PARAMS });
  assert.equal(pos.positionPct, null);
  assert.equal(pos.potentialHours, 0);
});

test('monthId נגזר מהתאריך הראשון כשלא הועבר במפורש', () => {
  const pos = calcMonthPosition({ days: [day('2026-02-02', '06:30', '15:24')], params: PARAMS });
  assert.equal(pos.monthId, '2026-02');
  assert.equal(pos.workDays, 20);
});

test('מצב ידני (ללא start/end) — נספר מקטגוריות השעות + ההפסקה שנוכתה', () => {
  const days = [{
    date: '2026-01-05', start: null, end: null,
    regularHours: 8.4, zeroHours: 0.3, overtimeHours: 1.2, unapprovedHours: 0,
    breakDeducted: 0.5, leave: null, training: false,
  }];
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });
  assert.equal(pos.presenceHours, 10.4);
});

test('יום שאינו שייך לחודש מסונן החוצה', () => {
  const days = [day('2026-01-05', '06:30', '15:24'), day('2026-02-05', '06:30', '15:24')];
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS });
  assert.equal(pos.presenceHours, 8.9);
});

// ─── חודש מתמשך (asOf) ────────────────────────────────────────────────────

test('חודש מתמשך — toDate חותך גם את המונה וגם את המכנה', () => {
  // עד 2026-01-08 יש 6 ימי עבודה; ממלאים את כולם ביום מלא
  const days = workDaysOf('2026-01', d => day(d, '06:30', '15:24')).filter(d => d.date <= '2026-01-08');
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS, asOf: '2026-01-08' });

  assert.equal(pos.toDate.workDays, 6);
  assert.equal(pos.toDate.positionPct, 100);      // עד היום — משרה מלאה
  assert.ok(pos.positionPct < 30, 'האחוז לחודש המלא עדיין נמוך — רוב החודש לפנינו');
});

test('חודש שהסתיים — אין toDate (asOf אחרי סופו)', () => {
  const days = [day('2026-01-05', '06:30', '15:24')];
  const pos = calcMonthPosition({ monthId: '2026-01', days, params: PARAMS, asOf: '2026-03-01' });
  assert.equal(pos.toDate, null);
});

// ─── אחוז משרה שנתי ───────────────────────────────────────────────────────

test('שנתי — Σ שעות ÷ Σ שעות אפשריות (ולא ממוצע האחוזים החודשיים)', () => {
  const months = [
    { id: '2026-01', days: [day('2026-01-05', '06:30', '15:24')] },                     // 1 מתוך 21
    { id: '2026-02', days: workDaysOf('2026-02', d => day(d, '06:30', '15:24')) },      // 20 מתוך 20
  ];
  const pos = calcYearPosition({ year: 2026, months, params: PARAMS });

  assert.equal(pos.monthsCounted, 2);
  assert.equal(pos.workDays, 41);
  assert.equal(pos.positionPct, +(((1 + 20) / 41) * 100).toFixed(2));
});

test('שנתי — חודש ללא נתוני נוכחות אינו נספר במכנה', () => {
  const months = [
    { id: '2026-01', days: [day('2026-01-05', '06:30', '15:24')] },
    { id: '2026-02', days: [] },
    { id: '2026-03', days: null },
  ];
  const pos = calcYearPosition({ year: 2026, months, params: PARAMS });
  assert.equal(pos.monthsCounted, 1);
  assert.equal(pos.workDays, 21);
});

test('שנתי — חודשים של שנה אחרת מסוננים', () => {
  const months = [
    { id: '2025-12', days: workDaysOf('2025-12', d => day(d, '06:30', '15:24')) },
    { id: '2026-01', days: [day('2026-01-05', '06:30', '15:24')] },
  ];
  const pos = calcYearPosition({ year: 2026, months, params: PARAMS });
  assert.equal(pos.monthsCounted, 1);
  assert.equal(pos.countedHours, 8.9);
});

test('שנתי — שנה ללא נתונים כלל: hasData=false ו-positionPct=null', () => {
  const pos = calcYearPosition({ year: 2026, months: [], params: PARAMS });
  assert.equal(pos.hasData, false);
  assert.equal(pos.positionPct, null);
});

// ─── נפילה-לאחור ל-snapshot ───────────────────────────────────────────────

test('monthPositionOf — נופל ל-snapshot כשרשת הימים ריקה', () => {
  const month = {
    id: '2026-01', days: [],
    estimate: { positionPct: 87.5, positionCountedHours: 163.5, positionPotentialHours: 186.9, positionWorkDays: 21 },
  };
  const pos = monthPositionOf(month, PARAMS);
  assert.equal(pos.positionPct, 87.5);
  assert.equal(pos.fromSnapshot, true);
  assert.equal(pos.hasData, true);
});

test('monthPositionOf — נתוני נוכחות חיים גוברים על ה-snapshot', () => {
  const month = {
    id: '2026-01', days: [day('2026-01-05', '06:30', '15:24')],
    estimate: { positionPct: 87.5, positionCountedHours: 163.5, positionPotentialHours: 186.9 },
  };
  const pos = monthPositionOf(month, PARAMS);
  assert.equal(pos.fromSnapshot, false);
  assert.equal(pos.countedHours, 8.9);
});
