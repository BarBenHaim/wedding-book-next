export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import nodemailer from 'nodemailer'

const LULU_API_KEY = process.env.LULU_API_KEY
const LULU_API_SECRET = process.env.LULU_API_SECRET
const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com'
const LULU_AUTH_URL = process.env.LULU_AUTH_URL || 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'

// ─── 1. Get OAuth2 token from Lulu ──────────────────────────────────────────
async function getLuluToken() {
    const res = await fetch(LULU_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: LULU_API_KEY,
            client_secret: LULU_API_SECRET,
        }),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Lulu auth failed (${res.status}): ${text}`)
    }

    const data = await res.json()
    return data.access_token
}

// ─── 2. Calculate shipping cost (optional pre-check) ────────────────────────
async function getShippingOptions(token, payload) {
    const res = await fetch(`${LULU_API_BASE}/print-job-cost-calculations/`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const text = await res.text()
        console.error('Lulu cost calc error:', text)
        return null
    }

    return res.json()
}

// ─── 3. Create print job ────────────────────────────────────────────────────
async function createPrintJob(token, payload) {
    const res = await fetch(`${LULU_API_BASE}/print-jobs/`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || body.message || JSON.stringify(body) || `HTTP ${res.status}`)
    }

    return res.json()
}

// ─── 4. Send admin email notification ───────────────────────────────────────
async function sendAdminEmail({ weddingId, printJobId, shippingAddress, contentUrl, coverUrl, estimatedCost, currency, pageCount }) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
    })

    const costLine = estimatedCost
        ? `<p><strong>עלות משוערת:</strong> ${estimatedCost} ${currency}</p>`
        : ''

    await transporter.sendMail({
        from: process.env.MAIL_USER,
        to: 'barbenbh@gmail.com',
        subject: `🖨️ הזמנת הדפסה חדשה! Wedding #${weddingId}`,
        html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #AA8840, #c9a44e); padding: 24px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 22px;">הזמנת הדפסה חדשה!</h1>
                <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Wedding Tales Print Order</p>
            </div>

            <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e5e5; border-top: none;">
                <div style="background: #f9f7f2; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <p style="margin: 4px 0;"><strong>מזהה חתונה:</strong> ${weddingId}</p>
                    <p style="margin: 4px 0;"><strong>מזהה הזמנת Lulu:</strong> <span style="font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 4px;">${printJobId}</span></p>
                    <p style="margin: 4px 0;"><strong>מספר עמודים:</strong> ${pageCount}</p>
                    ${costLine}
                </div>

                <h3 style="color: #AA8840; border-bottom: 2px solid #AA8840; padding-bottom: 8px;">כתובת למשלוח</h3>
                <div style="background: #f9f7f2; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <p style="margin: 4px 0;"><strong>שם:</strong> ${shippingAddress.name}</p>
                    <p style="margin: 4px 0;"><strong>רחוב:</strong> ${shippingAddress.street1}${shippingAddress.street2 ? ', ' + shippingAddress.street2 : ''}</p>
                    <p style="margin: 4px 0;"><strong>עיר:</strong> ${shippingAddress.city}</p>
                    <p style="margin: 4px 0;"><strong>מיקוד:</strong> ${shippingAddress.postcode}</p>
                    <p style="margin: 4px 0;"><strong>מדינה:</strong> ${shippingAddress.countryCode}</p>
                    ${shippingAddress.phone ? `<p style="margin: 4px 0;"><strong>טלפון:</strong> ${shippingAddress.phone}</p>` : ''}
                    ${shippingAddress.email ? `<p style="margin: 4px 0;"><strong>אימייל:</strong> ${shippingAddress.email}</p>` : ''}
                </div>

                <h3 style="color: #AA8840; border-bottom: 2px solid #AA8840; padding-bottom: 8px;">קבצים להורדה</h3>
                <div style="margin: 16px 0;">
                    <p>
                        <strong>1. תוכן הספר (Content):</strong><br/>
                        <a href="${contentUrl}" target="_blank" style="color: #AA8840; font-weight: bold;">לחץ להורדת התוכן</a>
                    </p>
                    <p>
                        <strong>2. כריכות (Covers):</strong><br/>
                        <a href="${coverUrl}" target="_blank" style="color: #AA8840; font-weight: bold;">לחץ להורדת הכריכות</a>
                    </p>
                </div>

                <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 12px; padding: 12px; margin-top: 16px;">
                    <p style="margin: 0; font-size: 13px; color: #8d6e00;">
                        ⚠️ <strong>שים לב:</strong> ההזמנה נוצרה ב-Lulu. כדי שההזמנה תעבור לייצור, יש לוודא שקיימת שיטת תשלום פעילה בחשבון ה-Lulu שלך.
                    </p>
                </div>
            </div>

            <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 16px 16px; border: 1px solid #e5e5e5; border-top: none;">
                <p style="font-size: 12px; color: gray; margin: 0; text-align: center;">נשלח אוטומטית ממערכת Wedding Tales</p>
            </div>
        </div>
        `,
    })
}

// ─── Main POST handler ──────────────────────────────────────────────────────
export async function POST(req) {
    try {
        const {
            weddingId,
            contentUrl,      // Firebase Storage URL of interior PDF
            coverUrl,         // Firebase Storage URL of cover spread PDF
            pageCount,        // Number of interior pages
            shippingAddress,  // { name, street1, street2, city, stateCode, postcode, countryCode, phone, email }
            quantity = 1,
        } = await req.json()

        // Validation
        if (!contentUrl || !coverUrl) {
            return NextResponse.json({ error: 'Missing PDF URLs' }, { status: 400 })
        }
        if (!shippingAddress?.name || !shippingAddress?.street1 || !shippingAddress?.city || !shippingAddress?.countryCode || !shippingAddress?.postcode) {
            return NextResponse.json({ error: 'Missing shipping address fields' }, { status: 400 })
        }
        if (!pageCount || pageCount < 2) {
            return NextResponse.json({ error: 'Invalid page count' }, { status: 400 })
        }

        // ───────────────────────────────────────────────────────────────────
        // Pod Package ID for your book format:
        // 8.5x8.5 inch (216x216mm) square book
        // 0850X0850FCSTDPB060UW444GXX
        // ───────────────────────────────────────────────────────────────────
        // Premium (PRE) instead of Standard (STD) — required for high ink coverage (photo books)
        const POD_PACKAGE_ID = '0850X0850FCPREPB060UW444GXX'

        // Get auth token
        const token = await getLuluToken()

        // Build the print job payload
        const printJobPayload = {
            contact_email: shippingAddress.email || process.env.MAIL_USER,
            line_items: [
                {
                    title: `Wedding Tales - ${weddingId}`,
                    cover: {
                        source_url: coverUrl,
                    },
                    interior: {
                        source_url: contentUrl,
                    },
                    pod_package_id: POD_PACKAGE_ID,
                    quantity: quantity,
                },
            ],
            shipping_address: {
                name: shippingAddress.name,
                street1: shippingAddress.street1,
                street2: shippingAddress.street2 || undefined,
                city: shippingAddress.city,
                state_code: shippingAddress.stateCode || undefined,
                postcode: shippingAddress.postcode,
                country_code: shippingAddress.countryCode,
                phone_number: shippingAddress.phone || '',
            },
            shipping_option_level: 'MAIL',
            external_id: `wt-${weddingId}-${Date.now()}`,
        }

        // First, get cost estimate
        const costEstimate = await getShippingOptions(token, printJobPayload)

        // Create the actual print job
        const printJob = await createPrintJob(token, printJobPayload)

        console.log(`🖨️ Lulu print job created for wedding ${weddingId}:`, printJob.id)

        // ─── Save print order to Firestore ──────────────────────────────
        const printOrderData = {
            printJobId: printJob.id,
            luluStatus: printJob.status?.name || 'CREATED',
            orderedAt: new Date().toISOString(),
            shippingAddress: {
                name: shippingAddress.name,
                street1: shippingAddress.street1,
                street2: shippingAddress.street2 || null,
                city: shippingAddress.city,
                postcode: shippingAddress.postcode,
                countryCode: shippingAddress.countryCode,
                phone: shippingAddress.phone || null,
                email: shippingAddress.email || null,
            },
            contentUrl,
            coverUrl,
            pageCount,
            quantity,
            estimatedCost: costEstimate?.total_cost_incl_tax ?? null,
            currency: costEstimate?.currency ?? 'USD',
        }

        await adminDb.collection('weddings').doc(weddingId).set(
            { printOrder: printOrderData },
            { merge: true }
        )

        console.log(`📝 Print order saved to Firestore for wedding ${weddingId}`)

        // ─── Send admin email notification ──────────────────────────────
        try {
            await sendAdminEmail({
                weddingId,
                printJobId: printJob.id,
                shippingAddress,
                contentUrl,
                coverUrl,
                estimatedCost: costEstimate?.total_cost_incl_tax ?? null,
                currency: costEstimate?.currency ?? 'USD',
                pageCount,
            })
            console.log(`📧 Admin email sent for wedding ${weddingId}`)
        } catch (emailErr) {
            // Don't fail the whole request if email fails
            console.error('❌ Admin email failed (order still created):', emailErr)
        }

        return NextResponse.json({
            success: true,
            printJobId: printJob.id,
            status: printJob.status?.name || 'CREATED',
            estimatedCost: costEstimate?.total_cost_incl_tax ?? null,
            currency: costEstimate?.currency ?? 'USD',
        })
    } catch (err) {
        console.error('❌ Lulu order error:', err)
        return NextResponse.json(
            { error: err.message || 'Failed to create print order' },
            { status: 500 }
        )
    }
}
