import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ✅ תמיכה בעברית (ללא שבירת רווחים)
function fixHebrew(text) {
    const hebrewRegex = /[\u0590-\u05FF]/
    if (!hebrewRegex.test(text)) return text
    const parts = text.match(/[^\s]+|\s+/g) || []
    return parts.reverse().join('')
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId')
        const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

        // ✅ טעינת פונט עברי
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansHebrew-Regular.ttf')
        if (!fs.existsSync(fontPath)) throw new Error('Font not found')
        const fontBuffer = fs.readFileSync(fontPath)

        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            font: fontBuffer,
        })

        doc.registerFont('hebrew', fontPath)
        doc.font('hebrew')

        const buffers = []
        doc.on('data', buffers.push.bind(buffers))
        const { width, height } = doc.page

        // ✅ רקע לבן מלא
        doc.rect(0, 0, width, height).fill('#FFFFFF')

        // 🌸 גרדיאנט רך עם נגיעה לבנדר־ורוד
        const gradientSteps = 40
        for (let i = 0; i < gradientSteps; i++) {
            const t = i / gradientSteps
            const r = 248 + (255 - 248) * t
            const g = 245 + (255 - 245) * t
            const b = 255
            doc.save()
            doc.fillColor(`rgb(${r},${g},${b})`)
            doc.rect(0, (height / gradientSteps) * i, width, height / gradientSteps).fill()
            doc.restore()
        }

        // ✨ מסגרת דקה ורכה
        doc.lineWidth(2)
            .strokeColor('#e5d8ff')
            .roundedRect(40, 40, width - 80, height - 80, 25)
            .stroke()

        // 💜 כותרת ראשית
        doc.fontSize(36).fillColor('#8B5CF6').text(fixHebrew('סרקו והעלו לנו תמונה או ברכה'), 0, 100, {
            align: 'center',
            width,
        })

        // קו ורוד מתחת לכותרת
        doc.lineWidth(2)
            .moveTo(width / 2 - 70, 150)
            .lineTo(width / 2 + 70, 150)
            .strokeColor('#EC4899')
            .stroke()

        // 💬 טקסט הסבר קטן מתחת לכותרת
        doc.fontSize(16).fillColor('#666666').text(fixHebrew('צלמו, ברכו או שתפו רגע קטן שלכם מהחתונה שלנו '), 0, 170, {
            align: 'center',
            width,
        })

        // 📷 QR במרכז
        const qrResponse = await fetch(
            `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(guestLink)}`
        )
        const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
        const qrX = width / 2 - 140
        const qrY = 260
        doc.rect(qrX - 10, qrY - 10, 300, 300)
            .fill('#ffffff')
            .stroke('#EDE9FE')
        doc.image(qrBuffer, qrX, qrY, { width: 280 })

        // 🌿 חתימה תחתונה
        doc.fontSize(12)
            .fillColor('#a1a1aa')
            .text(fixHebrew('נוצר באהבה עם Wedding Tales'), 0, height - 80, {
                align: 'center',
                width,
            })

        doc.end()

        const pdfBuffer = await new Promise(resolve => {
            doc.on('end', () => resolve(Buffer.concat(buffers)))
        })

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename=WeddingTales-${weddingId}.pdf`,
                'Cache-Control': 'no-store',
            },
        })
    } catch (err) {
        console.error('❌ PDF Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
