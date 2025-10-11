import { saveEntry } from '@/lib/classifyMedia'
import { NextResponse } from 'next/server'

const weddingId = 'CJIKJTqi0IVggDOAnDUZI7CmseV2'

// שמות לפי הסדר שביקשת
const names = [
    'שחר ואור',
    'משפחת ביבי',
    'מוטי וריף',
    'סבתא תקווה',
    'עומר',
    'אלי',
    'דור',
    "הצ'אחלות",
    'רון',
    'ירין',
    'בטן והחברים',
    'בטן והחברים',
    'ירין, אור ודויד',
    'האמפטי דמפטי',
    'משפחת ברוקס',
    'אתם יודעים כבר',
    'בר ומאיה',
    'אבי ומורן',
    'אוהד והזאת',
    'ניגר ופיגר',
    'חברים',
    'גבר וגבר יותר',
]

// ברכה דיפולטית אחידה
const defaultText = 'מזל טוב! מאחלים לכם המון אהבה ושמחה 💖'

export async function GET() {
    try {
        for (let i = 0; i < names.length; i++) {
            const name = names[i]
            const image = `http://localhost:3000/imgs/img${i + 1}.jpg`

            await saveEntry(weddingId, {
                name,
                text: defaultText,
                image,
            })
        }

        return NextResponse.json({ success: true, message: '✅ Seeded 22 entries' })
    } catch (err) {
        console.error('Error seeding wedding:', err)
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
