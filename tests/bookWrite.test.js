import { describe, expect, it } from 'vitest'
import { BOOK_VARIANT, charactersLeft, filledParts, isBookVariant, nextToFill, previewEntry, sendState, thanksPreviewParam } from '@/lib/bookWrite'
import he from '@/i18n/messages/he.json'
import en from '@/i18n/messages/en.json'
import es from '@/i18n/messages/es.json'
import it_ from '@/i18n/messages/it.json'

describe('writing straight onto the page of the book', () => {
    it('is used only where an event asked for it', () => {
        expect(isBookVariant('bar_mitzvah', BOOK_VARIANT)).toBe(true)
        expect(isBookVariant('wedding', 'book')).toBe(true)
        for (const variant of ['', undefined, null, 'night', 'dawn', 'romantic']) expect(isBookVariant('wedding', variant)).toBe(false)
    })

    it('never takes over a poker table, which has its own felt', () => {
        expect(isBookVariant('poker', 'book')).toBe(false)
    })

    it('knows which parts of the page are filled', () => {
        expect(filledParts({ text: '  ', name: '', photoUrl: '' })).toEqual({ text: false, photo: false, name: false })
        expect(filledParts({ text: 'מזל טוב', name: ' דנה ', photoUrl: 'blob:x' })).toEqual({ text: true, photo: true, name: true })
    })

    it('opens the first empty part when the page itself is tapped', () => {
        expect(nextToFill({ text: false, photo: false, name: false })).toBe('text')
        expect(nextToFill({ text: true, photo: false, name: false })).toBe('photo')
        expect(nextToFill({ text: true, photo: true, name: false })).toBe('name')
        expect(nextToFill({ text: true, photo: true, name: true })).toBe('text')
    })

    it('asks for words before it offers to send', () => {
        expect(sendState({ text: ' ', submitting: false })).toEqual({ disabled: true, label: 'bookSendWrite' })
        expect(sendState({ text: 'מזל טוב', submitting: false })).toEqual({ disabled: false, label: 'bookSend' })
        expect(sendState({ text: 'מזל טוב', submitting: true })).toEqual({ disabled: true, label: 'submitting' })
    })

    it('counts what is left and never goes below nothing', () => {
        expect(charactersLeft('abc', 210)).toBe(207)
        expect(charactersLeft('a'.repeat(300), 210)).toBe(0)
    })

    it('hands the book renderer the page exactly as it will be saved', () => {
        expect(previewEntry({ name: '  דנה ', text: 'שורה\nשנייה', photoUrl: 'blob:x' }))
            .toEqual({ id: 'live-preview', name: 'דנה', text: 'שורה\nשנייה', imageUrl: 'blob:x' })
        expect(previewEntry({ name: '', text: '', photoUrl: '' }).imageUrl).toBe(null)
    })

    it('carries a one-off design preview on to the thank-you screen, and nothing else', () => {
        expect(thanksPreviewParam('?dv=book')).toBe('&dv=book')
        expect(thanksPreviewParam('?dv=night&g=x')).toBe('')
        expect(thanksPreviewParam('?g=abc')).toBe('')
        expect(thanksPreviewParam('')).toBe('')
    })

    it('has every word of the page in all four languages', () => {
        const keys = ['bookTitle', 'bookTitleFor', 'bookHint', 'bookToolText', 'bookToolPhoto', 'bookToolName', 'bookAsk', 'bookAskFor', 'bookPhotoHeading', 'bookNameHeading',
            'bookDone', 'bookClose', 'bookSend', 'bookSendWrite', 'bookCharsLeft', 'bookEmptyPage', 'bookTextPlaceholder', 'bookNamePlaceholder', 'bookStarters']
        for (const [lang, messages] of Object.entries({ he, en, es, it: it_ })) {
            for (const key of keys) expect(messages.photo[key], `${lang} ${key}`).toBeTruthy()
            expect(messages.photo.bookStarters.split('|').length, lang).toBeGreaterThanOrEqual(3)
        }
    })
})
