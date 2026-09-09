/**
 * history.js — מסך היסטוריה: תצוגה חודשית/שנתית, yearSummaries
 * Input: state  Output: DOM מסך היסטוריה
 * Deps: store.js, strings.he.js, engine/defaults.js (EARNING_COMPONENTS — קטלוג בלבד, אין שימוש במנוע),
 *       engine/position.js (אחוז משרה — נגזר מרשת הנוכחות)
 */

import { store } from '../model/store.js';
import { STRINGS, formatCurrency } from './strings.he.js';
import { renderChart } from './charts.js';
import { EARNING_COMPONENTS } from '../engine/defaults.js';
import { calcYearPosition, monthPositionOf } from '../engine/position.js';
// ייבוא דינמי (lazy) — SheetJS נטען רק בלחיצה על "ייצוא ל-Excel", לא בכל render של המסך
const loadExcelIO = () => import('../io/excel-io.js');

const S = STRINGS.history;
const toPct = v => +(Number(v || 0) * 100).toFixed(2);

/** תאריך היום 'YYYY-MM-DD' (מקומי) — החודש/השנה המתמשכים נספרים עד היום, לא עד סוף החודש */
function _todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * מציג ערך חודשי בטבלה עם ציון מקור (בפועל/משוער) — actual-first לפי שדה.
 * @param {number|null|undefined} actualVal
 * @param {number|null|undefined} estimateVal
 * @param {string} sourceLabel — S.actualGross / S.actualNet (מוצג רק כשהערך מגיע מבפועל)
 * @returns {string} HTML לתא הטבלה
 */
function _monthCell(actualVal, estimateVal, sourceLabel) {
  if (actualVal != null) {
    return `${formatCurrency(actualVal)} <span class="hint" title="${sourceLabel}">(בפועל)</span>`;
  }
  return `${formatCurrency(estimateVal || 0)}`;
}

/** מציג ערך כספי אופציונלי — S.emptyField ("—") כשהשדה לא הוזן, אחרת formatCurrency */
function _optCurrency(v) {
  return v == null ? S.emptyField : formatCurrency(v);
}

/** מציג אחוז אופציונלי — S.emptyField כשהשדה לא הוזן (אין מספיק נתונים לחישוב) */
function _optPct(v) {
  return v == null ? S.emptyField : `${toPct(v)}%`;
}

/**
 * כרטיס מדד רגיל.
 * @param {string} label @param {string} value @param {boolean} [small] גופן מוקטן לערכים משניים
 */
function _statBox(label, value, small = true) {
  return `<div class="stat-box">
    <div class="stat-label">${label}</div>
    <div class="stat-value"${small ? ' style="font-size:1.1rem"' : ''}>${value}</div>
  </div>`;
}

/**
 * כרטיס אחוז-שינוי: ירוק לעלייה, אדום לירידה, ו-"—" כשאין בסיס השוואה
 * (שנה ראשונה, או שנה קודמת עם 0 מענקים) — WP13.3.
 * @param {string} label @param {number|null|undefined} pct
 */
function _changeBox(label, pct) {
  if (pct == null) return _statBox(label, S.emptyField);
  const color = pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
  return `<div class="stat-box">
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="font-size:1.1rem; color:${color}">${pct > 0 ? '+' : ''}${toPct(pct)}%</div>
  </div>`;
}

/**
 * ערך כרטיס "אחוז משרה שנתי": האחוז + מאיפה הגיע. במצב 'computed' מוצג ה-tooltip עם
 * שברי החישוב (שעות שנספרו ÷ שעות אפשריות) כדי שהמספר יהיה בר-אימות בלי לפתוח את הקוד.
 * @param {object} sum סיכום שנה
 * @returns {string} HTML
 */
function _positionValueHTML(sum) {
  if (sum.avgPositionPct == null) return S.emptyField;
  const pct = +sum.avgPositionPct.toFixed(2);
  if (sum.positionSource === 'manual') {
    return `${pct}% <span class="hint" style="font-size:0.7rem">${S.positionManualTag}</span>`;
  }
  const title = sum.positionCountedHours != null
    ? `${S.positionCounted}: ${sum.positionCountedHours} ש׳ ÷ ${S.positionPotential}: ${sum.positionPotentialHours} ש׳`
    : '';
  return `<span title="${title}">${pct}%</span>`;
}

/** מפה id→group מהקטלוג הקבוע, לסיווג "תוספות" (group !== 'base') — קטלוג בלבד, לא מנוע חישוב */
const _EARNING_GROUP_BY_ID = new Map(EARNING_COMPONENTS.map(c => [c.id, c.group]));

/**
 * מחשב "תוספות קבועות" של חודש בודד מתוך estimate.paramsSnapshot השמור (כלל #6 — לא מחשב מחדש):
 * סכום רכיבי personal.earnings שאינם בקבוצת 'base' (רכיב לא-מזוהה בקטלוג נחשב כתוספת, לא כבסיס)
 * + estimate.overtimePay + תוספת רכב (paramsSnapshot.personal.car, רק אם לא רכב חברה).
 * @param {object|null} estimate month.estimate שמור
 * @returns {number}
 */
function _monthAdditionsFromSnapshot(estimate) {
  if (!estimate) return 0;

  // overtimePay הוא שדה עצמאי על estimate (לא בתוך paramsSnapshot) — נספר גם אם ה-snapshot חסר/ריק
  const overtimePay = estimate.overtimePay ?? 0;

  const personal = estimate.paramsSnapshot?.personal;
  if (!personal) return overtimePay;

  const earnings = Array.isArray(personal.earnings) ? personal.earnings : [];
  const additionsFromEarnings = earnings.reduce((sum, e) => {
    const group = _EARNING_GROUP_BY_ID.get(e.id);
    return (group !== 'base') ? sum + (e.amount ?? 0) : sum;
  }, 0);

  const car = personal.car ?? null;
  const carAllowance = (car && !car.hasCompanyCar) ? (car.allowance ?? 0) : 0;

  return additionsFromEarnings + overtimePay + carAllowance;
}

/**
 * מחשב את סיכום השנה הנגזר (derived) משנה עם חודשים מתועדים ב-months[] — actual-first.
 * @param {number} year
 * @param {object[]} months חודשי השנה
 * @param {object|null} prevYearSummary סיכום השנה הקודמת (ל-incomeChangePct/netChangePct)
 * @param {number} inflationPct
 * @param {number|undefined} storedPositionPct אחוז משרה שנתי שהוזן ידנית — fallback לשנים
 *   היסטוריות שאין להן רשת נוכחות באפליקציה (ראו positionPctByYear ב-schema.js)
 * @param {object|null} attParams settings.national.attendanceParams — לחישוב אחוז המשרה
 * @param {string|null} asOf 'YYYY-MM-DD' — שנה מתמשכת: החודש הנוכחי נספר עד תאריך זה
 * @returns {object} סיכום שנה עם source:'derived'
 */
function _computeDerivedYear(year, months, prevYearSummary, inflationPct, storedPositionPct, attParams, asOf) {
  let totalGross = 0;
  let totalNet = 0;
  let bonusesGross = 0;
  let bonusesNet = 0;
  let additionsGross = 0;
  let unpaidHours = 0;

  for (const m of months) {
    // actual-first: אם הוזן תלוש בפועל הוא גובר; נופלים לאחור למשוער לפי שדה (??, לא ||,
    // כי actual.gross/net עשויים להיות null כשהוזן רק אחד מהשניים — ראו actual.js parse())
    const g = m.actual?.gross ?? m.estimate?.gross ?? 0;
    const n = m.actual?.net   ?? m.estimate?.net   ?? 0;
    totalGross += g;
    totalNet += n;
    bonusesGross += m.actual?.bonuses || 0;
    // WP12.5: מענק רבעוני (month.reductions.quarterlyBonus) הוסר — המענקים מגיעים מ-actual.bonuses בלבד.

    // WP10.7: תוספות קבועות — נקרא רק מ-estimate.paramsSnapshot השמור (כלל #6, אין חישוב מחדש)
    additionsGross += _monthAdditionsFromSnapshot(m.estimate);

    for (const d of (m.days || [])) {
      unpaidHours += (d.zeroHours || 0) + (d.unapprovedHours || 0);
    }
  }

  const count = months.length;
  const avgMonthlyGross = count ? totalGross / count : 0;
  const avgMonthlyNet = count ? totalNet / count : 0;
  const avgMonthlyBonuses = count ? bonusesGross / count : 0;

  // אחוז משרה שנתי — Σ שעות שנספרו ÷ Σ שעות אפשריות של חודשי השנה (position.js), ולא ממוצע
  // האחוזים החודשיים. נגזר מרשת הנוכחות; הערך הידני (positionPctByYear) הוא fallback בלבד
  // לשנים היסטוריות שאין להן נוכחות מתועדת. אחרת undefined — "לא ידוע" אינו "0% משרה".
  const yearPosition = calcYearPosition({ year, months, params: attParams, asOf });
  const avgPositionPct = yearPosition.hasData ? yearPosition.positionPct : storedPositionPct;
  const positionSource = yearPosition.hasData ? 'computed' : (storedPositionPct != null ? 'manual' : null);
  const netToGrossRatio = totalGross ? totalNet / totalGross : 0;

  // WP13.3: undefined לשנה הראשונה (אין בסיס השוואה) — קודם אותחל ל-0 והוצג "0%" מטעה.
  let incomeChangePct, netChangePct, bonusesChangePct;
  if (prevYearSummary && prevYearSummary.totalGross > 0) {
    incomeChangePct = (totalGross - prevYearSummary.totalGross) / prevYearSummary.totalGross;
  }
  if (prevYearSummary && prevYearSummary.totalNet > 0) {
    netChangePct = (totalNet - prevYearSummary.totalNet) / prevYearSummary.totalNet;
  }
  // שנה קודמת ללא מענקים כלל → אין אחוז שינוי בר-חישוב (חלוקה ב-0), לא "אינסוף" ולא 0
  if (prevYearSummary && prevYearSummary.bonusesGross > 0) {
    bonusesChangePct = (bonusesGross - prevYearSummary.bonusesGross) / prevYearSummary.bonusesGross;
  }

  return {
    year,
    source: 'derived',
    totalGross,
    totalNet,
    bonusesGross,
    bonusesNet,
    additionsGross,
    avgMonthlyGross,
    avgMonthlyNet,
    avgMonthlyBonuses,
    incomeChangePct,
    netChangePct,
    bonusesChangePct,
    inflationPct: inflationPct || 0,
    netToGrossRatio,
    avgPositionPct,
    positionSource,
    // פירוט אחוז המשרה — לתצוגת "איך זה חושב" ולייצוא (ריק כשהאחוז ידני/חסר)
    positionCountedHours:   yearPosition.hasData ? yearPosition.countedHours   : undefined,
    positionPotentialHours: yearPosition.hasData ? yearPosition.potentialHours : undefined,
    positionMonthsCounted:  yearPosition.hasData ? yearPosition.monthsCounted  : undefined,
    unpaidHours,
  };
}

/**
 * בונה סיכום שנה מ-manualYearSummaries[year] — כל שדה אופציונלי (הזנה חלקית); שדות חסרים
 * נשארים undefined (מוצגים ריקים ב-UI), ולא 0, כדי להבדיל "לא הוזן" מ"אפס".
 * ממוצע חודשי מחושב רק כש-monthsCount הוזן.
 * @param {number} year
 * @param {object} manual { totalGross?, totalNet?, bonusesGross?, monthsCount?, notes? }
 * @param {object|null} prevYearSummary
 * @param {number} inflationPct
 * @param {number|undefined} storedPositionPct אחוז משרה שנתי שהוזן ידנית (positionPctByYear)
 * @returns {object} סיכום שנה עם source:'manual'
 */
function _computeManualYear(year, manual, prevYearSummary, inflationPct, storedPositionPct) {
  const { totalGross, totalNet, bonusesGross, monthsCount, notes } = manual || {};

  const avgMonthlyGross = (monthsCount && totalGross != null) ? totalGross / monthsCount : undefined;
  const avgMonthlyNet    = (monthsCount && totalNet   != null) ? totalNet   / monthsCount : undefined;
  const avgMonthlyBonuses = (monthsCount && bonusesGross != null) ? bonusesGross / monthsCount : undefined;
  const netToGrossRatio  = (totalGross) ? (totalNet ?? 0) / totalGross : undefined;

  let incomeChangePct, netChangePct, bonusesChangePct;
  if (prevYearSummary && prevYearSummary.totalGross > 0 && totalGross != null) {
    incomeChangePct = (totalGross - prevYearSummary.totalGross) / prevYearSummary.totalGross;
  }
  if (prevYearSummary && prevYearSummary.totalNet > 0 && totalNet != null) {
    netChangePct = (totalNet - prevYearSummary.totalNet) / prevYearSummary.totalNet;
  }
  if (prevYearSummary && prevYearSummary.bonusesGross > 0 && bonusesGross != null) {
    bonusesChangePct = (bonusesGross - prevYearSummary.bonusesGross) / prevYearSummary.bonusesGross;
  }

  return {
    year,
    source: 'manual',
    totalGross,
    totalNet,
    bonusesGross,
    additionsGross: undefined, // אין snapshot לשנה ידנית-בלבד — נשאר ריק (—), לא 0 (ראו WP10.7)
    avgMonthlyGross,
    avgMonthlyNet,
    avgMonthlyBonuses,
    // לשנה ידנית אין רשת נוכחות לחשב ממנה — האחוז מגיע מהערך השנתי הידני, אם הוזן
    avgPositionPct: storedPositionPct,
    positionSource: storedPositionPct != null ? 'manual' : null,
    monthsCount,
    notes,
    incomeChangePct,
    netChangePct,
    bonusesChangePct,
    inflationPct: inflationPct || 0,
    netToGrossRatio,
  };
}

/**
 * מחשב סיכומי שנה — פונקציה טהורה (derived, לא persisted). ממזג שני מקורות:
 * שנים עם חודשים ב-state.months (derived, actual-first — כפי שהיה) ושנים ידניות-בלבד
 * מ-state.manualYearSummaries (WP10.6 — שנים היסטוריות ללא חודשים מתועדים, הזנה חלקית).
 * כלל המיזוג: derived תמיד גובר — שנה עם months לעולם אינה נדרסת ע"י manualYearSummaries.
 * מיוצאת גם ל-src/io/excel-io.js (גיליון "היסטוריה שנתית").
 * @param {object} state
 * @returns {Array} yearSummaries לתצוגה בלבד, ממוין עולה לפי שנה
 */
export function computeYearSummaries(state, { asOf = _todayISO() } = {}) {
  const monthsByYear = {};
  for (const m of (state.months || [])) {
    const year = parseInt(m.id.split('-')[0], 10);
    if (!monthsByYear[year]) monthsByYear[year] = [];
    monthsByYear[year].push(m);
  }

  const attParams = state.settings?.national?.attendanceParams ?? null;
  const inflationByYear = state.inflationByYear || {};
  const positionByYear = state.positionPctByYear ?? {};
  const manualByYear = state.manualYearSummaries ?? {};

  // איחוד קבוצת השנים: שנים עם חודשים ∪ שנים עם סיכום ידני
  const derivedYears = Object.keys(monthsByYear).map(Number);
  const manualYears = Object.keys(manualByYear).map(Number).filter(y => !Number.isNaN(y));
  const years = [...new Set([...derivedYears, ...manualYears])].sort((a, b) => a - b);

  const summaries = [];
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const prevYearSummary = i > 0 ? summaries[i - 1] : null;
    const inflationPct = inflationByYear[year] || 0;

    if (monthsByYear[year]) {
      // derived תמיד גובר — שנה עם months אינה נדרסת ע"י manualYearSummaries גם אם קיים לה ערך שם
      summaries.push(_computeDerivedYear(
        year, monthsByYear[year], prevYearSummary, inflationPct, positionByYear[year], attParams, asOf,
      ));
    } else {
      summaries.push(_computeManualYear(
        year, manualByYear[year], prevYearSummary, inflationPct, positionByYear[year],
      ));
    }
  }
  return summaries;
}

function _drawCharts(container, summaries) {
  renderChart(container.querySelector('#chart-annual'), 'annual', summaries);
  renderChart(container.querySelector('#chart-monthly'), 'monthlyAvg', summaries);
  renderChart(container.querySelector('#chart-inflation'), 'inflation', summaries);
}

// WP13.1: charts.js בוחר קנבס לפי media query (max-width:640px), ולכן חצייה של נקודת
// השבירה — סיבוב מכשיר, שינוי גודל חלון — מחייבת ציור מחדש. מאזין יחיד ברמת המודול,
// מוחלף בכל render כדי שלא יצטברו מאזינים בכל מעבר בין מסכים.
let _chartMql = null;
let _chartMqlHandler = null;

function _wireChartBreakpoint(container, summaries) {
  if (_chartMql && _chartMqlHandler) _chartMql.removeEventListener('change', _chartMqlHandler);
  if (!window.matchMedia) return;

  _chartMql = window.matchMedia('(max-width: 640px)');
  _chartMqlHandler = () => {
    // המסך אולי הוחלף מאז — מציירים רק אם המכלים עדיין ב-DOM
    if (!container.isConnected || !container.querySelector('#chart-annual')) return;
    _drawCharts(container, summaries);
  };
  _chartMql.addEventListener('change', _chartMqlHandler);
}

export function render(container, state) {
  // asOf יחיד לכל הרנדר — כדי שכרטיס השנה וטבלת החודשים יחתכו את החודש המתמשך באותו תאריך
  const asOf = _todayISO();
  const attParams = state.settings?.national?.attendanceParams ?? null;
  const summaries = computeYearSummaries(state, { asOf });

  const monthsByYear = {};
  for (const m of (state.months || [])) {
    const year = parseInt(m.id.split('-')[0], 10);
    if (!monthsByYear[year]) monthsByYear[year] = [];
    monthsByYear[year].push(m);
  }

  let html = `<div class="card">
    <h2>${STRINGS.nav.history}</h2>
    <p class="hint">מעקב והשוואה של נתוני השכר לאורך השנים.</p>
    <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
      <button type="button" class="btn-sec" id="btn-add-manual-year">${S.addManualYear}</button>
      ${summaries.length ? `<button type="button" class="btn-primary" id="btn-export-history">${STRINGS.io.exportHistory}</button>` : ''}
    </div>
    <div id="manual-year-form-slot"></div>
  </div>`;

  if (summaries.length === 0) {
    html += `<div class="card"><p class="placeholder-notice">${S.noMonths}</p></div>`;
    container.innerHTML = html;
    _wireAddYearButton(container, state);
    return;
  }

  // Charts Section (WP4.2)
  // WP13.1: ערימה אנכית במקום שורת flex של שלושה. הגרפים נקראו קטן לא בגלל גודל הגופן אלא
  // בגלל הפריסה — `flex:1 1 300px` דחס שלושה מכלים לרוחב ~300-420px כל אחד, ומול viewBox
  // של 900 יחידות זה קנה-מידה של ~0.4, כלומר טקסט 15px הוצג כ-6px. מכל ברוחב מלא מחזיר את
  // קנה המידה ל-~1 ומייתר הגדלות גופן מלאכותיות.
  html += `
    <div class="card chart-stack" style="margin-bottom:2rem;">
      <h3>מגמות ושכר</h3>
      <div class="chart-panel">
        <h4>ברוטו/נטו שנתי</h4>
        <div id="chart-annual"></div>
      </div>
      <div class="chart-panel">
        <h4>ממוצע חודשי (ברוטו/נטו)</h4>
        <div id="chart-monthly"></div>
      </div>
      <div class="chart-panel">
        <h4>שינוי הכנסה מול אינפלציה</h4>
        <div id="chart-inflation"></div>
      </div>
    </div>
  `;

  // Render years in descending order
  for (let i = summaries.length - 1; i >= 0; i--) {
    const sum = summaries[i];
    const isManual = sum.source === 'manual';
    const badgeText = isManual ? S.badgeManual : S.badgeDerived;
    const badgeColor = isManual ? 'var(--color-text-secondary)' : 'var(--color-accent)';

    html += `
      <div class="card" data-year-card="${sum.year}">
        <h3 style="color:var(--color-accent); border-bottom:1px solid var(--color-border); padding-bottom:0.5rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <span>${S.yearSummary} ${sum.year}</span>
          <span class="hint" style="font-size:0.75rem; font-weight:normal; border:1px solid ${badgeColor}; color:${badgeColor}; border-radius:12px; padding:0.1rem 0.6rem;">${badgeText}</span>
          ${isManual ? `
            <span style="margin-inline-start:auto; display:flex; gap:0.5rem;">
              <button type="button" class="btn-sec btn-edit-manual-year" data-year="${sum.year}" style="padding:0.2rem 0.7rem; font-size:0.85rem;">${S.editManualYear}</button>
              <button type="button" class="btn-sec btn-delete-manual-year" data-year="${sum.year}" style="padding:0.2rem 0.7rem; font-size:0.85rem;">${S.deleteManualYear}</button>
            </span>
          ` : ''}
        </h3>

        <div class="settings-grid" style="margin-bottom:1.5rem">
          ${_statBox(S.totalGross, _optCurrency(sum.totalGross), false)}
          ${_statBox(S.totalNet,   _optCurrency(sum.totalNet),   false)}
          ${_statBox(S.avgGross,   _optCurrency(sum.avgMonthlyGross))}
          ${_statBox(S.avgNet,     _optCurrency(sum.avgMonthlyNet))}

          ${_statBox(S.avgPosition, _positionValueHTML(sum))}
          ${_changeBox(S.incomeChange, sum.incomeChangePct)}
          ${_changeBox(S.netChange,    sum.netChangePct)}
          ${_statBox(S.netToGross, _optPct(sum.netToGrossRatio))}

          ${_statBox(S.bonusesGross, _optCurrency(sum.bonusesGross))}
          ${_statBox(S.avgBonuses,   _optCurrency(sum.avgMonthlyBonuses))}
          ${_changeBox(S.bonusesChange, sum.bonusesChangePct)}
          ${_statBox(S.additionsGross, _optCurrency(sum.additionsGross))}

          ${isManual ? _statBox(S.monthsCount, sum.monthsCount ?? S.emptyField) : ''}
        </div>

        <form class="inflation-form" data-year="${sum.year}" style="margin-bottom:1.5rem; display:flex; gap:1rem; align-items:flex-end; flex-wrap:wrap;">
          <label class="field" style="width:150px; margin-bottom:0;">
            <span>${S.inflation}</span>
            <input type="number" step="0.1" name="inflation" value="${toPct(sum.inflationPct)}" />
          </label>
          <label class="field" style="width:190px; margin-bottom:0;">
            <span>${S.avgPosition}</span>
            <input type="number" step="0.01" min="0" name="positionPct"
                   value="${sum.positionSource === 'computed' ? '' : (state.positionPctByYear?.[sum.year] ?? '')}"
                   ${sum.positionSource === 'computed' ? 'disabled' : ''}
                   placeholder="${sum.positionSource === 'computed' ? S.positionComputedHint : '100'}" />
          </label>
          <button type="submit" class="btn-primary" style="padding:0.4rem 1rem;">${S.updateInflation}</button>
        </form>

        ${isManual ? `
          ${sum.notes ? `<p class="hint">${S.notes}: ${sum.notes}</p>` : ''}
          <div id="manual-year-edit-slot-${sum.year}"></div>
        ` : `
          <h4>חודשי השנה</h4>
          <div style="overflow-x:auto;">
            <table class="params-table">
              <thead>
                <tr>
                  <th>${S.month}</th>
                  <th>${S.gross}</th>
                  <th>${S.net}</th>
                  <th>${S.monthBonuses}</th>
                  <th>${S.monthPosition}</th>
                </tr>
              </thead>
              <tbody>
                ${(monthsByYear[sum.year] || []).slice().sort((a,b) => b.id.localeCompare(a.id)).map(m => {
                  // WP13.3: עמודת "שעות נוספות" הוסרה — overtimePay כבר כלול בברוטו (engine.js), כך
                  // שהיא פירטה סכום שנספר ממילא. הוחלפה במענקים ובאחוז משרה לפי בקשת המשתמש.
                  // אחוז המשרה נגזר מרשת הנוכחות (position.js) — לא מהפרמטר הידני שבהגדרות.
                  const pos = monthPositionOf(m, attParams, asOf);
                  const eff = pos.toDate ?? pos;
                  return `
                  <tr>
                    <td style="font-weight:600">${m.id}</td>
                    <td>${_monthCell(m.actual?.gross, m.estimate?.gross, S.actualGross)}</td>
                    <td>${_monthCell(m.actual?.net, m.estimate?.net, S.actualNet)}</td>
                    <td>${m.actual?.bonuses ? formatCurrency(m.actual.bonuses) : S.emptyField}</td>
                    <td>${!pos.hasData || eff.positionPct == null ? S.emptyField : `<span title="${S.positionCounted}: ${eff.countedHours} ש׳ ÷ ${S.positionPotential}: ${eff.potentialHours} ש׳${pos.toDate ? ' — ' + S.positionToDate : ''}">${eff.positionPct}%${pos.toDate ? '*' : ''}</span>`}</td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>
          ${(monthsByYear[sum.year] || []).some(m => monthPositionOf(m, attParams, asOf).toDate?.positionPct != null)
            ? `<p class="hint">${S.positionPartialNote}</p>` : ''}
        `}
      </div>
    `;
  }

  container.innerHTML = html;

  if (summaries.length > 0) {
    _drawCharts(container, summaries);
    _wireChartBreakpoint(container, summaries);
  }

  // Event listeners for inflation updates
  container.querySelectorAll('.inflation-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const year = parseInt(form.dataset.year, 10);
      const val = parseFloat(form.querySelector('[name="inflation"]').value) / 100 || 0;
      // WP13.3: השדה לא קיים בשנה ידנית, ו-disabled כשאחוז המשרה מגיע מ-snapshot
      const posInput = form.querySelector('[name="positionPct"]:not([disabled])');
      const posRaw = posInput ? posInput.value.trim() : null;

      store.setState(s => {
        if (!s.inflationByYear) s.inflationByYear = {};
        s.inflationByYear[year] = val;

        if (posInput) {
          if (!s.positionPctByYear) s.positionPctByYear = {};
          const n = Number(posRaw);
          // ריק/לא-מספרי → מוחקים את המפתח כדי שהמדד יחזור ל-"—" ולא ייתקע על 0
          if (posRaw === '' || !Number.isFinite(n) || n < 0) delete s.positionPctByYear[year];
          else s.positionPctByYear[year] = n;
        }
      });
    });
  });

  _wireAddYearButton(container, state);

  // WP13.2 — ייצוא ההיסטוריה ל-Excel (הכפתור נוצר רק כשיש לפחות שנה אחת)
  container.querySelector('#btn-export-history')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { exportHistoryExcel } = await loadExcelIO();
      await exportHistoryExcel();
    } finally {
      btn.disabled = false;
    }
  });

  // עריכה/מחיקה של שנה ידנית (רק לשנים source:'manual' — לשנים נגזרות אין את הכפתורים האלה)
  container.querySelectorAll('.btn-edit-manual-year').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = btn.dataset.year;
      const slot = container.querySelector(`#manual-year-edit-slot-${year}`);
      if (!slot) return;
      const existing = (state.manualYearSummaries ?? {})[year] ?? {};
      slot.innerHTML = _manualYearFormHtml(year, existing, /*locked*/ true);
      _wireManualYearForm(slot.querySelector('form'), container, state);
    });
  });

  container.querySelectorAll('.btn-delete-manual-year').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = btn.dataset.year;
      if (!confirm(S.deleteManualYearConfirm)) return;
      store.setState(s => {
        if (s.manualYearSummaries) delete s.manualYearSummaries[year];
      });
    });
  });
}

/**
 * בונה HTML לטופס הוספה/עריכה של סיכום שנה ידני — כל השדות אופציונליים (הזנה חלקית).
 * @param {string|number} year שנה (ריק אם טרם נבחרה — טופס "הוספה")
 * @param {object} existing ערכים קיימים למילוי מראש
 * @param {boolean} yearLocked אם true, שדה השנה נעול (מצב עריכה)
 * @returns {string}
 */
function _manualYearFormHtml(year, existing, yearLocked) {
  const v = existing || {};
  return `
    <form class="manual-year-form" style="margin-top:1rem; padding:1rem; border:1px dashed var(--color-border); border-radius:6px; display:flex; flex-wrap:wrap; gap:1rem; align-items:flex-end;">
      <label class="field" style="width:100px; margin-bottom:0;">
        <span>${S.manualYearField}</span>
        <input type="number" step="1" name="year" value="${year ?? ''}" ${yearLocked ? 'readonly' : ''} />
      </label>
      <label class="field" style="width:140px; margin-bottom:0;">
        <span>${S.totalGross}</span>
        <input type="number" step="0.01" name="totalGross" value="${v.totalGross ?? ''}" />
      </label>
      <label class="field" style="width:140px; margin-bottom:0;">
        <span>${S.totalNet}</span>
        <input type="number" step="0.01" name="totalNet" value="${v.totalNet ?? ''}" />
      </label>
      <label class="field" style="width:140px; margin-bottom:0;">
        <span>${S.bonusesGross}</span>
        <input type="number" step="0.01" name="bonusesGross" value="${v.bonusesGross ?? ''}" />
      </label>
      <label class="field" style="width:110px; margin-bottom:0;">
        <span>${S.monthsCount}</span>
        <input type="number" step="1" min="1" max="12" name="monthsCount" value="${v.monthsCount ?? ''}" />
      </label>
      <label class="field" style="width:200px; margin-bottom:0;">
        <span>${S.notes}</span>
        <input type="text" name="notes" value="${v.notes ?? ''}" />
      </label>
      <button type="submit" class="btn-primary" style="padding:0.4rem 1rem;">${S.save}</button>
      <button type="button" class="btn-sec btn-cancel-manual-year" style="padding:0.4rem 1rem;">${S.cancel}</button>
    </form>
  `;
}

/** מציג טופס "הוספת שנה היסטורית" תחת הכפתור, וקושר submit/cancel */
function _wireAddYearButton(container, state) {
  const btn = container.querySelector('#btn-add-manual-year');
  const slot = container.querySelector('#manual-year-form-slot');
  if (!btn || !slot) return;
  btn.addEventListener('click', () => {
    slot.innerHTML = _manualYearFormHtml('', {}, false);
    _wireManualYearForm(slot.querySelector('form'), container, state);
  });
}

/** קושר submit (שמירה ל-manualYearSummaries) + cancel לטופס שנה ידנית (הוספה/עריכה) */
function _wireManualYearForm(form, container, state) {
  if (!form) return;
  form.querySelector('.btn-cancel-manual-year').addEventListener('click', () => {
    form.remove();
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const yearStr = String(fd.get('year') || '').trim();
    if (!/^\d{4}$/.test(yearStr)) { alert(S.manualYearInvalid); return; }

    const monthsByYear = {};
    for (const m of (state.months || [])) {
      const y = parseInt(m.id.split('-')[0], 10);
      if (!monthsByYear[y]) monthsByYear[y] = [];
      monthsByYear[y].push(m);
    }
    // הוספה חדשה (לא עריכה) לשנה שכבר יש לה months — derived גובר תמיד, אין טעם ליצור manual חבוי
    const isNewEntry = form.querySelector('[name="year"]').readOnly !== true;
    if (isNewEntry && monthsByYear[yearStr]) {
      alert(S.manualYearExists);
      return;
    }

    const numOrUndef = key => {
      const raw = fd.get(key);
      if (raw == null || String(raw).trim() === '') return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    const notes = String(fd.get('notes') || '').trim();

    const entry = {
      totalGross: numOrUndef('totalGross'),
      totalNet: numOrUndef('totalNet'),
      bonusesGross: numOrUndef('bonusesGross'),
      monthsCount: numOrUndef('monthsCount'),
      notes: notes || undefined,
    };
    // מסיר שדות undefined כדי לא לשמור מפתחות ריקים ב-JSON (עקבי עם שאר ה-schema)
    Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

    store.setState(s => {
      if (!s.manualYearSummaries) s.manualYearSummaries = {};
      s.manualYearSummaries[yearStr] = entry;
    });
  });
}
