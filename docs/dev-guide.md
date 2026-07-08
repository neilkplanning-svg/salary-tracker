# מדריך פיתוח — salary-tracker (WEB)

## פתיחה מהירה

### פתיחה ישירה (offline)
```
פתח index.html בדפדפן
```
> ⚠ דפדפן Chrome/Edge עשוי לחסום ES modules מ-file://. אם כך, הרץ server מקומי:

### Server מקומי (Node.js)
```bash
npx serve .          # מותקן npx
# או
python -m http.server 8080
```
ואז פתח: `http://localhost:8080`

### Server מקומי (PowerShell — ללא התקנה)
```powershell
# ב-Windows 11, PowerShell 5.1:
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server at http://localhost:8080"
```

---

## הרצת בדיקות

### בדפדפן
פתח `tests.html` — יריץ את כל golden-cases ויציג PASS/FAIL.

### Node.js (אופציונלי)
```bash
node --test test/engine.test.js
```

---

## Build לקובץ יחיד (WP6.3)

```bash
node build.mjs                    # יוצר salary.html בשורש הריפו
node build.mjs --out other.html   # שם קובץ פלט מותאם אישית
```

**ללא תלויות npm** — `node build.mjs` רץ ישירות (Node built-ins בלבד: `fs`, `path`, `url`).

מה הסקריפט עושה:
- קורא את כל 21 קבצי `src/**/*.js` (חוץ מ-`src/vendor/`), עוטף כל קובץ ב-closure משלו (מבודד מהתנגשויות שמות בין קבצים), וממיר `import`/`export` ל-`require`/`module.exports` פנימיים.
- מטמיע (`inline`) את `src/ui/theme.css` בתוך `<style>` וב-`src/vendor/xlsx.min.js` בתוך `<script>` קלאסי — verbatim, ללא שינוי בייט אחד.
- מרכיב הכול לקובץ **`salary.html`** יחיד בשורש הריפו: **נפתח ב-double-click ישירות מהדיסק (`file://`), ללא שרת, ועובד לגמרי offline** — אפס בקשות רשת בזמן ריצה (כולל ייצוא/ייבוא Excel, שכבר טעון מראש).
- כולל בדיקות תקינות פנימיות (למשל: שרשימת הקבצים תואמת בדיוק את מה שקיים ב-`src/`, שלא נשארו שורות `import`/`export` לא-ממוירות) — אם משהו לא תקין, הבנייה נכשלת עם הודעת שגיאה ברורה במקום להפיק קובץ שבור.

**מתי להריץ מחדש:** בכל פעם שמשנים קובץ תחת `src/` ורוצים גרסה מעודכנת של `salary.html` (למשל לפני הפצה/פרסום). זהו שלב build אופציונלי — הפיתוח השוטף ממשיך לעבוד מול `index.html` + `src/` (ES modules רגילים, ראו "פתיחה מהירה" למעלה).

**הבדל בין שתי הגרסאות:**
| | `index.html` + `src/` | `salary.html` |
|---|---|---|
| קבצים | רבים (ES modules) | קובץ יחיד |
| פתיחה מ-`file://` | לרוב חסום (CORS על ES modules) — דורש שרת מקומי | עובד ישירות, בלי שרת |
| פתיחה דרך HTTPS (GitHub Pages) | עובד מצוין | עובד מצוין |
| שימוש מומלץ | פיתוח, בדיקות | הפצה/שיתוף כקובץ בודד (מייל, USB, OneDrive) |

---

## פרסום GitHub Pages — ✅ פעיל

**הריפו מפורסם:** `https://github.com/neilkplanning-svg/salary-tracker` (Public; נוצר ונדחף ב-WP6.4, 2026-07-04 — לפי אישור מפורש של המשתמש להקמה ציבורית).
**הקישור החי:** **https://neilkplanning-svg.github.io/salary-tracker/**

אומת חי (`claude-in-chrome`, לא רק שרת פיתוח מקומי): הדף נטען דרך HTTPS אמיתי, כותרת "מעקב שכר" תקינה, ניווט ל-7 המסכים עובד, `aria-current="page"` תקין, `screen-container` מרונדר עם תוכן אמיתי (לא placeholder), מצב כהה/בהיר לפי מערכת ההפעלה. אפס שגיאות אפליקטיביות בקונסולה (הודעת "message channel closed" שנצפתה היא ארטיפקט ידוע של תוסף הדפדפן עצמו, לא של קוד האפליקציה).

### עדכון עתידי (push שוטף)
```bash
git push origin main    # דוחף שינויים חדשים לריפו הקיים
```
Pages בונה מחדש אוטומטית תוך דקה-שתיים מכל push ל-`main`.

### הקמה מאפס (אם נדרש ריפו/חשבון חדש בעתיד)

1. היכנסו ל-GitHub ← **New repository**. אפשר Private או Public — Pages עובד בשניהם (ב-Private נדרש חשבון עם תמיכה ב-GitHub Pages בתוכנית שלכם).
2. **אל** תאתחלו את הריפו החדש עם README/`.gitignore` (יש כאלה כבר בריפו המקומי).
3. בתיקיית הפרויקט המקומית:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git branch -M main
   git push -u origin main
   ```
4. בריפו ב-GitHub: **Settings → Pages** → **Source: Deploy from a branch** → **Branch: `main`, `/(root)`** → שמרו.
5. הקישור הסופי: `https://<user>.github.io/<repo>/`

### שלב 3 — איזה קובץ משרתים

Pages משרת דרך `https://`, כך ש-**ES modules עובדים מצוין** — כלומר `index.html` (עם `src/` הרגיל, ללא build) ניתן להגשה ישירה כפי שהוא, ולא נדרש שום build לצורך הפרסום ב-Pages עצמו:

- **גישה א' — Pages מגיש את `index.html` + `src/` כמו שהם:** אין צורך ב-`build.mjs` בכלל; `https://<user>.github.io/<repo>/` יטען את `index.html` שמריץ ES modules רגילים מול HTTPS (לא `file://`, אז אין חסימת CORS).
- **גישה ב' — קובץ יחיד להורדה/שיתוף:** אם רוצים גם אפשרות "קובץ אחד, לחיצה כפולה, offline לגמרי" (למשל להפצה במייל/USB, לא רק דרך אתר), הריצו `node build.mjs` ליצירת `salary.html`, ואז:
  - אפשר לפרסם אותו **גם** ב-Pages תחת נתיב נפרד (למשל `https://<user>.github.io/<repo>/salary.html`), **או**
  - לשנות את שמו ל-`index.html` (ולשמור את ה-`index.html` המקורי בשם אחר) אם רוצים ש-Pages עצמו יגיש את גרסת-הקובץ-היחיד כדף הבית — לרוב לא נחוץ, כי גרסת ה-ES-modules כבר עובדת ישירות ב-Pages; שינוי השם רלוונטי בעיקר לשימוש local/offline (double-click), לא לפרסום עצמו.

**סיכום:** לפרסום ב-GitHub Pages בלבד — אין צורך להריץ `build.mjs`. `salary.html` נועד לשימוש "קובץ בודד, בלי שרת, בלי אינטרנט" (USB/מייל/OneDrive), לא לפרסום אתר.

---

## התקנה כ-PWA (WP10.9)

**רק בגרסת ה-Pages** (`https://neilkplanning-svg.github.io/salary-tracker/`) — `manifest.webmanifest` בשורש הריפו + תגיות ב-`<head>` של `index.html`. **אין service worker ואין תמיכת offline** — זו התקנה בלבד ("הוסף למסך הבית"/יצירת קיצור-דרך עצמאי), לא PWA מלא. `salary.html` (קובץ יחיד) **לא** כולל את התגיות האלה בכוונה — ראו כללי ה-strip ב-`build.mjs` למטה.

### Android/Chrome/Edge (דסקטופ ומובייל)
מאז 2023 Chrome מתקין ישירות מ-manifest בלבד (ללא צורך ב-service worker). כניסה לאתר תציג באופן אוטומטי אפשרות התקנה (סמל "+"/"התקן אפליקציה" בשורת הכתובת, או "הוסף למסך הבית" בתפריט מובייל). לחיצה מתקינה קיצור-דרך עצמאי (`display: standalone`) עם אייקון וצבע נושא (navy `#14274E`).

### iOS/Safari — התקנה ידנית בלבד
Safari ב-iOS **אינו** מציג הנחיית התקנה אוטומטית ל-manifest — יש לבצע ידנית: **שיתוף (Share) ← הוסף למסך הבית (Add to Home Screen)**.

חשוב לדעת:
- **מחיצת אחסון נפרדת:** אפליקציית מסך-הבית המותקנת מקבלת מרחב אחסון (IndexedDB/localStorage) **נפרד לגמרי** מכרטיסיית Safari הרגילה. נתונים שהוזנו ב-Safari **לא** יופיעו אוטומטית באפליקציה המותקנת, ולהפך. להעברת נתונים בין השתיים יש להשתמש בייצוא/ייבוא JSON (מסך הגדרות) או בקובץ הסנכרון ב-OneDrive.
- **אייקון:** ה-manifest מצביע על `icons/icon.svg` (וקטורי, navy+gold) גם עבור `apple-touch-icon`. iOS אינו תומך רשמית ב-SVG כ-apple-touch-icon, ולכן ייתכן נפילה לצילום מסך גנרי כאייקון — קביל לגרסה זו. לשיפור האייקון ב-iOS: לייצא PNG בגודל 180×180 מתוך `icons/icon.svg` (למשל בכלי עיצוב חיצוני) ולהחליף את ה-`href` של `<link rel="apple-touch-icon">` ב-`index.html` לקובץ ה-PNG.

### build.mjs — הסרת תגיות PWA מ-salary.html
`build.mjs` מסיר בזמן ה-build שלוש תגיות מ-`index.html` לפני הטמעתן ב-`salary.html`: `<link rel="manifest">`, `<meta name="theme-color">`, ו-`<link rel="apple-touch-icon">` (כל אחת עם אותה בדיקת "fail if missing" כמו הסרת ה-`<link rel="stylesheet">`/`<script src>` הקיימות) — כך שקובץ ה-`file://` היחיד לא כולל הפניה ל-manifest/אייקון שלא קיימים כקבצים נפרדים באותו הקשר.

---

## סנכרון OneDrive (WP5.2)

מסך הגדרות → כרטיס "סנכרון קובץ OneDrive":
1. **פתח קובץ OneDrive** — בוחר קובץ `.json` קיים (למשל בתוך תיקיית OneDrive המסונכרנת מקומית) דרך `showOpenFilePicker`; טוען ומחליף את הנתונים המקומיים (עם התראת גרסה אם `appMeta.lastModified` שונה — כלל #7).
2. **שמור קובץ OneDrive** — בפעם הראשונה פותח `showSaveFilePicker`; מהפעם השנייה כותב לאותו קובץ ישירות (ה‑handle נשמר ב‑IndexedDB נפרד ומשוחזר גם אחרי סגירת הדפדפן, ב‑Edge/Chrome).
3. דפדפן ללא תמיכה ב‑File System Access API (למשל Firefox/Safari) נופל אוטומטית להורדה/העלאה ידנית (כפתורים זהים, ללא שינוי בממשק).
4. שגיאות מוצגות בהודעה ברורה: קובץ הוסר/הועבר, הרשאה נדחתה, או שגיאה כללית — ראו `src/sync/filesync.js`.

---

## ייצוא/ייבוא Excel (WP5.3)

**SheetJS vendored** — `src/vendor/xlsx.min.js` הוא ה-build "mini" (~250KB, לא ה-"full") של חבילת `xlsx` (מותקנת גם ב-`node_modules/xlsx` לצרכי סקריפטים מקומיים). אם צריך לעדכן גרסה:
```bash
npm install xlsx@latest        # מעדכן node_modules/xlsx
cp node_modules/xlsx/dist/xlsx.mini.min.js src/vendor/xlsx.min.js
cp node_modules/xlsx/LICENSE   src/vendor/xlsx.LICENSE.txt
```
לא להשתמש ב-CDN — vendored בלבד (עבודה offline). נטען דינמית (`<script>` מוזרק) רק כשנלחץ כפתור ייצוא/ייבוא ב‑`src/io/excel-io.js` — לא בטעינת האפליקציה.

מסך הגדרות → כרטיס "ייצוא/ייבוא Excel (נתוני שכר ושעות)":
1. **ייצוא Excel** — מוריד `salary-export.xlsx` עם 4 גיליונות: **נוכחות** (יום-ברוטו: תאריך/כניסה/יציאה/קוד הפסקה/היעדרות + עמודות "(מחושב)" לעיון), **סטטוס חודשי** (actual/reductions/מכסת ש"נ + תמונת estimate לעיון), **קרן עזרה** (יתרה/הפקדות/הלוואות), **היסטוריה שנתית** (סיכומים מחושבים + עמודת אינפלציה עריכה).
2. **ייבוא Excel** — קורא רק את 4 הגיליונות האלה וכותב **רק** ל‑`months`/`aidFund`/`inflationByYear` (לא ל‑`settings`). ה‑`estimate` הקיים לכל חודש **נשמר** — עמודות ה‑estimate בגיליון "סטטוס חודשי" הן לעיון בלבד ואינן נקראות בייבוא (כלל ה‑snapshot #6).
3. שגיאות בפורמט/בשורה בודדת מוצגות עם הקשר גיליון+מספר שורה (למשל "נוכחות שורה 5: תאריך לא תקין") — ראו `src/io/excel-io.js`.
4. **settings (פרמטרים לאומיים/אישיים) לא כלולים ב‑Excel** — לגיבוי/שחזור מלא כולל פרמטרים יש להשתמש ב‑ייצוא/ייבוא JSON (למעלה) או בסנכרון OneDrive.

---

## מבנה הקוד

| מודול | קובץ | אחריות |
|-------|------|---------|
| מנוע | `src/engine/engine.js` | חישוב pure functions |
| שעות נוספות | `src/engine/overtime.js` | תת-מנוע שעות נוספות |
| ברירות מחדל | `src/engine/defaults.js` | פרמטרים לאומיים |
| סכמה | `src/model/schema.js` | JSON schema + validate() |
| Store | `src/model/store.js` | state + pub/sub |
| Persistence | `src/storage/persistence.js` | IndexedDB + localStorage |
| סנכרון | `src/sync/filesync.js` | File System Access API |
| JSON I/O | `src/io/json-io.js` | ייצוא/ייבוא JSON |
| Excel I/O | `src/io/excel-io.js` | ייצוא/ייבוא xlsx |
| App shell | `src/ui/app.js` | ניווט + lifecycle |
| Theme | `src/ui/theme.css` | עיצוב + dark/light |
| מחרוזות | `src/ui/strings.he.js` | i18n עברית |

---

## כללי קוד

- שמות זהויות באנגלית; מחרוזות UI בעברית (`strings.he.js` בלבד)
- אין hard-coding של ערכים — הכל דרך `settings`
- מנוע (`src/engine/`) ללא תלות ב-DOM
- כל כתיבה מעדכנת `appMeta.lastModified` (דרך `store.setState`)
- Snapshots: `estimate.paramsSnapshot` + `computedAt` — לא מחשבים מחדש
