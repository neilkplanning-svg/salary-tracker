/**
 * strings.he.js — כל מחרוזות ה-UI בעברית
 * Input: none  Output: אובייקט STRINGS המיובא על-ידי מודולי UI
 */

export const STRINGS = {
  appName: 'מעקב שכר',

  nav: {
    attendance: 'נוכחות',
    estimate:   'משוער',
    actual:     'בפועל',
    reductions: 'הפחתות',
    aidFund:    'קרן עזרה',
    dollarFund: 'קרן דולרית',
    history:    'היסטוריה',
    settings:   'הגדרות',
  },

  attendance: {
    clockIn:         'כניסה',
    clockOut:        'יציאה',
    editManually:    'עריכה ידנית',
    openDayWarning:  'יום פתוח ללא יציאה — יש להשלים ידנית',
    regularHours:    'שעות רגילות',
    zeroHours:       'שעות אפס',
    overtimeHours:   'שעות נוספות',
    training:        'השתלמות',
    absent:          'היעדרות',
    present:         'נוכחות',
    monthTotal:      'סיכום חודשי',
    leaveType:       'היעדרות',
    leaveNone:       'ללא',
    leaveVacation:   'חופשה',
    leaveSick:       'מחלה',
    leaveTraining:   'השתלמות',
    leaveHours:      'שעות',
    leaveCompleteFull: 'השלם ליום מלא',
    leaveUtilTitle:  'ניצול היעדרויות — 4 חודשים',
    leaveAbsent:     'היעדרויות',
    monthlyShortfall: 'חיסור חודשי',
    vsZeroPool:      'אפס זמין',
    zeroUtilPct:     'ניצול שעות אפס',
    shortfallOk:       'מכוסה משעות אפס',
    shortfallCovered:  'נדרשו ש"נ/ללא-אישור',
    shortfallCut:      'ירידת שכר',
  },

  estimate: {
    title:          'נטו משוער',
    gross:          'ברוטו',
    incomeTax:      'מס הכנסה',
    nationalIns:    'ביטוח לאומי',
    healthTax:      'מס בריאות',
    pension:        'פנסיה',
    pension2:       'פנסיה שנייה (נלווים)',
    trainingFund:   'קרן השתלמות',
    creditCredit:   'זיכוי נקודות',
    net:            'נטו',
    netAfterRed:    'נטו לאחר הפחתות',
    standbyPay:     'כוננות',
    saveSnapshot:   'שמור תמונה',
    snapshotHint:   'שמירת תמונה מקבעת את החישוב הנוכחי לחודש זה. התמונה משמשת להשוואה מול התלוש בפועל ולסיכומי ההיסטוריה והגרפים, ואינה משתנה כששינויים בנתונים או בפרמטרים נעשים אחר-כך.',
    recalculate:    'חשב מחדש',
    aidFundRepayment:  'החזר קרן עזרה',
    editReductionsHint: 'עריכה במסך הפחתות / קרן עזרה',
  },

  actual: {
    title:          'תלוש בפועל',
    gross:          'ברוטו בפועל',
    net:            'נטו בפועל',
    approvedOT:     'שעות נוספות שאושרו',
    bonuses:        'תוספות / מענקים',
    notes:          'הערות',
    diffTitle:      'השוואה: משוער ↔ בפועל',
    diffGross:      'פער ברוטו',
    diffNet:        'פער נטו',
    diffOT:         'פער שעות נוספות',
  },

  reductions: {
    title:          'הפחתות שכר זמני',
    fromRegular:    'הפחתה משכר רגיל',
    fromOvertime:   'הפחתה משעות נוספות',
    quarterlyBonus: 'מענק רבעוני',
    bonusDeduction: 'ניכוי מענק',
    customTitle:    'ניכויים קבועים',
    customHint:     'הוסף ניכוי חוזר (למשל חברות בוועד) או ניכוי עם טווח תאריכים (למשל הלוואה שיורדת מהשכר).',
    customLabel:    'תיאור',
    customLabelPlaceholder: 'למשל: חברות בוועד',
    customAmount:   'סכום חודשי (₪)',
    customFrom:     'מחודש',
    customTo:       'עד חודש',
    customFromToHint: 'ריק = ללא הגבלה',
    customAdd:      'הוסף ניכוי קבוע',
    customEmpty:    'אין ניכויים קבועים מותאמים-אישית.',
    customRemove:   'מחק ניכוי',
  },

  aidFund: {
    title:          'קרן עזרה',
    deposits:       'הפקדות',
    balance:        'יתרת חיסכון',
    loans:          'הלוואות',
    repayment:      'החזר חודשי',
    loanFrom:       'מחודש',
    loanTo:         'עד חודש',
    loanFromToHint: 'ריק = ללא הגבלה (החזר פעיל תמיד)',
  },

  // WP10.10: קרן דולרית — מעקב עצמאי (USD), לא חלק מהתלוש/מנוע החישוב
  dollarFund: {
    title:              'קרן דולרית',
    hint:               'מעקב עצמאי בדולרים — אינו מופיע בתלוש ואינו משפיע על חישובי הברוטו/נטו של האפליקציה.',
    balance:             'יתרה נוכחית',
    netReceived:         'סה"כ התקבל נטו (אחרי מס)',
    personalYtd:         'משיכה אישית השנה',
    deposits:            'הפקדות',
    addDeposit:          '+ הוסף הפקדה',
    redemptions:         'פדיונות',
    addRedemption:       '+ הוסף פדיון',
    date:                'תאריך',
    amountUsd:           'סכום ($)',
    notes:               'הערות',
    type:                'סוג',
    typeResearchTravel:  'מחקר/נסיעה — פטור ממס',
    typePersonal:        'משיכה אישית',
    typeRetirement:      'פרישה',
    netAfterTax:         'נטו אחרי מס',
    retirementBtn:       'פדיון פרישה (כל היתרה)',
    depositsEmpty:       'אין הפקדות רשומות.',
    redemptionsEmpty:    'אין פדיונות רשומים.',
    depositAdded:        'הפקדה נוספה',
    redemptionAdded:     'פדיון נוסף',
    blockedFloor:        'לא ניתן: הפדיון יוריד את היתרה מתחת למינימום הנדרש ($)',
    blockedYearCap:      'לא ניתן: הפדיון האישי חורג מהתקרה השנתית ($)',
  },

  settings: {
    title:          'הגדרות',
    national:       'פרמטרים לאומיים',
    personal:       'פרמטרים אישיים',
    theme:          'ערכת נושא',
    themeSystem:    'מערכת',
    themeLight:     'בהיר',
    themeDark:      'כהה',
    incomeTaxBrackets: 'מדרגות מס הכנסה',
    creditPointValue:  'ערך נקודת זיכוי (₪/חודש)',
    niBands:           'מדרגות ביטוח לאומי',
    healthBands:       'מדרגות מס בריאות',
    trainingCap:       'תקרת קרן השתלמות',
    savingsCreditRate: 'שיעור זיכוי חסכון (סעיף 45א, %)',
    savingsCreditCap:  'תקרת הפקדה מזכה לזיכוי חסכון (₪/חודש)',
    baseSalary:        'שכר יסוד',
    positionPct:       'אחוז משרה',
    creditPoints:      'נקודות זיכוי',
    pensionRate:       'שיעור פנסיה (עובד)',
    pensionRate2:      'שיעור פנסיה שנייה (נלווים)',
    ancillaryPensionBase: 'בסיס פנסיה שנייה — נלווים (₪)',
    trainingRate:      'שיעור קרן השתלמות (עובד)',
    overtimeHourValue: 'ערך שעת נוספת (₪)',
    standbyDayValue:   'ערך יום כוננות (₪)',
    standbyDayValueHint: 'אם אתה משתמש בערך יום כוננות, השאר את רכיב "כוננות" הקבוע = 0 (אחרת ייספר פעמיים)',

    // WP10.10 — כללי קרן דולרית (ניתנים לעריכה; אינם hard-coded)
    dollarFundSection:    'כללי קרן דולרית',
    dollarFundMinBalance: 'רצפת יתרה מינימלית ($)',
    dollarFundYearCap:    'תקרת משיכה אישית לשנה ($)',
    dollarFundTaxRate:    'שיעור מס על משיכה אישית/פרישה (%)',
    car:               'רכב (₪)',
    phone:             'טלפון (₪)',
    fixedOther:        'תוספת קבועה אחרת (₪)',
    baseConst:         'שכר בסיס קבוע (₪)',
    perHourConst:      'תוספת לשעת נוכחות (₪)',
    adjustFactor:      'מקדם התאמה',
    pensionBaseFactor: 'מקדם בסיס פנסיה',
    overtimeRules:     'כללי שעות נוספות',
    otLogBase:         'בסיס לוגריתם',
    otMinHours:        'סף שעות לבונוס',
    otMaxTier1:        'גבול עליון מדרגה 1',
    otMinDays:         'סף ימי ש"נ',
    otFactorBase:      'גורם בסיס',
    otFactorT1:        'גורם מדרגה 1',
    otFactorT2:        'גורם מדרגה 2',
    colMin:            'מינימום',
    colMax:            'מקסימום',
    colRate:           'שיעור (%)',
    affectsNewOnly:    'שינוי פרמטר משפיע על חישובים חדשים בלבד — חודשים שמורים (snapshots) לא משתנים.',
    errNonNegative:    'ערך חייב להיות מספר אי-שלילי',
    otReadonlyNote:    'כללי שעות נוספות קבועים לכל הדירוגים — לקריאה בלבד.',
    carSection:        'רכב',
    hasCompanyCar:     'יש רכב חברה (ליסינג)',
    carAllowance:      'תוספת רכב (₪)',
    carImputation:     'שווי גילום רכב במס (₪)',
    carImputationPrompt: 'מהו שווי גילום הרכב לחיוב במס?',
    imputationsSection:'גילומים (שווי חיובי במס)',
    imputationsNote:   'ברוטו למס גדול מהברוטו בפועל: גילומים (שווי רכב, ביטוחים, מתנות, לימודים וכו׳) מגדילים את בסיס המס/ב"ל/בריאות אך אינם תשלום במזומן.',
    addImputation:     '+ הוסף גילום',
    impLabel:          'תיאור',
    impAmount:         'סכום (₪)',
    impLabelPlaceholder:'למשל שווי לימודים',
    remove:            'הסר',
    save:              'שמור',
    cancel:            'ביטול',
    savedOk:           'נשמר בהצלחה',

    // WP2.4 — earnings[] model (קטלוג קנוני קבוע)
    earningsSection:      'רכיבי שכר',
    earningsNote:         'רשימה קבועה של כל רכיבי השכר האפשריים (כל הדירוגים). הזן את הסכום מהתלוש שלך; השאר 0 אם הרכיב אינו בדירוגך. השיוך לבסיסים (✓ מס/ב"ל/פנסיה/קה"ש) קבוע ומובנה — המנוע מחשב את הבסיסים אוטומטית.',
    earningLabel:         'רכיב שכר',
    earningAmount:        'סכום (₪)',
    inTaxShort:           'מס',
    inTaxFull:            'נכנס לבסיס מס הכנסה',
    inNIShort:            'ב"ל',
    inNIFull:             'נכנס לבסיס ביטוח לאומי / בריאות',
    inPensionShort:       'פנסיה',
    inPensionFull:        'נכנס לבסיס פנסיה',
    inTrainingShort:      'קה"ש',
    inTrainingFull:       'נכנס לבסיס קרן השתלמות',
    depositAboveCap:      'הפקדה מעבר לתקרת קה"ש — המשך לפי % מהבסיס המלא (ברירת מחדל: עובד על תקרה, חלק מעסיק מעבר → ברוטו)',
    trainingRateEmployer: 'שיעור הפרשת מעסיק לקה"ש (%)',
    gradeCol:             'דירוג',
    legacySalarySection:  'שכר בסיס ישן (fallback — פעיל רק כשכל רכיבי השכר 0)',

    // WP10.5 — הסברים לרכיבי שכר לא-מובנים מאליהם בטבלת רכיבי השכר (מוצג ⓘ ליד התווית)
    earningDescriptions: {
      misc:              'רכיב "שונות" — תוספת שכר משתנה כפי שמופיעה בתלוש, נכנסת לכל הבסיסים.',
      duty:               'תשלום עבור זמינות/כוננות; נכנס לפנסיה אך לא לקרן ההשתלמות.',
      incentive:          'שכר עידוד — תוספת ביצועים/תפוקה, נכנסת לכל הבסיסים.',
      contractSupplement: 'השלמת שכר לעובדי חוזה אישי, עד לגובה השכר החוזי; נכנסת לכל הבסיסים.',
      researchSeniority:  'תוספת ותק ייעודית לדירוג מחקר; נכנסת לכל הבסיסים כמו שכר יסוד.',
    },
  },

  io: {
    sectionTitle:  'ייצוא וייבוא נתונים (גיבוי)',
    sectionHint:   'ייצוא שומר קובץ JSON מלא לגיבוי. ייבוא טוען קובץ ומחליף את כל הנתונים הנוכחיים — מומלץ לייצא גיבוי לפני ייבוא.',
    exportJson:    'ייצוא JSON',
    importJson:    'ייבוא JSON',
    exportExcel:   'ייצוא Excel',
    importExcel:   'ייבוא Excel',
    openFile:      'פתח קובץ OneDrive',
    saveFile:      'שמור קובץ OneDrive',
    versionAlert:  'קיים הבדל בין תאריך העדכון של הקובץ הנטען לנתונים המקומיים.',
    versionAlertConfirm: 'לטעון את הקובץ בכל זאת ולהחליף את הנתונים המקומיים?',
    exportOk:      'קובץ הגיבוי יוצא בהצלחה',
    importOk:      'הנתונים יובאו בהצלחה',
    errorBadSchema:'פורמט קובץ לא תואם — schemaVersion שגוי',
    errorBadFile:  'שגיאה בפתיחת הקובץ',
    errorNoFSA:    'הדפדפן אינו תומך ב-File System Access API — מצב הורדה/העלאה פעיל',

    // WP5.2 — סנכרון OneDrive (File System Access API)
    syncSectionTitle:    'סנכרון קובץ OneDrive',
    syncSectionHint:     'קשר קובץ salary-data.json בתיקיית OneDrive שלך (למשל דרך תיקיית הסנכרון המקומית) — "שמור" יכתוב לאותו קובץ בכל פעם, ו"פתח" יטען ממנו. ב-Edge/Chrome הקישור נשמר גם אחרי סגירת הדפדפן.',
    syncConnected:       'מחובר לקובץ',
    lastSaved:           'נשמר לאחרונה',
    kb:                  'ק"ב',
    syncNotConnected:    'לא מחובר לקובץ — לחץ "פתח" לבחירת קובץ קיים, או "שמור" ליצירת קובץ חדש',
    syncNeedsPermission:  'יש לאשר גישה מחדש — לחץ "פתח" או "שמור"',
    errorFileMissing:    'הקובץ לא נמצא — ייתכן שהוסר או הועבר. בחר קובץ מחדש.',
    errorPermissionDenied: 'הגישה לקובץ נדחתה. אשר הרשאה כדי להמשיך בסנכרון.',

    // WP5.3 — ייצוא/ייבוא Excel (נתוני שכר ושעות בלבד — לא settings)
    excelSectionTitle: 'ייצוא/ייבוא Excel (נתוני שכר ושעות)',
    excelSectionHint:  'ייצוא יוצר קובץ Excel עם 4 גיליונות: נוכחות, סטטוס חודשי, קרן עזרה והיסטוריה שנתית — נוח לצפייה/עריכה. ייבוא מעדכן רק את הנתונים האלה (לא את ההגדרות/פרמטרים); תמונות "משוער" שמורות אינן נדרסות.',
    exportExcelOk:      'קובץ ה-Excel יוצא בהצלחה',
    importExcelOk:      'הנתונים יובאו בהצלחה מ-Excel',
    errorVendorLoad:    'טעינת מנוע ה-Excel נכשלה (src/vendor/xlsx.min.js) — ודא שהקובץ קיים',
    errorBadExcelFile:  'לא ניתן לקרוא את הקובץ — ודא שזהו קובץ Excel (.xlsx) תקין',
    errorBadExcelFormat:'פורמט הקובץ אינו תואם למבנה הצפוי:',

    // תבנית ריקה — הורדת טמפלייט להעלאת נתונים מאקסל
    templateSectionTitle: 'הורדת תבנית להעלאת נתונים',
    templateSectionHint:  'להעלאת נתונים מאקסל — הורד תחילה תבנית ריקה. היא כוללת גיליון "הוראות" מפורט ו-4 גיליונות עם הכותרות המדויקות ושורות דוגמה, כדי שתדע בדיוק באיזה פורמט למלא. לאחר המילוי — העלה דרך "ייבוא Excel".',
    downloadTemplate:     'הורד תבנית (Excel)',
    templateOk:           'תבנית ריקה הורדה בהצלחה — מלא אותה והעלה דרך "ייבוא Excel"',
  },

  history: {
    yearSummary: 'סיכום שנת',
    totalGross: 'סה"כ ברוטו',
    totalNet: 'סה"כ נטו',
    avgGross: 'ממוצע ברוטו חודשי',
    avgNet: 'ממוצע נטו חודשי',
    bonusesGross: 'סה"כ ברוטו מענקים',
    bonusesNet: 'סה"כ נטו מענקים',
    additionsGross: 'סה"כ תוספות קבועות', // WP10.7 — Σ רכיבי earnings שאינם 'base' + ש"נ + רכב, מ-snapshot שמור בלבד
    incomeChange: 'שינוי ברוטו',
    netChange: 'שינוי נטו',
    inflation: 'אינפלציה (%)',
    netToGross: 'יחס נטו/ברוטו',
    avgPosition: 'ממוצע אחוז משרה',
    unpaidHours: 'שעות ללא אישור',
    month: 'חודש',
    gross: 'ברוטו (משוער)',
    net: 'נטו (משוער)',
    actualGross: 'ברוטו (בפועל)',
    actualNet: 'נטו (בפועל)',
    overtime: 'שעות נוספות',
    noMonths: 'אין חודשים מתועדים בשנה זו.',
    updateInflation: 'עדכן',

    // WP10.6 — סיכומי שנה ידניים (שנים היסטוריות ללא חודשים מתועדים)
    badgeDerived: 'מחושב מחודשים',
    badgeManual: 'ידני',
    addManualYear: 'הוסף שנה היסטורית',
    editManualYear: 'עריכה',
    deleteManualYear: 'מחיקה',
    deleteManualYearConfirm: 'למחוק את הסיכום הידני לשנה זו?',
    manualYearFormTitle: 'סיכום שנה ידני',
    manualYearField: 'שנה',
    monthsCount: 'מספר חודשים',
    notes: 'הערות',
    save: 'שמור',
    cancel: 'ביטול',
    emptyField: '—',
    manualYearExists: 'כבר קיים סיכום ידני לשנה זו',
    manualYearInvalid: 'יש להזין שנה תקינה (4 ספרות)',
  },

  general: {
    month:   'חודש',
    year:    'שנה',
    total:   'סה"כ',
    hours:   'שעות',
    amount:  'סכום',
    date:    'תאריך',
    loading: 'טוען...',
    empty:   'אין נתונים',
    error:   'שגיאה',
    confirm: 'אישור',
    close:   'סגור',
  },
};

/**
 * מנקה תוכן משתמש לפני הזרקה ל-innerHTML (מונע HTML injection)
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {number} amount @returns {string} */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount + 0);
}

/** @param {number} amount @returns {string} — WP10.10: קרן דולרית (USD, לא ₪) */
export function formatUsd(amount) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount + 0);
}

/** @param {string} isoDate @returns {string} */
export function formatDate(isoDate) {
  return new Intl.DateTimeFormat('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(isoDate));
}

/** @param {string} isoDate @returns {string} e.g. "14:30" */
export function formatTime(isoDate) {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(isoDate));
}
