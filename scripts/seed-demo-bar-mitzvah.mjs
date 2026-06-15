// scripts/seed-demo-bar-mitzvah.mjs
//
// יוצר אירוע הדגמה של בר מצווה עם ברכות אמיתיות-למראה — לשליחה למתעניינים.
//
// הרצה (מתיקיית wedding-book, אותם משתני סביבה כמו האפליקציה):
//   node --env-file=.env.local scripts/seed-demo-bar-mitzvah.mjs
//
// הסקריפט אידמפוטנטי: הרצה חוזרת מאתרת את אירוע הדמו הקיים ולא יוצרת כפול.
// בסוף הוא מדפיס את שלושת הקישורים — הדביקו אותם ב-CONFIG של
// src/app/bar-mitzvah/page.js ובהודעות הוואטסאפ.

import crypto from 'node:crypto'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const DEMO_EMAIL = 'demo@weddingtales.co.il'
const DEMO_SLUG = 'demobm' // קצר וקבוע — נוח לשלוח בוואטסאפ
const CELEBRANT = 'איתי'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.weddingtales.co.il'

function normalizePrivateKey(raw) {
    if (!raw) return undefined
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

const app = initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
})
const db = getFirestore(app)
const auth = getAuth(app)

// ─── ברכות הדגמה ─────────────────────────────────────────────────────────────
// בלי תמונות בכוונה — אפשר להוסיף 2-3 תמונות אמיתיות דרך עמוד האורחים עצמו.
const BLESSINGS = [
    { name: 'סבתא רחל', text: 'איתי שלי, נכד יקר ואהוב. לראות אותך עולה לתורה זה הרגע שחיכיתי לו מהיום שנולדת. שתמשיך לגדול בריא, שמח, ושתמיד תישאר הילד המתוק שאתה. אוהבת עד השמיים, סבתא.' },
    { name: 'אבא ואמא', text: 'בן שלנו, היום הזה הוא שלך. עבדת קשה, התרגשת, ועמדת שם כמו גבר אמיתי. אנחנו גאים בך יותר ממה שמילים יכולות להגיד. שתמיד תלך בדרך הטובה ותגשים כל חלום. אוהבים אותך אינסוף.' },
    { name: 'דוד אבי', text: 'איתי אלוף! עוד רגע אתה משיג אותי בגובה אז תיהנה מזה שאני עוד יכול להרים אותך 😄 מזל טוב גדול, שתהיה בריא ומאושר תמיד!' },
    { name: 'נועם — חבר הכי טוב', text: 'אחי!! מזל טוב!! היית תותח על הבמה, כל הכיתה מדברת על זה. שנישאר חברים לנצח ❤️' },
    { name: 'סבא יוסף', text: 'נכדי היקר, ראיתי אותך קורא בתורה ולא הצלחתי לעצור את הדמעות. אתה ממשיך שרשרת ארוכה של דורות, ואני יודע שתמשיך אותה בכבוד. מזל טוב, סבא.' },
    { name: 'דודה מיכל ומשפחת כהן', text: 'איתי מתוק שלנו, מזל טוב! שהחיוך הזה לא ירד לך מהפנים אף פעם. מחכים לראות אותך גדל ומצליח בכל מה שתבחר. נשיקות מכולנו!' },
    { name: 'המורה דנה', text: 'איתי, תלמיד מקסים עם לב ענק. הדרך שבה התכוננת לקראת היום הזה מלמדת הכל על מי שאתה. המשך להאיר את העולם. מזל טוב!' },
    { name: 'יובל ועידו', text: 'מזל טוב אח שלנו! האירוע היה פצצה והדי ג׳יי שרף את הרחבה 🔥 שתמיד יהיה לך טוב!' },
    { name: 'משפחת לוי', text: 'מזל טוב לאיתי ולכל המשפחה היקרה! התרגשנו להיות חלק מהיום המיוחד הזה. שתזכו לרוות ממנו רק נחת ושמחה.' },
    { name: 'דוד רון מאמריקה', text: 'איתי היקר, מצטער שלא יכולתי להגיע, אבל הלב שלי איתכם. גאה בך נורא! המתנה בדרך 😉 מזל טוב ענק!' },
    { name: 'שירה — אחות גדולה', text: 'אח קטן שלי (שכבר לא כל כך קטן), היום בכיתי מרוב גאווה. אתה הילד הכי טוב שיש ואני הכי בת מזל שאתה אח שלי. אוהבת אותך המון המון.' },
    { name: 'משפחת אברהם — השכנים', text: 'איתי, מהילד שמחייך לנו בחדר המדרגות כל בוקר — למזל טוב! שתגדל להיות איש טוב כמו שאתה ילד טוב.' },
    { name: 'אופיר מהקבוצה', text: 'קפטן!! מזל טוב!! שתמשיך לכבוש שערים במגרש ובחיים. נתראה באימון 💪⚽' },
    { name: 'סבתא לאה', text: 'איתי יקירי, סבתא מאחלת לך שכל השערים בעולם ייפתחו בפניך, ושתמיד תדע לבחור בטוב. היית מרגש מאוד היום. אוהבת, סבתא לאה.' },
]

async function main() {
    console.log('🚀 יוצר אירוע דמו לבר מצווה...')

    // 1. משתמש דמו
    let user
    try {
        user = await auth.getUserByEmail(DEMO_EMAIL)
        console.log('👤 משתמש דמו קיים:', user.uid)
    } catch {
        user = await auth.createUser({
            email: DEMO_EMAIL,
            password: crypto.randomBytes(9).toString('base64url'),
            displayName: 'Demo — Wedding Tales',
        })
        console.log('👤 נוצר משתמש דמו:', user.uid)
    }

    // 2. אירוע דמו (אידמפוטנטי לפי slug)
    let weddingId
    let viewerToken
    const existing = await db.collection('weddings').where('slug', '==', DEMO_SLUG).limit(1).get()

    if (!existing.empty) {
        const docSnap = existing.docs[0]
        weddingId = docSnap.id
        const tokens = docSnap.data().digitalTokens || []
        viewerToken = tokens[0]
        console.log('📖 אירוע דמו קיים:', weddingId)
    } else {
        const ref = db.collection('weddings').doc()
        weddingId = ref.id
        viewerToken = crypto.randomUUID()
        await ref.set({
            ownerId: user.uid,
            ownerEmail: DEMO_EMAIL,
            ownerName: 'Demo — Wedding Tales',
            createdAt: FieldValue.serverTimestamp(),
            slug: DEMO_SLUG,
            eventType: 'bar_mitzvah',
            celebrantName: CELEBRANT,
            themeColor: 'blue',
            isDemo: true, // סימון פנימי — לא לחייב/למחוק בטעות
            digitalTokens: FieldValue.arrayUnion(viewerToken),
            digitalTokensIssuedAt: FieldValue.arrayUnion({
                token: viewerToken,
                issuedAt: new Date().toISOString(),
                issuedBy: 'seed-demo-script',
            }),
        })
        console.log('📖 נוצר אירוע דמו:', weddingId)
    }

    // 3. ברכות (אידמפוטנטי — מזהה קבוע לכל ברכה)
    const batch = db.batch()
    const now = Date.now()
    BLESSINGS.forEach((b, i) => {
        const entryRef = db.collection('weddings').doc(weddingId).collection('entries').doc(`demo-entry-${i + 1}`)
        batch.set(entryRef, {
            name: b.name,
            text: b.text,
            imageUrl: null,
            // מפוזרות על פני ערב האירוע — נראה אמיתי בעמוד הסטטיסטיקות
            timestamp: Timestamp.fromMillis(now - (BLESSINGS.length - i) * 7 * 60 * 1000),
            orderIndex: i,
        })
    })
    await batch.commit()
    console.log(`💌 נשמרו ${BLESSINGS.length} ברכות דמו`)

    // 4. קישורים לשימוש
    console.log('\n✅ מוכן! הקישורים שלך:\n')
    console.log('עמוד אורחים (לכתוב ברכה):  ', `${BASE_URL}/w/${DEMO_SLUG}`)
    if (viewerToken) console.log('צפייה בספר (בלי התחברות):  ', `${BASE_URL}/wedding/${weddingId}/book/${viewerToken}`)
    console.log('\n👉 הדביקו אותם ב-CONFIG של src/app/bar-mitzvah/page.js ובהודעות הוואטסאפ.')
    console.log('💡 טיפ: היכנסו לעמוד האורחים והוסיפו 2-3 ברכות עם תמונות אמיתיות — זה משדרג את הדמו.')
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ שגיאה:', err)
        process.exit(1)
    })
