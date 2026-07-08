/**
 * build.mjs — bundler לקובץ יחיד (Node, ללא תלויות npm)
 * Usage: node build.mjs [--out salary.html]
 * Output: salary.html — כל ה-src מוטמע (inline), נפתח ב-double-click offline,
 *         ללא בקשות רשת חיצוניות בזמן ריצה.
 *
 * מנגנון: כל קובץ src/**\/*.js (חוץ מ-vendor) עובר עטיפת closure בסגנון
 * CommonJS (registry['<path>'] = function(module, exports, require){...}),
 * עם `import { a, b } from '../x.js'` -> `const { a, b } = require('x-path')`
 * ו-`export function/const` -> הסרת `export ` + `module.exports = {...}` בסוף.
 * זה נמנע מהתנגשויות זיהוי top-level (כל קובץ עם scope משלו), בניגוד
 * לשרשור flat (concatenation), שנכשל בפועל מול הקוד הזה (ראו §0 של המפרט).
 *
 * ראו WORK_PLAN.md WP6.3 למפרט המלא שלפיו נכתב קובץ זה.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, posix as pathPosix } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const outArgIdx = process.argv.indexOf('--out');
const outFile = outArgIdx !== -1
  ? process.argv[outArgIdx + 1]
  : 'salary.html';

// ---------------------------------------------------------------------------
// §1 — Fixed module manifest (root-relative, forward slashes)
// ---------------------------------------------------------------------------
const MODULES = [
  'src/engine/overtime.js',
  'src/engine/attendance-hours.js',
  'src/engine/attendance-month.js',
  'src/engine/defaults.js',
  'src/engine/engine.js',
  'src/model/schema.js',
  'src/model/store.js',
  'src/storage/persistence.js',
  'src/ui/strings.he.js',
  'src/ui/charts.js',
  'src/io/json-io.js',
  'src/sync/filesync.js',
  'src/ui/history.js',
  'src/io/excel-io.js',
  'src/ui/actual.js',
  'src/ui/aidfund.js',
  'src/ui/attendance.js',
  'src/ui/estimate.js',
  'src/ui/reductions.js',
  'src/ui/dollarfund.js',
  'src/ui/app.js',
  'src/ui/settings.js',
];

function fail(msg) {
  console.error(`build.mjs: FATAL — ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// §6 build-time assertion #1 — manifest completeness/exactness
// ---------------------------------------------------------------------------
function findAllJsFiles(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'vendor') continue; // vendor is handled separately (§5)
      findAllJsFiles(full, base, acc);
    } else if (entry.endsWith('.js')) {
      const rel = pathPosix.normalize(full.slice(base.length + 1).split('\\').join('/'));
      acc.push(rel);
    }
  }
  return acc;
}

{
  const srcDir = resolve(__dirname, 'src');
  const actualFiles = findAllJsFiles(srcDir).map(p => 'src/' + p).sort();
  const manifestSorted = [...MODULES].sort();
  const actualSet = new Set(actualFiles);
  const manifestSet = new Set(manifestSorted);
  const missingFromManifest = actualFiles.filter(f => !manifestSet.has(f));
  const missingFromDisk = manifestSorted.filter(f => !actualSet.has(f));
  if (missingFromManifest.length || missingFromDisk.length) {
    fail(
      `MODULES manifest drift detected.\n` +
      (missingFromManifest.length ? `  Files on disk but NOT in MODULES: ${missingFromManifest.join(', ')}\n` : '') +
      (missingFromDisk.length ? `  Files in MODULES but NOT on disk: ${missingFromDisk.join(', ')}\n` : '')
    );
  }
}

// ---------------------------------------------------------------------------
// §3.1 — import transform regex (hardened for multi-line brace lists)
// ---------------------------------------------------------------------------
const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](\.[^'"]+)['"];?\s*$/gm;

// §3.2 — export transform regexes
const EXPORT_FN_RE = /^export\s+(async\s+function|function)(\s+)(\w+)/gm;
const EXPORT_CONST_RE = /^export\s+(const)(\s+)(\w+)/gm;

// §6 build-time assertion #4 — forbidden export forms
const EXPORT_DEFAULT_RE = /^export\s+default\b/m;
const EXPORT_BRACE_RE = /^export\s*\{/m;
const EXPORT_STAR_RE = /^export\s*\*\s*from\b/m;

function resolveSpecifier(importingVirtualPath, specifier) {
  const dir = pathPosix.dirname(importingVirtualPath);
  return pathPosix.normalize(pathPosix.join(dir, specifier));
}

function transformImports(src, virtualPath) {
  return src.replace(IMPORT_RE, (whole, braceList, specifier) => {
    const resolved = resolveSpecifier(virtualPath, specifier);
    const names = braceList
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(entry => {
        const asMatch = entry.match(/^(\w+)\s+as\s+(\w+)$/);
        if (asMatch) return `${asMatch[1]}: ${asMatch[2]}`;
        return entry;
      });
    return `const { ${names.join(', ')} } = require('${resolved}');`;
  });
}

function transformExports(src) {
  const exportedNames = [];
  let out = src.replace(EXPORT_FN_RE, (whole, kw, ws, name) => {
    exportedNames.push(name);
    return `${kw}${ws}${name}`;
  });
  out = out.replace(EXPORT_CONST_RE, (whole, kw, ws, name) => {
    exportedNames.push(name);
    return `${kw}${ws}${name}`;
  });
  return { out, exportedNames };
}

// ---------------------------------------------------------------------------
// Per-file pre-flight safety checks (§6, build-time assertions 2, 3, 4, 7)
// ---------------------------------------------------------------------------
function preflightChecks(raw, virtualPath) {
  // #4 (part 1) — forbidden export forms, checked on RAW source before transform
  if (EXPORT_DEFAULT_RE.test(raw)) fail(`${virtualPath}: found "export default" — unsupported form.`);
  if (EXPORT_BRACE_RE.test(raw)) fail(`${virtualPath}: found "export {" — unsupported form.`);
  if (EXPORT_STAR_RE.test(raw)) fail(`${virtualPath}: found "export * from" — unsupported form.`);

  // #7 — top-level await outside async function. This codebase's only top-level
  // (column-0) statements are import/export/const/function/let declarations; every
  // "await" usage found during the design pass is indented inside an async function
  // body. Guard permanently against a column-0 "await " line, which would be a
  // syntax error inside the (non-async) wrapper factory.
  const lines = raw.split('\n');
  for (const line of lines) {
    if (/^await\s/.test(line)) {
      fail(`${virtualPath}: found top-level "await" at column 0 — not supported inside the non-async wrapper factory.`);
    }
  }

  // #2 — bare dangerous identifiers require/module/exports declared as bindings
  // would collide with the wrapper factory's own (module, exports, require)
  // parameters. Guarded permanently even though none exist today.
  const declRe = /\b(?:const|let|var|function)\s+(require|module|exports)\b/;
  const declMatch = raw.match(declRe);
  if (declMatch) {
    fail(`${virtualPath}: declares a binding named "${declMatch[1]}" which collides with the CommonJS wrapper parameters.`);
  }
}

function postflightChecks(transformedBody, virtualPath) {
  // #3 — import-line regex coverage: no remaining "^import " lines
  if (/^import\s/m.test(transformedBody)) {
    fail(`${virtualPath}: a line starting with "import " survived the import transform — regex missed a case.`);
  }
  // #4 (part 2) — export-line regex coverage: no remaining "^export " lines
  if (/^export\s/m.test(transformedBody)) {
    fail(`${virtualPath}: a line starting with "export " survived the export transform — regex missed a case.`);
  }
}

// ---------------------------------------------------------------------------
// §3.3 — dynamic import() special-case in src/ui/app.js
// ---------------------------------------------------------------------------
const DYNAMIC_IMPORT_LITERAL = 'mod = await import(`./${screen}.js`);';
const DYNAMIC_IMPORT_REPLACEMENT = 'mod = require(`src/ui/${screen}.js`);';

function applyDynamicImportFix(src, virtualPath) {
  if (virtualPath !== 'src/ui/app.js') return src;
  const occurrences = src.split(DYNAMIC_IMPORT_LITERAL).length - 1;
  if (occurrences !== 1) {
    fail(
      `src/ui/app.js: expected exactly 1 occurrence of the literal dynamic-import substring, found ${occurrences}. ` +
      `The file may have been reformatted — update build.mjs's DYNAMIC_IMPORT_LITERAL to match.`
    );
  }
  return src.split(DYNAMIC_IMPORT_LITERAL).join(DYNAMIC_IMPORT_REPLACEMENT);
}

// ---------------------------------------------------------------------------
// Build each module's wrapped registry entry
// ---------------------------------------------------------------------------
function buildModuleEntry(virtualPath) {
  const absPath = resolve(__dirname, virtualPath);
  const raw = readFileSync(absPath, 'utf8');

  preflightChecks(raw, virtualPath);

  let body = raw;
  body = applyDynamicImportFix(body, virtualPath);
  body = transformImports(body, virtualPath);
  const { out, exportedNames } = transformExports(body);
  body = out;

  postflightChecks(body, virtualPath);

  const trailer = `\nmodule.exports = { ${exportedNames.join(', ')} };\n`;

  return (
    `registry[${JSON.stringify(virtualPath)}] = function (module, exports, require) {\n` +
    body +
    trailer +
    `};\n`
  );
}

// ---------------------------------------------------------------------------
// Assemble the bundle script
// ---------------------------------------------------------------------------
const moduleEntries = MODULES.map(buildModuleEntry).join('\n');

const REQUIRE_RUNTIME_HEADER = `
var registry = {};
var cache = {};
function require(path) {
  if (cache[path]) return cache[path].exports;
  if (!registry[path]) throw new Error('Module not found: ' + path);
  var module = { exports: {} };
  cache[path] = module; // set BEFORE running factory — safe (no cycles at first-run time)
  registry[path](module, module.exports, require);
  return module.exports;
}
`;

const bundleScript =
  REQUIRE_RUNTIME_HEADER +
  '\n' +
  moduleEntries +
  '\n' +
  "require('src/ui/app.js');\n";

// ---------------------------------------------------------------------------
// §5 — xlsx.min.js verbatim embedding
// ---------------------------------------------------------------------------
const xlsxAbsPath = resolve(__dirname, 'src/vendor/xlsx.min.js');
const xlsxSource = readFileSync(xlsxAbsPath, 'utf8');

// §6 checklist #14 — byte-length sanity check (recorded for the build summary)
const xlsxOriginalByteLength = Buffer.byteLength(xlsxSource, 'utf8');

// ---------------------------------------------------------------------------
// §4 — theme.css verbatim embedding (with @import guard, §6 checklist #6)
// ---------------------------------------------------------------------------
const cssAbsPath = resolve(__dirname, 'src/ui/theme.css');
const cssSource = readFileSync(cssAbsPath, 'utf8');
if (/@import/.test(cssSource)) {
  fail('src/ui/theme.css contains "@import" — would introduce a live network request in the bundled artifact.');
}

// ---------------------------------------------------------------------------
// §4 — HTML assembly from index.html template
// ---------------------------------------------------------------------------
const indexHtmlPath = resolve(__dirname, 'index.html');
let html = readFileSync(indexHtmlPath, 'utf8');

// WP10.9 — strip PWA-install-only tags (manifest/theme-color/apple-touch-icon) so the
// single-file salary.html stays self-contained with zero external requests. These tags
// are meaningless (and would 404) inside a file:// single-file bundle with no manifest file.
const MANIFEST_LINK_RE = /\s*<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">\s*\n?/;
if (!MANIFEST_LINK_RE.test(html)) fail('index.html: could not find the expected <link rel="manifest" href="./manifest.webmanifest"> tag.');
html = html.replace(MANIFEST_LINK_RE, '\n');

const THEME_COLOR_META_RE = /\s*<meta\s+name="theme-color"\s+content="#14274E">\s*\n?/;
if (!THEME_COLOR_META_RE.test(html)) fail('index.html: could not find the expected <meta name="theme-color" content="#14274E"> tag.');
html = html.replace(THEME_COLOR_META_RE, '\n');

const APPLE_TOUCH_ICON_RE = /\s*<link\s+rel="apple-touch-icon"\s+href="\.\/icons\/icon\.svg">\s*\n?/;
if (!APPLE_TOUCH_ICON_RE.test(html)) fail('index.html: could not find the expected <link rel="apple-touch-icon" href="./icons/icon.svg"> tag.');
html = html.replace(APPLE_TOUCH_ICON_RE, '\n');

// Remove the original <link rel="stylesheet" ...theme.css.../> tag
const LINK_RE = /\s*<link\s+rel="stylesheet"\s+href="src\/ui\/theme\.css"\s*\/>\s*\n?/;
if (!LINK_RE.test(html)) fail('index.html: could not find the expected <link rel="stylesheet" href="src/ui/theme.css" /> tag.');
html = html.replace(LINK_RE, '\n');

// Remove the original <script type="module" src="src/ui/app.js"></script> tag
const SCRIPT_SRC_RE = /\s*<script\s+type="module"\s+src="src\/ui\/app\.js"><\/script>\s*\n?/;
if (!SCRIPT_SRC_RE.test(html)) fail('index.html: could not find the expected <script type="module" src="src/ui/app.js"></script> tag.');
html = html.replace(SCRIPT_SRC_RE, '\n');

// Inject <style> in <head>, in place of where the stylesheet link was
const styleBlock = `  <style>\n${cssSource}\n  </style>\n`;
if (!html.includes('</head>')) fail('index.html: could not find </head> closing tag.');
html = html.replace('</head>', `${styleBlock}</head>`);

// Inject xlsx classic <script> + bundle <script type="module"> just before </body>
const xlsxScriptBlock = `  <script>\n${xlsxSource}\n  </script>\n`;
const bundleScriptBlock =
  `  <!-- MUST remain type="module": import.meta.url appears (dead-code, in loadXLSX fallback) inside the bundled excel-io.js body -->\n` +
  `  <script type="module">\n${bundleScript}\n  </script>\n`;

if (!html.includes('</body>')) fail('index.html: could not find </body> closing tag.');
html = html.replace('</body>', `${xlsxScriptBlock}${bundleScriptBlock}</body>`);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const outAbsPath = resolve(__dirname, outFile);
writeFileSync(outAbsPath, html, 'utf8');

const outByteLength = Buffer.byteLength(html, 'utf8');

console.log('build.mjs: build complete.');
console.log(`  Modules bundled : ${MODULES.length}`);
console.log(`  Output file     : ${outAbsPath}`);
console.log(`  Output size     : ${(outByteLength / 1024).toFixed(1)} KB (${outByteLength} bytes)`);
console.log(`  xlsx.min.js size embedded (bytes): ${xlsxOriginalByteLength}`);
console.log('');
console.log('Manual verification checklist still required (see WORK_PLAN.md WP6.3 §6, items 8-14):');
console.log('  8.  פתח את הקובץ ב-file:// (double-click) — קונסולה נקייה משגיאות.');
console.log('  9.  מעבר בין 7 המסכים דרך הניווט — כל מסך מרונדר (לא "בבנייה"), כולל חזרה למסך שכבר בוקר.');
console.log('  10. הגדרת location.hash = "#nonexistent" בקונסולה — חוזר למסך נוכחות.');
console.log('  11. ייצוא/ייבוא Excel — round-trip מוצלח; window.XLSX זמין מיד בטעינה (ללא דיליי).');
console.log('  12. מתג ערכת נושא (dark/light) — data-theme מתחלף, משתני CSS מגיבים.');
console.log('  13. אין שגיאות "Identifier ... has already been declared" בקונסולה.');
