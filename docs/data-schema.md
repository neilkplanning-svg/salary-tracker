# סכמת נתונים — salary-tracker

## גרסה: schemaVersion 1

## מבנה JSON מלא

```jsonc
{
  "schemaVersion": 1,
  "appMeta": {
    "lastModified": "ISO-8601",    // עדכון אוטומטי בכל כתיבה
    "deviceId":     "UUID",        // זיהוי מכשיר
    "appVersion":   "semver"
  },

  "settings": {
    "national": {
      "incomeTaxBrackets": [        // 7 מדרגות, ₪/חודש
        { "min": 0, "max": 7010, "rate": 0.10 }
        // ...
      ],
      "creditPointValue": 242,      // ₪/נקודה/חודש
      "nationalInsuranceBands": [   // מדרגה מופחתת + מלאה
        { "min": 0, "max": 7522, "rate": 0.004 },
        { "min": 7522, "max": 49030, "rate": 0.07 }
      ],
      "healthTaxBands": [
        { "min": 0, "max": 7522, "rate": 0.031 },
        { "min": 7522, "max": 49030, "rate": 0.05 }
      ],
      "trainingFundCap": 15712      // ₪/חודש — תקרת קרן השתלמות
    },

    "personal": {
      "baseSalary": {
        "baseConst": 0,             // קבוע שכר בסיס
        "perHourConst": 0,          // קבוע לשעה
        "adjustFactor": 1           // גורם התאמה
      },
      "positionPercent": 100,       // אחוז משרה
      "creditPointsQty": 2.25,      // מספר נקודות זיכוי
      "pensionRateEmployee": 0.06,  // שיעור פנסיה עובד
      "trainingFundRateEmployee": 0.025,
      "overtimeHourValue": 0,       // ₪ לשעה רגילה (לחישוב שעות נוספות)
      "standbyDayValue": 0,         // WP10.8 — ₪ ליום כוננות; 0=כבוי. משולם על כל יום נוכחות בפועל
                                     // (כולל יום חלקי שהושלם בחופשה/מחלה), לא על יום היעדרות טהור.
                                     // ראו engine.js calculate() ו-excel-formulas.md §שיוך לבסיסים ('duty').
      "dollarFundRules": {          // WP10.10 — כללי קרן דולרית, ניתנים לעריכה (לא hard-coded)
        "minBalanceUsd": 2000,      // רצפה — אין לרדת מתחתיה בפדיון (חוץ מ-'retirement')
        "personalYearCapUsd": 5000, // תקרת משיכה אישית לשנה קלנדרית
        "personalTaxRate": 0.47     // מס על משיכה אישית/פרישה
      },
      "fixedAdditions": {
        "car": 0, "phone": 0, "other": 0
      },
      "imputations": [              // זקיפות
        { "name": "string", "amount": 0, "taxable": true }
      ],
      "otherDeductions": [          // ניכויים נוספים
        { "name": "string", "amount": 0 }
      ]
    },

    "theme": { "mode": "system|light|dark" }
  },

  "months": [
    {
      "id": "YYYY-MM",
      "days": [
        {
          "date":          "YYYY-MM-DD",
          "start":         "HH:mm",        // null אם לא הוזן
          "end":           "HH:mm",        // null = יום פתוח
          "regularHours":  0,              // ≥ 0
          "zeroHours":     0,              // ≥ 0
          "overtimeHours": 0,              // ≥ 0
          "training":      false,          // יום השתלמות
          "present":       true            // false = היעדרות
        }
      ],
      "estimate": {
        "gross":              0,
        "overtimePay":        0,
        "incomeTax":          0,
        "creditCredit":       0,
        "nationalInsurance":  0,
        "healthTax":          0,
        "pension":            0,
        "trainingFund":       0,
        "otherDeductions":    0,
        "net":                0,
        "netAfterReductions": 0,
        "computedAt":         "ISO-8601",
        "paramsSnapshot":     {}           // snapshot של settings בעת חישוב
      },
      "actual": {
        "gross":              0,
        "net":                0,
        "approvedOvertimeHours": 0,
        "bonuses":            0,
        "notes":              ""
      }
    }
  ],

  "temporaryReductions": [
    {
      "monthId":        "YYYY-MM",
      "fromRegular":    0,           // הפחתה משכר רגיל
      "fromOvertime":   0,           // הפחתה משעות נוספות
      "quarterlyBonus": 0,           // מענק רבעוני (חיובי)
      "bonusDeduction": 0            // ניכוי מענק
    }
  ],

  "aidFund": {
    "deposits": [
      { "monthId": "YYYY-MM", "amount": 0 }
    ],
    "balanceSavings": 0,
    "loans": [
      {
        "monthId": "YYYY-MM", "amount": 0, "repaymentMonthly": 0,
        "startMonth": "YYYY-MM",        // אופציונלי (WP10.11) — ההחזר פעיל רק מחודש זה ואילך
        "endMonth":   "YYYY-MM"         // אופציונלי (WP10.11) — ההחזר פעיל עד חודש זה (כולל); חסר = ללא הגבלה
      }
    ]
  },

  "dollarFund": {                       // WP10.10 — מעקב עצמאי (USD); אינו בתלוש, אינו נכנס ל-calculate()
    "deposits": [
      { "id": "UUID", "date": "YYYY-MM-DD", "amountUsd": 0, "notes": "string" }
    ],
    "redemptions": [
      {
        "id": "UUID", "date": "YYYY-MM-DD", "amountUsd": 0,
        "type":  "research-travel",      // 'research-travel' (פטור ממס) | 'personal' (עד תקרה שנתית, ממוסה) | 'retirement' (מרוקן את הקרן, ממוסה)
        "notes": "string"
      }
    ]
  },

  "customDeductions": [               // WP10.11 — ניכויים קבועים מותאמים-אישית (חברות בוועד, הלוואה חיצונית וכו')
    {
      "id":     "UUID",
      "label":  "string",              // תיאור חופשי, למשל "חברות בוועד"
      "amount": 0,                     // ₪/חודש, אי-שלילי
      "startMonth": "YYYY-MM",         // אופציונלי — פעיל מחודש זה ואילך; חסר = פתוח-קצה
      "endMonth":   "YYYY-MM"          // אופציונלי — פעיל עד חודש זה (כולל); חסר = פתוח-קצה
    }
  ],

  "inflationByYear": {
    "2017": 0.031                   // % אינפלציה שנתית, מוזן ידנית במסך היסטוריה; המפתח חייב להיות שנה (string)
  },

  "manualYearSummaries": {          // WP10.6 — סיכומי שנה ידניים לשנים ללא חודשים מתועדים ב-months[]
    "2019": {                       // מפתח = שנה (string, 4 ספרות); כל השדות אופציונליים (הזנה חלקית)
      "totalGross":   0,            // אופציונלי, ₪, אי-שלילי
      "totalNet":     0,            // אופציונלי, ₪, אי-שלילי
      "bonusesGross": 0,            // אופציונלי, ₪, אי-שלילי
      "monthsCount":  12,           // אופציונלי — משמש רק לחישוב ממוצע חודשי בתצוגה
      "notes":        "string"      // אופציונלי, חופשי
    }
  }
}
```

## ולידציה (src/model/schema.js)
- `schemaVersion` חייב להיות 1
- `appMeta.lastModified` חייב להיות תאריך ISO-8601
- `months[].days[].regularHours / zeroHours / overtimeHours` — אי-שלילי
- `settings.national` ו-`settings.personal` — שדות חובה, עם ולידציה מלאה של מדרגות המס/ב"ל/בריאות ופרמטרים אישיים (ראו §"ולידציית settings" למטה)

## עיקרון Snapshot
- `months[].estimate` נשמר עם `paramsSnapshot` ו-`computedAt`
- **`yearSummaries` אינו נשמר ב-JSON** — נגזר (derived) בזמן `render()` ב-`src/ui/history.js` מתוך `months[]`, כדי שצפייה בהיסטוריה לא תעדכן את `appMeta.lastModified` (WP9.1 §1.2). הערך היחיד שנשמר בפועל הוא `inflationByYear` — מפת שנה→אחוז אינפלציה, נערכת ידנית במסך ההיסטוריה.
- **`computeYearSummaries` הוא actual-first** (WP10.1): לכל חודש, `totalGross`/`totalNet` (וכל מה שנגזר מהם — ממוצעים, `netToGrossRatio`, `incomeChangePct`/`netChangePct`, הגרפים, וגיליון "היסטוריה שנתית" בייצוא Excel) לוקחים את `month.actual.gross`/`month.actual.net` כשקיימים (כלומר לא `null`), ונופלים חזרה ל-`month.estimate.gross`/`month.estimate.net` אחרת — בדיקה זו נעשית **בנפרד לכל שדה** (`??`, לא `||`), כי `actual.gross`/`actual.net` עשויים להיות `null` בנפרד זה מזה כשהוזן רק אחד מהם (ראו `src/ui/actual.js`). עמודת "שעות נוספות" בטבלה החודשית ממשיכה להציג את `estimate.overtimePay` בלבד (ל-`actual` יש רק שעות נוספות מאושרות, לא תשלום). ה-snapshot של `month.estimate` עצמו אינו משתנה ואינו מחושב מחדש — רק תצוגת ההיסטוריה הנגזרת.
- **סה"כ המענקים הרבעוניים (`bonusesGross`) מגיע מ-`month.reductions.quarterlyBonus`** (מסך "הפחתות", `src/ui/reductions.js`) ולא מהמערך `temporaryReductions` ברמת ה-state העליונה — שדה זה קיים ב-schema אך שום מסך לא כותב אליו בפועל.

## סיכומי שנה ידניים — manualYearSummaries (WP10.6)
- מטרה: לאפשר תיעוד שנים היסטוריות שקדמו לשימוש באפליקציה (אין להן חודשים ב-`months[]`), כולל הזנה חלקית (רק חלק מהשדות).
- **כלל המיזוג: derived תמיד גובר.** `computeYearSummaries` (`src/ui/history.js`) בונה את קבוצת השנים המלאה כ-**איחוד** של שנים עם חודשים ב-`months[]` ושנים ב-`manualYearSummaries`. שנה עם חודשים מוצגת **תמיד** מה-months (actual-first, כרגיל) — גם אם קיים לה ערך ב-`manualYearSummaries` (ערך "רדום" כזה לא נמחק אוטומטית מה-JSON, אך אינו משפיע על שום חישוב/תצוגה). שנה ללא חודשים מוצגת מ-`manualYearSummaries` בלבד.
- כל סיכום (שנה derived או manual) נושא שדה `source: 'derived' | 'manual'` — ה-UI מציג בהתאם badge ("מחושב מחודשים" / "ידני") וכפתורי עריכה/מחיקה מוצגים רק לשנים `manual`.
- **הזנה חלקית אמיתית**: שדה שלא הוזן נשאר `undefined` (לא `0`) בסיכום המחושב — כדי שה-UI יציג "—" ולא יטעה שהערך אפס. ממוצע חודשי (`avgMonthlyGross/Net`) מחושב רק כש-`monthsCount` הוזן **וגם** ה-total המתאים קיים.
- נערך במסך היסטוריה (`src/ui/history.js`) — כפתור "הוסף שנה היסטורית" + טופס לכל שנה `manual` (עריכה/מחיקה). ה-UI חוסם הוספת שנה ידנית חדשה לשנה שכבר יש לה חודשים (אין טעם — derived יגבר בכל מקרה).
- ב-Excel (`src/io/excel-io.js`, גיליון "היסטוריה שנתית"): עמודת אינפלציה מיובאת לכל שנה תמיד; עמודות הסכומים (`סה"כ ברוטו`/`סה"כ נטו`/`סה"כ מענקים`/`מספר חודשים`/`הערות`) מיובאות ל-`manualYearSummaries` **רק** לשנה שאין לה חודשים ב-`months` הסופי (לאחר הייבוא) — שנה עם חודשים מתעלמת מהעמודות האלה. שנה שהייתה לה קודם `manualYearSummaries` אך קיבלה חודשים בייבוא הנוכחי — מוסרת מהמפה הידנית (כדי לא להשאיר ערך רדום סותר).
- שדה רמת-שורש `manualYearSummaries` — לא קיים במסמכים ישנים; ה-UI וה-io ניגשים עם `state.manualYearSummaries ?? {}`.

## ולידציית settings (WP9.1 §1.3)
- `settings.national`: `incomeTaxBrackets` / `nationalInsuranceBands` / `healthTaxBands` — מערכים לא ריקים; כל איבר `{min,max,rate}` מספריים, `min < max`, `rate` בין 0 ל-1. `creditPointValue` / `trainingFundCap` — מספרים אי-שליליים.
- `settings.personal`: `creditPointsQty` / `pensionRateEmployee` / `trainingFundRateEmployee` — מספריים אי-שליליים. `earnings` (אם קיים) — מערך `{id, amount}`. `imputations` (אם קיים) — מערך `{amount, taxable}`.

## ניכויים קבועים מותאמים-אישית — customDeductions (WP10.11)
- שדה רמת-שורש `customDeductions[]` — לא קיים במסמכים ישנים; ה-UI ניגש עם `state.customDeductions ?? []`. `fillNationalDefaults` **אינו** ממלא אותו (משפיע רק על `settings.national`) — מערך ריק/חסר משמעו "אין ניכויים", לא צריך ברירת מחדל.
- כל איבר: `{ id, label, amount, startMonth?, endMonth? }`. `startMonth`/`endMonth` בפורמט `'YYYY-MM'`; השוואה לקסיקוגרפית מול חודש התצוגה (`isActiveInMonth`, `src/engine/engine.js`) — חסר = פתוח-קצה באותו כיוון.
- מסוכם ב-UI (לא במנוע) לחודש המוצג בלבד, ומועבר ל-`calculate()` כפרמטר סקלרי `customDeductions` (ברירת מחדל 0) המנוכה מ-`netAfterReductions`. המנוע עצמו אינו יודע על טווחי תאריכים — נשאר טהור וללא שינוי להתנהגות golden cases קיימים כש-`customDeductions=0`.
- `aidFund.loans[].startMonth/endMonth` — אותו מנגנון בדיוק, מסנן אילו הלוואות פעילות בחישוב `aidFundRepayment` לחודש נתון. הלוואות ללא תאריכים ממשיכות לפעול בכל חודש (תאימות לאחור מלאה).

## קרן דולרית — dollarFund (WP10.10)
- **מעקב עצמאי בלבד** — הקרן הדולרית **אינה** מופיעה בתלוש ואינה חלק ממנוע החישוב (`src/engine/engine.js`). `src/ui/dollarfund.js` אינו מייבא/קורא ל-`calculate()`; אין קשר בין הקרן הדולרית לברוטו/נטו המחושבים.
- שדה רמת-שורש `dollarFund` — לא קיים במסמכים ישנים (לפני WP10.10); ה-UI ניגש עם `state.dollarFund ?? {deposits:[], redemptions:[]}`.
- `dollarFund.deposits[]`: `{ id, date:'YYYY-MM-DD', amountUsd (≥0), notes? }`.
- `dollarFund.redemptions[]`: `{ id, date:'YYYY-MM-DD', amountUsd (≥0), type: 'research-travel'|'personal'|'retirement', notes? }`.
  - `research-travel` — פדיון פטור ממס (למשל נסיעה למחקר).
  - `personal` — משיכה אישית; ממוסה לפי `dollarFundRules.personalTaxRate`; מוגבלת ל-`dollarFundRules.personalYearCapUsd` דולר בשנה קלנדרית (`date.slice(0,4)`).
  - `retirement` — פדיון פרישה; ממוסה לפי אותו שיעור מס; מיועד לרוקן את מלוא היתרה (לכן פטור מבדיקת רצפת היתרה המינימלית).
- **היתרה נגזרת** בזמן `render()` — `Σ deposits.amountUsd − Σ redemptions.amountUsd` — **אינה נשמרת** בשדה נפרד (בניגוד ל-`aidFund.balanceSavings` שהיא ידנית).
- `settings.personal.dollarFundRules` — כללי הקרן (רצפת יתרה, תקרה שנתית אישית, שיעור מס) הם **ערכים ניתנים לעריכה במסך ההגדרות** (כלל #4 ב-CLAUDE.md) — לא hard-coded בקוד. ברירות מחדל: `minBalanceUsd=2000`, `personalYearCapUsd=5000`, `personalTaxRate=0.47`.
- אכיפה ב-UI לפני הוספת פדיון (`src/ui/dollarfund.js`): (א) רצפת `minBalanceUsd` חלה **רק** על `type='personal'` (משיכה אישית) — אם היתרה אחרי הפדיון האישי תרד מתחתיה, נחסם; `research-travel` הוא שימוש הליבה של הקרן ואינו מוגבל ברצפה, ו-`retirement` מרוקן את הקרן בכוונה (גם הוא פטור מהרצפה). (ב) אם `type='personal'` וסכום הפדיונות האישיים בשנה הקלנדרית הנוכחית יחרוג מ-`personalYearCapUsd` — נחסם.
