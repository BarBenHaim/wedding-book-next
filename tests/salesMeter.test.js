import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: null, adminAuth: null, adminStorage: null }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time', increment: n => n } }))

import { meterAnswer, meterImage } from '@/lib/salesAgent/meter'
import { costOfClaudeUsage, costOfImageUsage } from '@/lib/salesAgent/pricing'

const usage = { input_tokens: 1000, output_tokens: 200 }

describe('booking the cost of a model call made outside the reply route', () => {
    it('books a Claude answer at its model price', async () => {
        const record = vi.fn(async () => {})
        await meterAnswer({ text: 'x', usage, model: 'claude-opus-5-5', provider: 'anthropic' }, { record })
        const { usd } = costOfClaudeUsage(usage, 'claude-opus-5-5')
        expect(usd).toBeGreaterThan(0)
        expect(record).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-opus-5-5', usd, usage })
    })

    it('books nothing when the answer carries no usage', async () => {
        const record = vi.fn(async () => {})
        await meterAnswer({ text: 'x' }, { record })
        await meterAnswer(undefined, { record })
        expect(record).not.toHaveBeenCalled()
    })

    it('counts a call whose price is unknown, at zero money', async () => {
        const record = vi.fn(async () => {})
        await meterAnswer({ usage, model: 'claude-unheard-of' }, { record })
        expect(record).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-unheard-of', usd: 0, usage })
    })

    it('never throws, because bookkeeping must not break the work', async () => {
        const record = vi.fn(async () => { throw new Error('write failed') })
        await expect(meterAnswer({ usage, model: 'claude-opus-5-5' }, { record })).resolves.toBeUndefined()
    })

    it('books an image with its picture count', async () => {
        const record = vi.fn(async () => {})
        const imageUsage = { input_tokens: 500, output_tokens: 4000 }
        await meterImage({ usage: imageUsage, model: 'gpt-image-2' }, { record })
        const { usd } = costOfImageUsage(imageUsage, 'gpt-image-2')
        expect(record).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-image-2', usd, usage: imageUsage, images: 1 })
    })

    it('still counts an image the API reported no usage for', async () => {
        const record = vi.fn(async () => {})
        await meterImage({ model: 'gpt-image-2' }, { record })
        expect(record).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-image-2', usd: 0, usage: undefined, images: 1 })
    })
})
