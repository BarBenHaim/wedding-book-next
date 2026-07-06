// /start — self-serve onboarding: open a free digital blessing book.
// Server shell (SEO metadata) around the client wizard.
import StartWizard from './StartWizard'

export const metadata = {
    title: 'פתיחת ספר ברכות בחינם — Wedding Tales',
    description:
        'צרו ספר ברכות דיגיטלי לאירוע שלכם בחינם: קישור ו-QR לאורחים, איסוף ברכות ותמונות, וספר דיגיטלי מעוצב — מוכן תוך דקה.',
    openGraph: {
        title: 'פתחו ספר ברכות דיגיטלי בחינם — Wedding Tales',
        description: 'האורחים כותבים, אתם מתרגשים. ספר ברכות דיגיטלי לאירוע — חינם, מוכן תוך דקה.',
    },
}

export default function StartPage() {
    return <StartWizard />
}
