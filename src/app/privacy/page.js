// /privacy — מדיניות פרטיות. נדרש עבור App Store Connect ולשקיפות
// מול משתמשי המערכת. תוכן תמציתי ובעברית; מומלץ לעבור עם עו"ד.
export const metadata = { title: 'מדיניות פרטיות — Wedding Tales' }

export default function PrivacyPage() {
    return (
        <div dir='rtl' className='legal'>
            <h1>מדיניות פרטיות</h1>
            <p className='upd'>עדכון אחרון: יולי 2026</p>

            <h2>מי אנחנו</h2>
            <p>Wedding Tales (״אנחנו״) מפעילה שירות ליצירת ספרי ברכות דיגיטליים ומודפסים מאירועים, בכתובת app.weddingtales.co.il ובאפליקציה הנלווית.</p>

            <h2>איזה מידע נאסף</h2>
            <p>בעלי אירוע: כתובת אימייל, שם, ופרטי האירוע שהוזנו (שמות חוגגים, תאריך). אורחים: שם, נוסח הברכה ותמונה שבחרו להעלות — לפי שיקול דעתם בלבד. בנוסף נאספים נתוני שימוש אנונימיים (Microsoft Clarity) לשיפור השירות.</p>

            <h2>איפה המידע נשמר</h2>
            <p>המידע מאוחסן בתשתיות Google Firebase (Firestore, Storage, Authentication). התמונות והברכות משמשות אך ורק להצגה בספר של האירוע אליו הועלו ולהפקת הספר המודפס, אם הוזמן.</p>

            <h2>שיתוף מידע</h2>
            <p>איננו מוכרים או משתפים מידע אישי עם צדדים שלישיים, למעט ספקי תשתית (Google) ובית הדפוס לצורך הפקת ספר שהוזמן. אין באפליקציה או באתר פרסום של צדדים שלישיים ואין מעקב בין־אפליקציות.</p>

            <h2>זכויותיכם</h2>
            <p>ניתן לבקש עיון, תיקון או מחיקה של מידע בכל עת. מחיקת חשבון זמינה גם ישירות מתוך האפליקציה (מסך הבית ← חשבון ופרטיות ← מחיקת חשבון). לאחר מחיקת החשבון יוסרו גם האירועים והתכנים המשויכים אליו.</p>

            <h2>אבטחה</h2>
            <p>הגישה לניהול אירוע מוגנת בהתחברות. קישורי צפייה בספר מבוססי אסימון ייחודי. אנו נוקטים אמצעים סבירים ומקובלים להגנה על המידע.</p>

            <h2>ילדים</h2>
            <p>השירות מיועד למבוגרים (18+) המנהלים אירוע. תמונות של קטינים מועלות באחריות מעלה התוכן ובהסכמת האחראים עליהם.</p>

            <h2>יצירת קשר</h2>
            <p>לשאלות ובקשות בנושא פרטיות: <a href='mailto:barbenbh@gmail.com'>barbenbh@gmail.com</a></p>
        <style>{`
                .legal { max-width: 720px; margin: 0 auto; padding: 48px 22px 80px; color: #241c10; font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif; line-height: 1.85; }
                .legal h1 { font-size: 30px; font-weight: 800; margin: 0 0 6px; }
                .legal .upd { color: #8a6f45; font-size: 13px; margin: 0 0 28px; }
                .legal h2 { font-size: 19px; font-weight: 800; margin: 28px 0 8px; color: #4c3b21; }
                .legal p { margin: 0 0 12px; font-size: 15px; color: #4a3c26; }
                .legal a { color: #a8843a; font-weight: 700; }
`}</style>
        </div>
    )
}
