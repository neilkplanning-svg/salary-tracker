# CLAUDE.md — salary-tracker

קובץ הקשר ל‑Claude Code. מגדיר את ה‑stack, כללי הארכיטקטורה, מבנה הקוד ומוסכמות הפיתוח של פרויקט חישוב וניהול השכר. מסמך ה‑PRD המלא: `PRD_salary_app.md`.

## סקירה
אפליקציית ניהול שכר המחליפה קובץ Excel. תיעוד נוכחות, חישוב נטו משוער, תלוש בפועל, היסטוריה רב‑שנתית, גרפים, ייצוא/ייבוא Excel, וסנכרון מבוסס‑קובץ דרך OneDrive. **ללא שרת, אפס עלות חוזרת, local‑first.**

## מסלולי יישום

### מסלול WEB — vanilla HTML/JS (הנוכחי, גרסה קבועה)
**זהו המסלול הפעיל.** גרסה קבועה ומקבילה — לא אב-טיפוס חד-פעמי.
- **Vanilla JS (ES modules)** — ללא framework, ללא build, נפתח בקליק.
- **ניהול מצב:** store קטן בזיכרון + pub/sub ידני (`src/model/store.js`).
- **אחסון:** IndexedDB + localStorage fallback (`src/storage/persistence.js`).
- **גרפים:** SVG בעבודת-יד (ללא ספרייה).
- **Excel:** SheetJS vendored (`src/vendor/xlsx.min.js`).
- **סנכרון:** File System Access API + fallback (`src/sync/filesync.js`).
- **לוקליזציה:** `Intl` מובנה (`he-IL`), RTL, ₪.
- **בדיקות:** `tests.html` בדפדפן + אופציונלי `node --test`.
- **הפצה:** GitHub Pages (סטטי) + `build.mjs` לקובץ יחיד.

### מסלול נייד — Flutter (עתידי, מחוץ להיקף v1)
הארכיטקטורה של WEB מוכנה-לנייד:
- **Flutter (Dart)** — יעדים: `android`, `ios`.
- **Riverpod** — ניהול מצב.
- **`intl`** (`he_IL`) — לוקליזציה.
- **`fl_chart`** — גרפים.
- **שכבת סנכרון:** share-sheet של מ"ה (במקום File System Access API).
- אותו פורמט JSON כמקור אמת משותף.

**שתי הגרסאות חולקות:**
- פורמט JSON זהה (מקור אמת)
- לוגיקת מנוע חישוב (pure functions — ניתנת לפורט ל-Dart)
- כללי ארכיטקטורה (ראו להלן)

## Tech Stack (מסלול WEB הנוכחי)
- **Vanilla JS (ES modules)** — ללא framework, ללא build step.
- **CSS custom properties** — theme.css, dark/light, RTL מלא.
- **IndexedDB** + localStorage fallback — persistence.
- **SheetJS** (`src/vendor/xlsx.min.js`) — vendored, לא CDN.
- **File System Access API** (Edge/Chrome) + fallback הורדה/העלאה.
- **`Intl`** מובנה (`he-IL`) — לוקליזציה, RTL, ₪.

## Tech Stack (מסלול נייד עתידי — Flutter)
- **Flutter (Dart)** — יעדים: `android`, `ios`.
- **Riverpod** — ניהול מצב; **`fl_chart`** — גרפים; **`intl`** (`he_IL`).
- **Hive/JSON** דרך `path_provider` — אחסון מקומי.

## כללי ארכיטקטורה (לא לחרוג)
1. **אין רכיב שרת ואין חשבונות משתמש.** OneDrive הוא גיבוי/סנכרון בלבד.
2. **בסיס קוד יחיד** לכל היעדים; הפשטת פלטפורמה לגישת קבצים (mobile share‑sheet מול File System Access API).
3. **מנוע חישוב יחיד** ב‑module נפרד וטהור (pure functions, ללא תלות UI), המאומת מול האקסל המקורי.
4. **אין hard‑coding של ערכים אישיים או של חוקי מס בקוד.** הכול דרך `settings` הניתנים לעריכה.
5. **גרסה ריקה כברירת מחדל:** נתונים אישיים ריקים; פרמטרים לאומיים מאוכלסים מראש וניתנים לעריכה.
6. **snapshots:** חודש שמור אינו מחושב מחדש; כל `estimate` שומר `paramsSnapshot` + `computedAt`.
7. **סנכרון = "הכתיבה האחרונה מנצחת"** לפי `appMeta.lastModified`, עם התראת גרסה לפני דריסה.

## מבנה תיקיות — מסלול WEB (הנוכחי)
```
index.html             # מעטפת האפליקציה
tests.html             # בדיקות מנוע בדפדפן
build.mjs              # bundler אופציונלי לקובץ יחיד
src/
  engine/
    engine.js          # pipeline חישוב טהור
    overtime.js        # תת-מנוע שעות נוספות (משוחזר מהאקסל)
    defaults.js        # פרמטרים לאומיים כברירת מחדל
  model/
    schema.js          # schemaVersion + validate()
    store.js           # state + pub/sub
  storage/
    persistence.js     # IndexedDB + localStorage fallback
  sync/
    filesync.js        # File System Access API + fallback
  io/
    json-io.js         # ייצוא/ייבוא JSON
    excel-io.js        # ייצוא/ייבוא xlsx (SheetJS)
  ui/
    app.js             # App shell, ניווט, lifecycle
    attendance.js, estimate.js, actual.js,
    reductions.js, aidfund.js, history.js,
    charts.js, settings.js
    strings.he.js      # כל מחרוזות UI בעברית
    theme.css          # navy/gold, dark/light, RTL
  vendor/
    xlsx.min.js        # SheetJS vendored
test/
  engine.test.js       # golden-cases ל-node --test
  golden-cases.json    # קלטים → פלטים צפויים מהאקסל
reference/
  original-salary.xlsx # (מסופק ע"י המשתמש — .gitignore)
docs/
  architecture.md, data-schema.md, excel-formulas.md, dev-guide.md
```

## מבנה תיקיות — מסלול נייד עתידי (Flutter)
```
lib/
  main.dart
  engine/              # pure Dart — ניתן לפורט מ-src/engine/
  features/            # attendance, estimate, actual, reductions, aidfund, history, settings
test/
  engine/             # אימות מנוע מול ערכי האקסל (סטייה ≤ ₪1)
```

## מודל הנתונים
המבנה המלא ב‑`PRD_salary_app.md` §5.2. ישויות עיקריות: `appMeta`, `settings.national`, `settings.personal`, `months[]` (עם `days[]`, `estimate`, `actual`), `temporaryReductions[]`, `aidFund`, `yearSummaries[]`. `schemaVersion` בכל קובץ; ולידציה בטעינה.

## מנוע החישוב (תקציר — מפרט מלא ב‑PRD §5.3)
זרימה: שעות → רכיבי ברוטו → שעות נוספות (לשחזר מהאקסל בדיוק) → זקיפות → מס הכנסה לפי מדרגות פחות נקודות זיכוי (לא <0) → ב"ל ומס בריאות מדורגים → פנסיה וקרן השתלמות → ניכויים נוספים → נטו → נטו לאחר הפחתות/החזרי קרן עזרה.
- מס הכנסה למדרגה: `clamp(taxable − min, 0, max − min) × rate`.
- קרן השתלמות: `rate × min(base, trainingFundCap)`.
- ברירות מחדל לאומיות: מדרגות שולי 10/14/20/31/35/47/50%, ערכים רשמיים עדכניים, ניתנים לעריכה.

## מוסכמות קוד
- שמות זהויות באנגלית; מחרוזות UI בעברית דרך `intl`.
- `engine/` ללא תלות ב‑Flutter/UI; קל לבדיקה.
- כל שינוי פרמטר משפיע על חישובים חדשים בלבד.
- כל כתיבת נתונים מעדכנת `appMeta.lastModified`.
- ולידציה על קלטים (שעות/סכומים אי‑שליליים; ימים פתוחים מסומנים).

## פקודות
```bash
flutter pub get
flutter run                       # מכשיר/אמולטור
flutter run -d chrome             # WEB (פיתוח)
flutter build web                 # build סטטי לאירוח (GitHub Pages)
flutter build apk                 # אנדרואיד
flutter test                      # כולל אימות מנוע מול האקסל
```

## Definition of Done ל‑v1
ראו קריטריוני הקבלה ב‑`PRD_salary_app.md` §6. דגשים: דיוק מול האקסל (≤ ₪1), שעון כניסה/יציאה + עריכה ידנית, השוואה משוער↔בפועל, מודולי הפחתות וקרן עזרה, snapshots + 3 גרפים, ייצוא/ייבוא Excel ו‑JSON, גרסה ריקה + טעינה, RTL ומצב כהה, ו‑WEB הנפתח בקליק עם טעינה/שמירה מול OneDrive.

## Out of Scope (v1)
שרת/חשבונות, סנכרון בזמן אמת, Microsoft Graph אוטומטי, פרמטרים תלויי‑שנה, ייעוץ מס. ראו PRD §3.4 ו‑§8.2.
