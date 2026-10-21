import { describe, expect, it } from 'vitest'
import {
    MANAGE_SCOPE,
    linkScope,
    canManage,
    manageLinkUrl,
    isOwnEventPhotoUrl,
    validateEdit,
    isManageAction,
    actionAllowedOn,
    publicManageEntry,
    manageLinkMessage,
    MAX_NAME_LENGTH,
    MAX_TEXT_LENGTH,
} from '@/lib/manageLinks'
import { resolveEntryPhoto } from '@/lib/entryPhoto'

describe('which links may manage', () => {
    it('a link with no scope is an arrange link, as it always was', () => {
        expect(linkScope({ weddingId: 'w' })).toBe('arrange')
        expect(canManage({ weddingId: 'w' })).toBe(false)
        expect(canManage({ weddingId: 'w', scope: 'arrange' })).toBe(false)
        expect(canManage({ weddingId: 'w', scope: MANAGE_SCOPE })).toBe(true)
        expect(canManage(null)).toBe(false)
    })

    it('builds the link under /manage without a double slash', () => {
        expect(manageLinkUrl('https://app.weddingtales.co.il/', 'tok')).toBe('https://app.weddingtales.co.il/manage/tok')
    })
})

describe('photo URLs a link may put in the book', () => {
    const ok = 'https://firebasestorage.googleapis.com/v0/b/wt.appspot.com/o/weddings%2F6172%2Fmanage_e1_1.jpg?alt=media&token=x'

    it('accepts our storage, inside this event folder', () => {
        expect(isOwnEventPhotoUrl('6172', ok)).toBe(true)
    })

    it('refuses another event, another host, http, and junk', () => {
        expect(isOwnEventPhotoUrl('9999', ok)).toBe(false)
        expect(isOwnEventPhotoUrl('617', ok)).toBe(false)
        expect(isOwnEventPhotoUrl('6172', ok.replace('firebasestorage.googleapis.com', 'evil.example.com'))).toBe(false)
        expect(isOwnEventPhotoUrl('6172', ok.replace('https:', 'http:'))).toBe(false)
        expect(isOwnEventPhotoUrl('6172', 'not a url')).toBe(false)
        expect(isOwnEventPhotoUrl('', ok)).toBe(false)
    })
})

describe('edits', () => {
    it('trims, caps and keeps only name/text', () => {
        const r = validateEdit({ name: '  סבתא  ', text: 'מזל טוב\r\nאוהבים', imageUrl: 'x' })
        expect(r).toEqual({ ok: true, fields: { name: 'סבתא', text: 'מזל טוב\nאוהבים' } })
        expect(validateEdit({ name: 'א'.repeat(500) }).fields.name.length).toBe(MAX_NAME_LENGTH)
        expect(validateEdit({ text: 'ב'.repeat(9000) }).fields.text.length).toBe(MAX_TEXT_LENGTH)
    })

    it('refuses an empty or malformed request', () => {
        expect(validateEdit({}).ok).toBe(false)
        expect(validateEdit({ name: 5 }).ok).toBe(false)
        expect(validateEdit(null).ok).toBe(false)
    })

    it('knows its actions, and blank pages only move', () => {
        expect(isManageAction('delete')).toBe(true)
        expect(isManageAction('drop-table')).toBe(false)
        const blank = { kind: 'blank' }
        expect(actionAllowedOn('order', blank)).toBe(true)
        for (const a of ['edit', 'photo', 'restorePhoto', 'delete']) expect(actionAllowedOn(a, blank)).toBe(false)
        expect(actionAllowedOn('delete', { name: 'x' })).toBe(true)
        expect(actionAllowedOn('edit', null)).toBe(false)
    })
})

describe('what the page sees', () => {
    it('flags a swapped photo and whether the guest had one', () => {
        const swapped = publicManageEntry(resolveEntryPhoto({ id: 'a', name: 'n', text: 't', imageUrl: 'https://g/orig.jpg', imageUrlOverride: 'https://g/new.jpg' }))
        expect(swapped).toMatchObject({ imageUrl: 'https://g/new.jpg', photoReplaced: true, guestHadPhoto: true })

        const added = publicManageEntry(resolveEntryPhoto({ id: 'b', name: 'n', text: 't', imageUrl: null, imageUrlOverride: 'https://g/new.jpg' }))
        expect(added).toMatchObject({ imageUrl: 'https://g/new.jpg', photoReplaced: true, guestHadPhoto: false })

        const plain = publicManageEntry(resolveEntryPhoto({ id: 'c', name: 'n', text: 't', imageUrl: 'https://g/orig.jpg' }))
        expect(plain).toMatchObject({ photoReplaced: false, guestHadPhoto: false })
        expect(plain).not.toHaveProperty('imageUrlOverride')
    })
})

describe('the WhatsApp message', () => {
    it('greets by first name, lists what can be done, link on its own line', () => {
        const msg = manageLinkMessage({ ownerName: 'דנה כהן', eventLabel: 'בר מצווה של אריאל', link: 'https://app/manage/t' })
        expect(msg.startsWith('היי דנה,')).toBe(true)
        expect(msg).toContain('ספר הברכות של בר מצווה של אריאל')
        expect(msg.split('\n')).toContain('https://app/manage/t')
        expect(msg).toContain('בלי התחברות ובלי סיסמה')
    })
})
