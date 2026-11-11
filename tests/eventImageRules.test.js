import { describe, expect, it } from 'vitest'
import { validWeddingId, safeImageName, eventImagePath, uploadProblem, downloadUrl, MAX_SERVER_UPLOAD_BYTES } from '@/lib/eventImageRules'

describe('pictures uploaded through our own domain', () => {
    it('accepts the names the management screens actually use', () => {
        for (const name of ['photo-1794390000000.jpg', 'album-1794390000000-3.jpg', 'pagebg_AbC123_1794390000000.jpg', 'replace_0c05c5e7-f7c4-4c19-bd72-a678d93f8895_1794390000000.jpg', 'x.PNG', 'a.webp', 'b.jpeg']) {
            expect(safeImageName(name), name).toBe(name)
        }
    })

    it('refuses anything that could leave the event folder or is not a picture', () => {
        for (const name of ['../other/x.jpg', 'a/b.jpg', 'a\\b.jpg', '.hidden.jpg', 'x..jpg', 'x.svg', 'x.html', 'x.jpg.exe', 'x', '', null, 'שם.jpg', ' x.jpg/', 'x.jpg?alt=media']) {
            expect(safeImageName(name), String(name)).toBe(null)
        }
    })

    it('builds the path only inside weddings/{id}/', () => {
        expect(eventImagePath('6128', 'photo-1.jpg')).toBe('weddings/6128/photo-1.jpg')
        expect(eventImagePath('zzUG0piSIGquFthr6OJm', 'a.png')).toBe('weddings/zzUG0piSIGquFthr6OJm/a.png')
        expect(eventImagePath('../x', 'a.png')).toBe(null)
        expect(eventImagePath('a/b', 'a.png')).toBe(null)
        expect(eventImagePath('', 'a.png')).toBe(null)
        expect(eventImagePath('6128', '../a.png')).toBe(null)
        expect(validWeddingId('6128')).toBe(true)
        expect(validWeddingId(6128)).toBe(false)
    })

    it('says why an upload is refused', () => {
        const ok = { weddingId: '6128', filename: 'photo-1.jpg', size: 200_000, type: 'image/jpeg' }
        expect(uploadProblem(ok)).toBe(null)
        expect(uploadProblem({ ...ok, weddingId: 'a b' })).toBe('bad-wedding')
        expect(uploadProblem({ ...ok, filename: 'x.gif' })).toBe('bad-filename')
        expect(uploadProblem({ ...ok, type: 'text/html' })).toBe('not-an-image')
        expect(uploadProblem({ ...ok, type: 'image/svg+xml' })).toBe('not-an-image')
        expect(uploadProblem({ ...ok, size: 0 })).toBe('empty')
        expect(uploadProblem({ ...ok, size: MAX_SERVER_UPLOAD_BYTES + 1 })).toBe('too-large')
        expect(uploadProblem({ ...ok, size: MAX_SERVER_UPLOAD_BYTES })).toBe(null)
    })

    it('writes the address the way Firebase does, so the rest of the app recognises it', () => {
        const url = downloadUrl('wedding-memories-maker.firebasestorage.app', 'weddings/6128/photo-1.jpg', 'tok-1')
        expect(url).toBe('https://firebasestorage.googleapis.com/v0/b/wedding-memories-maker.firebasestorage.app/o/weddings%2F6128%2Fphoto-1.jpg?alt=media&token=tok-1')
    })
})
