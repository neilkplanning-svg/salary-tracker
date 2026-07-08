# מדריך חישובים ותזרים נתונים — salary-tracker

מסמך זה מסביר **איך כל מספר שמוצג באפליקציה מחושב**, ומאין הוא "מגיע" — זרימת הנתונים בין המסכים, מהקלט הגולמי ועד לשורת הנטו. נכתב לבעל/ת האפליקציה (לא נדרש רקע תכנותי), אך מפנה לקובצי המקור הרלוונטיים (`src/...`) כדי שהמסמך יישאר תקף כשהקוד משתנה.

**כל הדוגמאות המספריות במסמך הן דוגמאות עגולות להמחשה בלבד — לא נתוני שכר אמיתיים.** ערכי ברירת המחדל הלאומיים (מדרגות מס, אחוזי ביטוח לאומי וכו') המוזכרים כאן הם אלה המוגדרים כרגע ב-`src/engine/defaults.js`; הם ניתנים לעריכה במסך **הגדרות** ומתעדכנים מדי שנה לפי פרסום רשמי.

---

## תרשים זרימה כללי

```
                        ┌───────────────────────────────────────────┐
                        │  store.js — כל המסמך בזיכרון (state)       │
                        │  settings · months[] · aidFund · dollarFund │
                        │  customDeductions[] · manualYearSummaries   │
                        └───────────────────┬─────────────────────────┘
                          store.getState() ↑│↓ store.setState(draft => …)
        ┌───────────┬────────────┬──────────┼──────────┬─────────────┬────────────┐
        ▼           ▼            ▼                     ▼             ▼            ▼
     נוכחות      הגדרות      הפחתות /              משוער         בפועל       היסטוריה
   (attendance) (settings)   קרן עזרה /            (estimate)     (actual)    (history)
        │                    קרן דולרית                │                          ▲
        │  month.days[]                                │                          │
        │  (start/end/…)                                │                          │
        └──────────────────►────────────────────────────┘                          │
                                                         │                          │
                                              calculate() ב-engine.js               │
                                              (מחושב מחדש בכל רינדור — "חי")        │
                                                         │                          │
                                          "שמור תמונה" ──► month.estimate (קפוא)    │
                                                         │                          │
                                                         └───────────────────►  computeYearSummaries()
                                                                                (נגזר, actual-first,
                                                                                 לא נשמר בקובץ)
```

מסכי הקלט (**נוכחות**, **הגדרות**, **הפחתות**, **קרן עזרה**, **קרן דולרית**) כותבים ל-`store` בלבד. מסך **משוער** הוא הצרכן המרכזי של החישוב: בכל רינדור הוא אוסף את כל הקלטים הרלוונטיים ומפעיל מחדש את `calculate()` (`src/engine/engine.js`) — כלומר תמיד "חי" ומעודכן, עד שנלחץ **"שמור תמונה"** (ראו §4). מסכי **בפועל** ו**היסטוריה** אינם מחשבים בעצמם — הם קוראים את התמונה השמורה (`month.estimate`).

שמירה אוטומטית: כל `store.setState(...)` מעדכן `appMeta.lastModified` ומפעיל שמירה (debounce 300ms) ל-IndexedDB — ראו §1.

---

## 1. מקורות הנתונים ואיפה נשמרים

כל נתוני האפליקציה חיים במסמך JSON אחד, מוגדר ב-`src/model/schema.js` (`EMPTY_STATE`), ומוחזק בזיכרון על-ידי `src/model/store.js`. כל מסך קורא ממנו (`store.getState()`) וכותב אליו (`store.setState(draft => {...})`); כל כתיבה מעדכנת אוטומטית את `appMeta.lastModified`.

**שמירה ואחסון** (`src/storage/persistence.js`): בכל שינוי (עם debounce של 300ms) המסמך נשמר אוטומטית ל-IndexedDB בדפדפן, עם נפילה ל-`localStorage` אם IndexedDB נכשל. זו שמירה מקומית בלבד — **לא** מבטיחה סנכרון בין מכשירים.

**סנכרון OneDrive** (`src/sync/filesync.js`): קובץ `salary-data.json` נשמר/נטען דרך File System Access API (או הורדה/העלאה ידנית בדפדפנים ללא תמיכה). "הכתיבה האחרונה מנצחת" — לפני טעינת קובץ עם `appMeta.lastModified` שונה מהמקומי, המשתמש מקבל התראה (`src/io/json-io.js` → `applyImportedDoc`).

מבנה המסמך:

| שדה | תיאור | קובץ מקור |
|---|---|---|
| `appMeta` | `lastModified`, `deviceId`, `appVersion` | `schema.js` |
| `settings.national` | פרמטרים **לאומיים**: מדרגות מס הכנסה, ביטוח לאומי, מס בריאות, תקרת/שיעור קה"ש, זיכוי חסכון, פרמטרי נוכחות (`attendanceParams`), כללי שעות נוספות (`overtimeRules`) | `engine/defaults.js` (ברירות מחדל) |
| `settings.personal` | פרמטרים **אישיים**: רכיבי שכר (`earnings[]`), רכב, זקיפות (`imputations[]`), שיעורי פנסיה/קה"ש, נקודות זיכוי, ערך שעת ש"נ, ערך יום כוננות, כללי קרן דולרית, ניכויים אחרים (`otherDeductions[]`), ושדות legacy (`baseSalary` וכו') | `schema.js` |
| `months[]` | מערך חודשים, כל אחד עם `id` ('YYYY-MM'), `days[]` (נוכחות), `estimate` (תמונה שמורה), `actual` (תלוש בפועל), `reductions` (הפחתות/מענקים), `overtimeApprovedCap` (מכסת ש"נ) | — |
| `customDeductions[]` | ניכויים קבועים מותאמים-אישית עם טווח חודשים אופציונלי (`startMonth`/`endMonth`) | `reductions.js` |
| `aidFund` | `deposits[]`, `balanceSavings`, `loans[]` (עם `monthlyRepayment` וטווח חודשים אופציונלי) | `aidfund.js` |
| `dollarFund` | `deposits[]`, `redemptions[]` — מעקב עצמאי בדולרים | `dollarfund.js` |
| `inflationByYear` | אינפלציה שנתית מוזנת ידנית (מפתח = שנה) | `history.js` |
| `manualYearSummaries` | סיכומי שנה ידניים לשנים ללא חודשים מתועדים | `history.js` |

> **הערה:** בסכמה קיים גם שדה שורש `temporaryReductions: []` — הוא **אינו בשימוש בפועל**. ההפחתות/מענקים החודשיים נשמרים בפועל לכל חודש בנפרד תחת `month.reductions` (ראו §6).

---

## 2. נוכחות → שעות

**קובץ:** `src/engine/attendance-hours.js` (`categorizeDay`) + `src/engine/attendance-month.js` (`calcMonthlyShortfall`). הפרמטרים מגיעים מ-`settings.national.attendanceParams`.

### 2.1 קטגוריזציית יום בודד — `categorizeDay`

לכל יום עם שעת כניסה (S) ושעת יציאה (E) האלגוריתם מחשב:

1. **שעות ללא-אישור לפני הכניסה המאושרת** — כל דקה לפני `approvedStartTime` (ברירת מחדל 06:30) נספרת כ"ללא אישור", תמיד.
2. **קו-מכסה** (`quotaLine`) = תחילת העבודה המאושרת (`aStart` = מקסימום בין S ל-06:30) + `fullDayHours` (ברירת מחדל 8:54 שעות).
3. **ניכוי הפסקה** — אם הוגדר קוד הפסקה ליום (או קוד ברירת המחדל מההגדרות), מנוכות הדקות שבהן ההפסקה חופפת לחלון העבודה בפועל.
4. **שעות רגילות** (`regularPaid`) = הנוכחות בתוך קו-המכסה, פחות ההפסקה.
5. **העודף** מעבר לקו-המכסה מתחלק כך:
   - עודף **מעל שעה** (`firstBandHours`, ברירת מחדל 1:00) → **כל** העודף (כולל השעה הראשונה) נספר כ**שעות נוספות**.
   - עודף **עד שעה** מתפצל בנקודת החיתוך 17:00 (`zeroHourCutoff`): החלק עד 17:00 → **"שעות אפס"** (נספרות, לא משולמות ישירות); החלק אחרי 17:00 → **"ללא אישור"**.
6. **יום שישי** (אם `fridayAllOvertime` מסומן): כל הנוכחות המאושרת (מנוכה הפסקה) הופכת כולה לשעות נוספות; אין שעות רגילות/אפס באותו יום.
7. `isFullDay` = היציאה מגיעה לקו-המכסה ומעלה. `isHalfDay` = נוכחות של לפחות `halfDayHours` (ברירת מחדל 4:27) אך לא יום מלא — משמש להשלמת חיסורים (§2.2).

**דוגמה להמחשה** (מספרים עגולים): כניסה 07:30, יציאה 18:00, הפסקה 12:00–12:30.
`aStart` = 07:30 (אחרי 06:30). `quotaLine` = 07:30 + 8:54 = 16:24. הפסקת 12:00–12:30 נופלת כולה בתוך החלון → מנוכות 0:30. נוכחות עד קו-המכסה = 8:54, פחות הפסקה = **8:24 שעות רגילות**. העודף מעבר לקו-המכסה = 18:00 − 16:24 = 1:36, שגדול משעה → **1:36 שעות נוספות** במלואן.

אם היציאה הייתה 17:00 בלבד: העודף = 17:00 − 16:24 = 0:36 (פחות משעה) → מתפצל בנקודת 17:00: כל ה-0:36 נופל *לפני* 17:00 → כולו **"שעות אפס"**, ללא "ללא אישור".

### 2.2 השלמת חיסורים חודשית — `calcMonthlyShortfall`

עבור כל יום שאינו שישי ואינו יום היעדרות מלאה (`leave`), אם הוא לא הגיע ליום מלא:
- **יום "חצי" ומעלה** (`isHalfDay`) → החוסר (`fullDayHours − נוכחות`) נכנס למאגר "חיסור מוכשר" — ניתן לכיסוי ממאגרים.
- **פחות מחצי יום** → החוסר עובר ישירות ל"ירידת שכר" (`salaryCutHours`), ללא ניסיון כיסוי.

**סדר כיסוי החיסור המוכשר** מתוך המאגרים החודשיים שנצברו: **שעות אפס ← שעות נוספות ← שעות ללא-אישור**. מה שנשאר לא מכוסה (בתוספת החיסור הישיר) הוא `salaryCutHours`.

> **חשוב לדעת:** מנגנון זה **אינו מנכה אוטומטית כסף מהנטו**. הוא רק מציג התראה (למשל בכרטיס "חיסור לא מכוסה — ירידת שכר!" במסך משוער, ובמחוון הצבע במסך נוכחות). ההשפעה הכספית האוטומטית היחידה היא: כאשר חיסור מכוסה **משעות נוספות** — כמות השעות הנוספות המשמשות לחישוב **תשלום** השעות הנוספות (`overtimeApprovedHours`) קטנה בהתאם (ראו `adjustedOT` ב-§3.3), ולכן תשלום השעות הנוספות בפועל יורד. כיסוי משעות אפס/ללא-אישור אינו משפיע כספית כלל, כי שעות אלה ממילא לא היו משולמות. אם רוצים לשקף בפועל ירידת שכר בגין `salaryCutHours` — יש להזין אותה ידנית במסך **הפחתות** (שדה "הפחתה משכר רגיל", §6).

`zeroUtilizationPct` = אחוז שעות האפס שנוצלו לכיסוי, מוצג במסכי נוכחות/משוער כמדד מידע.

---

## 3. שכר משוער (estimate) — `src/engine/engine.js` (`calculate`)

זהו לב המנוע. מקבל `national`, `personal`, `month` (כולל `days[]`), ואופציונלית `reductions`, `aidFundRepayment`, `customDeductions` (סקלרים — ה-UI כבר מסכם אותם, ראו §6). הפלט הוא אובייקט `estimate` מלא (ברוטו, כל הניכויים, נטו, נטו-לאחר-הפחתות, ובסיסי חישוב).

### 3.0 שני מסלולי חישוב

המנוע בוחר אוטומטית:
- **מסלול חדש (earnings)** — פעיל אם יש לפחות רכיב שכר אחד ב-`personal.earnings` עם סכום שונה מאפס. זהו המסלול הפעיל להזנת נתונים חדשה דרך מסך הגדרות.
- **מסלול legacy (baseSalary)** — נופל אליו אם כל ה-`earnings` הם אפס (למשל מסמכים ישנים/בדיקות). מבוסס על `baseSalary.baseConst/perHourConst × positionPercent` בתוספת שדות ותק.

המסמך הזה מתאר את **שני** המסלולים, אך רוב הפירוט הוא על המסלול החדש כי הוא זה שמוצג בהגדרות הנוכחיות.

### 3.1 שותפי-חישוב מקדימים (משותפים לשני המסלולים)

- **נוכחות ← שעות נוספות**: `overtimeHours` נאסף מכל הימים (אחרי `categorizeDay`), מנוכה ממנו הכיסוי משעות נוספות (`coveredFromOT`, §2.2) ← `adjustedOT`. אם הוגדרה **מכסת ש"נ מאושרת** לחודש (`month.overtimeApprovedCap`, נערכת במסך משוער) — `approvedOT = min(adjustedOT, cap)`.
- **תשלום שעות נוספות** (`overtimePay`) מחושב על `approvedOT` על-ידי תת-המנוע הלוגריתמי (`src/engine/overtime.js`, ראו §3.2).
- **כוננות** (`standbyPay`) = `personal.standbyDayValue` (₪ ליום) **×** `presenceDays` — מספר ימי הנוכחות בפועל בחודש (יום עם שעת כניסה, שאינו יום השתלמות). **שימו לב:** זהו מנגנון **נפרד** מרכיב השכר "כוננות" (`duty`) שניתן להזין כסכום קבוע חודשי בטבלת רכיבי השכר בהגדרות — אפשר שהשניים יתקיימו זה לצד זה (סכום קבוע + תוספת-ליום), ושניהם מוסיפים לברוטו.
- **רכב**: אם `car.hasCompanyCar = false` → `carAllowance` (ברירת מחדל ₪3,879) מתווסף לברוטו במזומן. אם `true` → `carImputation` (שווי גילום) מתווסף לבסיס המס/ביטוח לאומי בלבד (לא למזומן בברוטו) — רק אחד מהשניים פעיל בכל רגע.
- **זקיפות** (`imputations[]`, למשל שווי שי לפסח/ארוחות/סלולרי): רכיבים עם `taxable:true` (כל רכיבי הקטלוג הקבוע כאלה) מתווספים לבסיס המס/ביטוח לאומי (`taxableImputations`) בלבד — הם **לא** מזומן בברוטו. אפשר להוסיף גם זקיפה מותאמת-אישית עם `taxable:false` (במסך הגדרות) — סכום כזה **מנוכה ישירות מהנטו** (`nonTaxableImputation`), ללא השפעה על בסיסי המס/ביטוח לאומי.
- **פנסיה שנייה** (`pension2`) = `ancillaryPensionBase` (שדה מספרי בהגדרות, מוזן ידנית — אינו נגזר אוטומטית מכוננות/ש"נ) **×** `pensionRateEmployee2` (ברירת מחדל 7%).

### 3.2 שעות נוספות — נוסחה לוגריתמית (`overtime.js`)

**זו אינה נוסחת 125%/150% פשוטה.** גורם ההכפלה (`factor`) נקבע לפי שעות הש"נ המאושרות ומספר הימים שבהם הייתה ש"נ:

| שעות ש"נ מאושרות | ימי ש"נ | גורם |
|---|---|---|
| ≤ 11.9 ש׳, או כל שעות עם פחות מ-6 ימים | — | 1.00 |
| 11.9–19.9 ש׳ | ≥ 6 ימים | 1.25 |
| מעל 19.9 ש׳ | ≥ 6 ימים | 1.30 |

הנוסחה: `יחידות = שעות × log₈(שעות) × גורם` (בתוספת רכיבים מיוחדים — 100%/פרמיית שבת-חג/פרמיית כוננות שעתית, אם קיימים), והתשלום = `יחידות × ערך שעה נוספת (personal.overtimeHourValue)`.

**דוגמה להמחשה:** 15 שעות ש"נ מאושרות, נפרשו על 7 ימים (≥6) → גורם 1.25 (מדרגה 11.9–19.9). `יחידות = 15 × log₈(15) × 1.25 ≈ 15 × 1.302 × 1.25 ≈ 24.4`. בערך שעה של ₪50 — תשלום ≈ ₪1,220.

> **הערה:** הרכיבים המיוחדים (100%, פרמיית שבת/חג, פרמיית כוננות שעתית — `month.overtimeSpecial`) **נתמכים בנוסחת המנוע אך אין להם כרגע שדה עריכה בשום מסך** — הם תמיד אפס אלא אם מוזנים ידנית בקובץ ה-JSON.

### 3.3 בסיסי חישוב — מי מזין את מה (מסלול חדש)

| בסיס | הרכיבים שנכנסים אליו | הרכיבים שלא נכנסים |
|---|---|---|
| **`pensionBase`** (בסיס פנסיה) | רכיבי `earnings` עם `inPension:true` (למשל שכר יסוד, ותק, כוננות-קבועה) **+ `standbyPay`** | שעות נוספות, תוספת רכב/גילום, השלמת קה"ש, זקיפות |
| **`trainingFundBase`** (בסיס קה"ש) | רכיבי `earnings` עם `inTraining:true` (רק קבוצת "שכר בסיס" בקטלוג) | כוננות, טלפון, ש"נ, רכב, זקיפות, כוננות-ליום |
| **`niBase`** (בסיס ב"ל/בריאות) | רכיבי `earnings` עם `inNI:true` + רכב (תוספת או גילום) + זקיפות חייבות + ש"נ + השלמת קה"ש + כוננות-ליום | — |
| **`taxableIncome`** (הכנסה חייבת במס) | זהה בדיוק ל-`niBase` אך לפי `inTax` במקום `inNI` — בקטלוג הנוכחי `inTax` ו-`inNI` תמיד זהים לכל רכיב, כך ש-`niBase` ו-`taxableIncome` יוצאים שווים בפועל | — |

**קרן השתלמות והמנגנון "השלמת קה\"ש":** אם `trainingFundBase` ≤ תקרת קה"ש הלאומית (`national.trainingFundCap`, ברירת מחדל ₪15,712), או שהמשתמש בחר "להמשיך להפקיד מעבר לתקרה" (`trainingFundDepositAboveCap`) — ההפרשה מחושבת כאחוז (`trainingFundRateEmployee`, ברירת מחדל 2.5%) מהבסיס המלא. אחרת — ההפרשה מחושבת רק על התקרה, וה**חלק שהיה אמור להיות מופרש ע"י המעסיק מעבר לתקרה** (`(trainingFundBase − cap) × trainingFundRateEmployer`, ברירת מחדל 7.5%) הופך ל**הכנסה חייבת** נוספת (`trainingComplement`) — מתווסף לברוטו, ל-`niBase` ול-`taxableIncome`, אך **לא** ל-`trainingFundBase` עצמו.

**ברוטו** (`gross`) = סכום כל רכיבי ה-earnings שאינם "נטו-בלבד" (ראו להלן) + תוספת רכב במזומן + תשלום ש"נ + השלמת קה"ש + כוננות-ליום.

**רכיב "נטו-בלבד"** (כרגע רק "מחקר דולרי (נטו)", ייעודי לדירוג מחקר): רכיב שכל ה-flags שלו כבויים (לא חייב מס/ב"ל/פנסיה/קה"ש) — **אינו** חלק מהברוטו כלל, אלא מתווסף ישירות לנטו בסוף החישוב (`netOnlyAmount`).

### 3.4 מס הכנסה

`calcIncomeTax` (`src/engine/engine.js`): על `taxableIncome` מחושב מס לפי מדרגות שוליות — לכל מדרגה `{min,max,rate}` נלקח החלק מתוך ההכנסה שנופל בתוך הטווח, כפול השיעור, והתוצאות מסוכמות. מהסכום מנוכים:
- **נקודות זיכוי**: `creditPointsQty × creditPointValue` (ברירת מחדל: ₪242 לנקודה).
- **"זיכוי חסכון" (סעיף 45א)**: `35% × min(פנסיה עובד + פנסיה שנייה, ₪679)` — זיכוי נוסף בגין הפקדה לביטוח פנסיוני, עד תקרה חודשית.

התוצאה לא יורדת מתחת לאפס.

**מדרגות ברירת המחדל (2026, לדוגמה)**: 10% עד ₪7,010, 14% על החלק עד ₪10,060, 20% עד ₪19,000, 31% עד ₪25,100, 35% עד ₪46,690, 47% עד ₪60,130, 50% מעבר לכך. ניתנות לעריכה במסך הגדרות.

### 3.5 ביטוח לאומי ומס בריאות

`calcBanded` — אותה שיטת "מדרגות" כמו המס, אך על `niBase` (או `taxableIncome` במסלול legacy): מדרגה מופחתת (1.04% ביטוח לאומי / 3.23% בריאות) עד ₪7,703, ומדרגה מלאה (7% / 5.17%) מעל לכך ועד תקרה (₪47,465).

### 3.6 פנסיה, פנסיה שנייה וקרן השתלמות

- `pension` = `pensionBase × pensionRateEmployee` (ברירת מחדל 6%).
- `pension2` = `ancillaryPensionBase × pensionRateEmployee2` (ברירת מחדל 7%) — ראו §3.1.
- `trainingFund` = כמתואר ב-§3.3 (אחוז מהבסיס, מוגבל לתקרה אלא אם המשתמש בחר להפקיד מעבר לה).

### 3.7 נטו

```
net = gross − incomeTax − nationalInsurance − healthTax − pension − pension2
      − trainingFund − otherDeductions − nonTaxableImputation + netOnlyAmount
```

- **`otherDeductions`** (`personal.otherDeductions[]`) — ניכויים קבועים ברמת ה**הגדרות** (לא חודש ספציפי), מנוכים בכל חודש ללא יוצא מן הכלל. **שדה זה נתמך במנוע ומוצג במסך משוער ("ניכויים אחרים"), אך אין לו כרגע ממשק הוספה/עריכה במסך הגדרות** — ניתן לאכלס אותו רק דרך עריכת קובץ ה-JSON.
- **`nonTaxableImputation`** — זקיפות מותאמות-אישית עם `taxable:false` (§3.1).
- **`netOnlyAmount`** — רכיבי earnings "נטו-בלבד" (§3.3).

### 3.8 נטו לאחר הפחתות

ראו §6 — שלב נפרד, מבוצע תמיד על בסיס ה-`net` שחושב לעיל.

### 3.9 מסלול Legacy (baseSalary) — בקצרה

פעיל רק אם כל ה-earnings אפס. `basePay = (baseConst + perHourConst × positionPercent/100) × adjustFactor`; `gross = basePay + fixedAdditions.phone/other + carAllowance + overtimePay`; `pension = pensionRateEmployee × gross × pensionBaseFactor` (גורם ברירת מחדל 0.9895); `trainingFund = trainingFundRateEmployee × min(gross, trainingFundCap)` (ללא מנגנון "השלמת קה\"ש"); מס/ב"ל/בריאות מחושבים על `taxableIncome = gross + imputationTotal`. `niBase` ו-`taxableIncome` זהים במסלול זה.

---

## 4. "שמור תמונה" (Snapshot)

במסך **משוער**, לחיצה על **"שמור תמונה"** (`src/ui/estimate.js`) מעתיקה את תוצאת החישוב החי (`result` המלא, כולל `paramsSnapshot: {national, personal}` ו-`computedAt`) לתוך `month.estimate`.

**כלל ברזל (CLAUDE.md #6): חודש שנשמר אינו מחושב מחדש אוטומטית.** גם אם ההגדרות הלאומיות/האישיות משתנות אחר-כך, ה"תמונה" השמורה **קפואה** — היא זו שמופיעה בהשוואה מול בפועל (§5) ובהיסטוריה (§8), ולא חישוב מעודכן. אם משנים פרמטרים בדיעבד ורוצים לעדכן חודש שכבר נשמר — יש לחזור למסך משוער וללחוץ שוב "עדכן תמונה" (הכפתור מזהה בעצמו סטייה של מעל ₪0.50 בברוטו/נטו בין החישוב החי לתמונה השמורה ומציג אזהרת "מיושן").

---

## 5. בפועל (actual) והשוואה

מסך **בפועל** (`src/ui/actual.js`) הוא טופס קלט חופשי — `month.actual = { gross, net, approvedOT, bonuses, notes }` — הזנה ידנית של מה שמופיע בתלוש האמיתי, **ללא כל חישוב**.

טבלת ההשוואה שבאותו מסך משווה שלוש שורות מול תמונת ה-`estimate` השמורה (§4): ברוטו, נטו, ושעות ש"נ מאושרות (`estimate.overtimeApprovedHours` מול `actual.approvedOT`). ההפרש מוצג עם חץ (▲/▼) וצבע. אם לא נשמרה תמונה לחודש — מוצגת הנחיה לשמור תמונה במסך משוער קודם.

---

## 6. הפחתות וקרן עזרה

### 6.1 הפחתות/מענקים חודשיים — `month.reductions`

נערך במסך **הפחתות** (`src/ui/reductions.js`), נשמר לכל חודש בנפרד: `fromRegular` (ניכוי משכר רגיל), `fromOvertime` (ניכוי משעות נוספות), `quarterlyBonus` (מענק רבעוני, תוספת), `bonusDeduction` (ניכוי מענק).

### 6.2 קרן עזרה — `aidFund.loans[]`

`aidFund.deposits[]` ו-`balanceSavings` הם **תיעוד בלבד** — אינם משפיעים על אף חישוב שכר. **רק** `aidFund.loans[].monthlyRepayment` משפיע: ה-UI מסכם את כל ההלוואות ה"פעילות" לחודש הנצפה (לפי `startMonth`/`endMonth` אופציונליים — חסר = פתוח-קצה, פעיל תמיד) ומעביר סכום כולל יחיד (`aidFundRepayment`) למנוע.

### 6.3 ניכויים קבועים מותאמים-אישית — `customDeductions[]`

נערכים במסך הפחתות (כרטיס "ניכויים קבועים"), כל אחד עם תווית, סכום, וטווח חודשים אופציונלי. גם כאן ה-UI מסכם את הפעילים לחודש (`isActiveInMonth`, `src/engine/engine.js`) לסקלר יחיד לפני מסירה למנוע.

### 6.4 הנוסחה הסופית

```
netAfterReductions = net − fromRegular − fromOvertime + quarterlyBonus − bonusDeduction
                      − aidFundRepayment − customDeductions(סכום פעילים לחודש)
```

כל הרכיבים בשלב הזה (הפחתות ידניות, קרן עזרה, ניכויים קבועים) פועלים **אחרי** ה-`net` שחושב ב-§3.7 — בשונה מ-`otherDeductions` ו-`nonTaxableImputation` שנכנסים כבר בתוך חישוב ה-`net` עצמו.

---

## 7. קרן דולרית

`src/ui/dollarfund.js` — **מודול מעקב עצמאי לחלוטין**, אינו קורא ל-`calculate()` ואינו משפיע על הברוטו/נטו של מנוע השכר בשום צורה. מיועד למעקב אחר הפקדות/משיכות בדולרים בקרן נפרדת שאינה מופיעה בתלוש.

- **יתרה** = סכום `deposits[].amountUsd` פחות סכום `redemptions[].amountUsd` — נגזרת בזמן תצוגה, אינה נשמרת כשדה עצמאי.
- **כללי הקרן** (`personal.dollarFundRules`, ניתנים לעריכה): רצפת יתרה מינימלית (ברירת מחדל $2,000 — חלה רק על משיכה מסוג "אישי"), תקרת משיכה אישית לשנה קלנדרית (ברירת מחדל $5,000), ושיעור מס על משיכה אישית/פרישה (ברירת מחדל 47%).
- **סוגי פדיון**: "נסיעת מחקר" — פטור ממס במלואו; "אישי" — כפוף לרצפת היתרה ולתקרה השנתית, ומוצג נטו-אחרי-מס; "פרישה" — כפתור ייעודי שמרוקן את כל היתרה בבת אחת, פטור מהרצפה (בכוונה — הקרן מתרוקנת).

---

## 8. היסטוריה וגרפים

`computeYearSummaries` (`src/ui/history.js`) היא פונקציה **נגזרת** (derived) — לא נשמרת בקובץ, מחושבת מחדש בכל רינדור של מסך היסטוריה, ומיוצאת גם ל-`src/io/excel-io.js` (גיליון "היסטוריה שנתית") כדי ששני המקומות תמיד יהיו עקביים.

### 8.1 שנה עם חודשים מתועדים (`source: 'derived'`)

לכל חודש בשנה: **actual-first** — אם הוזן `month.actual.gross/net`, הוא גובר; אחרת נופלים חזרה ל-`month.estimate.gross/net` השמור (לא לחישוב חי!). מסוכמים: `totalGross`, `totalNet`, `bonusesGross` (מ-`actual.bonuses` + `reductions.quarterlyBonus`), `additionsGross` ("תוספות קבועות" — נגזר **מתוך ה-`estimate.paramsSnapshot` השמור** של כל חודש: כל רכיבי earnings שאינם בקבוצת "שכר בסיס" + `overtimePay` + תוספת רכב מזומן; שוב — לא חישוב מחדש, אלא קריאה מהתמונה הקפואה). ממוצעים חודשיים, יחס נטו/ברוטו, ואחוז שינוי הכנסה/נטו מול השנה הקודמת.

### 8.2 שנה ידנית (`source: 'manual'`, ללא חודשים מתועדים)

לשנים שקדמו לשימוש באפליקציה: הזנה חלקית של `totalGross`/`totalNet`/`bonusesGross`/`monthsCount`/`notes` דרך כרטיס "הוסף שנה היסטורית". שדות שלא הוזנו נשארים ריקים (`—`) ולא אפס, כדי להבדיל "לא הוזן" מ"אפס". מסומנת בתג "ידני" (לעומת "נגזר").

**כלל מיזוג:** שנה "נגזרת" (עם חודשים ב-`months[]`) **תמיד גוברת** על ערך ידני קיים לאותה שנה — גם אם קיימת רשומה ב-`manualYearSummaries`.

### 8.3 גרפים (SVG, `src/ui/charts.js`)

שלושה גרפים, כולם ניזונים מ-`computeYearSummaries`: (1) ברוטו/נטו שנתי (עמודות), (2) ממוצע חודשי ברוטו/נטו (עמודות), (3) שינוי הכנסה מול אינפלציה (קווים) — `incomeChangePct` (נגזר מהשוואת `totalGross` בין שנים) מול `inflationPct` (מוזן ידנית ב-`inflationByYear`).

---

## 9. טבלת "מה עובר לאן"

| שדה קלט | נערך במסך | משפיע על (בסיסים/פלט) | נראה במסכים |
|---|---|---|---|
| `personal.earnings[].amount` | הגדרות | `gross`, `pensionBase`/`trainingFundBase`/`niBase`/`taxableIncome` לפי flags, `net` | משוער, היסטוריה (מתוך snapshot) |
| `personal.car` (`hasCompanyCar`/`allowance`/`imputation`) | הגדרות | `gross` (אם תוספת מזומן) או `niBase`+`taxableIncome` (אם גילום רכב חברה) | משוער |
| `personal.imputations[]` (`taxable:true/false`) | הגדרות | `taxable:true` → `niBase`+`taxableIncome`; `taxable:false` → מנוכה ישירות מ-`net` | משוער |
| `personal.standbyDayValue` | הגדרות | `standbyPay` = ערך×ימי-נוכחות → `gross`, `pensionBase`, `niBase`, `taxableIncome` (לא `trainingFundBase`) | משוער, נוכחות (ימי נוכחות) |
| `personal.overtimeHourValue` + `national.overtimeRules` | הגדרות | `overtimePay` → `gross`, `niBase`, `taxableIncome` | משוער, בפועל (השוואה) |
| `month.overtimeApprovedCap` | משוער | חוסם את `approvedOT` המוזן לנוסחת ש"נ | משוער, בפועל |
| `month.days[].start/end/breakCode` | נוכחות | `categorizeDay` → רגיל/אפס/ש"נ/ללא-אישור → חיסור חודשי → `adjustedOT` | נוכחות, משוער |
| `month.days[].leave` | נוכחות | מדלג על חישוב חיסור לאותו יום; `presenceDays` (אם יש `start`) | נוכחות, משוער (כוננות) |
| `personal.pensionRateEmployee`, `pensionRateEmployee2`, `ancillaryPensionBase` | הגדרות | `pension`, `pension2`, `pensionSavingsCredit` (→ מפחית `incomeTax`) | משוער |
| `personal.trainingFundRateEmployee` + `trainingFundDepositAboveCap` + `national.trainingFundCap`/`trainingFundRateEmployer` | הגדרות | `trainingFund`, `trainingComplement` (→ `gross`, `niBase`, `taxableIncome`) | משוער |
| `personal.creditPointsQty` + `national.creditPointValue` | הגדרות | `creditCredit` (מפחית `incomeTax`) | משוער |
| `national.incomeTaxBrackets` | הגדרות | `incomeTax` | משוער |
| `national.nationalInsuranceBands`/`healthTaxBands` | הגדרות | `nationalInsurance`, `healthTax` | משוער |
| `personal.otherDeductions[]` | (רק JSON — אין UI עריכה) | מנוכה מ-`net` בכל חודש, ללא יוצא מן הכלל | משוער |
| `month.reductions` | הפחתות | `netAfterReductions` | הפחתות, משוער |
| `customDeductions[]` (עם טווח חודשים) | הפחתות | `netAfterReductions` (אם פעיל לחודש) | הפחתות, משוער |
| `aidFund.loans[]` (עם טווח חודשים) | קרן עזרה | `netAfterReductions` (`aidFundRepayment`, אם פעיל לחודש) | קרן עזרה, משוער |
| `aidFund.deposits`/`balanceSavings` | קרן עזרה | תיעוד בלבד — **אין** השפעה על חישוב שכר | קרן עזרה |
| `dollarFund.*` + `personal.dollarFundRules` | קרן דולרית | יתרה/נטו-אחרי-מס נגזרים, עצמאי לגמרי מהמנוע | קרן דולרית בלבד |
| `month.actual.{gross,net,approvedOT,bonuses}` | בפועל | טבלת השוואה מול snapshot; `bonusesGross` בהיסטוריה | בפועל, היסטוריה |
| `month.estimate` (תמונה שמורה) | "שמור תמונה" במשוער | קפוא — משמש להשוואה ולהיסטוריה, לא מחושב מחדש | בפועל, היסטוריה |
| `inflationByYear[year]` | היסטוריה | מוצג מול `incomeChangePct` | היסטוריה (גרף אינפלציה) |
| `manualYearSummaries[year]` | היסטוריה | סיכום שנה ידני (רק לשנים ללא `months`) | היסטוריה |

---

## מקורות

`src/engine/engine.js` · `src/engine/attendance-hours.js` · `src/engine/attendance-month.js` · `src/engine/overtime.js` · `src/engine/defaults.js` · `src/model/schema.js` · `src/model/store.js` · `src/ui/estimate.js` · `src/ui/actual.js` · `src/ui/reductions.js` · `src/ui/aidfund.js` · `src/ui/dollarfund.js` · `src/ui/history.js` · `src/ui/charts.js` · `src/ui/attendance.js` · `src/ui/settings.js` · `src/io/excel-io.js` · `src/io/json-io.js` · `src/storage/persistence.js` · `src/sync/filesync.js`.

לפירוט הנוסחאות המקוריות מהאקסל (מקור-אמת היסטורי למנוע) ראו `docs/excel-formulas.md`.
