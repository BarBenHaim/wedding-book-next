import { describe, it, expect } from 'vitest'
import { MEDIA } from '@/lib/salesAgent/catalog'
import { mergeMedia, isApprovedSalesMedia, filterApprovedMedia, mediaDeliveryFallback, MEDIA_TEXT_FALLBACK } from '@/lib/salesAgent/mediaLibrary'
import { pickApprovedDemo, mediaGuard } from '@/lib/salesAgent/mediaGuard'
import { buildSystemPrompt } from '@/lib/salesAgent/prompt'

const NOW = Date.parse('2026-10-05T12:00:00Z')
function asset(overrides = {}) {
    const url = 'https://app.weddingtales.co.il/imgs/synthetic-demo.jpg'
    return { assetId: 'synthetic-asset', version: 'test-v1', url, kind: 'image', caption: 'Synthetic demo caption', when: 'Synthetic test purpose',
        approval: { status: 'approved', approvedBy: 'synthetic-reviewer', approvedAt: '2026-10-04T00:00:00Z', evidenceRef: 'synthetic-approval', assetVersion: 'test-v1', assetUrl: url },
        audience: 'public', usageScopes: ['sales_demo'], channels: ['whatsapp'], eventTypes: ['wedding'], representation: 'actual_product', purpose: 'spread',
        rights: { basis: 'owned', evidenceRef: 'synthetic-rights', personalData: 'none', minorData: 'none' }, ...overrides }
}

describe('explicit media provenance', () => {
    it('does not grandfather built-in or uploaded media into sharing permission', () => {
        expect(mergeMedia(MEDIA, [], { strict: true, nowMs: NOW })).toEqual({})
        expect(mergeMedia({}, [{ key: 'test', url: asset().url }], { strict: true, nowMs: NOW })).toEqual({})
    })
    it('preserves the legacy library only outside the opt-in boundary', () => {
        expect(Object.keys(mergeMedia(MEDIA)).length).toBe(Object.keys(MEDIA).length)
    })
    it('requires approval bound to this exact asset URL/version and public usage scope', () => {
        expect(isApprovedSalesMedia(asset(), { nowMs: NOW })).toBe(true)
        for (const change of [{ approval: null }, { version: 'test-v2' }, { url: 'https://app.weddingtales.co.il/imgs/replaced.jpg' }, { audience: 'private' }, { usageScopes: ['internal'] }, { channels: ['email'] }, { disabled: true }, { expiresAt: '2026-10-05T12:00:00Z' }, { eventTypes: [] }, { representation: null }]) expect(isApprovedSalesMedia(asset(change), { nowMs: NOW })).toBe(false)
    })
    it('requires specific provenance and consent evidence for customer/minor media', () => {
        for (const rights of [null, { ...asset().rights, personalData: 'unknown' }, { ...asset().rights, personalData: 'consented' }, { ...asset().rights, minorData: 'consented' }, { ...asset().rights, basis: 'customer_permission' }]) expect(isApprovedSalesMedia(asset({ rights }), { nowMs: NOW })).toBe(false)
        const rights = { ...asset().rights, basis: 'customer_permission', personalData: 'consented', minorData: 'consented', consentEvidenceRef: 'synthetic-consent' }
        expect(isApprovedSalesMedia(asset({ rights }), { nowMs: NOW })).toBe(true)
    })
    it('does not expose private book or management routes even with inconsistent metadata', () => {
        for (const path of ['/wedding/synthetic-id/photo', '/admin/books', '/arrange/synthetic-token', '/owner/book', '/b/synthetic-private-token', '/portal', '/api/private-book']) {
            const a = asset(); a.url = `https://app.weddingtales.co.il${path}`; a.approval.assetUrl = a.url
            expect(isApprovedSalesMedia(a, { nowMs: NOW })).toBe(false)
        }
    })
    it('retains provenance when merging a genuinely approved upload', () => {
        const library = mergeMedia({}, [{ ...asset(), key: 'synthetic_demo' }], { strict: true, nowMs: NOW })
        expect(library.synthetic_demo.approval.assetVersion).toBe('test-v1')
        expect(library.synthetic_demo.source).toBe('upload')
    })
    it('does not replace bat mitzvah examples with bar mitzvah media', () => {
        const library = { bar: asset({ eventTypes: ['bar_mitzvah'] }), bat: asset({ eventTypes: ['bat_mitzvah'] }) }
        expect(pickApprovedDemo({ library, eventType: 'bat_mitzvah', nowMs: NOW })).toBe('bat')
        expect(pickApprovedDemo({ library: { bar: library.bar }, eventType: 'bat_mitzvah', nowMs: NOW })).toBeNull()
    })
    it('chooses at most one event-relevant unseen approved asset, including a video', () => {
        const library = { generic: asset({ eventTypes: ['generic'] }), matched: asset({ kind: 'video' }), rejected: asset({ approval: null }) }
        expect(pickApprovedDemo({ library, eventType: 'wedding', nowMs: NOW })).toBe('matched')
        expect(pickApprovedDemo({ library, eventType: 'wedding', seen: ['matched'], nowMs: NOW })).toBe('generic')
        expect(mediaGuard({ incomingText: 'אפשר דוגמה?', library, eventType: 'wedding', strict: true, nowMs: NOW })).toBe('matched')
        expect(Object.keys(filterApprovedMedia(library, { nowMs: NOW }))).toEqual(['generic', 'matched'])
    })
    it('retries only once then supplies an honest textual fallback', () => {
        expect(mediaDeliveryFallback({ asset: asset(), attempts: 0, nowMs: NOW }).action).toBe('retry')
        expect(mediaDeliveryFallback({ asset: asset(), attempts: 1, nowMs: NOW })).toEqual({ action: 'text', text: MEDIA_TEXT_FALLBACK, asset: null })
        expect(mediaDeliveryFallback({ asset: asset({ approval: null }), attempts: 0, nowMs: NOW }).action).toBe('text')
    })
    it('filters direct media passed into the strict prompt as well as merged libraries', () => {
        const prompt = buildSystemPrompt({ eventType: 'memorial' }, '2026-10-05', { strictCommercial: true, media: { private_marker: asset(), other_marker: asset({ approval: null }) }, nowMs: NOW })
        expect(prompt).not.toContain('private_marker')
        expect(prompt).not.toContain('other_marker')
        expect(prompt).toContain('אין כרגע מדיה זמינה')
    })
})
