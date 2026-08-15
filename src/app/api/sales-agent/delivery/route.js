export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { validateDeliveryEvent } from '@/lib/salesAgent/delivery'
import { recordDeliveryEvent, resolveProviderMessageOutboundId } from '@/lib/salesAgent/leads'

const CONFLICT_CODES = new Set([
    'CHANNEL_MISMATCH',
    'PROVIDER_MESSAGE_ID_MISMATCH',
    'EVENT_ID_REPLAY',
    'EVENT_ID_CONFLICT',
    'INVALID_DELIVERY_TRANSITION',
    'DELIVERY_STATE_REGRESSION',
    'TERMINAL_DELIVERY_STATE',
    'PROVIDER_MESSAGE_ID_NOT_FOUND',
    'PROVIDER_MESSAGE_ID_AMBIGUOUS',
])

export async function POST(req) {
    const expected = process.env.SALES_AGENT_SECRET
    if (!expected || req.headers.get('x-sales-agent-secret') !== expected) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const parsed = validateDeliveryEvent(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    try {
        let event = parsed.event
        if (!event.outboundId) {
            try {
                event = { ...event, outboundId: await resolveProviderMessageOutboundId(event.providerMessageId) }
            } catch (error) {
                if (error?.code === 'PROVIDER_MESSAGE_ID_NOT_FOUND') {
                    return NextResponse.json({
                        accepted: true,
                        result: { action: 'noop', reason: 'PROVIDER_MESSAGE_ID_NOT_FOUND' },
                    }, { status: 202 })
                }
                throw error
            }
        }
        const result = await recordDeliveryEvent(event)
        return NextResponse.json({ accepted: true, result }, { status: 202 })
    } catch (error) {
        if (CONFLICT_CODES.has(error?.code)) {
            return NextResponse.json({ error: error.code }, { status: 409 })
        }
        console.error('[sales-agent/delivery] update failed')
        return NextResponse.json({ error: 'DELIVERY_UPDATE_FAILED' }, { status: 503 })
    }
}
