import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId') || 'demo'
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://weddingtales.co.il'
        const guestLink = `${baseUrl}/wedding/${weddingId}`

        // שימוש בנתיבים בטוחים יותר לפרודקשן
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
        const bgPath = path.join(process.cwd(), 'public', 'backgrounds', 'wedding-bg.png')

        // בדיקה אסינכרונית כדי לא לתקוע את השרת
        try {
            await fs.promises.access(fontPath, fs.constants.R_OK)
        } catch (e) {
            console.error('Font file is missing in path:', fontPath)
            return NextResponse.json(
                { error: 'Font file missing. Please check /public/fonts directory.' },
                { status: 500 },
            )
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
        try {
            await fs.promises.access(bgPath, fs.constants.R_OK)
            doc.image(bgPath, 0, 0, { width: width, height: height })
        } catch (e) {
            console.warn('Background image not found, proceeding with white background.')
            // ה-PDF פשוט ימשיך עם רקע לבן אם התמונה חסרה
        }

        // ==========================================
        // 2. ברקוד מעוצב (וקטורי)
        // ==========================================
        const qrSize = 280
        const qrX = width / 2 - qrSize / 2
        const qrY = height * 0.45 // מיקמתי את זה בשליש האמצעי כדי שייראה מאוזן

        try {
            // יצירת המידע הגולמי (מטריצה של 0 ו-1)
            const qrData = QRCode.create(guestLink, {
                errorCorrectionLevel: 'M',
                version: 0,
            })

            // צבע המותג של Wedding Tales (סגול יוקרתי)
            const brandColor = '#4a0c83'
            drawSpecialQR(doc, qrData, qrX, qrY, qrSize, brandColor)

            // ==========================================
            // 3. טקסט קריאה לפעולה (Call To Action)
            // ==========================================

            doc.fontSize(14)
                .fillColor('#9ca3af') // אפור בהיר לתת-טקסט
                .text('weddingtales.co.il', 0, qrY + qrSize + 65, {
                    align: 'center',
                    width: width,
                })
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
        console.error('PDF Final Error:', err)
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }
}

/**
 * פונקציה לציור ברקוד מעוצב - Apple/Premium Style
 */
function drawSpecialQR(doc, qrData, x, y, size, color) {
    const modules = qrData.modules
    const count = modules.size
    const cellSize = size / count

    // === הגדרות שליטה על העיצוב (Premium Tuning) ===

    // 0.85 נותן מרווח קטן ואלגנטי בין הריבועים (לא צפוף מדי)
    const fillPercentage = 0.95

    // 3 נותן עיגול עדין ("Squircle" כמו האייקונים באייפון)
    const borderRadius = 0
    // ===============================================

    const drawSize = cellSize * fillPercentage
    const offset = (cellSize - drawSize) / 2

    // רקע לבן נקי מתחת לברקוד כדי להבליט אותו מעל תמונת הרקע
    doc.save()
    // הגדלתי מעט את הרדיוס של המסגרת הלבנה שיתאים לעיצוב העגול
    doc.roundedRect(x - 20, y - 20, size + 40, size + 40, 20).fill('#FFFFFF')
    doc.restore()

    doc.fillColor(color)

    for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
            if (modules.get(row, col)) {
                const drawX = x + col * cellSize + offset
                const drawY = y + row * cellSize + offset

                // ציור הריבוע המעוגל
                doc.roundedRect(drawX, drawY, drawSize, drawSize, borderRadius)
            }
        }
    }
    doc.fill()
}
