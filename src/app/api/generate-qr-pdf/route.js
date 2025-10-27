import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ✅ תמיכה בעברית
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
        const fg = searchParams.get('fg') || '8B5CF6' // צבע קדמי (סגול)
        const bg = searchParams.get('bg') || 'FFFFFF' // רקע לבן
        const includeLogo = searchParams.get('logo') === 'true'

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

        // ✅ רקע
        doc.rect(0, 0, width, height).fill('#FFFFFF')

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

        // ✨ מסגרת
        doc.lineWidth(2)
            .strokeColor('#E5D8FF')
            .roundedRect(40, 40, width - 80, height - 80, 25)
            .stroke()

        // 💜 כותרת
        doc.fontSize(36).fillColor('#8B5CF6').text(fixHebrew('סרקו והעלו לנו תמונה או ברכה'), 0, 100, {
            align: 'center',
            width,
        })

        // קו
        doc.lineWidth(2)
            .moveTo(width / 2 - 70, 150)
            .lineTo(width / 2 + 70, 150)
            .strokeColor('#EC4899')
            .stroke()

        // טקסט משנה
        doc.fontSize(16).fillColor('#666').text(fixHebrew('צלמו, ברכו או שתפו רגע קטן שלכם מהחתונה שלנו 💜'), 0, 170, {
            align: 'center',
            width,
        })

        // 📷 יצירת QR צבעוני
        let qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(
            guestLink
        )}&color=${fg}&bgcolor=${bg}`

        // עם לוגו אם קיים
        if (includeLogo) {
            const logoPath = path.join(process.cwd(), 'public', 'logo-gradient.png')
            if (fs.existsSync(logoPath)) {
                // נוריד את הברקוד
                const qrResponse = await fetch(qrUrl)
                const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
                const qrX = width / 2 - 140
                const qrY = 260

                // מסגרת
                doc.rect(qrX - 10, qrY - 10, 300, 300)
                    .fill('#ffffff')
                    .stroke('#EDE9FE')
                doc.image(qrBuffer, qrX, qrY, { width: 280 })

                // לוגו במרכז
                doc.circle(width / 2, qrY + 140, 25).fill('#fff')
                doc.image(logoPath, width / 2 - 20, qrY + 120, { width: 40 })
            } else {
                // בלי לוגו
                const qrResponse = await fetch(qrUrl)
                const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
                const qrX = width / 2 - 140
                const qrY = 260
                doc.rect(qrX - 10, qrY - 10, 300, 300)
                    .fill('#ffffff')
                    .stroke('#EDE9FE')
                doc.image(qrBuffer, qrX, qrY, { width: 280 })
            }
        } else {
            const qrResponse = await fetch(qrUrl)
            const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
            const qrX = width / 2 - 140
            const qrY = 260
            doc.rect(qrX - 10, qrY - 10, 300, 300)
                .fill('#ffffff')
                .stroke('#EDE9FE')
            doc.image(qrBuffer, qrX, qrY, { width: 280 })
        }

        // חתימה
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
