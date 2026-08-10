# Wedding Tales — agent handover

Read this before touching anything under `src/lib/salesAgent/` or
`src/lib/social/`. It is the state of a long build, written down so the
next session does not start from zero.

The commit messages in this repo are unusually long on purpose. They
explain *why* a thing is the way it is, including several decisions that
look wrong until you know what broke. `git log --oneline -15` then read
the ones that touch what you are about to change.

---

## The WhatsApp sales agent — shipped and live

A Claude-powered salesperson that answers WhatsApp on the business
number, qualifies, sends the demo and payment links, follows up, and
hands over to Lord when it should not answer.

**Shape.** Make is a dumb pipe; all logic is in this repo.
WhatsApp Cloud (Watch Events) → Make → `POST /api/sales-agent/reply` →
`{ sendText, sendImage, notifyOwner }` → Make sends it back.
Make scenario `9630287` on eu2.make.com, **Active**.

**Files.**
- `catalog.js` — the ONLY facts the agent may state. Prices, links,
  photos. Change a price here and the bot changes.
- `prompt.js` — assembles the system prompt from catalog + journey +
  experiment arm + what the CRM knows about this lead.
- `journey.js` — a written brief per funnel stage. Only the CURRENT
  stage is injected. This is the file to edit when a conversation goes
  badly; it is fixable the same afternoon, unlike the A/B test.
- `experiments.js` — four opening variants, assigned by phone hash.
  Refuses to name a winner until both leading arms clear 30 leads AND
  the gap beats the noise. Do not weaken that.
- `agent.js` — model call, JSON parsing that fails toward handoff, and
  `sanitizeReply()` which strips em dashes, markdown and surplus emoji.
- `leadsCore.js` — the PURE half of the CRM. Anything testable lives
  here, because `leads.js` boots firebase-admin and cannot be imported
  by a test.
- `leads.js` — Firestore `sales_leads/{phone}`.
- `digest.js` — the morning summary.

**Three ways the bot shuts up.** A human replying in the chat (detected
via Meta's echo, told apart from our own sends by comparing text to the
last assistant turn), an existing customer writing in, and the owner
muting it from his phone. All in `reply/route.js`, in that order, before
the model is ever called.

**Spend is metered here, not read from a dashboard.** `pricing.js` holds
the published rates; every model call is costed from the `usage` block it
returned and rolled into `sales_usage/{date}` plus a `_totals` document.
That buys cost per lead and cost per closed deal, which no provider
dashboard can give. Two things it is not, both said on screen: it counts
only what this app spends since counting began, and the rates are
hardcoded, so a price change makes it wrong until someone edits the file.
`RATES_CHECKED_ON` is the honesty marker.

**Follow-ups chase on a widening ladder, not a timer.** `followupPolicy.js`
owns every timing decision: 1 / 3 / 7 days, floors per stage so a fresh
quote gets air, scaled by how close the event is, and stopped dead once
the event has passed. Three attempts, the last one explicitly written as
a goodbye rather than a nudge. Quiet hours are Israel's: nothing before
09:00 or after 21:00, nothing Friday afternoon, nothing on Saturday at
all. `/api/sales-agent/followups` composes them; something external has
to call it. Outside Meta's 24h window only an approved TEMPLATE can be
sent - `withinWindow` on each item says which case it is, and ignoring
that is why follow-up automations appear to work and then silently stop.

**Admin.** `/admin/sales-leads` — triage strip, transcript, per-lead
actions, the experiment panel, and a button that sweeps the synthetic
`9725000009xx` test leads.

**Owner commands** from Lord's own number (needs `SALES_AGENT_OWNER_PHONE`):
`שקט <phone>`, `בוט <phone>`, `סטטוס <phone>`, `דוח`.

**Make sends broken JSON, and that is handled here.** The HTTP module
builds the body by interpolating values into a raw string, so a newline
or a quote in a customer's message makes it stop being JSON. That cost a
real lead on 8 August: two-line message, 400, no reply, no alert.
`inbound.js` repairs it by finding the known keys and taking the values
between them verbatim. The tidier fix is `toJSON()` in Make, still not
applied because it cannot be verified without a live message and it
fails loudly in the wrong direction. If it is ever applied, `inbound.js`
costs nothing - valid JSON never reaches the repair path.

**Env:** `ANTHROPIC_API_KEY`, `SALES_AGENT_SECRET`, `SALES_AGENT_OWNER_PHONE`,
`CRON_SECRET`, `OPENAI_API_KEY`, optional `OPENAI_IMAGE_MODEL`. Secrets are Lord's to enter — do not type them into forms.

**Open:** the daily digest push needs a WhatsApp template `wt_daily_digest`
(UTILITY, Hebrew, 4 single-line variables) because free-form business-
initiated messages die outside Meta's 24h window. `דוח` works today
without it. The same window limit applies to the handoff alerts.

---

## Social — in progress, NOT wired to any account

Nothing has ever been published. Instagram is `weddingtales.il`.

- `social/contentPlan.js` — six post angles on a deterministic rotation,
  each paired with a photo of a book we actually printed. **Done, tested.**
- `social/compose.js` — programmatic Hebrew overlay via satori + sharp.
  **Working, but Lord has asked to drop this approach**: he wants the
  image model to produce the picture with the caption baked in.
- `social/imagePrompt.js` — builds the request to gpt-image-1. Refuses
  to ask for a caption it expects to come back broken (too long, mixed
  script, digits, more than one line) and asks for a wordless picture
  instead. **Done, tested.**
- `/admin/social-preview` + `/api/social/preview` — the four test
  renders, one per request because four in a single serverless
  invocation times out and returns nothing at all. **Built, never run**:
  it needs `OPENAI_API_KEY` in Vercel, which is Lord's to add.

**Before deleting compose.js, know what it cost to learn.** Satori does
not implement the Unicode bidi algorithm, so Hebrew rendered fully
reversed until `toVisualOrder()` was added; the Latin wordmark rendered
as empty boxes until a Latin font subset was registered under its own
family name. Multi-line RTL headlines still wrap in the wrong order
(wrap first in logical order, then reorder per line — not done). If the
image model turns out to mangle Hebrew, this file is the fallback and
those three lessons are why it works.

**Next:** open `/admin/social-preview`, press the button, look at the
four pictures. If the Hebrew is clean the caption stays inside the
image; if it breaks, the caption moves under the picture and the images
go out wordless. That one look decides the architecture and nothing
after it should be built before it. Then: caption writing, an approval
queue (he approves before publish — agreed, at least for the first
month), and a Make scenario publishing via Make's own approved IG/FB
connectors, so no Meta App Review is needed.

---

## Working in this repo

`.git/index.lock` gets orphaned because the Cowork bridge cannot delete
files. Any plain `git` command through `device_bash` leaves one behind
and blocks VS Code. Always set `GIT_INDEX_FILE` to a path in `/tmp`, and
write `.git/refs/heads/main` directly instead of `git commit`.

Tests: `npx vitest run tests/`. The sales agent and social suites are
pure by design — keep them that way.

## שלא ייפול בין הכיסאות (sweep.js)

הסולם ב-`followupPolicy.js` מטפל רק בליד שיש לו `followUpAt`. הבעיה
האמיתית היא ליד שאיבד את השדה הזה: כתיבה שנכשלה אחרי שהתשובה כבר
יצאה, סטטוס שנערך ידנית בטבלה, או handoff שפג. אף אחד מהם לא זורק
שגיאה, ואף אחד מהם לא מופיע בשום לוג — והתוצאה תמיד זהה: מישהו שאל
על ספר ברכות ולא שמע יותר כלום.

`src/lib/salesAgent/sweep.js` מפריד שני מקרים שדורשים טיפול הפוך:

- **orphan** — ליד חי בלי צעד הבא, לא מסומן human, פחות מ-3 ניסיונות,
  והמגע האחרון לפני יותר מ-36 שעות. חוזר לסולם אוטומטית
  (`reviveOrphans` ב-`leads.js` כותב `followUpAt: today` + `revivedCount`).
- **stale handoff** — מישהו סימן שצריך בן אדם, וה-48 שעות עברו. הבוט
  **לא** ממשיך את אלה לעולם. הן עולות ל-Lord כרשימה (`handoffAlert`),
  כי handoff קורה כשמישהו כועס או ביקש אדם, ובוט שמחכה יומיים ואז חוזר
  לשיחה בעליזות גרוע מבוט שלא העביר מלכתחילה.

`revivedCount` שווה מבט מדי פעם: אם אותם לידים ניצלים שבוע אחרי שבוע,
משהו למעלה מפיל כתיבות ורק המונה הזה יראה את זה.

### הריצה היומית

`/api/sales-agent/followups` עושה עכשיו שלושה דברים בסדר הזה: sweep
(מחזיר orphans לתור באותה ריצה), chase (כותב פולו-אפ אמיתי לכל מי
שבתור), escalate (מחזיר `alert` ל-Lord על handoffs תקועים, ו-`null`
ביום נקי — התראה שמגיעה כל בוקר עם 0 היא התראה שמפסיקים לקרוא).

מכבד את `sendableNow()`: בשבת ומחוץ ל-09:00–21:00 הראוט מחזיר
`{ok:true, skipped:'shabbat'}` ולא שולח כלום. הלידים נשארים due כי
`dueFollowUps` משווה ב-`<=`, אז שבת מדולגת הופכת לשליחה בראשון בבוקר.

מי קורא לזה: Vercel cron ב-`vercel.json`, `30 7 * * *` UTC = 10:30
שעון קיץ / 09:30 שעון חורף. עד עכשיו המנוע היה קיים ואף אחד לא קרא לו,
וזה היה הפער האמיתי.

`?dry=1` מרכיב הכל בלי לסמן כלום כנשלח ובלי להחיות אף ליד, ומתעלם
משעות שקטות — הנקודה שלו היא להסתכל.

## מה הוסר מהסופר-אדמין

Lord ביקש להעיף שלושה מסכים שלא היו רלוונטיים יותר:

- `/admin/landing` + `/api/admin/landing` — עורך דף הנחיתה השיווקי.
- `/admin/analytics` + `/api/admin/analytics` — "סטטיסטיקה חיה".
- `/admin/pipeline` — "לוח הפקה", ואיתו `/admin/board` (גרסה חדשה
  יותר של אותו לוח, שהייתה נגישה רק מקישור בתוך pipeline והייתה
  הופכת למסך יתום).

מה שנשאר וחשוב לדעת:

`site_config/landing` **עדיין נקרא** על ידי `/landing` הציבורי. הדף
ממשיך להיראות בדיוק כמו שהוא, עם מה שנשמר בפעם האחרונה — פשוט כבר אין
מסך שכותב לשם. שינוי בדף הנחיתה מעכשיו הוא שינוי בקוד.

`productionStatus` על מסמך wedding עדיין נכתב מעורך האירוע ב-`/admin`.
רק הלוח שהציג אותו נעלם, לא השדה.

`/api/admin/wedding-stats` ו-`/api/admin/stats-tokens` **נשארו** — הם
משרתים את פאנל האירוע הבודד ואת דף הסטטיסטיקה לזוג, לא את המסך שהוסר.

הקבצים לא נמחקו מהדיסק אלא הועברו ל-`_to_delete/` (ה-mount של OneDrive
חוסם unlink), והתיקייה ב-gitignore. מבחינת git הם מחוקים. אפשר למחוק
את התיקייה ביד.

### ונוסף

כפתור **תוכן לרשתות** בתפריט העליון → `/admin/social-preview`. המסך
מייצר את הפוסטים ומראה מה חזר; הוא לא מעלה לאינסטגרם בעצמו עדיין.

## הבוט: מחיר, מדיה, ולמידה

### "לורד" יצא ללקוחות
היה קשיח בשני מקומות — ההודעה שנשלחת ללקוח קיים, והשורה שמסבירה שאפשר
לקבל בן אדם. עכשיו `BUSINESS.ownerName` מ-`process.env.SALES_AGENT_OWNER_NAME`,
ובלי הגדרה נופל ל"מישהו מהצוות" / "הצוות". יש טסט שנכשל אם המילה חוזרת
לפרומפט.

### מחיר
הכלל של Lord: מי ששאל מחיר מקבל מחיר, בלי לקדם שאלות לפני. שלושה
שינויים:
1. `selling.js` — `SELLING_CRAFT`, המדריך שאומר את זה בפירוש, יחד עם
   קריאת מה שהצד השני באמת רוצה לשמוע, קידום השיחה, וסגירה.
2. שלב 0 ב"מהלך המכירה" בפרומפט, לפני כל שאר הסדר.
3. רשת ביטחון דטרמיניסטית: `priceDodged(incoming, messages)` בודק אם
   הלקוח שאל מחיר והתשובה חזרה בלי מספר, ואם כן `reply/route.js`
   מוסיף הודעה שנייה עם המחירים מהקטלוג. הפרומפט אומר את זה בארבעה
   מקומות ותחת לחץ המודל עדיין מתחמק, אז זה לא עוד פסקה.

### ספריית מדיה
`sales_media` ב-Firestore + `mediaLibrary.js` (טהור, נבדק). שש התמונות
ב-`catalog.js` נשארות כרצפה, וכל מה שמעלים מצטרף אליהן. המודל רואה
רשימה אחת ולא יודע מה מאיפה.

העלאה: הדפדפן מעלה ישירות ל-Firebase Storage תחת `sales-media/` ורק
ה-URL נשלח ל-API. סרטון 16MB דרך פונקציה של Vercel נתקל בתקרת 4.5MB
ונופל כ-413 אטום אחרי שהמשתמש כבר חיכה להעלאה כולה.

מגבלות וואטסאפ נאכפות בשלושה מקומות (UI, API, storage.rules): תמונה עד
5MB JPEG/PNG, סרטון עד 16MB MP4.

השדה `when` הוא היחיד שהמודל קורא כהוראה, ולכן הוא חובה — נכס בלי הסבר
מתי לשלוח אותו הוא נכס שלא נשלח או שנשלח לאדם הלא נכון.

סרטון מגיע ב-`sendVideo` / `sendVideoCaption` / `hasVideo` נפרדים,
כי זה מודול אחר בוואטסאפ. **צריך להוסיף מודול וידאו ב-Make** — עד אז
`hasVideo` פשוט תמיד false ושום דבר לא נשבר.

### מדידה
שני מונים על כל נכס: `replied` (הלקוח כתב בחזרה תוך 24 שעות משליחה)
ו-`won` (השיחה נסגרה בעסקה). ה-win מיוחס לכל מה שנשלח בשיחה, לא
לאחרון — last-touch כאן היה נותן את הקרדיט למה שנשלח הכי קרוב לקישור
התשלום.

מתחת ל-8 שליחות המסך מציג ספירה ומסרב להציג אחוז, ו-`performanceNote`
לא נכנס לפרומפט בכלל. אחוז מענה של 100% על שתי שליחות הוא המספר הכי
מטעה שדשבורד יכול להדפיס, וההחלטה שהוא מייצר — למחוק משהו שעבד — לא
הפיכה. גם כשיש מספיק, הניסוח לפרומפט הוא "זה מידע, לא הוראה", כי כלל
שגובר על רלוונטיות ישלח ספר חתונה למישהי ששואלת על בת מצווה.

### תוקן אגב
`isFinalAttempt` היה קיים ואף אחד לא העביר אותו — כל פולו-אפ שלישי
נכתב כעוד תזכורת במקום כפרידה.

### שלוש התמונות שהבוט שולח הכי הרבה

Lord שלח שלוש והן ראשונות ב-`MEDIA` — הסדר הוא משקל, המודל קורא מלמעלה:

- `upload_screen` — מסך העלאת הברכה בתוך טלפון. הנכס היחיד שמראה את
  המוצר מהצד של האורח, על מסך, שזה בדיוק איפה שהוא יפגוש אותו. עונה
  על "זה מסובך לאורחים?" / "צריך אפליקציה?".
- `cover_personalised` — כריכה אמיתית עם שם ותמונה. עונה על "זה באמת
  יהיה שלנו?" מהר יותר מכל משפט על התאמה אישית.
- `book_open_spread` — ספר פתוח. עונה על ההתלבטות שיושבת בדיוק בין
  החבילה הזולה לזו שמשלמת: "המודפס שווה את ההפרש?".

הפרומפט שונה במכוון לכיוון של **לשלוח יותר**. הנוסח הקודם אמר "תמונה
אחת מספיקה, שתיים זה כבר הרבה"; עכשיו הוא אומר ששתיים או שלוש במקומות
הנכונים זו שיחה טובה. עדיין אסור בהודעה הראשונה, ואסור אותה מדיה
פעמיים.

`tests/salesMediaFiles.test.js` הולך על כל URL ב-`MEDIA` ובודק שהקובץ
באמת קיים תחת `public/`. אף שלב אחר בשרשרת לא בודק את זה — המודל בוחר
מפתח, הראוט מעביר URL ל-Make, ווואטסאפ היא הראשונה שמסתכלת. קובץ חסר
מגיע ללקוח כהודעה בלי תמונה, בשקט. בדיוק זה קרה פעם עם ה-webp של
הסושיאל.

ושינוי קטן בלוגיקה: סטטיסטיקה מוצגת עכשיו לפי **אם יש נתונים**, לא לפי
מאיפה הנכס בא. המונים ממילא נכתבים לפי מפתח ולא אכפת להם אם הוא מהקוד
או מהעלאה, אז שלוש התמונות האלה נמדדות מהיום הראשון.

## מספרי עמודים בניהול ברכות

`src/lib/bookPageIndex.js` — מחשב לאיזה עמוד בספר המודפס כל ברכה נופלת,
ומציג את זה כתגית על הכרטיסייה ובשורת הסידור מחדש.

**למה זה לא טריוויאלי:** מיקום הכרטיסייה הוא לא מספר העמוד. ברכה ארוכה
עם תמונה מתפצלת לשני עמודים (`autoSplit` או `forceSplit` פר-ברכה),
`entriesPerPage: 2` דוחס שתי ברכות לעמוד אחד, `photoLayout: 'smart'`
ממזג שתי תמונות פורטרט, ו-`padToSpread` מכניס דפים ריקים שתופסים מספר
ולא שייכים לאף אחד. כרטיסייה 14 היא בקביעות עמוד 19.

**נגזר, לא נשמר.** כל גרירה וכל פיצול מזרימים מחדש את כל הספר. מספר
שמור היה הופך לשקר בטוח לכל ברכה שאחרי העריכה, תוך שנייה.

**איזו מוסכמת מספור.** `expandBookPages` מחזיר מערך מאונדקס-0 בלי
מספרים; המיקום *הוא* העמוד. מה שהופך את זה למספר לבן אדם היא מוסכמה,
ובקוד יש היום **שתיים**:

- `picabook-export` (הספר הריבועי 20×20 — המוצר בפועל) רץ על הברכות
  בסדר האדמין, עם `padToSpread: true, spreadOffset: 1`, ומקבץ קבצים
  `index + 1`. **זו המוסכמה שבחרתי**, ו-`PRINT_LAYOUT` בקובץ הוא בדיוק
  אותם דגלים.
- מסלול ה-PDF של Lulu ב-`/viewer` עושה `entries.reverse()` לפני
  ההרחבה, ואז מרנדר לפי סדר המערך. כלומר עמוד 1 שלו הוא **הברכה
  האחרונה** בסדר האדמין — הפוך מ-Picabook.

⚠️ **זה אומר ששני מסלולי ההדפסה מייצרים את הספר בסדר הפוך זה מזה.**
לא נגעתי בזה כי זו שאלה על המוצר ולא באג של מודול אחד, אבל צריך
להכריע: או ש-Lulu מדפיס הפוך, או שהוא בכוונה מוגש הפוך בגלל כריכה RTL.
עד שזה יוכרע, התגית אומרת את המספר של Picabook.

יש טסט שקורא את הקוד של `picabook-export` ומוודא שהוא עדיין קורא ל-
`expandBookPages` עם אותם דגלים. הערה בסגנון "שמרו על סנכרון" היא לא
מנגנון; זה כן.

**מוצג לסופר-אדמין בלבד** (`adminUser`). המספרים זזים בכל סידור מחדש,
ומספר שרץ מול הזוג מזמין "תעבירו את אמא לעמוד 5" לספר שעוד לא עוצב.

## דריסות עיצוב פר-עמוד

`src/lib/pageStyle.js` + `entry.pageStyle` ב-Firestore. עמוד בודד יכול
לחלוק על עיצוב הספר: ריווח תמונה, גודל, חיתוך, מסגרת, רקע, ריפוד,
טיפוגרפיה.

**הדריסה דלילה.** היא מחזיקה רק את המפתחות שנעלו במפורש, וכל השאר ממשיך
לרשת. זה מה שהופך את זה לבטוח: החלפת פריסט עדיין מעצבת מחדש כל עמוד,
כולל עמודים עם דריסות, בכל ציר שלא ננעל ידנית. בלי זה, "תיקנתי עמוד
אחד" היה הופך ל"העמוד הזה קפא ב-2026".

**מה אסור לדרוס:** `autoSplit`, `splitThreshold`, `entriesPerPage`,
`photoLayout`. הם מחליטים אילו עמודים *קיימים*, ונצרכים על ידי
`expandBookPages` הרבה לפני שנבנה אובייקט עמוד. דריסה שלהם היא מעגלית —
העמוד שמבקש להתחלק אחרת לא קיים עד שהחלוקה כבר רצה. חסומים ברשימה
לבנה, לא בתיעוד, ויש טסט שנכשל אם מישהו יוסיף אותם.

**נקודת המיזוג אחת:** `BookPageTemplate` בשורה הראשונה. כל 12 מקומות
הרינדור — הפליפבוק, המהדורה הדיגיטלית, שלושת ייצואי ה-PDF, ייצוא
Picabook, התצוגה בדף התודה — עוברים דרך הקומפוננטה הזאת. מיזוג אחד שם
הוא ההבדל בין שהעבודה של Lord תופיע בכל מקום לבין שתופיע במסכים שמישהו
זכר לתקן.

הסדר קריטי: המיזוג רץ **אחרי** הרזולוציה של הקורא (כולל
`withNoCropOverride`) ו**לפני** `resolvePhotoStyle`. זה מה שמאפשר לעמוד
אחד לחתוך בתוך ספר במצב אלבום — ההוראה הספציפית יותר מנצחת.

**הכתיבה דרך שרת** (`/api/entries/page-style`), כי
`firestore.rules` אוסר `update` על entries. שים לב: יש בקוד קריאות
`updateDoc` מהלקוח ל-entries (מיסגור תמונה, `forceSplit`) שאמורות
להיחסם לפי הקובץ הזה. או שהחוקים בפרודקשן שונים מהריפו, או שהן נכשלות
בשקט. **שווה בדיקה.**

**ה-UI** ב-`/wedding/[weddingId]/viewer` מתחת לרייל העיצוב הגלובלי,
סופר-אדמין בלבד. כל פקד מתחיל *בירושה* ומציג את הערך של הספר; ברגע
שמזיזים אותו הוא נעול, אומר את זה, ויש דרך חזרה — פר-פקד ולגמרי. תצוגה
מקדימה חיה מרנדרת את ה-`BookPageTemplate` האמיתי עם הסגנון הממוזג
האמיתי, כי כל דבר פחות מזה זה לעצב מול קירוב ולגלות אצל המדפיס.

`bookPages.js` בונה את עמוד התמונה של פיצול שדה-שדה, אז `pageStyle`
נוסף שם במפורש. בלי השורה הזאת פיצול עמוד היה מוחק בשקט את העבודה
בדיוק על החצי שכיווננו.

## ביקורת השיחות האמיתיות (11.8) ומה תוקן בעקבותיה

נקראו: מאיה (נסגרה על מודפס), חני (מוכן לשלם), Hasid (נפסל בצדק —
אירוע בלי סמארטפונים), שירלי (מהיום). הכתיבה עצמה טובה — מחיר ניתן
מיד כששאלו, עברית טבעית, פסילה מכובדת. שלוש תקלות התנהגות חזרו:

1. **הצעה להראות בלי לשלוח.** שירלי ביקשה את הסרטון מהמודעה; הבוט ענה
   "יש לי תמונות של ספרים אמיתיים, אשמח להראות לך" — עם image: null.
   72 קריאות מודל, אפס תמונות. זו אותה פתולוגיה של התחמקות מהמחיר:
   המודל מספר על היכולת במקום להשתמש בה. תוקן ב-`mediaGuard.js` —
   רשת דטרמיניסטית: לקוח ביקש לראות או שהבוט הבטיח להראות ⇒ מוצמדת
   התמונה הנכונה לפי סוג האירוע והשאלה. וידאו לעולם לא נבחר אוטומטית.
2. **חזרתיות.** חני קיבל את קישור התשלום שלוש פעמים, ו"איך קוראים לבן
   המצווה?" פעמיים בלי מענה. נוספו כללי אל-תחזור ל-CONVERSATION_CRAFT.
3. **באג הפרסר** (תוקן בקומיט הקודם): מפתח מדיה שהועלה נפסל מול ששת
   הקבועים.

מודול התמונה ב-Make קיים (מודול 10, פילטר "הסוכן ביקש תמונה") — הצנרת
לא הופעלה מעולם כי המודל לא בחר. עם ה-guard זה אמור להישלח בפועל;
לוודא בשיחה הבאה.

### פולו-אפים — גילוי חשוב

ה-cron של Vercel קרא לראוט שמרכיב הודעות, **מסמן אותן כנשלחו, ומחזיר
JSON לקורא שאין לו ידיים**. Vercel cron לא שולח וואטסאפ. אילו
CRON_SECRET היה מוגדר, כל בוקר היו "נשלחים" עד 25 פולו-אפים לשום מקום.
זה שהיו 26 ממתינים זה מה שחשף את זה — ה-cron קיבל 401 כי הסוד לא הוגדר.

תוקן: הראוט מזהה מי הקורא. Make (סוד משותף) — כמו קודם, הקורא שולח.
אחרת, אם מוגדרים `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` — הראוט שולח
בעצמו (`whatsapp.js`, Graph API): טקסט + תמונה בתוך חלון 24ש; מחוץ
לחלון השליחה נכשלת, הליד נשאר due, והשגיאה על ה-item. בלי אף אחד
מהשניים — מרכיב בלבד, לא מסמן כלום, ומחזיר `delivery: 'none'` עם
אזהרה. שקר על משלוח הוא הדבר היחיד שאסור.

**מה Lord צריך להגדיר ב-Vercel:** `CRON_SECRET` (כל מחרוזת),
`WHATSAPP_TOKEN` (טוקן קבוע של system user מ-Meta Business),
`WHATSAPP_PHONE_ID` (המזהה של 972515350253). ואז ה-cron של 10:30
באמת שולח.

**הסרטון מהמודעה:** לקוחות מבקשים אותו בשם. להעלות אותו למסך המדיה
(עד 16MB MP4) + מודול וידאו ב-Make, ואז הבוט יוכל לענות עליו במקום
להתנצל.

## סטטוס תפעולי (10.8) — וואטסאפ, סביבה, והתקרית

**סביבה ב-Vercel:** `CRON_SECRET` (הערך שהוגדר שונה מהמחרוזת שנשלחה
בצ'אט — לא קריטי, ה-cron של Vercel מזריק אותו בעצמו), `WHATSAPP_PHONE_ID=1158941773964795`,
`WHATSAPP_TOKEN` (system user "WeddingTales", אפליקציית **WT Sales
Messaging** שנוצרה היום עם use case של WhatsApp, טוקן ללא תפוגה,
הרשאות messaging+management, ה-WABA "בר מספר הברכות" משויך). אומת:
`whatsappConfigured: true`.

**מגבלת חשבון ב-Meta מאז 24.5:** "החשבון הושבת כי האתר הרשום לא
נמצא" — למרות שהאתר חי. עודכן פרופיל העסק (אתר:
app.weddingtales.co.il/lp, כתובת מלאה) והוגש ערעור. עד להסרה: אין
פתיחת שיחות יזומות. שיחות נכנסות דרך Make ממשיכות לעבוד בפועל.

**תקרית ה-dry run (מתועדת גם בקומיט f508170):** ההרצה רצה על הקוד
שלפני התיקון ושלחה בפועל דרך ה-API. Meta החזירה 200 על כל 25 (ה-API
אסינכרוני — קבלה ≠ מסירה). 24 מתוך 25 היו מחוץ לחלון 24ש ולכן ייכשלו
במסירה ולא יגיעו לאף לקוח. אחת — Kateryna Curiel — הייתה בתוך החלון
וכנראה קיבלה את הפולו-אפ ("היי, רק רציתי לבדוק אם הספקת לראות את
הדמו..."). טקסט לגיטימי; הסיכון היחיד: היא לא סומנה (בגלל שאר שערי
ה-dry) ולכן ה-followUpAt שלה הוזז ידנית ל-12.8 כדי למנוע כפילות מחר.
ההודעה גם לא כתובה ב-turns שלה — אם תענה, הבוט לא יזכור שהוא שלח.

**ריצה מלאה של 25 לידים ארכה 28.5 דקות** על הקוד ללא timeout — כל
שליחה מחוץ לחלון כנראה נתלתה דקות. עם ה-timeout של 15ש בקוד הנוכחי
הריצה חסומה ב~2-3 דקות. `maxDuration: 60` בראוט לא נאכף בפועל (Fluid).

**מה נשאר לבוט:**
- ברגע שהמגבלה תוסר: להריץ פולו-אפים (26 ממתינים, dry קודם), ולבדוק
  שליחת תמונה בשיחה חיה (mediaGuard פרוס אך טרם נצפה בפעולה).
- תבנית `wt_followup` (MARKETING) — תנאי לפולו-אפים מחוץ לחלון 24ש.
  חסום עד הסרת המגבלה.
- סרטון המודעה מפייסבוק: להעלות למסך המדיה + מודול וידאו ב-Make.
- טסט תגובות אינסטגרם (Advanced Access) — פתוח מהשבוע שעבר.


## פתיחות מגוונות (סבב משוב שני של Lord)

הזרועות ב-`experiments.js` הוחלפו בשבע גישות שונות באמת, לפי הבקשה
המפורשת שלו: קצר-ושאלה, דמו מיד, **דוגמה אישית מתמונה** ("שלחי תמונה
ואכין דוגמה"), **הצעת שיחה** ("מתי נוח שנדבר?"), **העוזר האישי**,
**תמונות קודם** (תמונה כבר בהודעה הראשונה — ההנחיה גוברת על האיסור
הכללי), ומחיר מראש. `value_then_ask` הוסרה. שבע זרועות לומדות לאט
מארבע — הוא בחר רוחב על פני מהירות במודע.

שתי זרועות מסתיימות ב-handoff בכוונה (דוגמה מתמונה, קביעת שיחה):
את הדוגמה ואת השיחה עושה בן אדם. תפקיד הבוט להשיג את הכן ולהעביר.

⚠️ פער ידוע: הודעת מדיה נכנסת (תמונה מהלקוח) מגיעה מ-Make בלי טקסט
והראוט שותק עליה. בזרוע photo_sample זה אומר שלקוח ששלח תמונה עלול
לקבל שקט. עד שנחווט זיהוי מדיה נכנסת ב-Make (למפות את סוג ההודעה
ולא רק טקסט), ה-handoff קורה כשהם *מסכימים* בטקסט; אם שלחו תמונה
ישר — זה ייתפס בסריקה של הליד או בעין של Lord בפאנל. לתקן בהמשך:
מודול Make שמעביר גם type + media id.
