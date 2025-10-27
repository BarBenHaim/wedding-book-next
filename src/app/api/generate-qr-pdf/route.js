import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// פונקציה שמסדרת מילים בעברית (בלי להפוך אותיות)
function reorderHebrewWords(text) {
    const hebrewRegex = /[\u0590-\u05FF]/
    if (!hebrewRegex.test(text)) return text
    return text.split(' ').reverse().join(' ')
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const weddingId = searchParams.get('weddingId')
        const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

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

        // רקע
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#faf7ff')
        doc.fillColor('#000')

        // כותרת
        doc.fontSize(26)
            .fillColor('#9333ea')
            .text(reorderHebrewWords('ברכו את הזוג'), 0, 80, { align: 'right', width: doc.page.width - 80 })

        // תת־כותרת
        doc.fontSize(14)
            .fillColor('#ec4899')
            .text(reorderHebrewWords('סרקו את הקוד או העתיקו את הקישור כדי להעלות תמונות וברכות 💌'), 0, 120, {
                align: 'right',
                width: doc.page.width - 80,
            })

        // QR
        const qrResponse = await fetch(
            `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(guestLink)}`
        )
        const qrBuffer = Buffer.from(await qrResponse.arrayBuffer())
        doc.image(qrBuffer, doc.page.width / 2 - 140, 240, { width: 280 })

        // טיפ
        doc.fontSize(12)
            .fillColor('#555')
            .text(reorderHebrewWords('💡 מומלץ להדפיס ולתלות ליד הבר או עמדת הצילום'), 0, 540, {
                align: 'right',
                width: doc.page.width - 80,
            })

        // לינק
        doc.fontSize(10).fillColor('#777').text(guestLink, 0, 580, { align: 'center', width: doc.page.width })

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
