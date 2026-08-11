import { describe, it, expect } from 'vitest'
import { resolveEntryPhoto, hasPhotoOverride } from '@/lib/entryPhoto'

const guest = {
    id: 'e1',
    name: 'סבתא',
    text: 'ברכה',
    imageUrl: 'https://storage.example/original.jpg',
    imgAspect: 1.5,
    photoPosition: '40% 60%',
}

describe('resolveEntryPhoto', () => {
    it('leaves an untouched entry exactly as it was', () => {
        // Identity, not a copy: this runs on every entry of every load,
        // and a fresh object each time breaks memo equality upstream.
        expect(resolveEntryPhoto(guest)).toBe(guest)
        expect(resolveEntryPhoto({ ...guest, imageUrlOverride: '' })).toEqual({ ...guest, imageUrlOverride: '' })
        expect(resolveEntryPhoto({ ...guest, imageUrlOverride: '   ' }).imageUrl).toBe(guest.imageUrl)
    })

    it('serves the replacement as the entry photo', () => {
        const r = resolveEntryPhoto({ ...guest, imageUrlOverride: 'https://storage.example/new.jpg' })
        expect(r.imageUrl).toBe('https://storage.example/new.jpg')
    })

    it('never destroys what the guest sent', () => {
        // The whole reason this is an override and not an edit.
        const r = resolveEntryPhoto({ ...guest, imageUrlOverride: 'https://storage.example/new.jpg' })
        expect(r.originalImageUrl).toBe('https://storage.example/original.jpg')
        expect(r.imageUrlOverride).toBe('https://storage.example/new.jpg')
    })

    it('drops the old aspect so no-crop letterboxes to the NEW photo', () => {
        // Inheriting 1.5 from the replaced picture would frame the new
        // one to a box it does not fit — the exact bug "do not crop"
        // exists to prevent.
        const r = resolveEntryPhoto({ ...guest, imageUrlOverride: 'https://storage.example/new.jpg' })
        expect(r.imgAspect).toBeNull()
    })

    it('uses a measured aspect when one was stored with the replacement', () => {
        const r = resolveEntryPhoto({
            ...guest,
            imageUrlOverride: 'https://storage.example/new.jpg',
            imgAspectOverride: 0.75,
        })
        expect(r.imgAspect).toBe(0.75)
    })

    it('ignores a nonsense stored aspect rather than trusting it', () => {
        for (const bad of [0, -2, NaN, 'wide', null]) {
            const r = resolveEntryPhoto({ ...guest, imageUrlOverride: 'u', imgAspectOverride: bad })
            expect(r.imgAspect, String(bad)).toBeNull()
        }
    })

    it('keeps everything else about the blessing intact', () => {
        const r = resolveEntryPhoto({ ...guest, imageUrlOverride: 'u' })
        expect(r.name).toBe('סבתא')
        expect(r.text).toBe('ברכה')
        expect(r.photoPosition).toBe('40% 60%')
    })

    it('can give a photo to a blessing that never had one', () => {
        const r = resolveEntryPhoto({ id: 'e2', text: 'ברכה', imageUrlOverride: 'u' })
        expect(r.imageUrl).toBe('u')
        expect(r.originalImageUrl).toBeNull()
    })

    it('survives junk', () => {
        expect(resolveEntryPhoto(null)).toBeNull()
        expect(resolveEntryPhoto(undefined)).toBeUndefined()
    })
})

describe('hasPhotoOverride', () => {
    it('reports only a real replacement', () => {
        expect(hasPhotoOverride(guest)).toBe(false)
        expect(hasPhotoOverride({ ...guest, imageUrlOverride: '' })).toBe(false)
        expect(hasPhotoOverride({ ...guest, imageUrlOverride: '  ' })).toBe(false)
        expect(hasPhotoOverride({ ...guest, imageUrlOverride: 'u' })).toBe(true)
        expect(hasPhotoOverride(null)).toBe(false)
    })
})
