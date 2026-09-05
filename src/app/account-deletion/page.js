// /account-deletion — the public "delete my account and data" route.
//
// Google Play requires a URL a user can reach WITHOUT installing the app,
// which states what is deleted, what is kept, and for how long, and which
// offers a way to submit the request. This page is that URL; it is also
// what the Data Safety form points at. Keep it reachable without login and
// keep the retention numbers here in step with what we actually do.
//
// The prose is a server component on purpose: a reviewer (and a crawler)
// should get the whole statement in the initial HTML.

import DeletionForm from './DeletionForm'

export const metadata = {
    title: 'מחיקת חשבון ומידע — Wedding Tales',
    description:
        'בקשה למחיקת חשבון Wedding Tales והמידע המשויך אליו: מה נמחק, מה נשמר, וכמה זמן זה לוקח.',
    alternates: { canonical: 'https://app.weddingtales.co.il/account-deletion' },
}

export default function AccountDeletionPage() {
    return (
        <div dir='rtl' className='legal'>
            <h1>מחיקת חשבון ומידע</h1>
            <p className='upd'>Wedding Tales · עדכון אחרון: ספטמבר 2026</p>

            <p>
                אפשר לבקש את מחיקת החשבון והמידע המשויך אליו בשתי דרכים: מתוך האפליקציה
                (מסך הבית ← חשבון ופרטיות ← מחיקת חשבון), או בטופס שבעמוד הזה — בלי צורך
                להתקין את האפליקציה.
            </p>

            <h2>מה נמחק</h2>
            <ul>
                <li>חשבון ההתחברות שלך ופרטי הקשר שנשמרו בו.</li>
                <li>האירועים שיצרת, לרבות שמות החוגגים ותאריך האירוע.</li>
                <li>הברכות והתמונות שהאורחים העלו לאירועים האלה, מהמסד ומאחסון הקבצים.</li>
                <li>קישורי הצפייה בספר — הם מפסיקים לעבוד.</li>
                <li>נתוני השימוש שנאספו סביב האירועים שלך.</li>
            </ul>

            <h2>מה נשמר, ולמה</h2>
            <ul>
                <li>
                    <b>חשבוניות ורישומי תשלום</b> — נשמרים כל עוד חוק הדיווח לרשויות המס
                    מחייב זאת (בישראל, שבע שנים). זהו מידע חשבונאי; הוא אינו כולל ברכות או
                    תמונות.
                </li>
                <li>
                    <b>ספר שכבר הודפס</b> — עותק פיזי שנשלח אליך אינו ניתן למחיקה, מטבע
                    הדברים. הקבצים ששימשו להפקתו נמחקים.
                </li>
                <li>
                    <b>גיבויים</b> — עותקי גיבוי מתגלגלים עשויים להכיל את המידע עד 30 יום
                    נוספים אחרי המחיקה, ואז נדרסים.
                </li>
            </ul>

            <h2>כמה זמן זה לוקח</h2>
            <p>
                מחיקה מתוך האפליקציה מיידית. בקשה דרך הטופס הזה מטופלת תוך 30 יום לכל
                היותר, ואנחנו מאשרים במייל כשהיא בוצעה. אנחנו מוודאים שהכתובת שנשלחה היא
                אכן הכתובת של החשבון לפני שמוחקים משהו.
            </p>

            <h2>בקשת מחיקה</h2>
            <DeletionForm />

            <p className='fine'>
                לשאלות: <a href='mailto:barbenbh@gmail.com'>barbenbh@gmail.com</a> · ראו גם{' '}
                <a href='/privacy'>מדיניות הפרטיות</a>.
            </p>

            <style>{`
                .legal { max-width: 720px; margin: 0 auto; padding: 48px 22px 80px; color: #241c10; font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif; line-height: 1.85; }
                .legal h1 { font-size: 30px; font-weight: 800; margin: 0 0 6px; }
                .legal .upd { color: #8a6f45; font-size: 13px; margin: 0 0 28px; }
                .legal h2 { font-size: 19px; font-weight: 800; margin: 28px 0 8px; color: #4c3b21; }
                .legal p { margin: 0 0 12px; font-size: 15px; color: #4a3c26; }
                .legal ul { margin: 0 0 12px; padding-inline-start: 22px; font-size: 15px; color: #4a3c26; }
                .legal li { margin: 0 0 6px; }
                .legal a { color: #a8843a; font-weight: 700; }
                .legal .fine { margin-top: 30px; font-size: 14px; color: #8a6f45; }
            `}</style>
        </div>
    )
}
