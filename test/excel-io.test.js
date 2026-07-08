/**
 * excel-io.test.js — פענוח תאריכים/חודשים בייבוא Excel (WP10.2)
 * Input: ערכי תא גולמיים (סריאלי/Date/טקסט ISO/טקסט ישראלי)  Output: PASS/FAIL תחת node --test
 * Deps: excel-io.js (normalizeDateCell/normalizeMonthCell — exported לבדיקה), vendor xlsx (devDependency, ל-round-trip)
 *
 * מטרה: לוודא שתאריכים בפורמט הסטנדרטי הישראלי (dd/mm/yyyy, dd.mm.yyyy) ותאי תאריך/חודש
 * שאקסל ממיר אוטומטית לסריאלי מתקבלים בייבוא, לא רק ISO מדויק — ראו יומן החלטות ב-
 * docs/architecture.md (WP10.2). לא נוגע במנוע/סכימה; זו בדיקת יחידה טהורה על helper functions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateCell, normalizeMonthCell, parseWorkbook } from '../src/io/excel-io.js';
import { EMPTY_STATE } from '../src/model/schema.js';
import * as XLSX from 'xlsx';

test('normalizeDateCell — מקבל סריאלי אקסל', () => {
  // 2026-06-15 → סריאלי אקסל (ספירה מ-1899-12-30, כולל "יום 0" הפיקטיבי של לוטוס)
  assert.equal(normalizeDateCell(46188), '2026-06-15');
});

test('normalizeDateCell — מקבל מחרוזת ISO קיימת (ללא שינוי)', () => {
  assert.equal(normalizeDateCell('2026-06-15'), '2026-06-15');
});

test('normalizeDateCell — מקבל dd/mm/yyyy (סדר ישראלי יום-חודש-שנה)', () => {
  assert.equal(normalizeDateCell('15/06/2026'), '2026-06-15');
});

test('normalizeDateCell — מקבל dd.mm.yyyy', () => {
  assert.equal(normalizeDateCell('15.6.2026'), '2026-06-15');
});

test('normalizeDateCell — יום/חודש בספרה בודדת (d/m/yyyy) — לא מתפרש כחודש-יום', () => {
  assert.equal(normalizeDateCell('5/6/2026'), '2026-06-05');
});

test('normalizeDateCell — מקבל אובייקט Date', () => {
  assert.equal(normalizeDateCell(new Date(Date.UTC(2026, 5, 15))), '2026-06-15');
});

test('normalizeDateCell — דוחה טקסט לא תקין (מחזיר את המקור, לא ISO)', () => {
  assert.equal(normalizeDateCell('garbage'), 'garbage');
  assert.equal(/^\d{4}-\d{2}-\d{2}$/.test(normalizeDateCell('garbage')), false);
});

test('normalizeDateCell — דוחה תאריך שלא קיים בלוח השנה (31/02)', () => {
  const result = normalizeDateCell('31/02/2026');
  assert.equal(/^\d{4}-\d{2}-\d{2}$/.test(result), false);
});

test('normalizeMonthCell — מקבל סריאלי אקסל', () => {
  assert.equal(normalizeMonthCell(46188), '2026-06');
});

test('normalizeMonthCell — מקבל מחרוזת YYYY-MM קיימת (ללא שינוי)', () => {
  assert.equal(normalizeMonthCell('2026-06'), '2026-06');
});

test('normalizeMonthCell — מקבל MM/YYYY', () => {
  assert.equal(normalizeMonthCell('06/2026'), '2026-06');
});

test('normalizeMonthCell — מקבל M/YYYY (חודש בספרה בודדת)', () => {
  assert.equal(normalizeMonthCell('6/2026'), '2026-06');
});

test('normalizeMonthCell — מקבל תאריך ישראלי מלא ולוקח שנה-חודש בלבד', () => {
  assert.equal(normalizeMonthCell('15/06/2026'), '2026-06');
});

test('normalizeMonthCell — דוחה טקסט לא תקין (מחזיר את המקור, לא YYYY-MM)', () => {
  assert.equal(normalizeMonthCell('garbage'), 'garbage');
  assert.equal(/^\d{4}-\d{2}$/.test(normalizeMonthCell('garbage')), false);
});

test('round-trip: גיליון "סטטוס חודשי" עם תא חודש כסריאלי אקסל (אקסל ממיר MM/YYYY שהוקלד) — נקרא נכון', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['חודש', 'מכסת ש"נ מאושרת'],
    [46188, 30], // אקסל המיר את התא לתאריך/סריאלי (התנהגות ברירת המחדל של אקסל בעריכה ידנית)
  ]);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  assert.equal(rows.length, 1);
  const monthId = normalizeMonthCell(rows[0]['חודש']);
  assert.equal(monthId, '2026-06');
  assert.equal(/^\d{4}-\d{2}$/.test(monthId), true);
});

// WP10.6 — גיליון "היסטוריה שנתית": שנה ללא months מייבאת ל-manualYearSummaries; שנה עם months לא נדרסת (derived גובר)

function buildWorkbookWithSheets(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return wb;
}

test('parseWorkbook — שורת "היסטוריה שנתית" לשנה ללא חודשים מייבאת ל-manualYearSummaries (הזנה חלקית)', () => {
  const wb = buildWorkbookWithSheets({
    'היסטוריה שנתית': [
      ['שנה', 'סה"כ ברוטו', 'סה"כ נטו', 'סה"כ מענקים', 'מספר חודשים (לשנה ידנית)', 'הערות (שנה ידנית)', 'אינפלציה (%)'],
      [2018, 120000, '', '', 12, 'שנה היסטורית', 3.5],
    ],
  });
  const state = structuredClone(EMPTY_STATE);
  const { manualYearSummaries, inflationByYear, errors } = parseWorkbook(XLSX, wb, state);

  assert.deepEqual(errors, []);
  assert.equal(inflationByYear['2018'], 0.035);
  assert.deepEqual(manualYearSummaries['2018'], { totalGross: 120000, monthsCount: 12, notes: 'שנה היסטורית' });
  assert.equal('totalNet' in manualYearSummaries['2018'], false); // לא הוזן — לא נכתב כלל, לא 0
});

test('parseWorkbook — שנה שיש לה חודשים (בגיליון "סטטוס חודשי") מתעלמת מעמודות הסכומים בגיליון ההיסטוריה', () => {
  const wb = buildWorkbookWithSheets({
    'סטטוס חודשי': [
      ['חודש', 'מכסת ש"נ מאושרת'],
      ['2026-01', ''],
    ],
    'היסטוריה שנתית': [
      ['שנה', 'סה"כ ברוטו', 'סה"כ נטו', 'סה"כ מענקים', 'מספר חודשים (לשנה ידנית)', 'הערות (שנה ידנית)', 'אינפלציה (%)'],
      [2026, 999999, 999999, '', '', 'לא אמור להישמר', 2.0],
    ],
  });
  const state = structuredClone(EMPTY_STATE);
  const { months, manualYearSummaries, inflationByYear, errors } = parseWorkbook(XLSX, wb, state);

  assert.deepEqual(errors, []);
  assert.equal(months.some(m => m.id === '2026-01'), true);
  assert.equal(manualYearSummaries['2026'], undefined); // derived גובר — לא נכתב ל-manual
  assert.equal(inflationByYear['2026'], 0.02); // עמודת האינפלציה כן מיובאת תמיד
});
