import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode' // שימוש בספרייה לקבלת המידע הגולמי

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId') || 'demo'
        const bgFile = searchParams.get('bg') || 'wedding-bg.png'
        const slug = searchParams.get('slug') || ''
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://weddingtales.co.il'
        const guestLink = slug ? `${baseUrl}/w/${slug}` : `${baseUrl}/wedding/${weddingId}`

        // נתיבי קבצים
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
        // בדיקה למניעת קריסה
        if (!fs.existsSync(fontPath)) {
            return NextResponse.json({ error: 'Font file missing' }, { status: 500 })
        }

        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
            font: fontPath,
        })

        const buffers = []
        doc.on('data', buffers.push.bind(buffers))
        const { width, height } = doc.page

        // ==========================================
        // 1. רקע (תמונה מלאה)
        // ==========================================
        // Sanitize bgFile to prevent path traversal
        const safeBgFile = path.basename(bgFile)
        const bgPath = path.join(process.cwd(), 'public', 'backgrounds', safeBgFile)
        if (fs.existsSync(bgPath)) {
            doc.image(bgPath, 0, 0, { width: width, height: height })
        }

        // ==========================================
        // 2. ברקוד מעוצב (וקטורי)
        // ==========================================

        const qrSize = 280 // גודל הברקוד
        const qrX = width / 2 - qrSize / 2
        const qrY = 280 // מיקום אנכי (אפשר לשחק עם זה)

        try {
            // יצירת המידע הגולמי (מטריצה של 0 ו-1)
            const qrData = QRCode.create(guestLink, {
                errorCorrectionLevel: 'M', // רמה בינונית כדי לאפשר עיצוב נקי
                version: 0,
            })

            // קריאה לפונקציה שמציירת את הצורות המיוחדות
            // פרמטר אחרון הוא הצבע - שמתי שחור, אפשר לשנות לסגול המותג שלך (#9333ea)
            drawSpecialQR(doc, qrData, qrX, qrY, qrSize, '#000000')
        } catch (e) {
            console.error('QR Generation Error:', e)
        }

        doc.end()

        const pdfBuffer = await new Promise(resolve => {
            doc.on('end', () => resolve(Buffer.concat(buffers)))
        })

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename=WeddingTales-${weddingId}.pdf`,
            },
        })
    } catch (err) {
        console.error('PDF Error:', err)
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }
}

/**
 * פונקציה לציור ברקוד מעוצב
 */
function drawSpecialQR(doc, qrData, x, y, size, color) {
    const modules = qrData.modules
    const count = modules.size
    const cellSize = size / count

    // === הגדרות שליטה על העיצוב ===

    // 1. כמה המקום הריבוע תופס? (0.8 = 80%, יוצר רווחים. 1.0 = ללא רווחים)
    // מומלץ: 0.85 למראה יוקרתי, 0.9 למראה צפוף יותר
    const fillPercentage = 1

    // 2. כמה עגולות הפינות? (0 = שפיץ, 10 = עגול מאוד)
    // מומלץ: 2 עד 4 למראה ריבועי רך ("אייפון")
    const borderRadius = 0

    // ===============================

    const drawSize = cellSize * fillPercentage
    const offset = (cellSize - drawSize) / 2

    // רקע לבן נקי מתחת לברקוד
    doc.save()
    doc.roundedRect(x - 15, y - 15, size + 30, size + 30, 15).fill('#FFFFFF')
    doc.restore()

    doc.fillColor(color)

    for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
            if (modules.get(row, col)) {
                const drawX = x + col * cellSize + offset
                const drawY = y + row * cellSize + offset

                // כאן אנחנו משתמשים במשתנה borderRadius שהגדרנו למעלה
                doc.roundedRect(drawX, drawY, drawSize, drawSize, borderRadius)
            }
        }
    }
    doc.fill()
}