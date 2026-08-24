import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { downloadWhatsAppMedia, renderOpeningDesign } from '../src/lib/salesAgent/openingDesign'

const jsonResponse = (body, { ok = true } = {}) => ({ ok, json: async () => body })
const bytesResponse = (bytes, headers = {}) => ({
    ok: true,
    headers: { get: key => headers[String(key).toLowerCase()] || null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
})

describe('downloadWhatsAppMedia', () => {
    it('downloads only a bounded verified image without exposing provider payloads', async () => {
        const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#89a' } }).png().toBuffer()
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ url: 'https://lookaside.facebook.test/media', mime_type: 'image/png', file_size: image.length }))
            .mockResolvedValueOnce(bytesResponse(image, { 'content-type': 'image/png', 'content-length': String(image.length) }))

        const result = await downloadWhatsAppMedia('opaque-provider-id', { fetchFn, token: 'secret-token', graphBase: 'https://graph.facebook.test' })

        expect(result.mimeType).toBe('image/png')
        expect(result.bytes.equals(image)).toBe(true)
        expect(fetchFn).toHaveBeenNthCalledWith(1, 'https://graph.facebook.test/opaque-provider-id', expect.objectContaining({
            headers: { Authorization: 'Bearer secret-token' }, signal: expect.any(AbortSignal),
        }))
        expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://lookaside.facebook.test/media', expect.objectContaining({
            headers: { Authorization: 'Bearer secret-token' }, signal: expect.any(AbortSignal),
        }))
    })

    it.each([
        [{ url: 'https://lookaside.facebook.test/media', mime_type: 'application/pdf', file_size: 10 }, 'UNSUPPORTED_MEDIA_TYPE'],
        [{ url: 'https://lookaside.facebook.test/media', mime_type: 'image/jpeg', file_size: 10_000_001 }, 'MEDIA_TOO_LARGE'],
        [{ url: 'javascript:alert(1)', mime_type: 'image/jpeg', file_size: 10 }, 'MEDIA_PROVIDER_INVALID'],
    ])('rejects invalid metadata with a fixed error', async (metadata, code) => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse(metadata))
        await expect(downloadWhatsAppMedia('opaque-provider-id', { fetchFn, token: 'secret-token', graphBase: 'https://graph.facebook.test' }))
            .rejects.toMatchObject({ code })
    })

    it('normalizes network failures without leaking the provider body or token', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error('private provider payload secret-token'))
        const error = await downloadWhatsAppMedia('opaque-provider-id', { fetchFn, token: 'secret-token' }).catch(value => value)
        expect(error).toMatchObject({ code: 'MEDIA_DOWNLOAD_FAILED', message: 'opening media unavailable' })
        expect(JSON.stringify(error)).not.toMatch(/private provider payload|secret-token/)
    })
})

describe('renderOpeningDesign', () => {
    it('renders a deterministic 1080x1350 PNG for the fixed bar-mitzvah template', async () => {
        const input = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#d9c3a0' } }).jpeg().toBuffer()
        const output = await renderOpeningDesign({ image: input, templateId: 'bar-mitzvah-v1' })
        const metadata = await sharp(output).metadata()
        expect(metadata).toMatchObject({ width: 1080, height: 1350, format: 'png' })
        expect(output.length).toBeLessThan(10_000_000)
    })

    it('rejects unknown templates and invalid images with fixed errors', async () => {
        await expect(renderOpeningDesign({ image: Buffer.from('not-an-image'), templateId: 'bar-mitzvah-v1' }))
            .rejects.toMatchObject({ code: 'DESIGN_RENDER_FAILED' })
        await expect(renderOpeningDesign({ image: Buffer.from('x'), templateId: 'other' }))
            .rejects.toMatchObject({ code: 'INVALID_OPENING_TEMPLATE' })
    })
})
