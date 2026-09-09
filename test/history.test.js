/**
 * history.test.js — computeYearSummaries: actual-first עם נפילה חזרה למשוער (WP10.1)
 * Input: state.months (estimate/actual)  Output: PASS/FAIL תחת node --test
 * Deps: history.js
 *
 * רקע: computeYearSummaries סיכם בעבר רק את estimate, גם כשהוזן תלוש בפועל, ובנוסף
 * קרא את המענק הרבעוני מ-state.temporaryReductions (מערך שאף מסך לא כותב אליו) במקום
 * מ-month.reductions.quarterlyBonus (ראו src/ui/reductions.js). ראו docs/data-schema.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE } from '../src/model/schema.js';
import { computeYearSummaries } from '../src/ui/history.js';

function monthDoc(id, { estimate, actual, reductions } = {}) {
  return { id, days: [], estimate: estimate ?? null, actual: actual ?? null, reductions: reductions ?? null };
}

test('computeYearSummaries — actual גובר על estimate כששניהם קיימים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual:   { gross: 10500, net: 8200 },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10500);
  assert.equal(summary.totalNet, 8200);
});

test('computeYearSummaries — נופל חזרה ל-estimate כש-actual חסר לגמרי', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual: null,
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10000);
  assert.equal(summary.totalNet, 8000);
});

test('computeYearSummaries — נפילה per-field: actual.net קיים, actual.gross null → gross מ-estimate, net מ-actual', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual:   { gross: null, net: 8300 }, // כפי שנשמר כשהוזן רק שדה net (ראו actual.js parse())
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10000); // מ-estimate, כי actual.gross === null
  assert.equal(summary.totalNet, 8300);    // מ-actual
});

test('computeYearSummaries — מענקים מ-actual.bonuses בלבד (WP12.5: reductions.quarterlyBonus הוסר)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual: { gross: 10000, net: 8000, bonuses: 1200 },
    // reductions.quarterlyBonus כבר לא נספר (הטופס הוסר) — נוודא שהוא מתעלם
    reductions: { fromRegular: 0, fromOvertime: 0, quarterlyBonus: 1500, bonusDeduction: 0 },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.bonusesGross, 1200); // רק actual.bonuses, לא ה-1500 של quarterlyBonus
});

// WP10.6 — manualYearSummaries: שנים היסטוריות ללא חודשים מתועדים, הזנה חלקית, derived גובר

test('computeYearSummaries — שנה ידנית-בלבד (ללא months) מופיעה עם source:"manual" ושדות חלקיים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalNet: 90000, monthsCount: 12 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.year, 2019);
  assert.equal(summary.source, 'manual');
  assert.equal(summary.totalNet, 90000);
  assert.equal(summary.avgMonthlyNet, 7500); // 90000 / 12
  assert.equal(summary.totalGross, undefined); // לא הוזן — נשאר ריק, לא 0
  assert.equal(summary.avgMonthlyGross, undefined); // אין totalGross → אין ממוצע
  assert.equal(summary.bonusesGross, undefined);
});

test('computeYearSummaries — שנה עם months נשארת derived גם כשיש לה גם manualYearSummaries (derived גובר)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { estimate: { gross: 10000, net: 8000 } }));
  doc.manualYearSummaries = { '2026': { totalGross: 999999, totalNet: 999999 } };

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].source, 'derived');
  assert.equal(summaries[0].totalGross, 10000); // מה-months, לא מה-manual
  assert.equal(summaries[0].totalNet, 8000);
});

test('computeYearSummaries — שנה ללא ממוצע כש-monthsCount לא הוזן, גם אם total קיים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2018': { totalGross: 120000 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 120000);
  assert.equal(summary.avgMonthlyGross, undefined);
});

test('computeYearSummaries — ממזג שנים derived וmanual יחד, ממוין עולה, וincomeChangePct מחושב ביחס לשנה הקודמת ברשימה הממוזגת', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalGross: 100000 } };
  doc.months.push(monthDoc('2020-01', { estimate: { gross: 120000, net: 90000 } }));

  const summaries = computeYearSummaries(doc);
  assert.deepEqual(summaries.map(s => s.year), [2019, 2020]);
  assert.equal(summaries[0].source, 'manual');
  assert.equal(summaries[1].source, 'derived');
  // 2020 גדל מ-100000 ל-120000 → +20%
  assert.equal(Math.round(summaries[1].incomeChangePct * 100), 20);
});

// WP10.7 — additionsGross: Σ רכיבי earnings שאינם 'base' + overtimePay + רכב, מ-estimate.paramsSnapshot
// השמור בלבד (כלל #6 — אין חישוב מחדש); bonusesGross נשאר כפי שהיה (Σ actual.bonuses + quarterlyBonus).

test('computeYearSummaries — additionsGross מסכם רכיבי earnings לא-base (כוננות/טלפון) + overtimePay + רכב מ-snapshot שמור', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: {
      gross: 15000,
      net: 11000,
      overtimePay: 800,
      paramsSnapshot: {
        national: {},
        personal: {
          earnings: [
            { id: 'base', amount: 10000 },       // group: base — לא נכלל
            { id: 'duty', amount: 500 },          // group: add — נכלל
            { id: 'phone', amount: 200 },         // group: add — נכלל
            { id: 'researchDollar', amount: 300 }, // group: special — נכלל
          ],
          car: { hasCompanyCar: false, allowance: 400 }, // תוספת רכב במזומן — נכלל
        },
      },
    },
  }));

  const [summary] = computeYearSummaries(doc);
  // 500 (duty) + 200 (phone) + 300 (researchDollar) + 800 (overtimePay) + 400 (car) = 2200
  assert.equal(summary.additionsGross, 2200);
});

test('computeYearSummaries — additionsGross מתעלם מתוספת רכב כש-hasCompanyCar=true (רכב חברה, לא תוספת מזומן)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: {
      gross: 15000, net: 11000, overtimePay: 0,
      paramsSnapshot: {
        national: {},
        personal: {
          earnings: [{ id: 'base', amount: 10000 }, { id: 'duty', amount: 500 }],
          car: { hasCompanyCar: true, allowance: 0, imputation: 700 },
        },
      },
    },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.additionsGross, 500); // רק duty; רכב חברה אינו "תוספת" במזומן
});

test('computeYearSummaries — additionsGross מסכם על פני כמה חודשים באותה שנה', () => {
  const doc = structuredClone(EMPTY_STATE);
  const snap = amount => ({
    gross: 10000, net: 8000, overtimePay: 100,
    paramsSnapshot: { national: {}, personal: { earnings: [{ id: 'duty', amount }] } },
  });
  doc.months.push(monthDoc('2026-01', { estimate: snap(300) }));
  doc.months.push(monthDoc('2026-02', { estimate: snap(400) }));

  const [summary] = computeYearSummaries(doc);
  // חודש 1: 300+100=400, חודש 2: 400+100=500 → 900
  assert.equal(summary.additionsGross, 900);
});

test('computeYearSummaries — additionsGross סופר overtimePay גם כש-paramsSnapshot.personal ריק/חסר (legacy snapshot ישן)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000, overtimePay: 300, paramsSnapshot: {} }, // legacy — ללא personal
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.additionsGross, 300); // overtimePay נספר גם בלי snapshot.personal
});

test('computeYearSummaries — additionsGross הוא 0 (לא undefined) לשנה derived כש-estimate חסר', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { estimate: null, actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.source, 'derived');
  assert.equal(summary.additionsGross, 0);
});

test('computeYearSummaries — additionsGross הוא undefined (ריק) לשנה ידנית-בלבד — אין snapshot לקרוא ממנו', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalGross: 100000, totalNet: 80000, bonusesGross: 5000 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.source, 'manual');
  assert.equal(summary.additionsGross, undefined);
  assert.equal(summary.bonusesGross, 5000); // בונוסים ידניים — כרגיל, לא חסום
});

// ─── אחוז משרה: נגזר מהנוכחות (position.js), עם נפילה לערך שנתי ידני ───────────
//
// ההגדרה: Σ (שעות נוכחות + היעדרות בתשלום) ÷ Σ (ימי א'–ה' × fullDayHours) של חודשי השנה —
// ולא ממוצע האחוזים החודשיים. הבדיקות מעבירות asOf קבוע כדי שלא יהיו תלויות בתאריך ההרצה.

/** יום נוכחות מלא 06:30→15:24 (8.9 ש׳ = fullDayHours ברירת המחדל) */
function fullDay(date) {
  return { date, start: '06:30', end: '15:24', breakCode: null, leave: null, training: false };
}

/** יום חופשה מלא (leave.hours = fullDayHours, כפי שממלא "השלם ליום מלא") */
function vacationDay(date) {
  return { date, start: null, end: null, breakCode: null, leave: { type: 'vacation', hours: 8.9 }, training: false };
}

const AS_OF = '2026-12-31'; // אחרי כל החודשים בבדיקות — אין חיתוך "עד היום"

test('אחוז משרה — חודש שכולו ימי נוכחות מלאים = 100%', () => {
  const doc = structuredClone(EMPTY_STATE);
  // ינואר 2026: 21 ימי א׳–ה׳. ממלאים את כולם ביום מלא.
  const days = [];
  for (let i = 1; i <= 31; i++) {
    const date = `2026-01-${String(i).padStart(2, '0')}`;
    const dow = new Date(date + 'T12:00:00Z').getDay();
    if (dow !== 5 && dow !== 6) days.push(fullDay(date));
  }
  const m = monthDoc('2026-01');
  m.days = days;
  doc.months.push(m);

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.avgPositionPct, 100);
  assert.equal(summary.positionSource, 'computed');
});

test('אחוז משרה — חופשה נספרת כשעות עבודה (חצי החודש נוכחות + חצי חופשה = 100%)', () => {
  const doc = structuredClone(EMPTY_STATE);
  const days = [];
  let n = 0;
  for (let i = 1; i <= 31; i++) {
    const date = `2026-01-${String(i).padStart(2, '0')}`;
    const dow = new Date(date + 'T12:00:00Z').getDay();
    if (dow === 5 || dow === 6) continue;
    days.push(n++ % 2 === 0 ? fullDay(date) : vacationDay(date));
  }
  const m = monthDoc('2026-01');
  m.days = days;
  doc.months.push(m);

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.avgPositionPct, 100);
});

test('אחוז משרה — חצי מימי העבודה בלבד ≈ 50%', () => {
  const doc = structuredClone(EMPTY_STATE);
  const days = [];
  let n = 0;
  for (let i = 1; i <= 31; i++) {
    const date = `2026-01-${String(i).padStart(2, '0')}`;
    const dow = new Date(date + 'T12:00:00Z').getDay();
    if (dow === 5 || dow === 6) continue;
    if (n++ % 2 === 0) days.push(fullDay(date)); // רק חצי מהימים תועדו כנוכחות
  }
  const m = monthDoc('2026-01');
  m.days = days;
  doc.months.push(m);

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  // 11 ימי נוכחות מתוך 21 ימי עבודה אפשריים
  assert.equal(summary.avgPositionPct, +((11 / 21) * 100).toFixed(2));
});

test('אחוז משרה שנתי — סכום שעות ÷ סכום שעות אפשריות, לא ממוצע האחוזים החודשיים', () => {
  const doc = structuredClone(EMPTY_STATE);

  // ינואר: יום נוכחות אחד בלבד (21 ימי עבודה במכנה)
  const jan = monthDoc('2026-01');
  jan.days = [fullDay('2026-01-05')];
  doc.months.push(jan);

  // פברואר: כל 20 ימי העבודה
  const feb = monthDoc('2026-02');
  feb.days = [];
  for (let i = 1; i <= 28; i++) {
    const date = `2026-02-${String(i).padStart(2, '0')}`;
    const dow = new Date(date + 'T12:00:00Z').getDay();
    if (dow !== 5 && dow !== 6) feb.days.push(fullDay(date));
  }
  doc.months.push(feb);

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  const expected = +(((1 + 20) / (21 + 20)) * 100).toFixed(2); // 51.22%
  assert.equal(summary.avgPositionPct, expected);
  // ממוצע האחוזים החודשיים היה נותן (4.76 + 100) / 2 ≈ 52.38 — לא זה מה שביקשנו
  assert.notEqual(summary.avgPositionPct, 52.38);
});

test('אחוז משרה — חודש מתועד ללא שעות כלל אינו מדלל את השנה', () => {
  const doc = structuredClone(EMPTY_STATE);
  const jan = monthDoc('2026-01');
  jan.days = [fullDay('2026-01-05'), fullDay('2026-01-06')];
  doc.months.push(jan);
  doc.months.push(monthDoc('2026-02')); // חודש ריק (למשל רק תלוש בפועל הוזן) — לא נספר

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.avgPositionPct, +((2 / 21) * 100).toFixed(2));
});

test('אחוז משרה — עבודה בשישי נספרת במונה אך שישי אינו במכנה (מעל 100% אפשרי)', () => {
  const doc = structuredClone(EMPTY_STATE);
  const days = [];
  for (let i = 1; i <= 31; i++) {
    const date = `2026-01-${String(i).padStart(2, '0')}`;
    const dow = new Date(date + 'T12:00:00Z').getDay();
    if (dow !== 5 && dow !== 6) days.push(fullDay(date));
  }
  days.push({ date: '2026-01-02', start: '06:30', end: '10:30', breakCode: -1, leave: null, training: false }); // שישי
  const m = monthDoc('2026-01');
  m.days = days;
  doc.months.push(m);

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.ok(summary.avgPositionPct > 100, `צפוי מעל 100%, קיבלנו ${summary.avgPositionPct}`);
});

test('אחוז משרה — נופל ל-positionPctByYear כשאין נוכחות מתועדת, ומסומן source:"manual"', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2019-01', { actual: { gross: 10000, net: 8000 } }));
  doc.positionPctByYear = { '2019': 111.37 };

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.avgPositionPct, 111.37);
  assert.equal(summary.positionSource, 'manual');
});

test('אחוז משרה — הנוכחות המחושבת גוברת על positionPctByYear כששניהם קיימים', () => {
  const doc = structuredClone(EMPTY_STATE);
  const m = monthDoc('2026-01');
  m.days = [fullDay('2026-01-05')];
  doc.months.push(m);
  doc.positionPctByYear = { '2026': 111.37 };

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.positionSource, 'computed');
  assert.notEqual(summary.avgPositionPct, 111.37);
});

test('אחוז משרה — undefined (—) כשאין לא נוכחות ולא ערך שנתי ידני', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2019-01', { actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.avgPositionPct, undefined);
  assert.equal(summary.positionSource, null);
});

test('אחוז משרה — שנה ידנית-בלבד לוקחת את הערך השנתי הידני (positionPctByYear)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2018': { totalGross: 100000, totalNet: 80000 } };
  doc.positionPctByYear   = { '2018': 90 };

  const [summary] = computeYearSummaries(doc, { asOf: AS_OF });
  assert.equal(summary.source, 'manual');
  assert.equal(summary.avgPositionPct, 90);
  assert.equal(summary.positionSource, 'manual');
});

test('WP13.3 — avgMonthlyBonuses מחלק במספר החודשים המתועדים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 1200 } }));
  doc.months.push(monthDoc('2026-02', { actual: { gross: 10000, net: 8000, bonuses: 0 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.bonusesGross, 1200);
  assert.equal(summary.avgMonthlyBonuses, 600); // 1200 / 2 חודשים, לא / 12
});

test('WP13.3 — bonusesChangePct מול השנה הקודמת', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2025-01', { actual: { gross: 10000, net: 8000, bonuses: 2000 } }));
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 3000 } }));

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries[0].bonusesChangePct, undefined); // שנה ראשונה — אין בסיס
  assert.equal(Math.round(summaries[1].bonusesChangePct * 100), 50); // 2000 → 3000 = +50%
});

test('WP13.3 — bonusesChangePct הוא undefined כשלשנה הקודמת אין מענקים כלל (אין חלוקה ב-0)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2025-01', { actual: { gross: 10000, net: 8000, bonuses: 0 } }));
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 3000 } }));

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries[1].bonusesChangePct, undefined); // ולא Infinity ולא 0
});

test('WP13.3 — שנה ראשונה: incomeChangePct/netChangePct הם undefined ולא 0 (לא להציג "0%" מטעה)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.incomeChangePct, undefined);
  assert.equal(summary.netChangePct, undefined);
});
