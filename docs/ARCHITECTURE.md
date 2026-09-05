# Wedding Tales — מפת המערכת

> מסמך התמצאות. נכתב מתוך קריאה של הקוד עצמו (ספטמבר 2026), לא מהזיכרון.
> המספרים נמדדו: **246 קבצי `.js`/`.jsx` תחת `src`, ~62,300 שורות, 37 דפים, 59 נתיבי API, 81 קבצי טסטים.**
>
> המסמך הזה עונה על "מה יש כאן ואיפה". להסברים למה משהו נכתב כמו שנכתב —
> `AGENTS.md`, שהוא יומן ההחלטות והמלכודות.

---

## 1. מה המערכת עושה

אורח באירוע סורק QR, כותב ברכה ומצרף תמונה — בלי הורדת אפליקציה ובלי הרשמה.
בעל האירוע מעצב מזה ספר, צופה בו דיגיטלית, ומזמין הדפסה. סביב זה יושבות שתי
מערכות נוספות שלא קשורות למוצר עצמו: סוכן מכירות בוואטסאפ שמנהל את הלידים,
ומנוע מיילים לאוטומציות ללקוחות קיימים.

**שלוש קהילות משתמשים, שלוש רמות הרשאה:**

| מי | נכנס דרך | אימות |
|---|---|---|
| אורח | `/q/[code]` → `/wedding/[id]/photo` | אין — אנונימי בכוונה |
| בעל האירוע | `/my`, `/portal`, `/viewer` | Firebase Auth + קוקי `session` |
| סופר-אדמין | `/admin/*` | רשימת מיילים ב-`src/lib/superAdmin.js` |

---

## 2. הסטאק

- **Next.js 15 App Router** + React 18, `next dev --turbopack`
- **Tailwind v4** (`@tailwindcss/postcss`)
- **Firebase** — Firestore + Storage + Auth. שני מסלולים:
  לקוח (`firebaseClient.js`, כפוף ל-`firestore.rules`) ו-Admin SDK
  (`firebaseAdmin.js`, **עוקף את הכללים** — כל `/api/admin/*` עובד דרכו)
- **Vercel** — פריסה + שני crons
- **next-intl** — ארבע שפות: he, en, es, it. **אין סגמנטי `[locale]` בנתיב**:
  השפה שייכת למסמך האירוע ב-Firestore, וכל דף קורא אותה משם
- **vitest** — סוויטת טסטים של ספריות טהורות בלבד (ראו §11)
- ספריות משמעותיות: `html2canvas` + `jspdf` (ייצוא הספר), `react-pageflip`
  (הצפייה), `react-easy-crop`, `sharp`, `pdf-lib` + `pdfkit`, `opentype.js`

**Cron (`vercel.json`):**
```
08:00 → /api/cron/email                 קמפיינים ואוטומציות מייל
07:30 → /api/sales-agent/followups      מעקב לידים בוואטסאפ
```

---

## 3. מפת המסלולים

### קישורים קצרים — כל אחד קיים מסיבה ספציפית

| נתיב | מה זה |
|---|---|
| `/q/[code]` | **QR דינמי.** Route handler שמחזיר 302 אמיתי. ה-QR המודפס מצביע לכאן; לשנות יעד = לעדכן מסמך ב-`qrcodes/`. סופר סריקות. |
| `/w/[slug]` | דף נחיתה ממותג לאירוע — לשיתוף בוואטסאפ |
| `/g/[slug]?g=<guestId>` | קישור אישי לאורח; מקדים את שמו בטופס |
| `/b/[token]` | שיתוף הספר הדיגיטלי. **לא** רידיירקט — מגיש OG meta בעצמו, כי קראולר של וואטסאפ לא קורא `<head>` מתוך 3xx |

### דפי האורח
`/wedding/[weddingId]/photo` — טופס הברכה (~2,900 שורות, הקובץ המרכזי במוצר)
`/wedding/[weddingId]/thanks` · `/gallery` · `/edit/[entryId]`

### דפי בעל האירוע
`/my` — כל האירועים שלי · `/portal` (רפליקה 1:1 של אפליקציית המובייל, ארבעה טאבים)
`/viewer` — עורך הספר · `/book/[token]` — המהדורה הדיגיטלית · `/stats/[token]`
`/start` — אשף יצירת אירוע עצמאי (המסלול החינמי)

### סופר-אדמין
`/admin` — טבלת האירועים · `/admin/studio` — עיצוב הספר
`/admin/guest-design` — עיצוב דף הברכה · `/admin/emails` · `/admin/qrcodes`
`/admin/sales-leads` · `/admin/social-preview`
`/admin/wedding/[id]/picabook-export` · `/cover-print`

`src/app/middleware.js` חוסם `/admin`, `/viewer`, `/portal` בלי קוקי `session` תקף.

---

## 4. זרימת האורח, מקצה לקצה

```
QR → /q/abc123 → 302 → /wedding/<id>/photo
                          ↓
  buildGuestPageTheme()  בוחר פריסה: moment | classic | poker | framed
                          ↓
  react-easy-crop → browser-image-compression → offlineQueue (IndexedDB)
                          ↓
  uploadEntry.js → Storage `weddings/<id>/<file>` + doc `weddings/<id>/entries/<eid>`
                          ↓
  mySubmissions.js שומר מקומית → האורח יכול לחזור ולערוך
  notify-blessing → פוש לבעל האירוע · log-event → `scans/`
```

**התור האופליין הוא לא קישוט.** אולמות זה סביבת רשת גרועה; `offlineQueue.js`
שומר ברכה ב-IndexedDB ו-`uploadEntry.js` משגר אותה כשיש קליטה.

---

## 5. מודל הנתונים

```
weddings/{wid}
├─ זהות:      ownerId, ownerEmail, ownerName, ownerPhone, phoneNormalized, slug
├─ אירוע:     eventType, themeColor, weddingDate, celebrantName, age, locale
├─ עיצוב:     designVariant, guestDesign, bookDesign, coverDesign
├─ טקסטים:    custom{Title,Subtitle,Description}, customMoment* (×9), customName*/Blessing*
├─ תפעול:     productionStatus, blessingMaxChars, noPhotoCrop, adminNotes
├─ מסחר:      orderId, amountPaid, currency, printOrder
├─ גישה:      digitalTokens[], digitalTokensIssuedAt[], statsTokens
├─ entries/{eid}   ← הברכות. name, blessing, imageUrl, imgAspect,
│                     photoPosition, photoRotation, pageStyle, preserveLineBreaks
├─ guests/{gid}    ← רשימת מוזמנים (שם, טלפון, קבוצה, invitedAt)
└─ scans/{sid}     ← אנליטיקס משפך. כתיבה מהשרת בלבד
```

**אוספים ברמת השורש:**
`qrcodes` · `ordersRaw` · `ordersLocks` (אידמפוטנטיות מול Lulu) ·
`studio_presets` · `studio_photo_frames` · `studio_config` · `site_config` ·
`sales_leads` · `sales_agent_settings` (+`_history`) · `sales_variables` (+`_uploads`,
ושם תת-אוסף `versions/` לגרסאות של כל משתנה) · `emailLog` (דה-דופליקציה של מיילים)

### כללי האבטחה — העיקרון
`firestore.rules` שומר רק על **הלקוח**. ה-Admin SDK עוקף אותו, ולכן כל מה
שצריך להיות מוגן פשוט לא ניתן להגעה מהדפדפן.

- `weddings/{wid}` — קריאה פתוחה (אין PII מעבר לשמות), עדכון רק לבעלים,
  יצירה ומחיקה **חסומות לגמרי**
- `entries` — קריאה ויצירה פתוחות (זו כל הפואנטה), **`update, delete: if false`**.
  לכן עריכה של ברכה עוברת ב-`/api/guest/update-entry` ומחיקה ב-`/api/entries/delete`
- `scans` — קריאה לבעלים בלבד, כתיבה חסומה, כדי שאי אפשר יהיה להזרים מדדים מזויפים

---

## 6. מנוע הספר — הלב של המוצר

### הצינור
```
entries[]
   ↓ expandBookPages()        פיצול לעמודים; ב-autoSplit תמונה מול ברכה
pages[]
   ↓ BookPageTemplate         רג'יסטרי עם switch אחד
   ↓ mergePageStyle()         דריסות ברמת עמוד בודד מעל עיצוב הספר
layout component
   ↓ html2canvas + jsPDF      PDF להדפסה
```

### `BookPageTemplate` — הרג'יסטרי
`resolveActiveTemplate(entry, styleSettings)` מנתב: עמוד עם תמונה מקבל את
התבנית הראשית, עמוד ברכה בלבד מקבל את `blessingTemplate`. אחר כך שורת switch:

`polaroid` · `scrapbook` · `notebook` · `collage` · `window` · ו-**classic**
כברירת מחדל (הפריסה הארוכה בתוך הקובץ עצמו). `duo` מטופל בנפרד.

### הספריות שמחזיקות את המתמטיקה
| קובץ | אחראי על |
|---|---|
| `bookPages.js` | הפיכת ברכות לרצף עמודים (`expandBookPages`) — כולל `padToSpread` ו-parity הכריכה |
| `bookPageIndex.js` | באיזה עמוד מודפס כל ברכה |
| `bookDesignSchema.js` | **מקור האמת היחיד** למה יש באובייקט עיצוב |
| `bookFormats.js` | פורמטים תואמי Lulu |
| `pageGeometry.js` | `pageScale` — המרת אחוזים לפיקסלים |
| `pageStyle.js` | דריסות ברמת עמוד + **נעיצה** |
| `fontFit.js` | כמה ברכה ארוכה מתכווצת |
| `photoSlot.js` | משבצת 4:3 מול מצב "אלבום" (בלי חיתוך) |
| `nineSlice.js` | הפיכת כל תמונה למסגרת — בלי דרישת שקיפות |
| `photoFrames.js` | מסגרות דקורטיביות מובנות |
| `entryPhoto.js` | החלפת תמונה בעמוד בודד |
| `coverPhotoBake.js` | הפיכת צילום לכריכה עם קצוות מתפוגגים |

### שתי מלכודות שכדאי לזכור
**נעיצה (`pageStyle`)** — עמוד שנערך פעם אחת בעורך העמוד מפסיק לעקוב אחרי
עיצוב הספר. זו המהות של הפיצ'ר וגם מצב הכשל הכי מבלבל שלו; לכן הפאנל מפרט
היום *אילו* עמודים נעוצים, לא רק כמה.

**`html2canvas` מגביל את ה-CSS.** לא כל מה שנראה טוב בדפדפן שורד את הייצוא —
`border-image`, למשל, לא. זו הסיבה ש-nine-slice מצויר כשמונה תגי `<img>`.

---

## 7. עיצוב דף הברכה לאורח

`guestPageTheme.js` הוא מקור האמת. `buildGuestPageTheme({ eventType, designVariant, guestDesign })`
מחזיר ערכת נושא **ואת הדגלים שקובעים איזו פריסה רצה**:

- **moment** — ברירת המחדל לרוב האירועים. בונה את הסגנונות שלה inline
- **classic** — מונע-ערכת-נושא (רומנטי, פוקר)
- **framed** — `night` (זכוכית ונוף לילי) ו-`dawn` (הכותל). **מתעלמים מפלטת הצבעים בכוונה**:
  אלה עיצובים שלמים — צילום, פריסה, טיפוגרפיה — והחלה חלקית של פלטה תמחק כותרת על רקע כהה

**ההתאמה למעמד האקרילי** (`framedPanel.js`) — הפיצ'ר הכי לא-טריוויאלי בדף:
הטופס ממוקם דינמית על הלוח שצבוע *בתוך הצילום*. `panelRect()` מחזיר את
מלבן הלוח **ואת החיתוך שלו עם החלון** (`rect.visible`), ו-`fitScale()` מחשב
כמה להקטין. בלנדסקייפ שני המלבנים שונים לגמרי — וזה בדיוק המקרה שבדיקה
שמאמתת רק "בתוך המסגרת" עוברת בו בזמן שהמשתמש רואה טופס חתוך.

---

## 8. הסטודיו והאדמין

**`/admin`** — טבלת האירועים. `adminEventsView.js` מחזיק את חיפוש/סינון/דחיפות
(אירוע בשבועיים הקרובים נצבע; אירוע בלי תאריך נצבע אחרת).

**`/admin/studio`** — עיצוב הספר: פריסטים, תבניות, מסגרות, רקעים.
מוטציות עוברות ב-`POST /api/studio` עם `op` (`savePreset`, `deletePreset`,
`hideBackground`, `deleteUploadedPhotoFrame`…) דרך ה-Admin SDK.

**`/admin/guest-design`** — עיצוב דף הברכה, עם תצוגה חיה ב-iframe.
הפריסטים המובנים הם משני סוגים שונים לגמרי: פלטות (`design`) מול עיצובים
שלמים (`variant`). התצוגה של עיצוב ממוסגר עוברת ב-`?dv=`, של פלטה ב-`?gd=`.

**`/api/admin/weddings`** — GET מחזיר את כל האירועים, PATCH מעדכן לפי
allow-list. השניים חייבים להישאר סימטריים: מפתח שה-PATCH מקבל וה-GET לא
מחזיר יוצר מסך שעורך ברירת מחדל ריקה ואז כותב אותה על הנתון האמיתי.
`tests/adminWeddingsShape.test.js` נועל את זה.

---

## 9. סוכן המכירות בוואטסאפ

מערכת עצמאית לגמרי, ~40 מודולים תחת `src/lib/salesAgent/` ו-40 קבצי טסטים —
בערך **מחצית מסוויטת הטסטים של הפרויקט**.

**הארכיטקטורה:** Make.com הוא צינור טיפש. כל ההיגיון כאן.
```
WhatsApp Cloud → Make → POST /api/sales-agent/reply { phone, text }
                     ← { send: [...], notifyOwner, stage, handoff }
```
הסיבה מתועדת בקוד: שיחה שלמה עולה ~3 פעולות Make במקום תריסר (החשבון על
תוכנית חינם), המחירים חיים בקובץ מגורסן ולא בתוך מודול ויזואלי, וההיגיון
יושב ליד ה-Firestore שכבר יודע מי לקוח.

**מדיניות הכשל, שכתובה במפורש:** כל מסלול לא צפוי מסתיים ב-handoff לאדם —
אף פעם לא בשתיקה ואף פעם לא בתשובה מומצאת. *"לקוח שממתין לאדם ניתן להצלה;
לקוח שקיבל מחיר שגוי לא."*

**המודולים המרכזיים:**
`catalog.js` — מקור האמת לכל עובדה שהבוט רשאי לומר · `prompt.js` בונה ממנו
את הפרומפט · `decisionPolicy.js` — **המודל מנסח, אבל לא מחליט מה הצעד הבא** ·
`leads.js`/`leadsCore.js` — CRM, מסמך לטלפון · `followupPolicy.js` — מתי לרדוף
וכמה · `sweep.js` — "אף אחד לא נופל בין הכיסאות" · `circuitBreaker.js` —
מנתק את Anthropic בכשל · `mediaGuard.js` — הרשת מתחת ל"אשמח להראות לך" ·
`experiments.js` + כל משפחת `opening*` — למידה מה עובד · `digest.js` — ההודעה הבוקר.

**כלל 24 השעות** מעצב הכל: מטא מרשה הודעה חופשית רק בתוך 24 שעות מההודעה
האחרונה של הלקוח. לכן כל פריט מעקב נושא `withinWindow`, ומחוץ לחלון נשלחת
תבנית מאושרת (`wt_followup`) במקום טקסט חופשי.

---

## 10. מיילים, הדפסה ורשתות

**`emailEngine.js`** (שרת בלבד) — קמפיינים מתוזמנים ואוטומציות יחסיות-לאירוע
("שבוע לפני", "יום אחרי"), עם `emailLog` לדה-דופליקציה כדי שהרצה חוזרת לא
תשלח פעמיים. `/api/cron/email` מריץ יומית ב-08:00.

**הדפסה — שני ספקים, אחד פעיל:**
- **Picabook** — הזרימה בפועל. ייצוא מ-`/admin/wedding/[id]/picabook-export`,
  ואז העלאה ידנית למערכת שלהם
- **Lulu** — מחווט מלא (`/api/lulu/*`, `bookFormats.js`, `ordersLocks`)
  אבל לא בשימוש. ההחלטה נשארה Picabook

**`src/lib/social/`** — צינור לייצור פוסטים: `contentPlan` (מה לפרסם ולמה
דווקא את זה) · `scenes` (במה התמונה עוסקת, כבימוי ולא כתיאור) ·
`imagePrompt` · `brandRefs`. תצוגה ב-`/admin/social-preview`.

---

## 11. טסטים — מה מכוסה ומה לא

81 קבצים, `include: ['tests/**/*.{test,spec}.{js,mjs}']`, אליאס `@` → `src`.

**המגבלה המבנית:** הסוויטה רצה ב-node בלי jsdom ובלי React Testing Library.
כלומר **אפשר לבדוק רק ספריות טהורות** — כל לוגיקה שחיה בתוך קומפוננטה אינה
בת-בדיקה כאן. זה מסביר למה כל כך הרבה חישוב חולץ ל-`src/lib`: `fontFit`,
`framedPanel`, `nineSlice`, `pageStyle`, `adminEventsView`, `leadsView`,
`decisionPolicy`. **חילוץ לספרייה הוא הדרך היחידה לבדוק משהו כאן.**

שני טסטים חורגים מהדפוס בכוונה ובודקים **טקסט מקור**, כי האינווריאנטה עצמה
היא ברמת המקור: `framedEntrance` (אלמנט שממוקם ב-transform לא לובש אנימציה
שנוגעת ב-transform) ו-`adminWeddingsShape` (מפתח שנכתב חייב להיות ניתן לקריאה).

---

## 12. חוב ידוע

**~2,950 שורות קוד מת — נמחקו (ספטמבר 2026).** אחת-עשרה קומפוננטות פריסה,
`PageLayouts.jsx`, `SmartImg`, `lib/ogCard.jsx`, `lib/apiClient.js`,
`lib/unitUtils.js` — אף קובץ לא ייבא אותם. יחד איתם ירדו ארבע חבילות npm
שאף שורה לא השתמשה בהן: `pdf-lib`, `@pdf-lib/fontkit`, `get-stream`,
`react-draggable`.

**המלכודת ששווה לזכור מהניקוי הזה:** חיפוש טקסט סימן גם את `html2canvas`,
`jspdf` ו-`jszip` כלא-בשימוש — והן הליבה של ייצוא הספר. הן מיובאות
**דינמית** (`await import('html2canvas')`) בדיוק כדי שצפייה רגילה לא תשלם
עליהן. אותו דבר בנכסים: `` `/app-screenshots/${s.id}-lg.webp` `` נראה
כקובץ שאף אחד לא מזכיר. **בפרויקט הזה קוד מת וקוד שנטען דינמית נראים זהים
לחיפוש טקסט** — כל מחיקה חייבת אימות ידני.

**מה שנשאר, ודורש החלטה שלך ולא של הקוד:** כ-62MB ב-`public/imgs/`
(`img9`–`img22` ו-`Cover img.jpg`; רק `img1`–`img8` בשימוש, בדף `/demo`),
וספריות `.jpg` ישנות ב-`portfolio/` שהוחלפו ב-`.webp`. הרקעים ב-
`/backgrounds/` **אינם** מועמדים למחיקה: הם נבחרים בזמן ריצה מ-Firestore,
כך שקובץ שלא מוזכר בקוד עדיין יכול להיות הרקע של אירוע חי.

**סביבת הפיתוח.** הריפו יושב תחת OneDrive, ש**לא מרשה `unlink`**. לכן git
משאיר קבצי `.lock` אחרי כמעט כל פעולה, `lint-staged` נכשל, והאריזה של
`.git` לא מצליחה. פתרון בטרמינל:
```powershell
Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
Remove-Item .git\objects\*\tmp_obj_* -Force -ErrorAction SilentlyContinue
Remove-Item .git\objects\pack\tmp_pack_* -Force -ErrorAction SilentlyContinue
```

**סוף שורה.** חלק מהקבצים ב-CRLF וחלק ב-LF, מה שמייצר דיפים ענקיים על
קבצים שלא נגעו בהם. שווה `.gitattributes` שיכריע.

---

## 13. איפה מתחילים לחפש

| השאלה | הקובץ |
|---|---|
| איך נראה דף הברכה | `src/lib/guestPageTheme.js` ואז `app/wedding/[weddingId]/photo/page.js` |
| למה עמוד בספר נראה ככה | `components/BookPageTemplate/BookPageTemplate.jsx` |
| למה עמוד אחד לא משתנה | `src/lib/pageStyle.js` — הוא נעוץ |
| מה נשמר על אירוע | `ALLOWED` ב-`api/admin/weddings/route.js` |
| מה הבוט רשאי להגיד | `src/lib/salesAgent/catalog.js` |
| מה הבוט יעשה עכשיו | `src/lib/salesAgent/decisionPolicy.js` |
| למה משהו נכתב ככה | `AGENTS.md` |
