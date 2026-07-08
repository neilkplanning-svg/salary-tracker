# ארכיטקטורה — salary-tracker

## ADR-001: WEB-first עם vanilla JS, גרסה קבועה ומקבילה לנייד

**תאריך:** 2026-06-24  
**סטטוס:** מאושר

### הקשר
הפרויקט מחליף קובץ Excel מורכב. ה-PRD הגדיר Flutter יחיד לכל היעדים. לאחר שיחה עם המשתמש, התקבלה החלטה לשנות את גישת הפיתוח.

### החלטה
**מתחילים ביישום WEB מלא ב-vanilla HTML/JS** — לא כאב-טיפוס חד-פעמי, אלא כגרסה **קבועה ומקבילה** שנשארת בשימוש לצד הנייד העתידי.

### נימוק
1. **הגבלות התקנה:** המשתמש וחבריו מוגבלים בהתקנות על מחשב העבודה. גרסת WEB נפתחת בקליק ללא התקנה.
2. **פשטות מקסימלית:** vanilla JS (ES modules) = אפס build, אפס תלויות חיצוניות (מלבד SheetJS לאקסל — vendored). הכל נפתח מקובץ מקומי.
3. **גרסה קבועה:** ה-WEB לא נזרקת לאחר אב-טיפוס — היא נשארת ערוץ העדכון מ-PC.
4. **JSON משותף:** שתי הגרסאות (WEB + נייד עתידי) חולקות אותו פורמט JSON כמקור אמת.

### השלכות
- Flutter/מסלול נייד נשאר פתוח (מחוץ להיקף v1).
- מנוע חישוב נכתב כ-pure JS functions — ניתן לפורט ל-Dart אם יחליטו על Flutter בעתיד.
- `CLAUDE.md` עודכן לשקף שני מסלולים.

---

## מבנה המודולים

```
src/engine/    — מנוע חישוב טהור (pure functions, ללא DOM)
src/model/     — סכמת JSON, store, ולידציה
src/storage/   — persistence (IndexedDB + localStorage fallback)
src/sync/      — File System Access API + fallback
src/io/        — ייצוא/ייבוא JSON ו-Excel
src/ui/        — רכיבי ממשק, theme.css, strings.he.js
src/vendor/    — SheetJS vendored
test/          — golden-cases.json + engine.test.js
docs/          — תיעוד ארכיטקטורה, סכמה, נוסחאות, dev-guide
```

## כללי ארכיטקטורה (מ-CLAUDE.md)

| כלל | פירוט |
|-----|-------|
| אין שרת | OneDrive = גיבוי/סנכרון קובץ בלבד |
| מנוע טהור | `engine.js` ללא תלות ב-DOM; מאומת מול האקסל |
| אין hard-coding | כל ערך חישובי מגיע מ-`settings`/`defaults.js` |
| גרסה ריקה | ברירת מחדל: נתונים אישיים ריקים, פרמטרים לאומיים מאוכלסים |
| Snapshots | `estimate` שמור עם `paramsSnapshot` + `computedAt`; לא מחושב מחדש |
| סנכרון | "הכתיבה האחרונה מנצחת" לפי `lastModified` + התראת גרסה |

## מסלול נייד (עתידי — מחוץ להיקף v1)

כשתתקבל החלטה (Flutter / PWA / אחר):
- המנוע (`src/engine/`) מתועד ומוכן לפורט
- פורמט ה-JSON זהה — אותו `salary-data.json`
- שכבת הסנכרון מוחלפת: share-sheet במקום File System Access API

---

# יומן החלטות (ADR-lite)

> הועבר מ-`PROGRESS.md` ב-2026-07-01 כחלק מאיחוד התיעוד (ראו `WORK_PLAN.md` §11). **מכאן והלאה — כל החלטה לא-טריוויאלית נרשמת כאן**, בסוף כל WP: תאריך + תג WP + מה הוחלט + למה. הסטטוס עצמו חי ב-`WORK_PLAN.md` §5.

## החלטות ליבה (2026-06-24)
- **WEB-first, vanilla JS, גרסה קבועה ומקבילה לנייד** — ראו ADR-001 לעיל.
- **SheetJS vendored (לא CDN)** — עבודה offline.
- **IndexedDB + localStorage fallback** — אפס תלות חיצונית לאחסון.
- **מנוע (`src/engine/`) ללא תלות ב-DOM** — ניתן לפורט ל-Dart עתידית.

## מנוע ופרמטרים (WP1.2–1.3)
- **[WP1.2] מדרגות מס/ב"ל/בריאות במבנה `min=מקסימום_קודם+1`** (S7=7011, S18=7704…) — חולץ מתאי האקסל (V6:V12, V17:V18). מדרגות רציפות ניפחו מס בכ-₪1 והפילו את `net` — שורש באג OI-07.
- **[WP1.2] `pensionBaseFactor` (0.9895)** נוסף ל-`personal` (לא מספר קסם) — בסיס פנסיה = ברוטו × גורם.
- **[WP1.2] `schema.js` EMPTY_STATE מייבא את `NATIONAL_DEFAULTS`** (היה דיברגנטי) — מקור אמת יחיד.
- **[WP1.3] נוסחת ש"נ לוגריתמית** (`P20 = P12×LOG₈(P12)×P18`) משוחזרת מתאי האקסל P12–P21. גורם P18 (1.0/1.25/1.3) לפי שעות+ימים. כללים ב-`national.overtimeRules`.
- **[WP1.3] `calcOvertime` מחזיר N5** (ש"נ ברוטו); גורם 0.988 (M5=N5×0.988) נדחה ל-OI-05.

## הגדרות ומודל earnings (WP2.2–2.4)
- **[WP2.2] מסך הגדרות שומר ב-submit בלבד** (לא לכל הקשה) — כי `onStateChange→route` מרנדר מחדש; toast מתווסף ל-`body` כדי לשרוד re-render.
- **[WP2.2] מנגנון `data-path` גנרי** ממפה input↔settings (כולל אינדקסי מערך, למשל `national.incomeTaxBrackets.0.min`).
- **[WP2.3] "מקדם התאמה" (adjustFactor) הוסר** — היה placeholder ספקולטיבי; המנוע נופל ל-1.
- **[WP2.3] `personal.car{hasCompanyCar,allowance,imputation}`** — רכב חברה→שווי גילום חייב במס; אחרת→תוספת רכב בברוטו (ברירת מחדל 3879). שיעורים מוצגים ב-% ונשמרים כשבר.
- **[תלושים 2026-06-25]** פוענחו 3 מקורות (אקסל מחקר, תלוש מהנדסים 05/26, תלוש חוזה 06/25). בסיסי פנסיה/קה"ש/ב"ל אינם הברוטו המלא אלא סכום תת-קבוצת רכיבים (91025/91202/94010); `gross×0.9895` הוא קירוב שהוחלף במודל הגנרי.
- **[WP2.4] `personal.earnings[]` — מודל גנרי dual-path**: מערך לא ריק → בסיסים מחושבים מ-flags; אחרת → legacy `baseSalary`+`pensionBaseFactor` (תאימות לאחור).
- **[WP2.4] תקרת קה"ש + complement**: אם `trainingBase>cap` ו-`depositAboveCap=false` → עובד על תקרה, חלק מעסיק מעל תקרה (×0.075) מתווסף לברוטו וכלל בבסיסי ב"ל/מס. `trainingFundRateEmployer=0.075`.
- **[WP2.4] קטלוג רכיבי שכר קנוני קבוע** (12 רכיבים + 5 זקיפות) במקום טבלה נערכת. השיוך לבסיסים (flags) מובנה — המשתמש מזין סכום בלבד (0=לא בדירוגו). תיעוד: `excel-formulas.md` §15.
- **[WP2.4] שיוך כוננות**: בפנסיה (91025) אך **לא** בקה"ש (91202) — baked ב-`duty` flags.
- **[WP2.4 — באג שתוקן] `carAllowance`** נכלל כעת ב-`taxableIncome`+`niBase` (קודם היה בברוטו בלבד → מס/ב"ל חוסר).
- **[WP2.4] `hasEarnings = some(amount≠0)`** (לא `length>0`): שלד ריק נופל ל-legacy ולא דורס golden cases ישנים.

## מסכי פיצ'רים (WP3.2–3.5)
- **[WP3.2] חישוב חי בכל render** (לא מטמון) — תאימות לכלל #6: snapshot שמור ≠ חישוב מחדש.
- **[WP3.2] stale-detection Δ>₪0.50** על gross ו-net.
- **[WP3.2] `overtimeApprovedCap`** על החודש (לא הגדרות); `null`=ללא הגבלה.
- **[WP3.2] תיקון ‑0**: `formatCurrency(amount + 0)` ממיר `-0` ל-`+0`.
- **[WP3.3] `month.actual`** = `{gross,net,approvedOT,bonuses,notes}`; פער ▲▼≈ בסף 0.005.
- **[WP3.4] `month.reductions`** = `{fromRegular,fromOvertime,quarterlyBonus,bonusDeduction}` per-month.
- **[WP3.5] `state.aidFund` גלובלי** (לא per-month); `netBeforeAid = netAfterReductions + totalRepayment`.

## סבב 1 QA (WP8.7)
- **[WP8.7] יחידות ש"נ** — הוסף `overtimeApprovedHours` לפלט המנוע; `actual.js` משווה שעות↔שעות; שווי ₪ כהערה נפרדת.
- **[WP8.7] renderScreen** — שני try-catch נפרדים: ייבוא נכשל = "בבנייה"; `render()` נכשל = שגיאת ריצה גלויה.
- **[WP8.7] persistence** — `idbSet` עם `await new Promise` (דחיית `put`→fallback ל-localStorage); debounce 300ms; `_skipSave` מונע שמירה חוזרת בטעינה.
- **[WP8.7] escapeHtml** — נוסף ל-`strings.he.js`; מיושם ב-`actual.js` (notes) וב-`app.js` (שגיאות).
- **[WP8.7] paramsSnapshot** — שמירת `{national,personal}` בכל estimate מבטיחה דיוק היסטורי (כלל #6); ניפוח JSON נדחה כ-trade-off מקובל.

## מנוע נוכחות (WP8.1–8.4)
- **[WP8.1] `isFullDay = E ≥ quotaLine`; `isHalfDay = !isFullDay && presenceInQuota ≥ halfDayHours`** (נוכחות פיזית, כולל הפסקה) — "עבדתי חצי יום" = נוכחות פיזית.
- **[WP8.2] `presenceInQuota`** — הבסיס לחיסור (`fullDayHours − presenceInQuota`), לא שעות משולמות.
- **[WP8.2] כיסוי חיסור**: מוכשר (≥ חצי יום) → אפס→ש"נ→ללא-אישור; ישיר (< חצי יום) → ירידת שכר. שישי לא יוצר חיסור.
- **[WP8.2] engine integration** — `engine.calculate` מחשב `categorizeDay` לכל יום עם start/end; `coveredFromOT` יורד מ-`approvedOT`. golden cases ישנים ללא `attendanceParams` לא מושפעים.
- **[WP8.3] leave model** — `leave:{type,hours}` per-day; backward-compat עם `training:boolean` ישן; השתלמות=יום מלא אוטומטי.
- **[WP8.4] פיצול תאריך** ל-dd/MM + עמודת יום בשבוע נפרדת (דרישה #2).
- **[WP8.4] עמודות מחושבות** (רגיל/נוסף/אפס/ללא-אישור) מ-`categorizeDay` בכל רנדר (לא נשמרות ל-store).
- **[WP8.4+ סטיית משתמש] breakCode קבוע מהגדרות** — בורר inline הוסר; `defaultBreakCode` ב-`attendanceParams` + select בהגדרות (קוד הפסקה = global default לחודש).
- **[WP8.4+ סטיית משתמש] toggle עשרוני/HH:MM** — `#btn-toggle-fmt`, משתנה module-level `_decimalMode`.
- **[WP8.4+ סטיית משתמש] נוכחות אוטומטית** — checkbox הוסר; `present=true` אם יש start/leave/training.
- **[QA#4] schema.js** — הורחב `validate()`: breakCode range, leave.type/hours, attendanceParams. (הרחבה נוספת — national/personal shape — מבוצעת ב-WP9.1 שלב 1.3.)
- **[QA#5] engine.test.js** — `loadCases()` מזהה Node וקורא `fs.readFileSync`; בדפדפן fetch. סגר את חוב WP1.4.

## דירוגים + גילומים (WP8.5–8.6)
- **[WP8.5] 3 דירוגים** (מחקר/מהנדסים/חוזה, `GRADES`); כל רכיב עם `appliesToGrades`; `gradeLabel()`; תג badge זהוב (pill, navy/gold).
- **[WP8.6] גילומים מותאמים** — הוספה/הסרה (`custom_<ts>`), מוזרמים גנרית למנוע דרך `personal.imputations`.

## היסטוריה + גרפים (WP4.1–4.2)
- **[WP4.1] summaries דינמיים** מחושבים מ-`months` בזמן render; אינפלציה נערכת per-year — מ-WP9.1 שלב 1.2 ואילך: derived-only, ראו למטה.
- **[WP4.2] 3 גרפי SVG טהורים**: ברוטו/נטו שנתי (עמודות), ממוצע חודשי (עמודות), שינוי הכנסה מול אינפלציה (קווי).

## ייצוב ואיחוד — שלב 1 (WP9.1), 2026-07-01
- **[1.1] מפתח `history` כפול** — `strings.he.js` הכיל שני בלוקים `history:`; השני (העדכני, הכולל את כל המפתחות בשימוש) דרס בשקט את הראשון. הוסר הבלוק הראשון (כלל גם `title`/`monthly`/`annual` שלא היו בשימוש — `history.js` משתמש ב-`STRINGS.nav.history`).
- **[1.2] `history.js` — derived, לא persisted** — `render()` הפסיק לכתוב `yearSummaries` ל-store (היה `setTimeout`+`store.setState` על כל צפייה — עדכן `appMeta.lastModified` בניגוד לכלל #6/#7). `computeYearSummaries()` הפכה לפונקציה טהורה שנקראת בכל render מ-`state.months`. הערך היחיד שמשתמש עורך ונשמר בפועל הוא `inflationByYear` (map שנה→אחוז) ב-`EMPTY_STATE`; `yearSummaries` הוסר מהמסמך הקנוני (`docs/data-schema.md` עודכן). אומת: ניווט חוזר להיסטוריה לא משנה `lastModified`.
- **[1.3] `validate()` הורחב** — כשקיים `settings.national`: `incomeTaxBrackets`/`nationalInsuranceBands`/`healthTaxBands` (מערך לא ריק, `{min,max,rate}` מספריים, `min<max`, `0≤rate≤1`), `creditPointValue`/`trainingFundCap` (אי-שלילי). כשקיים `settings.personal`: `creditPointsQty`/`pensionRateEmployee`/`trainingFundRateEmployee` (אי-שלילי), `earnings[]` (`{id,amount}`), `imputations[]` (`{amount,taxable}`). סוגר את חוב הוולידציה של WP1.1 — חשוב לקראת ייבוא JSON (שלב 2).
- **[1.4] קוד מת** — `sumHours()` ב-`engine.js` הוסרה (הוגדרה, מעולם לא נקראה).
- אומת: `node --test` 23/23; כל 7 המסכים נטענו נקי ב-Claude_Preview (אפס שגיאות קונסול, אפס בקשות רשת כושלות).

## ייצוא/ייבוא JSON (WP5.1), 2026-07-01
- **`applyImportedDoc(doc)`** — פונקציה משותפת ב-`src/io/json-io.js`, מיוצאת גם ל-`src/sync/filesync.js` (WP5.2) כדי שלא לשכפל את לוגיקת הוולידציה/התראת-הגרסה בשני מקומות. סדר הפעולה: `validate()` → אם `appMeta.lastModified` שונה בין המקומי לנטען, `confirm()` עם שני התאריכים המתורגמים (`toLocaleString('he-IL')`) → `store.replace(doc)`.
- **החלטה: להתרות על *כל* הבדל בתאריכים (לא רק "נטען חדש יותר")** — כלל #7 דורש התראה לפני דריסה; מכיוון שהייבוא תמיד דורס את המצב המקומי במלואו, גם ייבוא קובץ *ישן* יותר מסוכן (עלול לאבד נתונים מקומיים חדשים). המימוש הקודם (`filesync.js`) התריע רק כש-remote חדש יותר — תוקן.
- **UI** — כרטיס "ייצוא וייבוא נתונים" נוסף למסך ההגדרות (`settings.js`), עם toast הצלחה/כישלון (`STRINGS.io.exportOk`/`importOk`).
- **בדיקות** — `test/io-schema.test.js` (חדש): round-trip JSON טהור (`JSON.stringify`/`parse`) לשני מסמכים (ריק + מלא עם שדות סבב 2), ודחיית `validate()` למסמכים פגומים. לא בודק את זרימת ה-DOM המלאה (input[type=file]/Blob) — זו אומתה ידנית ב-Claude_Preview דרך קריאה ישירה ל-`applyImportedDoc` עם מוקים ל-`confirm`/`alert`.

## סנכרון OneDrive — File System Access API (WP5.2), 2026-07-01
- **`getSyncStatus()`/`initSync()`** — `filesync.js` עוקב אחר מצב חיבור (`connected`/`fileName`/`needsPermission`) שמסך ההגדרות קורא לאחר כל פעולה (אין pub/sub נפרד — מיותר, פעולה→עדכון DOM ישיר מספיק).
- **החלטה: לשמר את ה-`FileSystemFileHandle` ב-IndexedDB נפרד (`salary-tracker-sync`, לא ה-DB של `persistence.js`)** — כדי ש"שמור" בסשן הבא יכתוב לאותו קובץ בלי לבחור מחדש (Chrome/Edge תומכים ב-structured-clone של handles). DB נפרד נבחר כדי לא להתערב בגרסת ה-schema של `persistence.js` (`DB_VER`); העלות – שכפול קטן של קוד idb open/get/put, קביל בהיקף הזה.
- **הבחנת שגיאות** (WORK_PLAN §שלב1 דרש הודעות ברורות): `AbortError` (ביטול משתמש) → שקט; `NotFoundError` → `errorFileMissing` (קובץ הוסר/הועבר); `NotAllowedError`/`SecurityError` → `errorPermissionDenied` (מבקש הרשאה מחדש ב-`requestPermission` בפעולה הבאה, בתוך user gesture); אחר → `errorBadFile` גנרי.
- **הרשאה מתבקשת רק בתוך לחיצה** — `queryPermission` (לא דורש gesture) רץ ב-`initSync()` בזמן טעינת מסך ההגדרות כדי להציג סטטוס; `requestPermission` (עלול לבקש אישור מהמשתמש) רץ רק בתוך handler של לחיצה על "שמור"/"פתח".
- **UI** — כרטיס "סנכרון קובץ OneDrive" נוסף למסך ההגדרות, מעל כרטיס ה-JSON הרגיל; שורת סטטוס בצבע לפי מצב (מחובר=זהב, לא מחובר=אפור, דורש הרשאה=אדום).
- **אומת ב-Claude_Preview** (מוקים ל-`showOpenFilePicker`/`showSaveFilePicker`, ללא אינטראקציית משתמש אמיתית עם דיאלוג OS): כל שלושת תרחישי השגיאה (`NotFoundError`/`NotAllowedError`/`AbortError`) מציגים את ההודעה הנכונה ומעדכנים סטטוס; זרימת open→save מוצלחת מעדכנת `connected:true`+`fileName`. שחזור ה-handle אחרי רענון אמיתי לא נבדק אוטומטית (מחייב אינטראקציה עם דיאלוג OS אמיתי) — הקוד עוקב אחר אותו תבנית idb כמו `persistence.js` הקיים והבדוק.

## ייצוא/ייבוא Excel (WP5.3), 2026-07-01
- **vendoring: build "mini" של SheetJS, לא "full"** — `node_modules/xlsx` כבר היה מותקן (שימש לפענוח `reference/original-salary.xlsx` ב-WP0.2). מתוך `dist/`, `xlsx.mini.min.js` (~250KB) נבחר על פני `xlsx.full.min.js` (~880KB): ה-mini build תומך מלא ב-`.xlsx`/קריאה+כתיבה, ורק חסר טבלאות codepage לפורמטים בינאריים ישנים (`.xls`/`.xlsb`) שהאפליקציה לא צריכה. הועתק סטטית ל-`src/vendor/xlsx.min.js` + `xlsx.LICENSE.txt` (Apache-2.0) — לא CDN, עקבי עם `CLAUDE.md`. נטען דינמית (`<script>` שמוזרק, `import.meta.url`) רק כשנלחץ כפתור ייצוא/ייבוא — לא בטעינת האפליקציה.
- **היקף: נתוני שכר/שעות בלבד, לא settings** — בניגוד ל-JSON (WP5.1, ייצוא/ייבוא מסמך שלם כולל פרמטרים), ה-Excel מייצא/מייבא רק `months`/`aidFund`/`inflationByYear`. הפרמטרים הלאומיים/אישיים (מדרגות מס, שיעורים) נשארים עריכה-דרך-הגדרות-בלבד/JSON — למנוע ממשק עריכה כפול לאותם נתונים בשני פורמטים.
- **4 גיליונות** ב-`src/io/excel-io.js`: "נוכחות" (יום ברוטו: תאריך/כניסה/יציאה/קוד הפסקה/סוג היעדרות/שעות היעדרות — כולם מיובאים חזרה; + 4 עמודות "(מחושב)" דרך `categorizeDay` לתצוגה בלבד, לא נקראות בייבוא), "סטטוס חודשי" (actual/reductions/מכסת ש"נ מיובאים; 3 עמודות estimate תמונה-שמורה לתצוגה בלבד), "קרן עזרה" (שורת "יתרה" + שורות "הפקדה"/"הלוואה"), "היסטוריה שנתית" (עמודת "אינפלציה (%)" בלבד מיובאת; שאר העמודות — סה"כ/ממוצע ברוטו-נטו — מחושבות דרך `computeYearSummaries`, שיוצאה מ-`history.js` ל-`export` כדי לא לשכפל את לוגיקת הצבירה השנתית).
- **החלטה קריטית: ייבוא Excel לא נוגע ב-`month.estimate`** — בניגוד ל-JSON/filesync (שני האחרונים = replace מלא של המסמך), ייבוא Excel בונה מחדש רק `days`/`actual`/`reductions`/`overtimeApprovedCap` לכל חודש, ושומר את ה-`estimate` הקיים מקומית (כולל `paramsSnapshot`+`computedAt`) ללא נגיעה — כי Excel לא מסוגל לשאת אובייקט `paramsSnapshot` מקונן בעמודה שטוחה, ולדרוס `estimate` בלי `paramsSnapshot` תקין היה מפר את כלל ה-snapshot (#6 ב-`CLAUDE.md`: "חודש שמור אינו מחושב מחדש"). אומת ב-round-trip: אחרי ייבוא, `month.estimate` זהה למה שהיה לפני הייבוא.
- **סמנטיקת ייבוא = merge חלקי, לא replace מלא** — נכתב דרך `store.setState` (לא `store.replace`): מעדכן רק `months`/`aidFund`/`inflationByYear`, לא נוגע ב-`settings`/`appMeta` (מלבד `lastModified` האוטומטי של `setState`). בפועל שקול ל-replace עבור `months`/`aidFund`/`inflationByYear` עצמם (הייצוא תמיד כולל את כל הנתונים הנוכחיים, אז ייצוא→עריכה→ייבוא הוא round-trip שקוף) — `inflationByYear` הוא היחיד שממוזג מפתח-מפתח (`{...existing, ...imported}`) כדי לא לאבד שנים שנערכו בעבר ולא הופיעו בקובץ המיובא.
- **ולידציה ייעודית, לא `schema.js` `validate()`** — `validate()` פועל על מסמך JSON מלא (settings+appMeta); Excel מספק רק חלק מהמסמך, כך שנכתבה ולידציה ייעודית ב-`excel-io.js` שמחזירה שגיאות עם הקשר "גיליון + מספר שורה + ערך" (לדוגמה `נוכחות שורה 5: תאריך לא תקין`) — מדויק יותר להדרכת המשתמש לתיקון בקובץ המקורי מאשר הודעות `validate()` הגנריות.
- **עמידות לתאים שאקסל המיר אוטומטית** — תאריך/שעה שיוצאו כמחרוזת (`"2026-07-01"`/`"07:00"`) עלולים להפוך למספר סידורי אם המשתמש מקליד ידנית שורה חדשה ואקסל מזהה תבנית תאריך/שעה. `parseTimeCell`/`normalizeDateCell` מזהים תאים מספריים וממירים (שבר-יממה→HH:MM, ימים-מ-1899-12-30→YYYY-MM-DD) לפני הוולידציה — כדי שהזנת שורות חדשות ישירות באקסל (לא רק עריכת קיימות) תעבוד.
- **אומת חי ב-Claude_Preview** (ללא דיאלוג OS אמיתי — קובץ נבנה מ-`XLSX.write` ל-`ArrayBuffer`, עטוף ב-`File`, מוזרק ל-`<input type=file>` שנוצר בתוך `importExcel()` דרך יירוט `document.createElement` + `DataTransfer`, ואז `input.onchange()` נקרא ישירות): round-trip מלא (חודש עם ימים/actual/reductions/מכסה/estimate, aidFund מלא, inflationByYear) חזר זהה כולל שימור `estimate`; 3 תרחישי שגיאה (קובץ טקסט לא-workbook, workbook תקין בלי גיליונות מוכרים, שורת "נוכחות" עם תאריך פגום) — כולם הציגו הודעה ברורה עם הקשר.

## גרסה ריקה + מקרי קצה (WP6.1), 2026-07-01
- **בדיקה: התקנה ריקה (IndexedDB+localStorage נמחקו, `EMPTY_STATE` נטען)** — כל 7 המסכים נטענו נקי ב-Claude_Preview, אפס שגיאות קונסול.
- **ממצא לא-קוד, הוצג למשתמש ואושר "להשאיר כמו שזה"**: `settings.personal` בהתקנה ריקה כולל ברירות מחדל לא-אפסיות (`car.allowance=3879`, `creditPointsQty=2.25`, `pensionRateEmployee=0.06`, `trainingFundRateEmployee=0.025`) שמייצרות נטו משוער ‎₪3,386 עוד לפני שהמשתמש הזין נתון אישי אחד. זו החלטה מתועדת מ-WP2.3 (ערכים טיפוסיים לעובד IAI/MALAT חדש) שסותרת טכנית את כלל הארכיטקטורה #5 ("נתונים אישיים ריקים כברירת מחדל") — אך המשתמש בחר להשאיר, כי `earnings[]` (רכיבי השכר בפועל) כן מתחיל ריק לגמרי; רק "שיעורים טיפוסיים" משניים מאוכלסים מראש.
- **באג אמיתי שתוקן: `onSave` ב-`settings.js` לא דחה סכומים שליליים ברכיבי שכר/זקיפות/רכב** — שדות `[data-path]` הכלליים (מדרגות מס, נק' זיכוי וכו') כבר דחו ערך שלילי עם הודעת שגיאה (`S.errNonNegative`), אבל `personal.earnings[]`, `personal.imputations[]` (כולל גילומים מותאמים) ו-`personal.car.allowance/imputation` נקראו דרך `parseFloat(...) || 0` בלבד — ערך שלילי (למשל "‑500" ברכיב שכר) היה נשמר בשקט ומזרים למנוע. תוקן: כל שלוש הקריאות בונות `errors.push()` על ערך שלילי, לפני בדיקת `errors.length` הקיימת שחוסמת שמירה. אומת חי: הזנת "‑500" ברכיב "שכר יסוד" → שגיאה מוצגת, `store` לא משתנה; תיקון לערך חיובי → נשמר כרגיל.
- **מקרי קצה נוספים אומתו חיים (ללא צורך בתיקון קוד)**: יום פתוח (כניסה ללא יציאה — התראה קיימת מ-WP8.4), `schemaVersion` פגום (`validate()` דוחה + `alert` עם רשימת שגיאות), קונפליקט עריכה (ייבוא עם `lastModified` שונה → `confirm()` עם שני התאריכים; ביטול משמר מצב מקומי, אישור דורס), חודש חלקי (יום בודד בחודש — אין קריסה), חיסור לא מכוסה (יום נוכחות קצר מחצי יום → "⚠ חיסור לא מכוסה — ירידת שכר!" ב-`estimate.js`, מבוסס `attendance-month.js` מ-WP8.2).
- **`node --test` 31/31** לאחר התיקון; כל הבדיקות הידניות בוצעו דרך `preview_eval` עם קריאה ישירה ל-`store`/`applyImportedDoc` (ולא לחיצות UI בפועל) כדי לעקוף דיאלוגי `confirm`/`alert` חוסמים — תואם לתבנית האימות שנקבעה ב-WP5.2/5.3.

## תיקון: פער מיגרציה ב-settings.national (2026-07-01)
- **הבאג שדווח:** משתמש דיווח שתפריט הפסקת הצהריים בהגדרות מציג רק "ללא הפסקה" — כל 5 חלונות ה-30-דק' נעלמו.
- **שורש הבעיה:** `NATIONAL_DEFAULTS` הוא מקור-האמת היחיד ל-`settings.national`, אבל הוא נצרך **רק** בבניית `EMPTY_STATE` (התקנה חדשה). כשמשתמש קיים שומר מסמך *לפני* שדה חדש נוסף ל-`NATIONAL_DEFAULTS` (למשל `attendanceParams`/`breakWindows`, WP8.1 ב-2026-06-28), אין שום מנגנון שממזג את השדה החדש לתוך המסמך השמור שלו — `loadFromStorage`/`store.replace` פשוט לוקחים את המסמך הישן כמות שהוא. `validate()` לא תפס את זה כי הבדיקה מותנית ב-`if (attendanceParams)` — שדה חסר לגמרי עובר ולידציה בשקט.
- **התיקון:** `schema.js` מייצא `fillNationalDefaults(doc)` — משלים רקורסיבית (על אובייקטים פשוטים בלבד) כל שדה חסר (`undefined`) ב-`settings.national` מתוך `NATIONAL_DEFAULTS`, **בלי לדרוס** ערכים/מערכים שכבר קיימים (גם אם המשתמש ערך אותם). `store.replace()` קורא לזה תמיד — כך שכל נתיב טעינת מסמך חיצוני (אחסון מקומי, ייבוא JSON, ובעתיד סנכרון OneDrive) מקבל אותו טיפול בנקודת-חניקה אחת. `settings.personal` **לא** נגעת — נשארת נאמנה לכלל #5 (נתונים אישיים ריקים כברירת מחדל, לא ברירות מחדל לאומיות).
- **בדיקות:** `test/schema-migration.test.js` (חדש, 4 בדיקות) — השלמת שדה חסר לגמרי, השלמת שדה מקונן בודד בלי לדרוס שדה אחר שנערך, אי-נגיעה במסמך מלא, אי-נגיעה ב-`personal`.
- **אומת חי:** טעינת מסמך מדומה בלי `attendanceParams` → לאחר `store.replace` המסך מציג את כל האפשרויות מ-`breakWindows`.
- **החלטת המשתמש (2026-07-01):** לצד תיקון הבאג, המשתמש ביקש לצמצם את טווח חלונות ההפסקה מ-5 (11:00–13:30) ל-3 (11:30–13:00) — `breakWindows` ב-`defaults.js` צומצם בהתאם; `defaultBreakCode` עודכן מ-2 ל-1 (עדיין 12:00–12:30). מכיוון שגם `golden-cases.json` וגם `test/engine.test.js` מעבירים `breakWindows` inline לכל מקרה בדיקה (לא תלויים ב-`NATIONAL_DEFAULTS`), השינוי לא השפיע על ה-golden cases.

## WP8.9: סיווג יום עבודה שהושלם בחופש כיום נוכחות (2026-07-01)
- **בקשת המשתמש:** "אם הייתי בעבודה והשלמתי עם חופש — היום מוגדר כיום נוכחות רגיל ולא כיום חופש". מנגנון ההזנה והחישוב נשארים כמות שהם (עובדים טוב).
- **מה שונה (UI בלבד, `attendance.js`):** (1) badge — יום עם `start != null` וגם `leave` (חופשה/מחלה) מציג "נוכח" עם tooltip של שעות ההשלמה, במקום "חופשה"/"מחלה"; (2) מונה ימי ההיעדרות בסיכום החודשי סופר רק ימים עם `leave`/`training` **ללא** שעות עבודה (`start == null`).
- **מה לא שונה בכוונה:** `calcMonthlyShortfall` — יום עם `leave` עדיין לא יוצר חיסור (ההשלמה מכסה); כרטיס "ניצול היעדרויות — 4 חודשים" עדיין סופר את שעות החופשה שנוצלו כי הן אכן נוכו מהמכסה בפועל; מבנה הנתונים (`day.leave`) לא שונה — אין השפעה על schema/ייצוא/סנכרון.

## WP8.8ב: מס הכנסה מדויק — זיכוי חסכון מחליף V33, פנסיה שנייה (2026-07-03)
- **הקשר:** WP8.8א אימת בסיסים/ב"ל/בריאות/פנסיה מול קורפוס התלושים האמיתי; מס הכנסה נותר פתוח (OI-08). קריאת רצף מלא ינואר–מאי 2026 (לא רק מדגם בודד) חשפה איך MALAT באמת מחשב מס — ראו `docs/excel-formulas.md` §16 לפירוט המלא.
- **ממצא:** תלוש 05/26 (שהיה המדגם הקיים ל"מהנדסים") מכיל **שתי** התאמות רטרואקטיביות חד-פעמיות חופפות (שינוי נקודות זיכוי 9.25→11.75 עקב אירוע משפחתי; שינוי חוק מדרגות המס שפורסם 31/3/2026 בתוקף רטרואקטיבי מ-01/2026) — הוצג למשתמש, שבחר לכייל מול 2023/2025 בלבד (חודשים "נקיים") ולתעד את 05/26 כחריג מוסבר.
- **החלטה (אושרה במשתמעות דרך אישור הכיול המומלץ):** מנגנון "מדרגה ראשונה דינמית" (V33=פנסיה+קה"ש) מהאקסל המקורי **הוסר** מ-`calcIncomeTax` — הוא ו"זיכוי חסכון" (סעיף 45א, מזוהה מהנתונים כ-`35%×min(פנסיה,679)`, קבוע ₪237.65/חודש בדיוק על 3 חודשים בלתי-תלויים) הם שני מודלים חופפים לאותה הטבת-מס; הפעלת שניהם יחד ניפחה את הפער ל-~₪145/חודש, בעוד זיכוי חסכון לבד נותן ~₪16–29/חודש. golden case `2026-06-full` (מבוסס האקסל המקורי) עודכן בהתאם (`incomeTax` 2371.26→2351.81).
- **נוסף:** `pension2` (פנסיה שנייה על נלווים, OI-07) — `personal.ancillaryPensionBase`×`personal.pensionRateEmployee2` (ברירת מחדל 7%), שדה ישיר (לא נגזר מ-`earnings[]`) כי הניסיון לפרק אותו לרכיבי שכר בודדים לא התכנס בין הדירוגים. מאומת ≤₪0.01 בשלושה תלושים.
- **מה לא נפתר:** ≤₪1 ל-`incomeTax`/`net` בתלושים בודדים — דורש state מצטבר לכל השנה (מנוגד לכלל ה-snapshot #6 ב-`CLAUDE.md`), מחוץ להיקף v1. תועד כפער מקובל.
- **בדיקות:** `node --test` 33/33; אומת חי ב-Claude_Preview (שדות UI חדשים בהגדרות, `pension2` מוצג במסך משוער).

## WP6.2: נגישות — ניגודיות, ARIA, יעדי מגע (2026-07-03)
- **שיטה:** נבנה סקריפט Node לחישוב יחסי ניגודיות (WCAG relative luminance) על כל צמדי הצבעים ב-`theme.css` (כהה+בהיר), ואומתו חיים ב-Claude_Preview דרך `preview_inspect`/`preview_eval` (לא רק ניתוח סטטי).
- **4 כשלי ניגודיות אמיתיים (1.4.3, נדרש 4.5:1) תוקנו:**
  - `.btn-accent` (כפתור "שמור" הראשי) — טקסט לבן על זהב = 2.4:1. תוקן: טקסט `var(--color-primary)` (כחול-נייבי) על זהב = ~6:1.
  - `.att-c-ot` (שעות נוספות בטבלת נוכחות) — זהב על רקע בהיר = 2.4:1. תוקן בתבנית קיימת בקובץ (היפוך צבע לפי ערכת-נושא): בהיר←`var(--color-primary)`, כהה←`var(--color-accent)` (זהב על רקע כהה עובר בנוחות, ~7.4:1).
  - `.grade-badge` (תג דירוג ליד כל פרמטר/רכיב) — זהב על רקע זהב-בהיר-שקוף = 2.3:1 במצב בהיר (במצב כהה כבר עבר, ~7.2:1). תוקן באותה תבנית היפוך-לפי-ערכת-נושא.
  - `.att-shab` (שורת שבת בטבלת נוכחות) — עמעום דרך `opacity:0.4` הוריד את כל הטקסט בשורה ל-~2:1 (הטקסט המשני אף ירד ל-1.9:1) בשני המצבים. תוקן: הוסר ה-`opacity`; הוחלף ברקע `var(--color-surface)` + צבע `var(--color-text-secondary)` בעוצמה מלאה — אותה תבנית עיצובית שכבר קיימת ל-`.att-fri` (שישי), נשאר "מעומעם" ויזואלית אך קריא (6.5–6.8:1 בשני המצבים).
- **סמנטיקה חסרה תוקנה (4.1.2 / 1.3.1 / 4.1.3):**
  - קישור הניווט הפעיל (`#main-nav a.active`) קיבל `aria-current="page"` (היה מתבטא רק ויזואלית דרך צבע) — `app.js` `route()`.
  - כפתורי אייקון-בלבד (`.btn-edit-row` ✎, `.aid-del` ✕, `.remove-imp-btn` ×) הסתמכו רק על `title` (לא נגיש-לוודאות ל-screen reader/מקלדת) — נוסף `aria-label` מפורש בנוסף ל-`title` הקיים בכל אחד מ-4 מוקעי השימוש.
  - **6 מוקעי "toast"** (`app.js`, `actual.js`, `estimate.js`, `reductions.js`, `aidfund.js`/`_toast`, `settings.js`/`showToast`) לא הכריזו את השינוי למשתמשי screen reader — נוסף `role="status"` + `aria-live="polite"` לכולם (4.1.3 Status Messages, רמה AA ב-WCAG 2.1).
- **יעדי מגע (2.5.5, בפועל רמה AAA ב-WCAG 2.1 — לא נדרש ל-AA):** האפליקציה מיועדת למחשב עבודה (עכבר), לא מגע; עם זאת שלושה כפתורי-אייקון קטנים במיוחד (`#theme-toggle`, `.btn-edit-row`, `.aid-del`) קיבלו `padding` נדיב יותר לשיפור שטח-הקליק, בלי לשנות את גודל הגלף החזותי או לפרק את הצפיפות בטבלאות. הוחלט **לא** לדחוף ל-44×44 מלא (AAA) — היה דורש ניפוח משמעותי של טבלאות מידע-צפוף (נוכחות/קרן עזרה) שאינו מוצדק לאפליקציית desktop יחיד-משתמש.
- **`node --test` 33/33** ללא שינוי (WP זה נגע רק ב-CSS/HTML/ARIA, לא בלוגיקת מנוע); אומת חי ב-Claude_Preview על כל 7 המסכים בשני מצבי הערכת-נושא — אפס שגיאות קונסול.

## WP6.3: הפצה — bundler לקובץ יחיד + פרסום GitHub Pages (2026-07-03)
- **בעיה:** ES modules (`<script type="module" src="...">`) חסומים מ-`file://` (fetch של מודול חיצוני נכשל על מקור null/opaque) — כך שהגרסה הרגילה (`index.html`+`src/`) דורשת שרת מקומי לפיתוח וגם לשימוש. היעד: קובץ HTML יחיד, בלי שרת, נפתח בדאבל-קליק, offline לגמרי.
- **גישת הבנייה (build.mjs, Node, אפס תלויות npm):** נשקלו שתי גישות — (א) שרשור flat של כל 21 קבצי `src/**/*.js` למרחב-שמות (scope) משותף אחד, (ב) עטיפת כל קובץ ב-closure עצמאי בסגנון CommonJS (`registry['path'] = function(module, exports, require){...}`) עם `require`/`module.exports` פנימיים וקאש. **נבחרה גישה (ב)** — שרשור flat נכשל בפועל מול הקוד הזה (משתנים/פונקציות מקומיות בשמות זהים בקבצים שונים, למשל helpers בשם `round2`/`r2`, היו מתנגשות ב-scope משותף). ה-closure-shim מבודד כל קובץ ל-scope משלו, תואם בדיוק לסמנטיקת ES modules המקורית.
- **טיפול ב-dynamic import היחיד:** `src/ui/app.js` מכיל `import(\`./\${screen}.js\`)` לניתוב מסכים לפי hash. `build.mjs` מזהה את המחרוזת המדויקת הזו בזמן build ומחליף אותה ב-`require(\`src/ui/\${screen}.js\`)` (עם assertion שהמחרוזת המדויקת נמצאת פעם אחת בדיוק — נכשל בבנייה אם `app.js` ישונה בעתיד ולא יתעדכן ה-build).
- **הטמעת SheetJS — הכרעה מפורשת:** נשקלה חלופה של השארת `xlsx.min.js` (250KB) כקובץ צמוד (לא מוטמע), נטען lazy רק במסך I/O — נדחתה כי היא סותרת את יעד "קובץ אחד באמת, בלי תלות בקבצים נוספים לצדו". **הוחלט להטמיע verbatim** בתוך `<script>` קלאסי לפני קוד האפליקציה. תוצאה נעימה: מכיוון ש-`loadXLSX()` הקיים ב-`excel-io.js` כבר בודק `if (window.XLSX) return Promise.resolve(window.XLSX)`, ההטמעה המוקדמת גורמת לבדיקה הזו "לנצח" אוטומטית — **אפס שינוי קוד** נדרש ב-`excel-io.js`. מחיר: `salary.html` = 492KB (רובו SheetJS), נטען כולו מראש (לא lazy) — נשקל כטריוויאלי לאפליקציית desktop יחיד-משתמש.
- **`type="module"` נשאר על ה-`<script>` הראשי (לא הפך ל-classic) — נקודה טכנית לא-טריוויאלית:** הקוד המשורשר של `excel-io.js` מכיל `import.meta.url` (בתוך fallback-path של `loadXLSX()` שהופך לקוד-מת כי `window.XLSX` כבר מוגדר, אך עדיין **נפרש**/parsed). `import.meta` הוא syntax legal רק בתוך מודול אמיתי — קוד לא-מודול עם `import.meta` הוא שגיאת syntax. לכן ה-`<script>` המשורשר חייב `type="module"`, למרות שאין בו אף `import`/`export` בפועל אחרי הטרנספורמציה.
- **אימות אמפירי — לא הסתפקנו בהנחה:** נשקל חשש אמיתי שמא `type="module"` עצמו (גם ריק מ-imports) חסום מ-`file://` בדפדפנים מודרניים, לא רק ה-fetch של imports. במקום להסתמך על זיכרון/הנחה, **נכתב כלי אבחון CDP-over-WebSocket מינימלי** (Node built-ins בלבד — `http`/`crypto`/`net`, ללא חבילת `ws`) שמריץ Chrome headless אמיתי (`--headless=new --remote-debugging-port`), פותח את `salary.html` דרך `file://` ממש (לא שרת http), ומאזין ל-`Runtime.consoleAPICalled`/`Runtime.exceptionThrown` דרך CDP + מריץ `Runtime.evaluate` לבדיקת מצב ה-DOM בפועל. תוצאה: **עובד** — מודול inline ללא `import` בפועל מתבצע תקין מ-`file://` (החסימה חלה רק כש-יש fetch בפועל של מודול/משאב חיצוני). אומתו כך: כל 7 המסכים מרנדרים תוכן אמיתי (לא placeholder), ניתוב hash כולל fallback ל-hash לא-קיים, `aria-current`/מעבר ערכת-נושא, `window.XLSX` זמין מיד, לחיצה על ייצוא Excel לא זורקת — אפס הודעות קונסול/חריגות בכל הריצה.
- **`node --test` 33/33** ללא שינוי — ה-WP הזה לא נגע בלוגיקת `src/**` (רק `build.mjs` חדש + `docs/dev-guide.md`). `docs/dev-guide.md` עודכן עם הוראות פרסום GitHub Pages מלאות (הריפו עדיין ללא remote מוגדר — ההוראות כלליות, לא בוצעה דחיפה בפועל).

## WP6.4: קבלה סופית מול PRD §6 — סגירת פאזת ה-WEB (2026-07-04)
- **שיטה:** workflow עם 6 סוכנים במקביל (אחד לכל קטגוריית צ'קליסט PRD §6+§8.1) ביקר כל קריטריון מול קוד המקור + היסטוריית WORK_PLAN.md/architecture.md, וסיווג כל סעיף: מאומת-בקוד-והיסטוריה / מאומת-בקוד-בלבד (חסר תיעוד בדיקה חיה) / דורש-בדיקה-חיה / פער. לאחר מכן בוצעו בדיקות חיות ממוקדות ב-Claude_Preview לכל סעיף שלא הוכרז "מאומת-והיסטוריה".
- **4 בדיקות חיות חדשות (לא היה תיעוד קודם):**
  - מס הכנסה לא-שלילי בערכי קיצון: `calcIncomeTax(3000, brackets, 50, 242, 0)` (50 נקודות זיכוי על הכנסה חייבת נמוכה, אמור לצאת שלילי בלי ה-clamp) → `0`, מאשר את ה-`Math.max(0, tax-credit)` ב-`engine.js`.
  - 3 גרפי היסטוריה עם נתונים אמיתיים רב-שנתיים: הוזרקו 9 חודשים מדומים על פני 2024–2026 דרך `store.setState`, נבדק שכל 3 ה-SVG מציגים תוויות ציר נפרדות לכל שנה (לא רק "נטען בלי שגיאה" כמו שתועד קודם) — עבר.
  - Fallback הורדה/העלאה כש-File System Access API לא קיים: `delete window.showOpenFilePicker/showSaveFilePicker` + לחיצה על הכפתורים, אימות ש-`<input type=file accept=".json">` ו-download-blob נוצרים נכון (ולא רק "הקוד קיים סטטית") — עבר.
  - ביקורת קוד מדוקדקת של `filesync.js` (persist/restore handle ל-IndexedDB) — תקין, תואם spec; אינטראקציה עם דיאלוג OS אמיתי (בחירת קובץ אמיתי, restart דפדפן אמיתי) נשארת מגבלת-בדיקה מתועדת כבר מ-WP5.2 (לא נסגרה, לא נחוצה מחדש).
- **2 "פערים" שהתגלו הם למעשה סטיות מכוונות ומאושרות מנוסח ה-PRD המילולי — לא באגים, לא תוקנו:**
  1. PRD §6 דורש "לסמן שעות אפס" ידנית — הוסר במכוון ב-WP8.4+ לפי בקשת מפורשת של המשתמש (נוכחות אוטומטית מחושבת מ-start/end, לא checkbox ידני). זו החלטה כבר מתועדת; ה-PRD פשוט לא עודכן בהתאם.
  2. PRD §6 דורש סטייה ≤₪1 "מול האקסל המקורי" — זה מתקיים (25/25 golden cases). אבל מול **תלושים אמיתיים** (לא האקסל) הסטייה נותרת ~₪16-29/חודש (OI-08, WP8.8ב) — מתועד כפער מקובל, דורש state מצטבר שנתי, מחוץ להיקף v1.
- **סעיף שנפתר בפועל (לא רק תועד כסטייה):** PRD §6 "WEB נפתח מקישור בלבד, ללא התקנה/localhost" — עד לרגע זה לא היה קיים כלל (אין GitHub remote). **הוצגה למשתמש בחירה מפורשת** (Public / Private / דחיית הסעיף) — המשתמש בחר **Public**. בוצע: `gh repo create salary-tracker --public` (חשבון `neilkplanning-svg`, נבדק מראש שאין דליפת מידע רגיש — `reference/`, קבצי JSON אישיים, ותעודות זהות — כל אלה מחוץ ל-tracked files), `git push`, הפעלת Pages דרך `gh api repos/.../pages` (branch `main`, root). **אומת חי לא דרך שרת פיתוח אלא דרך `claude-in-chrome` על ה-URL הציבורי האמיתי** `https://neilkplanning-svg.github.io/salary-tracker/`: כותרת "מעקב שכר", ניווט מלא, `aria-current="page"` תקין (מאשר את תיקון WP6.2 בסביבת production אמיתית), `screen-container` עם 20,765 תווים של תוכן אמיתי, מצב-כהה לפי מערכת ההפעלה — אפס שגיאות אפליקטיביות (הודעת "message channel closed" שנצפתה היא ארטיפקט ידוע של תוסף דפדפן, לא קוד האפליקציה).
- **`node --test` 33/33** לכל אורך ה-WP (לא נגעה בלוגיקת מנוע). `docs/dev-guide.md` עודכן עם ה-URL האמיתי במקום הוראות גנריות.

## tooling
- **[2026-06-24] `serve.mjs`** (שרת סטטי אפס-תלויות) + `.claude/launch.json` — נדרש כי הדפדפן חוסם ES modules מ-`file://`.

---

# סוגיות פתוחות (מנוע — לטיפול עתידי)

> סיכונים וסוגיות ברמת התוכנית מנוהלים ב-`WORK_PLAN.md` §7. כאן — סוגיות מנוע/נוסחה בלבד.

- **OI-05:** גורם 0.988 (M2/M3/M5) — כרגע מובלע ב-`baseConst` של ה-golden cases ולא מיושם על N5. לפרק כשיורכב ברוטו מימי החודש; בנתיב `earnings[]` ניתן להגדיר factor per-component.
- **OI-06:** פרמטרים לאומיים תלויי-שנה — `defaults.js` תמיד 2026 (מחוץ להיקף v1).
- **ש"נ מיוחדות (P13–P17):** שבת/חג/כוננות/100% נתמכים ב-`calcOvertime` (special) אך עדיין אפס — להזין מנתוני חודש בעת הצורך.
- **חודשי vs שעתי:** ניכוי ההפסקה משפיע על ספירת השעות (השלמת חיסורים) ולא על הברוטו הישיר — לאמת מול האקסל אם יתגלה פער בתלוש אמיתי.
- **OI-07 (WP8.8):** ✓ נפתר ב-WP8.8ב — `pension2 = ancillaryPensionBase × pensionRateEmployee2`, מאומת ≤₪0.01 בשלושה תלושים.
- **OI-08 (WP8.8b):** ◐ שופר משמעותית (V33 הוחלף ב"זיכוי חסכון", ~₪150+/חודש→~₪16–29/חודש) אך לא ≤₪1 — דורש state מצטבר לכל השנה, מחוץ להיקף v1. פירוט: `docs/excel-formulas.md` §16.
