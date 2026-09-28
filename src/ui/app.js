/**
 * app.js — App shell: ניהול ניווט, lifecycle, חיבור store ל-UI
 * Input: hash routing events  Output: מרנדר את המסך המתאים ב-#screen-container
 * Deps: store.js, persistence.js, strings.he.js, ui-kit.js, כל מודולי המסך
 *
 * WP14.2 — רינדור מחדש ללא הבהוב: קודם כל שינוי ב-store החליף את המסך ב"טוען..." ואז
 * המתין ל-import — הדף התכווץ לרגע והגלילה קפצה לראש העמוד אחרי כל שמירה. עכשיו מודולים
 * נשמרים ב-cache ורינדור-מחדש של אותו מסך הוא סינכרוני (הגלילה נשמרת); מסך "טוען..."
 * מוצג רק בכניסה ראשונה למסך, וגלילה לראש העמוד — רק במעבר בין מסכים.
 */

import { store, subscribe } from '../model/store.js';
import { loadFromStorage } from '../storage/persistence.js';
import { STRINGS, escapeHtml } from './strings.he.js';
import { icon, toast } from './ui-kit.js';
import { openFile as syncOpenFile, saveFile as syncSaveFile, getSyncStatus, initSync, isFSASupported } from '../sync/filesync.js';

const SCREENS = ['attendance', 'estimate', 'actual', 'reductions', 'aidfund', 'dollarfund', 'history', 'settings'];
/** מסכים שמוצגים בגיליון "עוד" בסרגל התחתון (ולא כלשונית ראשית) */
const MORE_SCREENS = ['reductions', 'aidfund', 'dollarfund', 'settings'];
const SCREEN_TITLES = {
  attendance: STRINGS.nav.attendance, estimate: STRINGS.nav.estimate, actual: STRINGS.nav.actual,
  reductions: STRINGS.nav.reductions, aidfund: STRINGS.nav.aidFund, dollarfund: STRINGS.nav.dollarFund,
  history: STRINGS.nav.history, settings: STRINGS.nav.settings,
};

/** @type {Map<string, object>} מודולי מסך שכבר נטענו */
const _modules = new Map();
let _currentScreen = null;
/** מונה ניווטים — מונע מרינדור אסינכרוני ישן לדרוס מסך חדש יותר */
let _routeSeq = 0;

async function init() {
  if (navigator.storage?.persist) navigator.storage.persist(); // WP10.9 — מפחית סיכון לפינוי אחסון (best-effort, ללא המתנה)
  injectIcons(document);
  applyTheme(store.getState().settings?.theme?.mode ?? 'system');
  await loadFromStorage();
  applyTheme(store.getState().settings?.theme?.mode ?? 'system'); // החל מחדש אחרי טעינת מצב שמור
  setupNav();
  setupMoreSheet();
  setupThemeToggle();
  setupHeaderSync();
  route();
  window.addEventListener('hashchange', route);
  subscribe(onStateChange);
  window.addEventListener('salary-save-error', () => toast(STRINGS.ui.saveError, { type: 'error', ms: 4000 }));
}

/** ממלא כל [data-icon] ב-SVG המתאים (האייקונים לא נכתבים ב-index.html כדי לשמור אותו קריא) */
function injectIcons(root) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.outerHTML = icon(el.dataset.icon);
  });
}

function currentScreenFromHash() {
  const hash = location.hash.replace('#', '') || 'attendance';
  return SCREENS.includes(hash) ? hash : 'attendance';
}

function route() {
  const screen = currentScreenFromHash();
  const switching = screen !== _currentScreen;
  _currentScreen = screen;
  renderScreen(screen, switching);
  updateNavState(screen);
  if (switching) {
    document.title = `${SCREEN_TITLES[screen]} · ${STRINGS.appName}`;
    closeMoreSheet();
  }
}

function updateNavState(screen) {
  document.querySelectorAll('#main-nav a, #bottom-nav a, #more-sheet a').forEach(a => {
    const isActive = a.dataset.screen === screen;
    a.classList.toggle('active', isActive);
    if (isActive) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // כשהמסך הפעיל נמצא בגיליון "עוד" — הלשונית "עוד" מסומנת כפעילה
  document.getElementById('bottom-more')?.classList.toggle('active', MORE_SCREENS.includes(screen));
}

async function renderScreen(screen, switching) {
  const container = document.getElementById('screen-container');
  const seq = ++_routeSeq;

  // שלב 1: ייבוא המודול (פעם אחת לכל מסך) — כשל = מסך בבנייה (ידוע)
  let mod = _modules.get(screen);
  if (!mod) {
    container.innerHTML = `<p class="screen-loading">${STRINGS.general.loading}</p>`;
    try {
      mod = await import(`./${screen}.js`);
    } catch (importErr) {
      console.warn('renderScreen: module import failed for', screen, importErr);
      if (seq === _routeSeq) container.innerHTML = `<div class="placeholder-notice"><p>${STRINGS.general.empty}</p><p style="font-size:0.8em">${escapeHtml(screen)} — בבנייה</p></div>`;
      return;
    }
    _modules.set(screen, mod);
    if (seq !== _routeSeq) return; // בזמן הטעינה המשתמש כבר עבר למסך אחר
  }

  // מסך עם עריכה לא-שמורה (הגדרות) יכול לבקש לדלג על רינדור-מחדש שנגרם משינוי store
  if (!switching && mod.shouldRerender && !mod.shouldRerender()) return;

  // שלב 2: רינדור — כשל = שגיאת ריצה אמיתית (לא להסתיר)
  try {
    mod.render(container, store.getState());
  } catch (err) {
    console.error('renderScreen runtime error in', screen, err);
    container.innerHTML = `
      <div class="card" style="border:2px solid var(--color-danger)">
        <p style="color:var(--color-danger);font-weight:600">שגיאת ריצה — ${escapeHtml(screen)}</p>
        <pre style="font-size:0.8em;white-space:pre-wrap;overflow-x:auto;margin-top:0.5rem">${escapeHtml(err?.stack ?? err?.message ?? String(err))}</pre>
      </div>`;
  }
  if (switching) window.scrollTo(0, 0);
}

function setupNav() {
  document.querySelectorAll('#main-nav a, #bottom-nav a, #more-sheet a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = a.getAttribute('href');
      if (location.hash === target) closeMoreSheet();
      else location.hash = target;
    });
  });
}

// ─── גיליון "עוד" (מובייל) ────────────────────────────────────────────────

function setupMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  const btn = document.getElementById('bottom-more');
  if (!sheet || !btn) return;
  btn.addEventListener('click', () => {
    if (sheet.open) closeMoreSheet();
    else {
      sheet.showModal();
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  sheet.addEventListener('close', () => btn.setAttribute('aria-expanded', 'false'));
  sheet.querySelector('[data-close-sheet]')?.addEventListener('click', closeMoreSheet);
  // לחיצה על הרקע (מחוץ לתוכן הגיליון) סוגרת
  sheet.addEventListener('click', e => { if (e.target === sheet) closeMoreSheet(); });
}

function closeMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  if (sheet?.open) sheet.close();
}

// ─── ערכת נושא ─────────────────────────────────────────────────────────────

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') ?? 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.setState(s => { s.settings.theme = { mode: next }; });
  });
}

export function applyTheme(mode) {
  const resolved = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const label = resolved === 'dark' ? STRINGS.ui.themeToLight : STRINGS.ui.themeToDark;
    btn.innerHTML = icon(resolved === 'dark' ? 'sun' : 'moon');
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}

// WP12.3 — כפתורי סנכרון OneDrive בכותרת (נגישים מכל מסך, לא רק מהגדרות)
function setupHeaderSync() {
  const openBtn = document.getElementById('header-sync-open');
  const saveBtn = document.getElementById('header-sync-save');
  if (!openBtn || !saveBtn) return;
  openBtn.addEventListener('click', async () => {
    await syncOpenFile();
    renderHeaderSyncStatus();
  });
  saveBtn.addEventListener('click', async () => {
    await syncSaveFile();
    renderHeaderSyncStatus();
  });
  renderHeaderSyncStatus();
  initSync().then(renderHeaderSyncStatus); // משחזר handle משסשן קודם, ללא בקשת הרשאה חדשה
}

/** מעדכן את חיווי הסנכרון הקומפקטי בכותרת (לצד כרטיס הסנכרון המלא במסך הגדרות) */
function renderHeaderSyncStatus() {
  const el = document.getElementById('header-sync-status');
  const saveBtn = document.getElementById('header-sync-save');
  if (!el) return;
  const IO = STRINGS.io;
  let state = 'off';
  if (!isFSASupported()) {
    el.textContent = '';
    el.title = IO.errorNoFSA;
  } else {
    const st = getSyncStatus();
    if (st.connected) {
      const t = st.lastSaved ? new Date(st.lastSaved).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
      el.textContent = t ? `✓ ${t}` : '✓';
      el.title = `${IO.syncConnected}: ${st.fileName ?? ''}`;
      state = 'on';
    } else if (st.needsPermission && st.fileName) {
      el.textContent = '⚠';
      el.title = `${st.fileName} — ${IO.syncNeedsPermission}`;
      state = 'warn';
    } else {
      el.textContent = '';
      el.title = IO.syncNotConnected;
    }
  }
  // במובייל הטקסט מוסתר — נקודת-מצב על כפתור השמירה נושאת את אותו מידע
  saveBtn?.setAttribute('data-sync', state);
}

function onStateChange() {
  route();
  renderHeaderSyncStatus();
}

init();
