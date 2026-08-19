import { describe, expect, it, vi } from 'vitest'
import { readPriorConversationContext } from '../src/lib/salesAgent/priorContext'

const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
})

describe('readPriorConversationContext', () => {
    it('returns a bounded fact summary for a known historical conversation without putting the phone in the URL', async () => {
        const fetcher = vi.fn().mockResolvedValue(response({
            found: true,
            eventType: 'בר מצווה',
            eventDate: '2026-10-20',
            celebrantName: 'יואב',
            stage: 'offer_sent',
            messageCount: 12,
            lastMessageAt: '2026-08-18T10:00:00.000Z',
            summary: 'כבר קיבל דוגמה וביקש לחזור אליו אחרי החג',
            transcript: 'must never cross the boundary',
        }))

        await expect(readPriorConversationContext('972500000000', {
            fetcher,
            baseUrl: 'https://businessos-control.vercel.app',
            secret: 'shared-secret',
        })).resolves.toEqual({
            state: 'found',
            hasPriorConversation: true,
            eventType: 'בר מצווה',
            eventDate: '2026-10-20',
            celebrantName: 'יואב',
            stage: 'offer_sent',
            messageCount: 12,
            lastMessageAt: '2026-08-18T10:00:00.000Z',
            summary: 'כבר קיבל דוגמה וביקש לחזור אליו אחרי החג',
        })
        expect(fetcher).toHaveBeenCalledWith('https://businessos-control.vercel.app/api/crm/whatsapp-leads/context', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ authorization: 'Bearer shared-secret' }),
            body: JSON.stringify({ phone: '972500000000' }),
        }))
        expect(fetcher.mock.calls[0][0]).not.toContain('972500000000')
    })

    it('distinguishes a proven-new phone from a historical conversation', async () => {
        await expect(readPriorConversationContext('phone-token', {
            fetcher: vi.fn().mockResolvedValue(response({ found: false })),
            baseUrl: 'https://businessos-control.vercel.app',
            secret: 'shared-secret',
        })).resolves.toEqual({ state: 'none', hasPriorConversation: false })
    })

    it.each([
        ['provider failure', vi.fn().mockResolvedValue(response({ error: 'private provider failure' }, 503))],
        ['invalid response', vi.fn().mockResolvedValue(response({ found: 'yes', transcript: 'raw only' }))],
        ['network failure', vi.fn().mockRejectedValue(new Error('private network body'))],
    ])('fails conservatively without leaking raw data for %s', async (_label, fetcher) => {
        await expect(readPriorConversationContext('phone-token', {
            fetcher,
            baseUrl: 'https://businessos-control.vercel.app',
            secret: 'shared-secret',
        })).resolves.toEqual({ state: 'unknown', hasPriorConversation: true })
    })

    it('times out as unknown instead of blocking the sales reply', async () => {
        const fetcher = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }))
        await expect(readPriorConversationContext('phone-token', {
            fetcher,
            baseUrl: 'https://businessos-control.vercel.app',
            secret: 'shared-secret',
            timeoutMs: 5,
        })).resolves.toEqual({ state: 'unknown', hasPriorConversation: true })
    })

    it('drops invalid fact values while keeping the conversation block', async () => {
        const fetcher = vi.fn().mockResolvedValue(response({
            found: true,
            eventType: 'x'.repeat(500),
            eventDate: 'not-a-date',
            stage: 'invented-stage',
            messageCount: -4,
            lastMessageAt: 'not-a-timestamp',
            summary: 's'.repeat(900),
        }))
        await expect(readPriorConversationContext('phone-token', {
            fetcher,
            baseUrl: 'https://businessos-control.vercel.app',
            secret: 'shared-secret',
        })).resolves.toEqual({ state: 'found', hasPriorConversation: true })
    })
})
