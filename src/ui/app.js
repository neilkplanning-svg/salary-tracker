/**
 * app.js — App shell: ניהול ניווט, lifecycle, חיבור store ל-UI
 * Input: hash routing events  Output: מרנדר את המסך המתאים ב-#screen-container
 * Deps: store.js, persistence.js, strings.he.js, כל מודולי המסך
 */

import { store, subscribe } from '../model/store.js';
import { loadFromStorage } from '../storage/persistence.js';
import { STRINGS, escapeHtml } from './strings.he.js';
import { openFile as syncOpenFile, saveFile as syncSaveFile, getSyncStatus, initSync, isFSASupported } from '../sync/filesync.js';

const SCREENS = ['attendance', 'estimate', 'actual', 'reductions', 'aidfund', 'dollarfund', 'history', 'settings'];

async function init() {
  if (navigator.storage?.persist) navigator.storage.persist(); // WP10.9 — מפחית סיכון לפינוי אחסון (best-effort, ללא המתנה)
  applyTheme(store.getState().settings?.theme?.mode ?? 'system');
  await loadFromStorage();
  applyTheme(store.getState().settings?.theme?.mode ?? 'system'); // החל מחדש אחרי טעינת מצב שמור
  setupNav();
  setupThemeToggle();
  setupHeaderSync();
  route();
  window.addEventListener('hashchange', route);
  subscribe(onStateChange);
  window.addEventListener('salary-save-error', () => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.style.background = 'var(--color-error, #c44)';
    t.textContent = 'שגיאה: לא ניתן לשמור נתונים — אחסון מלא?';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  });
}

function route() {
  const hash = location.hash.replace('#', '') || 'attendance';
  const screen = SCREENS.includes(hash) ? hash : 'attendance';
  renderScreen(screen);
  document.querySelectorAll('#main-nav a').forEach(a => {
    const isActive = a.getAttribute('href') === `#${screen}`;
    a.classList.toggle('active', isActive);
    if (isActive) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function renderScreen(screen) {
  const container = document.getElementById('screen-container');
  container.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--color-text-secondary)">${STRINGS.general.loading}</p>`;

  // שלב 1: ייבוא המודול — כשל = מסך בבנייה (ידוע)
  let mod;
  try {
    mod = await import(`./${screen}.js`);
  } catch (importErr) {
    console.warn('renderScreen: module import failed for', screen, importErr);
    container.innerHTML = `<div class="placeholder-notice"><p>${STRINGS.general.empty}</p><p style="font-size:0.8em">${escapeHtml(screen)} — בבנייה</p></div>`;
    return;
  }

  // שלב 2: רינדור — כשל = שגיאת ריצה אמיתית (לא להסתיר)
  try {
    mod.render(container, store.getState());
  } catch (err) {
    console.error('renderScreen runtime error in', screen, err);
    container.innerHTML = `
      <div class="card" style="border:2px solid var(--color-error,#c44)">
        <p style="color:var(--color-error,#c44);font-weight:600">שגיאת ריצה — ${escapeHtml(screen)}</p>
        <pre style="font-size:0.8em;white-space:pre-wrap;overflow-x:auto;margin-top:0.5rem">${escapeHtml(err?.stack ?? err?.message ?? String(err))}</pre>
      </div>`;
  }
}

function setupNav() {
  document.querySelectorAll('#main-nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      location.hash = a.getAttribute('href');
    });
  });
}

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
  if (btn) btn.textContent = resolved === 'dark' ? '☀️' : '🌙';
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
  if (!el) return;
  const IO = STRINGS.io;
  if (!isFSASupported()) {
    el.textContent = '';
    el.title = IO.errorNoFSA;
    return;
  }
  const st = getSyncStatus();
  if (st.connected) {
    const t = st.lastSaved ? new Date(st.lastSaved).toLocaleTimeString('he-IL') : '';
    el.textContent = t ? `✓ ${t}` : '✓';
    el.title = `${IO.syncConnected}: ${st.fileName ?? ''}`;
  } else if (st.needsPermission && st.fileName) {
    el.textContent = '⚠';
    el.title = `${st.fileName} — ${IO.syncNeedsPermission}`;
  } else {
    el.textContent = '';
    el.title = IO.syncNotConnected;
  }
}

function onStateChange() {
  route();
  renderHeaderSyncStatus();
}

init();
