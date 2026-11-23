import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_COVER_KEYS, defaultCoverKey, defaultCoverUrl, coverIsUndressed, fallbackCoverTexture } from '@/lib/defaultCovers'
import { EVENT_TYPE_ORDER } from '@/lib/eventTypes'

describe('default covers: every event type has one', () => {
    it('has a finished file for every key', () => {
        for (const key of DEFAULT_COVER_KEYS) {
            const file = path.join(process.cwd(), 'public', 'covers', `${key}.webp`)
            expect(fs.existsSync(file), key).toBe(true)
            expect(fs.statSync(file).size, key).toBeGreaterThan(50_000)
        }
    })

    it('maps every known event type to a cover, the twins to bar mitzvah, anything else to the neutral one', () => {
        for (const type of EVENT_TYPE_ORDER) expect(DEFAULT_COVER_KEYS, type).toContain(defaultCoverKey(type))
        expect(defaultCoverKey('twins_bar_mitzvah')).toBe('bar_mitzvah')
        expect(defaultCoverKey('bat_mitzvah')).toBe('bat_mitzvah')
        for (const odd of [undefined, null, '', 'brit', 'something_new', 42]) expect(defaultCoverKey(odd), String(odd)).toBe('other')
        expect(defaultCoverUrl('birthday')).toBe('/covers/birthday.webp')
    })
})

describe('an undressed cover is judged by the same cascade the template paints with', () => {
    it('is undressed only when nothing was set', () => {
        expect(coverIsUndressed(undefined)).toBe(true)
        expect(coverIsUndressed({})).toBe(true)
        expect(coverIsUndressed({ coverTexture: null, texture: '', coverTitle: '  ' })).toBe(true)
        expect(coverIsUndressed({ backgroundColor: '#ffffff', backgroundUrl: '/backgrounds/book/wd-silk.webp' })).toBe(true) // page art is not a cover
    })

    it('leaves anything the owner or a preset set exactly as it is', () => {
        expect(coverIsUndressed({ coverImage: 'https://x/y.png' })).toBe(false)
        expect(coverIsUndressed({ coverTexture: '/textures/tex1.png' })).toBe(false)
        expect(coverIsUndressed({ coverTexture: 'none' })).toBe(false) // an explicit plain cover stays plain
        expect(coverIsUndressed({ texture: '/textures/tex2.png' })).toBe(false)
        expect(coverIsUndressed({ coverTitle: 'ספר הברכות של דנה' })).toBe(false)
        expect(coverIsUndressed({ coverSubtitle: 'דנה' })).toBe(false)
    })

    it('gives the fallback texture only for an undressed cover', () => {
        expect(fallbackCoverTexture({}, 'bat_mitzvah')).toBe('/covers/bat_mitzvah.webp')
        expect(fallbackCoverTexture({ coverImage: 'https://x/y.png' }, 'bat_mitzvah')).toBeNull()
        expect(fallbackCoverTexture({ coverTexture: 'none' }, 'wedding')).toBeNull()
    })
})

describe('the cover template paints it', () => {
    const render = async (wedding, style) => {
        const { renderToStaticMarkup } = await import('react-dom/server')
        const React = (await import('react')).default
        globalThis.React = React // the template's JSX relies on the app's automatic runtime; vitest needs the global
        const { default: BookCoverTemplate } = await import('@/components/BookCoverTemplate/BookCoverTemplate')
        return renderToStaticMarkup(React.createElement(BookCoverTemplate, { wedding, styleSettings: style, scaledWidth: 300, scaledHeight: 300 }))
    }

    it('paints the cover of the event type when nothing dressed the cover', async () => {
        expect(await render({ eventType: 'bat_mitzvah' }, { backgroundColor: '#ffffff' })).toContain('/covers/bat_mitzvah.webp')
        expect(await render({ eventType: 'twins_bar_mitzvah' }, {})).toContain('/covers/bar_mitzvah.webp')
        expect(await render({}, {})).toContain('/covers/other.webp')
    })

    it('does not touch a cover the owner dressed', async () => {
        const photo = await render({ eventType: 'wedding' }, { coverImage: 'https://example.com/p.png' })
        expect(photo).not.toContain('/covers/')
        expect(photo).toContain('https://example.com/p.png')
        expect(await render({ eventType: 'wedding' }, { coverTexture: 'none' })).not.toContain('/covers/')
        expect(await render({ eventType: 'wedding' }, { coverTexture: '/textures/tex1.png' })).not.toContain('/covers/')
        expect(await render({ eventType: 'wedding' }, { coverTitle: 'ספר הברכות של דנה' })).not.toContain('/covers/')
    })
})
