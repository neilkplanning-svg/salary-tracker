/**
 * settings.js — מסך הגדרות: עריכת פרמטרים לאומיים ואישיים (WP2.2 + WP2.3 + WP2.4)
 * Input: state.settings  Output: טפסים + שמירה ל-store/persistence
 * Deps: store.js, strings.he.js, app.js (applyTheme)
 *
 * כלל #4: אין hard-coding — כל ערך חישובי נערך כאן ונשמר ב-settings.
 * שינוי פרמטר משפיע על חישובים חדשים בלבד; snapshots קיימים שומרים paramsSnapshot.
 *
 * WP2.3: שיעורים ב-%, ש"נ disabled, מתג רכב חברה, גילומים נערכים.
 * WP2.4: רכיבי שכר וזקיפות מקטלוג קנוני קבוע (EARNING_COMPONENTS / IMPUTATION_COMPONENTS) —
 *        רשימה קבועה, השיוך לבסיסים מובנה; המשתמש מזין סכומים בלבד (0 = לא בדירוג שלי).
 */

import { store } from '../model/store.js';
import { STRINGS, escapeHtml } from './strings.he.js';
import { applyTheme } from './app.js';
import { EARNING_COMPONENTS, IMPUTATION_COMPONENTS, gradeLabel } from '../engine/defaults.js';
import { exportJSON, importJSON } from '../io/json-io.js';
import { exportExcel, importExcel, downloadTemplate } from '../io/excel-io.js';
import { openFile as syncOpenFile, saveFile as syncSaveFile, getSyncStatus, initSync, isFSASupported } from '../sync/filesync.js';

const S = STRINGS.settings;

/** תוויות קבוצות רכיבי שכר */
const GROUP_LABELS = { base: 'שכר בסיס', add: 'תוספות', special: 'מיוחד' };
/** סדר הצגת קבוצות */
const GROUP_ORDER = ['base', 'add', 'special'];

/** המרת שבר→אחוז לתצוגה (0.0104 → 1.04) */
const toPct = v => +(Number(v ?? 0) * 100).toFixed(6);

/**
 * מרנדר את מסך ההגדרות
 * @param {HTMLElement} container
 * @param {object} state — store state
 */
export function render(container, state) {
  const { national, personal, theme } = state.settings;
  const car = personal.car ?? { hasCompanyCar: false, allowance: 3879, imputation: 0 };

  container.innerHTML = `
    <form id="settings-form" novalidate>
      <div class="card">
        <h2>${S.title}</h2>
        <p class="hint">${S.affectsNewOnly}</p>
      </div>

      <!-- WP2.4: רכיבי שכר — רשימה קבועה מקטלוג קנוני (לא נערכת); המשתמש מזין סכומים בלבד -->
      <div class="card">
        <h3>${S.earningsSection}</h3>
        <p class="hint">${S.earningsNote}</p>
        <div style="overflow-x:auto">
          <table class="params-table earnings-table" style="min-width:520px">
            <thead>
              <tr>
                <th style="min-width:150px">${S.earningLabel}</th>
                <th style="min-width:100px">${S.earningAmount}</th>
                <th title="${S.inTaxFull}">${S.inTaxShort}</th>
                <th title="${S.inNIFull}">${S.inNIShort}</th>
                <th title="${S.inPensionFull}">${S.inPensionShort}</th>
                <th title="${S.inTrainingFull}">${S.inTrainingShort}</th>
                <th>${S.gradeCol}</th>
              </tr>
            </thead>
            <tbody>
              ${earningsCatalogRows(personal.earnings ?? [])}
            </tbody>
          </table>
        </div>
        <label class="field-check" style="margin-top:0.8rem;display:flex;align-items:flex-start;gap:0.5rem">
          <input type="checkbox" id="deposit-above-cap" ${personal.trainingFundDepositAboveCap ? 'checked' : ''} style="margin-top:0.2rem;flex-shrink:0" />
          <span style="font-size:0.85em">${S.depositAboveCap}</span>
        </label>
      </div>

      <div class="card">
        <h3>${S.personal}</h3>
        <div class="settings-grid">
          ${numG(S.creditPoints,     'personal.creditPointsQty',          personal.creditPointsQty, ['all'], 'any')}
          ${pctG(S.pensionRate,      'personal.pensionRateEmployee',      personal.pensionRateEmployee, ['all'])}
          ${pctG(S.trainingRate,     'personal.trainingFundRateEmployee', personal.trainingFundRateEmployee, ['all'])}
          ${numG(S.overtimeHourValue,'personal.overtimeHourValue',        personal.overtimeHourValue, ['all'], 'any')}
          ${numG(S.standbyDayValue,  'personal.standbyDayValue',          personal.standbyDayValue ?? 0, ['all'], 'any')}
          ${pctG(S.pensionRate2,        'personal.pensionRateEmployee2',   personal.pensionRateEmployee2 ?? 0.07, ['all'])}
          ${numG(S.ancillaryPensionBase,'personal.ancillaryPensionBase',  personal.ancillaryPensionBase ?? 0, ['all'], 'any')}
        </div>
        <p class="hint">${S.standbyDayValueHint}</p>
      </div>

      <!-- WP10.10: כללי קרן דולרית (מעקב עצמאי, נפרד מהתלוש) — ניתנים לעריכה, לא hard-coded -->
      <div class="card">
        <h3>${S.dollarFundSection}</h3>
        <div class="settings-grid">
          ${num(S.dollarFundMinBalance, 'personal.dollarFundRules.minBalanceUsd',      personal.dollarFundRules?.minBalanceUsd      ?? 2000, 'any')}
          ${num(S.dollarFundYearCap,    'personal.dollarFundRules.personalYearCapUsd', personal.dollarFundRules?.personalYearCapUsd ?? 5000, 'any')}
          ${pct(S.dollarFundTaxRate,    'personal.dollarFundRules.personalTaxRate',    personal.dollarFundRules?.personalTaxRate    ?? 0.47)}
        </div>
        <details style="margin-top:0.8rem">
          <summary style="cursor:pointer;font-size:0.9em;color:var(--color-muted)">${S.legacySalarySection}</summary>
          <div class="settings-grid" style="margin-top:0.5rem">
            ${num(S.baseConst,        'personal.baseSalary.baseConst',     personal.baseSalary?.baseConst ?? 0)}
            ${num(S.perHourConst,     'personal.baseSalary.perHourConst',  personal.baseSalary?.perHourConst ?? 0)}
            ${num(S.positionPct,      'personal.positionPercent',          personal.positionPercent)}
            ${num(S.pensionBaseFactor,'personal.pensionBaseFactor',        personal.pensionBaseFactor ?? 1, 'any')}
            ${num(S.phone,            'personal.fixedAdditions.phone',     personal.fixedAdditions?.phone ?? 0)}
            ${num(S.fixedOther,       'personal.fixedAdditions.other',     personal.fixedAdditions?.other ?? 0)}
          </div>
        </details>
      </div>

      <div class="card">
        <h3>${S.carSection}</h3>
        <label class="field-check">
          <input type="checkbox" id="car-toggle" ${car.hasCompanyCar ? 'checked' : ''} />
          <span>${S.hasCompanyCar}</span>
        </label>
        <div class="settings-grid" style="margin-top:0.6rem">
          <label class="field" id="car-allowance-field">
            <span>${S.carAllowance}</span>
            <input type="number" step="any" id="car-allowance" value="${car.allowance ?? 0}" />
          </label>
          <label class="field" id="car-imputation-field">
            <p class="hint">${S.carImputationPrompt}</p>
            <span>${S.carImputation}</span>
            <input type="number" step="any" id="car-imputation" value="${car.imputation ?? 0}" />
          </label>
        </div>
      </div>

      <div class="card">
        <h3>${S.imputationsSection}</h3>
        <p class="hint">${S.imputationsNote}</p>
        <div style="overflow-x:auto">
          <table class="params-table">
            <thead><tr><th style="min-width:180px">${S.impLabel}</th><th>${S.impAmount}</th><th>${S.gradeCol}</th></tr></thead>
            <tbody id="imputations-tbody">${imputationsCatalogRows(personal.imputations ?? [])}</tbody>
          </table>
        </div>
        <button type="button" id="add-custom-imp" class="btn-text" style="margin-top:0.8rem;font-weight:600;color:var(--color-accent);background:none;border:none;cursor:pointer;">${S.addImputation}</button>
      </div>

      <div class="card">
        <h3>${S.national}</h3>
        <div class="settings-grid">
          ${num(S.creditPointValue,      'national.creditPointValue',       national.creditPointValue)}
          ${num(S.trainingCap,           'national.trainingFundCap',        national.trainingFundCap)}
          ${pct(S.trainingRateEmployer,  'national.trainingFundRateEmployer', national.trainingFundRateEmployer ?? 0.075)}
          ${pct(S.savingsCreditRate,     'national.pensionSavingsCreditRate', national.pensionSavingsCreditRate ?? 0.35)}
          ${num(S.savingsCreditCap,      'national.pensionSavingsCreditCap',  national.pensionSavingsCreditCap ?? 679)}
        </div>

        <h4>${S.incomeTaxBrackets}</h4>
        ${bandsTable(national.incomeTaxBrackets, 'national.incomeTaxBrackets')}

        <h4>${S.niBands}</h4>
        ${bandsTable(national.nationalInsuranceBands, 'national.nationalInsuranceBands')}

        <h4>${S.healthBands}</h4>
        ${bandsTable(national.healthTaxBands, 'national.healthTaxBands')}

        <h4>${S.overtimeRules}</h4>
        <p class="hint">${S.otReadonlyNote}</p>
        <div class="settings-grid">
          ${roNum(S.otLogBase,    national.overtimeRules?.logBase)}
          ${roNum(S.otMinHours,   national.overtimeRules?.minOvertimeForBonus)}
          ${roNum(S.otMaxTier1,   national.overtimeRules?.maxHoursForTier1)}
          ${roNum(S.otMinDays,    national.overtimeRules?.minDaysForBonus)}
          ${roNum(S.otFactorBase, national.overtimeRules?.factorBase)}
          ${roNum(S.otFactorT1,   national.overtimeRules?.factorTier1)}
          ${roNum(S.otFactorT2,   national.overtimeRules?.factorTier2)}
        </div>
      </div>

      <!-- פרמטרי נוכחות: קוד הפסקה ברירת מחדל -->
      <div class="card">
        <h3>פרמטרי נוכחות</h3>
        <p class="hint">קוד הפסקה נקבע פעם אחת — חל אוטומטית על כל ימי העבודה (ניתן לשנות ליום ספציפי מהמודל).</p>
        <div class="settings-grid">
          <label class="field">
            <span>הפסקה ברירת מחדל</span>
            <select id="default-break-code">
              <option value=""${(national.attendanceParams?.defaultBreakCode == null) ? ' selected' : ''}>ללא הפסקה</option>
              ${(national.attendanceParams?.breakWindows ?? []).map((bw, i) => {
                const toHhmm = h => {
                  const hh = Math.floor(h).toString().padStart(2,'0');
                  const mm = Math.round((h%1)*60).toString().padStart(2,'0');
                  return hh+':'+mm;
                };
                const sel = national.attendanceParams?.defaultBreakCode === i ? ' selected' : '';
                return `<option value="${i}"${sel}>${toHhmm(bw[0])}–${toHhmm(bw[1])}</option>`;
              }).join('')}
            </select>
          </label>
          <label class="field-check" style="align-self:end;padding-bottom:0.2rem">
            <input type="checkbox" id="friday-all-ot" ${national.attendanceParams?.fridayAllOvertime ? 'checked' : ''} />
            <span>שישי — כל הנוכחות ש"נ</span>
          </label>
        </div>
      </div>

      <div class="card">
        <h3>${S.theme}</h3>
        <label class="field" style="max-width:240px">
          <span>${S.theme}</span>
          <select data-path="theme.mode">
            <option value="system" ${theme?.mode === 'system' ? 'selected' : ''}>${S.themeSystem}</option>
            <option value="light"  ${theme?.mode === 'light'  ? 'selected' : ''}>${S.themeLight}</option>
            <option value="dark"   ${theme?.mode === 'dark'   ? 'selected' : ''}>${S.themeDark}</option>
          </select>
        </label>
      </div>

      <div id="settings-errors" class="error-list" role="alert" aria-live="polite"></div>
      <div class="settings-actions">
        <button type="submit" class="btn-accent">${S.save}</button>
      </div>
    </form>

    <div class="card">
      <h3>${STRINGS.io.syncSectionTitle}</h3>
      <p class="hint">${STRINGS.io.syncSectionHint}</p>
      <p id="sync-status-text" class="hint" style="font-weight:600"></p>
      <div class="settings-actions" style="gap:0.75rem">
        <button type="button" id="btn-open-onedrive" class="btn-primary">${STRINGS.io.openFile}</button>
        <button type="button" id="btn-save-onedrive" class="btn-primary">${STRINGS.io.saveFile}</button>
      </div>
    </div>

    <div class="card">
      <h3>${STRINGS.io.sectionTitle}</h3>
      <p class="hint">${STRINGS.io.sectionHint}</p>
      <div class="settings-actions" style="gap:0.75rem">
        <button type="button" id="btn-export-json" class="btn-primary">${STRINGS.io.exportJson}</button>
        <button type="button" id="btn-import-json" class="btn-primary">${STRINGS.io.importJson}</button>
      </div>
    </div>

    <div class="card">
      <h3>${STRINGS.io.templateSectionTitle}</h3>
      <p class="hint">${STRINGS.io.templateSectionHint}</p>
      <div class="settings-actions" style="gap:0.75rem">
        <button type="button" id="btn-download-template" class="btn-accent">⬇ ${STRINGS.io.downloadTemplate}</button>
      </div>
    </div>

    <div class="card">
      <h3>${STRINGS.io.excelSectionTitle}</h3>
      <p class="hint">${STRINGS.io.excelSectionHint}</p>
      <div class="settings-actions" style="gap:0.75rem">
        <button type="button" id="btn-export-excel" class="btn-primary">${STRINGS.io.exportExcel}</button>
        <button type="button" id="btn-import-excel" class="btn-primary">${STRINGS.io.importExcel}</button>
      </div>
    </div>`;

  const form = container.querySelector('#settings-form');
  form.addEventListener('submit', e => onSave(e, state));
  container.querySelector('#btn-export-json').addEventListener('click', exportJSON);
  container.querySelector('#btn-import-json').addEventListener('click', importJSON);
  container.querySelector('#btn-export-excel').addEventListener('click', exportExcel);
  container.querySelector('#btn-import-excel').addEventListener('click', importExcel);
  container.querySelector('#btn-download-template').addEventListener('click', downloadTemplate);

  // WP5.2: סנכרון OneDrive (File System Access API)
  const syncStatusEl = container.querySelector('#sync-status-text');
  const IO = STRINGS.io;
  const renderSyncStatus = () => {
    const st = getSyncStatus();
    if (!isFSASupported()) {
      syncStatusEl.textContent = IO.errorNoFSA;
      syncStatusEl.style.color = 'var(--color-muted,#888)';
    } else if (st.connected) {
      let txt = `${IO.syncConnected}: ${st.fileName}`;
      if (st.lastSaved) {
        const t = new Date(st.lastSaved).toLocaleTimeString('he-IL');
        const kb = st.lastSavedBytes != null ? ` · ${Math.max(1, Math.round(st.lastSavedBytes / 1024))} ${IO.kb}` : '';
        txt += ` — ${IO.lastSaved} ${t}${kb}`;
      }
      syncStatusEl.textContent = txt;
      syncStatusEl.style.color = 'var(--color-accent,#C9A24B)';
    } else if (st.needsPermission && st.fileName) {
      syncStatusEl.textContent = `${st.fileName} — ${IO.syncNeedsPermission}`;
      syncStatusEl.style.color = 'var(--color-error,#c44)';
    } else {
      syncStatusEl.textContent = IO.syncNotConnected;
      syncStatusEl.style.color = 'var(--color-muted,#888)';
    }
  };
  renderSyncStatus();
  initSync().then(renderSyncStatus);
  container.querySelector('#btn-open-onedrive').addEventListener('click', async () => {
    await syncOpenFile();
    renderSyncStatus();
  });
  container.querySelector('#btn-save-onedrive').addEventListener('click', async () => {
    await syncSaveFile();
    renderSyncStatus();
  });

  // מתג רכב חברה — מחליף בין שדה תוספת לשדה גילום
  const carToggle = form.querySelector('#car-toggle');
  const syncCar = () => {
    form.querySelector('#car-allowance-field').style.display  = carToggle.checked ? 'none' : '';
    form.querySelector('#car-imputation-field').style.display = carToggle.checked ? '' : 'none';
  };
  carToggle.addEventListener('change', () => {
    syncCar();
    if (carToggle.checked) form.querySelector('#car-imputation').focus();
  });
  syncCar();

  // WP8.6: גילומים מותאמים אישית
  const addImpBtn = form.querySelector('#add-custom-imp');
  const impTbody = form.querySelector('#imputations-tbody');
  if (addImpBtn && impTbody) {
    addImpBtn.addEventListener('click', () => {
      const id = 'custom_' + Date.now();
      const tr = document.createElement('tr');
      tr.className = 'custom-imp-row';
      tr.dataset.impId = id;
      tr.innerHTML = `
        <td><input type="text" class="custom-imp-label" value="" placeholder="${S.impLabelPlaceholder}" style="width:100%" /></td>
        <td><input type="number" step="any" inputmode="decimal" class="custom-imp-amount" value="0" style="width:120px" /></td>
        <td>
          <label style="font-size:0.8rem;white-space:nowrap;margin-left:0.5rem;"><input type="checkbox" class="custom-imp-taxable" checked /> חיוב במס</label>
          <button type="button" class="remove-imp-btn" title="${S.remove}" aria-label="${S.remove}" style="color:var(--color-danger);background:none;border:none;cursor:pointer;font-size:1.2rem;vertical-align:middle;">×</button>
        </td>`;
      tr.querySelector('.remove-imp-btn').addEventListener('click', () => tr.remove());
      impTbody.appendChild(tr);
    });
    
    impTbody.querySelectorAll('.remove-imp-btn').forEach(btn => {
      btn.addEventListener('click', e => e.target.closest('tr').remove());
    });
  }
}

/** שדה מספרי עם תווית; data-path ממפה חזרה לאובייקט settings */
function num(label, path, value, step = '1') {
  return `<label class="field">
    <span>${label}</span>
    <input type="number" step="${step}" inputmode="decimal"
           data-path="${path}" data-type="number" data-label="${label}"
           value="${value ?? 0}" />
  </label>`;
}

/** שדה מספרי עם תווית + תיוג דירוג (WP8.5) */
function numG(label, path, value, grades, step = '1') {
  return `<label class="field">
    <span>${label}</span>
    <input type="number" step="${step}" inputmode="decimal"
           data-path="${path}" data-type="number" data-label="${label}"
           value="${value ?? 0}" />
    ${gradeBadge(grades)}
  </label>`;
}

/** שדה שיעור — מוצג ב-% (×100), נשמר כשבר (÷100) */
function pct(label, path, value) {
  return `<label class="field">
    <span>${label}</span>
    <span class="pct-wrap">
      <input type="number" step="any" inputmode="decimal"
             data-path="${path}" data-type="percent" data-label="${label}"
             value="${toPct(value)}" />
      <span class="pct-sign">%</span>
    </span>
  </label>`;
}

/** שדה שיעור עם תיוג דירוג (WP8.5) */
function pctG(label, path, value, grades) {
  return `<label class="field">
    <span>${label}</span>
    <span class="pct-wrap">
      <input type="number" step="any" inputmode="decimal"
             data-path="${path}" data-type="percent" data-label="${label}"
             value="${toPct(value)}" />
      <span class="pct-sign">%</span>
    </span>
    ${gradeBadge(grades)}
  </label>`;
}

/** תג דירוג קומפקטי — WP8.5 */
function gradeBadge(grades) {
  if (!grades || !grades.length) return '';
  return `<span class="grade-badge" title="${gradeLabel(grades)}">${gradeLabel(grades)}</span>`;
}

/** שדה לקריאה-בלבד (כללי ש"נ — קבועים) */
function roNum(label, value) {
  return `<label class="field">
    <span>${label}</span>
    <input type="number" value="${value ?? 0}" disabled />
  </label>`;
}

/** טבלת מדרגות (מינימום/מקסימום/שיעור%) ניתנות לעריכה */
function bandsTable(rows, basePath) {
  const body = rows.map((b, i) => `
    <tr>
      <td><input type="number" step="any" data-path="${basePath}.${i}.min"  data-type="number"  data-label="מינ' שורה ${i + 1}" value="${b.min}" /></td>
      <td><input type="number" step="any" data-path="${basePath}.${i}.max"  data-type="number"  data-label="מקס' שורה ${i + 1}" value="${b.max}" /></td>
      <td><input type="number" step="any" data-path="${basePath}.${i}.rate" data-type="percent" data-label="שיעור שורה ${i + 1}" value="${toPct(b.rate)}" /></td>
    </tr>`).join('');
  return `<table class="params-table">
    <thead><tr><th>${S.colMin}</th><th>${S.colMax}</th><th>${S.colRate}</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** סימן flag לקריאה-בלבד (✓/־) */
function flagCell(on) {
  return `<td style="text-align:center;color:${on ? 'var(--color-accent,#C9A24B)' : 'var(--color-muted,#888)'}">${on ? '✓' : '־'}</td>`;
}

/**
 * שורות רכיבי שכר מהקטלוג הקנוני (קבוע), מקובצות לפי group.
 * הסכום נקרא מ-personal.earnings לפי id (ברירת מחדל 0); השיוך לבסיסים לקריאה בלבד.
 * WP8.5: עמודת דירוג נוספת.
 * @param {{id:string,amount:number}[]} earnings
 */
function earningsCatalogRows(earnings) {
  const amountOf = id => earnings.find(e => e.id === id)?.amount ?? 0;
  const descOf = id => STRINGS.settings.earningDescriptions?.[id];
  let html = '';
  for (const g of GROUP_ORDER) {
    const comps = EARNING_COMPONENTS.filter(c => c.group === g);
    if (!comps.length) continue;
    html += `<tr class="group-header"><td colspan="7" style="background:var(--color-surface-2,#1f2c4d);font-weight:600;font-size:0.8em">${GROUP_LABELS[g] ?? g}</td></tr>`;
    html += comps.map(c => {
      const desc = descOf(c.id);
      const labelCell = desc
        ? `<td><details class="earning-info">
             <summary>${c.label} <span class="info-icon" title="${escapeHtml(desc)}">ⓘ</span></summary>
             <p class="hint">${escapeHtml(desc)}</p>
           </details></td>`
        : `<td>${c.label}</td>`;
      return `<tr>
      ${labelCell}
      <td><input type="number" step="any" inputmode="decimal"
                 data-earning-id="${c.id}" value="${amountOf(c.id)}" style="width:100px" /></td>
      ${flagCell(c.inTax)}
      ${flagCell(c.inNI)}
      ${flagCell(c.inPension)}
      ${flagCell(c.inTraining)}
      <td><span class="grade-badge">${gradeLabel(c.appliesToGrades)}</span></td>
    </tr>`;
    }).join('');
  }
  return html;
}

/**
 * שורות זקיפות מהקטלוג הקנוני (קבוע). amount נקרא לפי id (ברירת מחדל 0).
 * WP8.5: עמודת דירוג נוספת.
 * WP8.6: הצגת זקיפות מותאמות אישית.
 * @param {{id:string,amount:number,taxable?:boolean,label?:string}[]} imputations
 */
function imputationsCatalogRows(imputations) {
  const amountOf = id => imputations.find(i => i.id === id)?.amount ?? 0;
  let html = IMPUTATION_COMPONENTS.map(c => `<tr>
    <td>${c.label}</td>
    <td><input type="number" step="any" inputmode="decimal"
               data-imp-id="${c.id}" value="${amountOf(c.id)}" style="width:120px" /></td>
    <td><span class="grade-badge">${gradeLabel(c.appliesToGrades)}</span></td>
  </tr>`).join('');

  const customImps = imputations.filter(i => i.id && i.id.startsWith('custom_'));
  html += customImps.map(c => `<tr class="custom-imp-row" data-imp-id="${c.id}">
    <td><input type="text" class="custom-imp-label" value="${escapeHtml(c.label || '')}" placeholder="${S.impLabelPlaceholder}" style="width:100%" /></td>
    <td><input type="number" step="any" inputmode="decimal" class="custom-imp-amount" value="${c.amount}" style="width:120px" /></td>
    <td>
      <label style="font-size:0.8rem;white-space:nowrap;margin-left:0.5rem;"><input type="checkbox" class="custom-imp-taxable" ${c.taxable ? 'checked' : ''} /> חיוב במס</label>
      <button type="button" class="remove-imp-btn" title="${S.remove}" aria-label="${S.remove}" style="color:var(--color-danger);background:none;border:none;cursor:pointer;font-size:1.2rem;vertical-align:middle;">×</button>
    </td>
  </tr>`).join('');
  return html;
}

/** קריאת ערך לפי נתיב נקודות (תומך באינדקסי מערך) */
function setByPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    // יוצר אובייקט-ביניים חסר (למשל personal.dollarFundRules במסמך שנשמר לפני WP10.10),
    // אחרת ההשמה למטה זורקת TypeError והשמירה נכשלת בשקט.
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/** ולידציה: min < max בכל מדרגה */
function validateBands(bands, label, errors) {
  bands.forEach((b, i) => {
    if (b.min >= b.max) errors.push(`${label} שורה ${i + 1}: מינימום (${b.min}) חייב להיות קטן מהמקסימום (${b.max})`);
  });
}

function onSave(e, state) {
  e.preventDefault();
  const form = e.currentTarget;
  const errors = [];

  const national = structuredClone(state.settings.national);
  const personal = structuredClone(state.settings.personal);
  const theme    = structuredClone(state.settings.theme ?? { mode: 'system' });
  const targets  = { national, personal, theme };

  // שדות data-path (מספר / אחוז / טקסט). שדות disabled (כללי ש"נ) לא נכללים ב-querySelectorAll עם value.
  form.querySelectorAll('[data-path]').forEach(input => {
    if (input.disabled) return;
    const path = input.dataset.path;
    const i = path.indexOf('.');
    const root = path.slice(0, i);
    const rest = path.slice(i + 1);
    const t = input.dataset.type;
    if (t === 'number' || t === 'percent') {
      let v = parseFloat(input.value);
      if (!Number.isFinite(v) || v < 0) {
        errors.push(`${input.dataset.label || path}: ${S.errNonNegative}`);
        return;
      }
      if (t === 'percent') v = v / 100;
      setByPath(targets[root], rest, v);
    } else {
      setByPath(targets[root], rest, input.value);
    }
  });

  // רכב (נק' 8) — WP6.1: סכומים שליליים נדחים (כמו שדות data-path רגילים)
  const carAllowance  = parseFloat(form.querySelector('#car-allowance').value)  || 0;
  const carImputation = parseFloat(form.querySelector('#car-imputation').value) || 0;
  if (carAllowance  < 0) errors.push(`${S.carAllowance}: ${S.errNonNegative}`);
  if (carImputation < 0) errors.push(`${S.carImputation}: ${S.errNonNegative}`);
  personal.car = {
    hasCompanyCar: form.querySelector('#car-toggle').checked,
    allowance:  carAllowance,
    imputation: carImputation,
  };

  // WP2.4: זקיפות — קטלוג קבוע; amount לפי data-imp-id (taxable מהקטלוג)
  personal.imputations = IMPUTATION_COMPONENTS.map(c => {
    const inp = form.querySelector(`[data-imp-id="${c.id}"]`);
    const amount = parseFloat(inp?.value) || 0;
    if (amount < 0) errors.push(`${c.label}: ${S.errNonNegative}`);
    return { id: c.id, amount, taxable: c.taxable };
  });

  // WP8.6: גילומים מותאמים אישית
  form.querySelectorAll('.custom-imp-row').forEach(tr => {
    const id = tr.dataset.impId;
    const label = tr.querySelector('.custom-imp-label').value.trim() || 'גילום מותאם';
    const amount = parseFloat(tr.querySelector('.custom-imp-amount').value) || 0;
    if (amount < 0) errors.push(`${label}: ${S.errNonNegative}`);
    const taxable = tr.querySelector('.custom-imp-taxable').checked;
    personal.imputations.push({ id, label, amount, taxable });
  });

  // WP2.4: רכיבי שכר — קטלוג קבוע; amount לפי data-earning-id (flags מהקטלוג, לא נשמרים inline)
  personal.earnings = EARNING_COMPONENTS.map(c => {
    const inp = form.querySelector(`[data-earning-id="${c.id}"]`);
    const amount = parseFloat(inp?.value) || 0;
    if (amount < 0) errors.push(`${c.label}: ${S.errNonNegative}`);
    return { id: c.id, amount };
  });
  personal.trainingFundDepositAboveCap = form.querySelector('#deposit-above-cap').checked;

  validateBands(national.incomeTaxBrackets,      S.incomeTaxBrackets, errors);
  validateBands(national.nationalInsuranceBands, S.niBands,           errors);
  validateBands(national.healthTaxBands,         S.healthBands,       errors);

  const errBox = form.querySelector('#settings-errors');
  if (errors.length) {
    errBox.innerHTML = `<ul>${errors.map(x => `<li>${x}</li>`).join('')}</ul>`;
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // פרמטרי נוכחות: defaultBreakCode + fridayAllOvertime
  const breakSel = form.querySelector('#default-break-code');
  if (breakSel && national.attendanceParams) {
    national.attendanceParams = structuredClone(national.attendanceParams);
    national.attendanceParams.defaultBreakCode = breakSel.value === '' ? null : parseInt(breakSel.value, 10);
    const fridayCb = form.querySelector('#friday-all-ot');
    if (fridayCb) national.attendanceParams.fridayAllOvertime = fridayCb.checked;
  }

  store.setState(s => {
    s.settings.national = national;
    s.settings.personal = personal;
    s.settings.theme    = theme;
  });
  applyTheme(theme.mode);
  showToast(S.savedOk);
}

/** הודעת אישור צפה — מחוץ ל-container כדי לשרוד re-render */
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
