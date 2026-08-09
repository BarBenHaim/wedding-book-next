// src/lib/salesAgent/catalog.js
//
// THE single source of truth for every FACT the WhatsApp sales agent is
// allowed to state: packages, prices, add-ons, links, delivery times.
//
// Why it lives in one small pure module: an LLM will happily invent a
// price or a delivery window if the prompt is vague, and a wrong number
// sent to a customer is a real commitment. So the agent never "knows"
// commercial facts — they are injected into its system prompt from here
// on every single call, and the prompt forbids stating anything not on
// this list. Change a price here and the bot changes with it, with no
// prompt editing and no redeploy of anything else.
//
// These values mirror the live landing page (public/lp.html) and the
// live WooCommerce products as of August 2026. If you change one, change
// it in BOTH places — tests/salesAgent.test.js asserts the shape but it
// cannot know what the shop charges.

export const BUSINESS = {
    brand: 'Wedding Tales',
    // What the bot calls the human it is handing over to. "לורד" was
    // hardcoded here for a while and went out to real customers, which
    // reads exactly as unprofessional as it sounds: it is a handle, not
    // a name a business uses about itself.
    //
    // Env-driven so it can be set without a deploy, and null-safe: with
    // nothing set the copy says "מישהו מהצוות", which is true, neutral
    // and survives somebody else answering the phone.
    ownerName: process.env.SALES_AGENT_OWNER_NAME || null,
    product: 'ספר ברכות — האורחים סורקים QR, כותבים ברכה ומעלים תמונה, והכול נארג לספר מזכרת',
    whatsapp: 'https://wa.link/rduj2s',
    landing: 'https://app.weddingtales.co.il/lp',
    infoPage: 'https://app.weddingtales.co.il/bar-mitzvah',
    shop: 'https://weddingtales.co.il',
}

// The live demo event — the strongest sales asset there is. The agent is
// told to send it early, because a parent who writes a blessing on their
// own phone has already imagined their own event.
export const DEMO = {
    writeBlessing: 'https://app.weddingtales.co.il/wedding/0oeixSvNuY9uKEmZ0GVg/photo',
    label: 'אירוע דמו אמיתי — אפשר לכתוב ברכה ולהעלות תמונה מהטלפון',
}

// Bar mitzvah is the commercial focus (see the landing page). The same
// three packages serve every event type; only the wording changes.
export const PACKAGES = [
    {
        id: 'digital',
        name: 'ספר דיגיטלי',
        price: 690,
        wasPrice: 890,
        checkout: 'https://weddingtales.co.il/checkout/?add-to-cart=6258',
        pitch: 'מושלם לשיתוף מיידי במשפחה',
        includes: [
            'פוסטר QR בעיצוב אישי',
            'עמוד אורחים — ללא הגבלת ברכות ותמונות',
            'ספר דיגיטלי מעוצב',
            'קובץ PDF להורדה ולהדפסה',
            'פאנל ניהול ואישור ברכות',
            'פעיל שנה שלמה',
        ],
    },
    {
        id: 'printed',
        name: 'ספר מודפס',
        price: 950,
        wasPrice: 1190,
        checkout: 'https://weddingtales.co.il/checkout/?add-to-cart=6271',
        pitch: 'מזכרת שעוברת מדור לדור',
        // The one to steer toward — it is what most families buy and it
        // is the only package that produces the physical object the whole
        // pitch is about.
        recommended: true,
        includes: [
            'כל מה שבדיגיטלי',
            'ספר מודפס בכריכה קשה',
            'עיצוב כל עמוד על ידי מעצב',
            'נייר פרימיום בגימור משי',
            'כל הברכות והתמונות בפנים',
            'משלוח עד הבית — כלול',
        ],
    },
    {
        id: 'premium',
        name: 'פרימיום מלכותי',
        price: 1490,
        wasPrice: 1790,
        checkout: 'https://weddingtales.co.il/checkout/?add-to-cart=5480',
        pitch: 'החוויה המלאה למשפחות גדולות',
        includes: [
            'כל מה שבמודפס',
            'עותק נוסף — לסבא ולסבתא',
            'פוסטר A2 מוקשח לעמדה',
            'עדיפות בתור ההפקה',
            'ליווי אישי צמוד בוואטסאפ',
        ],
    },
]

export const ADDONS = [
    { name: 'עותק מודפס נוסף', price: 290 },
    { name: 'פוסטר A2 מוקשח לעמדה', price: 180 },
    { name: 'הפקת אקספרס', price: 190 },
]

// Answers to the questions that actually come up. The agent may quote
// these; anything outside this list is a handoff, not a guess.
export const FACTS = [
    'האורחים לא מורידים שום אפליקציה — סריקת QR פותחת עמוד בדפדפן, כותבים, מעלים תמונה, שולחים.',
    'אין הגבלה על מספר הברכות והתמונות, גם באירוע של 500 אורחים.',
    'יש פאנל ניהול: מאשרים כל ברכה, מתקנים שגיאות כתיב, בוחרים תמונות ומסדרים את הסדר — ורק אז לדפוס.',
    'עמוד האורחים והפוסטר מוכנים תוך 48 שעות מאישור העיצוב.',
    'הספר המודפס יוצא לדפוס אחרי שסוגרים את הברכות ומגיע עד הבית תוך 14 ימי עסקים. יש מסלול אקספרס בתוספת תשלום.',
    'לא מדפיסים כלום לפני אישור מלא של הלקוח — רואים כל עמוד, מבקשים תיקונים בלי הגבלה.',
    'הקישור נשאר פתוח גם אחרי האירוע — מי שפספס משלים מהבית, ואפשר גם להתחיל אחרי שהאירוע כבר עבר.',
    'מתאים לבר מצווה, בת מצווה, חתונה, ברית ויום הולדת — אותה מערכת, עיצוב מותאם לאירוע.',
    'המחירים כוללים מע״מ, עיצוב אישי וליווי בוואטסאפ.',
    'אחרי התשלום נשלח מייל עם פרטי גישה, ואנחנו יוצרים קשר בוואטסאפ להתחלת העיצוב.',
]

// ── Images the agent is allowed to send ─────────────────────────────
//
// A whitelist, not a capability. The model picks a KEY; the URL is
// resolved here. If the model could name its own URL it would sooner or
// later name one that 404s in front of a customer, or one belonging to
// somebody else's site — and on WhatsApp a broken image is not a broken
// image, it is a failed send that looks like the business is falling
// apart.
//
// These are real spreads from books we actually printed. That matters:
// the single most common objection is "how does it really look", and a
// stock mockup answers it worse than nothing.
const ORIGIN = 'https://app.weddingtales.co.il'

export const MEDIA = {
    // ── The three that answer the questions people actually ask ─────
    //
    // Listed first because the model reads this list in order, and
    // because these three are not more of the same: each answers a
    // different hesitation, and between them they cover most of what
    // stalls a conversation.
    //
    // The screen answers "is this complicated for my guests" - it is the
    // only asset showing the product from the guest's side, on a phone,
    // which is exactly where they will meet it.
    //
    // The cover answers "will it feel like ours" - a name in huge
    // letters over a real photograph lands faster than any sentence
    // about personalisation.
    //
    // The open spread answers "is the printed one worth the difference",
    // which is the specific hesitation sitting between the cheap package
    // and the one that pays.
    upload_screen: {
        url: `${ORIGIN}/imgs/portfolio/shared/upload-screen.jpg`,
        caption: 'ככה זה נראה לאורח: סורק QR, כותב ברכה, מוסיף תמונה. בלי אפליקציה ובלי הרשמה',
        when: 'כל אירוע, כששואלים איך זה עובד לאורחים, אם צריך אפליקציה, או חוששים שזה מסובך למבוגרים',
    },
    cover_personalised: {
        url: `${ORIGIN}/imgs/portfolio/shared/cover-personalised.jpg`,
        caption: 'כריכה אמיתית שהפקנו, עם השם והתמונה של החוגג',
        when: 'כששואלים אם הספר מותאם אישית, איך נראית הכריכה, או רוצים לראות שזה באמת שלהם',
    },
    book_open_spread: {
        url: `${ORIGIN}/imgs/portfolio/shared/book-open-spread.jpg`,
        caption: 'ספר פתוח: כל ברכה עם התמונה של מי שכתב אותה',
        when: 'כששואלים איך נראה הספר המוכן מבפנים, או מתלבטים אם המודפס שווה את ההפרש מהדיגיטלי',
    },

    book_bar_mitzvah: {
        url: `${ORIGIN}/imgs/portfolio/bar-mitzvah/cover.jpg`,
        caption: 'ספר בר מצווה שהפקנו, כריכה קשה',
        when: 'בר/בת מצווה, כשרוצים לראות איך הספר נראה מבחוץ',
    },
    pages_bar_mitzvah: {
        url: `${ORIGIN}/imgs/portfolio/bar-mitzvah/spread-1.jpg`,
        caption: 'ככה נראים העמודים מבפנים, ברכה ותמונה בכל עמוד',
        when: 'בר/בת מצווה, כששואלים איך הברכות יושבות בתוך הספר',
    },
    book_wedding: {
        url: `${ORIGIN}/imgs/portfolio/wedding/cover.jpg`,
        caption: 'ספר ברכות מחתונה, כריכה קשה',
        when: 'חתונה, מבט מבחוץ',
    },
    pages_wedding: {
        url: `${ORIGIN}/imgs/portfolio/wedding/spread-1.jpg`,
        caption: 'עמודים מתוך ספר של חתונה',
        when: 'חתונה, מבט מבפנים',
    },
    book_birthday: {
        url: `${ORIGIN}/imgs/portfolio/birthday/cover.jpg`,
        caption: 'ספר ברכות מיום הולדת',
        when: 'יום הולדת, מבט מבחוץ',
    },
    pages_birthday: {
        url: `${ORIGIN}/imgs/portfolio/birthday/spread-1.jpg`,
        caption: 'עמודים מתוך ספר של יום הולדת',
        when: 'יום הולדת, מבט מבפנים',
    },
}

export const MEDIA_KEYS = Object.keys(MEDIA)

export function findMedia(key) {
    return (typeof key === 'string' && MEDIA[key]) || null
}

// The ONLY concession the agent may offer, and only under the conditions
// spelled out in the prompt. Everything else — percentage discounts,
// "special price for you", invented deadlines — is forbidden.
export const CONCESSION = {
    text: 'עותק מודפס נוסף במתנה (שווי ₪290) בסגירה עד {DATE}',
    validDays: 3,
}

// Conversation stages. Order matters: it is the funnel, and the CRM
// reports read it as an ordinal.
export const STAGES = [
    'new', // first contact, nothing known yet
    'engaged', // talking, event type / date surfacing
    'demo_sent', // the live demo link went out
    'offer_sent', // the three packages were presented
    'objection', // price / spouse / timing pushback being worked
    'commit_later', // promised to come back — a real callback is scheduled
    'ready_to_pay', // asked for the payment link
    'closed_won', // payment landed (set by the WooCommerce webhook)
    'closed_lost', // politely closed after the follow-up ladder ran out
    'handoff', // a human owns this conversation now
]

export const TERMINAL_STAGES = ['closed_won', 'closed_lost']

export function findPackage(id) {
    return PACKAGES.find(p => p.id === id) || null
}

export const CATALOG = { BUSINESS, DEMO, PACKAGES, ADDONS, FACTS, CONCESSION, STAGES, MEDIA }

export default CATALOG
