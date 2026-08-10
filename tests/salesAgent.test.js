import { describe, it, expect } from 'vitest'
import { PACKAGES, ADDONS, STAGES, findPackage, FACTS, MEDIA_KEYS, findMedia } from '@/lib/salesAgent/catalog'
import { buildSystemPrompt, buildFollowUpPrompt, addDaysISO, formatHebrewDate } from '@/lib/salesAgent/prompt'
import { parseAgentJson, normalizePhone, resolveFollowUp, sanitizeReply } from '@/lib/salesAgent/agent'
// leadsCore, not leads: importing leads.js boots the Firebase Admin SDK,
// which needs service-account credentials the test runner has no business
// holding. The pure logic lives in leadsCore for exactly this reason.
import { toApiMessages, trimTurns, isPausedForHuman, isOwnEcho, parseOwnerCommand, MAX_TURNS, HUMAN_PAUSE_HOURS } from '@/lib/salesAgent/leadsCore'

// The agent talks to paying customers with no human in the loop. These
// tests pin the things that would be expensive to discover in production:
// a wrong price in the prompt, a lead that silently stops being chased,
// a malformed model answer reaching a customer as-is.

describe('catalog — the only facts the agent may state', () => {
    it('carries the live prices and checkout links', () => {
        expect(PACKAGES.map(p => p.price)).toEqual([690, 950, 1490])
        expect(findPackage('printed').checkout).toContain('add-to-cart=6271')
        expect(findPackage('digital').checkout).toContain('add-to-cart=6258')
        expect(findPackage('premium').checkout).toContain('add-to-cart=5480')
    })

    it('marks exactly one package as the recommendation', () => {
        // Two "recommended" badges is a confused pitch; zero is a passive one.
        expect(PACKAGES.filter(p => p.recommended)).toHaveLength(1)
        expect(findPackage('printed').recommended).toBe(true)
    })

    it('prices every add-on', () => {
        for (const a of ADDONS) {
            expect(a.name.length).toBeGreaterThan(2)
            expect(Number.isFinite(a.price)).toBe(true)
        }
    })

    it('keeps the funnel stages in order, closed states last', () => {
        expect(STAGES[0]).toBe('new')
        expect(STAGES.indexOf('offer_sent')).toBeGreaterThan(STAGES.indexOf('engaged'))
        expect(STAGES).toContain('closed_won')
    })
})

describe('system prompt — what actually reaches the model', () => {
    const today = '2026-08-05'

    it('injects every price and checkout link', () => {
        const p = buildSystemPrompt({}, today)
        for (const pkg of PACKAGES) {
            expect(p).toContain(String(pkg.price.toLocaleString('he-IL')))
            expect(p).toContain(pkg.checkout)
        }
    })

    it('injects the facts list so answers are quoted, not invented', () => {
        const p = buildSystemPrompt({}, today)
        expect(p).toContain(FACTS[0])
    })

    it('tells the agent what it already knows, so it stops re-asking', () => {
        const p = buildSystemPrompt(
            { name: 'דני', eventType: 'bar_mitzvah', eventDate: '2026-11-05', notes: 'מתלבט מול אשתו' },
            today
        )
        expect(p).toContain('דני')
        expect(p).toContain('2026-11-05')
        expect(p).toContain('מתלבט מול אשתו')
    })

    it('says explicitly that there is nothing known for a brand-new lead', () => {
        expect(buildSystemPrompt({}, today)).toContain('שום דבר')
    })

    it('dates the single allowed concession instead of leaving a placeholder', () => {
        const p = buildSystemPrompt({}, today)
        expect(p).not.toContain('{DATE}')
        // Hebrew, not ISO — the model got the month wrong when left to
        // phrase '2026-08-08' itself. See the regression block below.
        expect(p).toContain('8 באוגוסט 2026') // today + 3
    })

    it('the follow-up prompt keeps the catalog but changes the task', () => {
        const f = buildFollowUpPrompt({ followUpCount: 2 }, today)
        expect(f).toContain(findPackage('printed').checkout) // still grounded
        expect(f).toContain('פולו-אפ מספר 3')
    })
})

describe('addDaysISO', () => {
    it('adds days across a month boundary', () => {
        expect(addDaysISO('2026-08-30', 3)).toBe('2026-09-02')
    })
    it('survives garbage rather than producing Invalid Date', () => {
        expect(addDaysISO('not-a-date', 3)).toBe('not-a-date')
    })
})

describe('normalizePhone — one lead per human', () => {
    it('folds every Israeli spelling onto the same id', () => {
        const forms = ['0501234567', '+972501234567', '972501234567', '050-123-4567', '00972501234567', '501234567']
        const ids = new Set(forms.map(normalizePhone))
        // A mismatch here would create a SECOND lead mid-conversation and
        // the agent would greet a customer it has been talking to for days.
        expect(ids.size).toBe(1)
        expect([...ids][0]).toBe('972501234567')
    })
    it('returns empty for junk', () => {
        expect(normalizePhone('')).toBe('')
        expect(normalizePhone(null)).toBe('')
    })
})

describe('parseAgentJson — nothing malformed reaches a customer', () => {
    const good = JSON.stringify({
        messages: ['היי! על איזה אירוע מדובר?'],
        stage: 'engaged',
        event_type: 'bar_mitzvah',
        event_date: '2026-11-05',
        celebrant_name: 'נועם',
        customer_name: 'דני',
        package_interest: 'printed',
        callback_promised: null,
        follow_up_at: '2026-08-06',
        handoff: false,
        handoff_reason: null,
        objection_raised: false,
        notes: 'האירוע בנובמבר',
    })

    it('parses a clean answer', () => {
        const p = parseAgentJson(good)
        expect(p.malformed).toBe(false)
        expect(p.messages).toHaveLength(1)
        expect(p.stage).toBe('engaged')
        expect(p.eventType).toBe('bar_mitzvah')
        expect(p.packageInterest).toBe('printed')
    })

    it('digs the JSON out of a chatty or fenced answer', () => {
        expect(parseAgentJson('בטח, הנה:\n```json\n' + good + '\n```').stage).toBe('engaged')
    })

    it('repairs a trailing comma', () => {
        const p = parseAgentJson('{"messages":["שלום"],"stage":"engaged",}')
        expect(p.malformed).toBe(false)
        expect(p.messages).toEqual(['שלום'])
    })

    it('accepts the older single-`reply` shape a prompt edit might reintroduce', () => {
        expect(parseAgentJson('{"reply":"שלום","stage":"engaged"}').messages).toEqual(['שלום'])
    })

    it('falls back to a HANDOFF on unparseable output — never to silence', () => {
        for (const bad of ['', 'סתם טקסט בלי JSON', null, undefined, '{{{']) {
            const p = parseAgentJson(bad)
            expect(p.handoff).toBe(true)
            expect(p.stage).toBe('handoff')
            expect(p.malformed).toBe(true)
        }
    })

    it('hands off when the model returns no text and no handoff flag', () => {
        // Otherwise the customer gets nothing at all and nobody notices.
        const p = parseAgentJson('{"messages":[],"stage":"engaged","handoff":false}')
        expect(p.handoff).toBe(true)
    })

    it('rejects invented enum values instead of storing them', () => {
        const p = parseAgentJson('{"messages":["x"],"stage":"almost_closed","event_type":"funeral","package_interest":"gold"}')
        expect(p.stage).toBe('engaged') // safe default, not the invention
        expect(p.eventType).toBeNull()
        expect(p.packageInterest).toBeNull()
    })

    it('rejects a non-ISO date rather than writing it to the CRM', () => {
        const p = parseAgentJson('{"messages":["x"],"stage":"engaged","event_date":"בנובמבר","follow_up_at":"מחר"}')
        expect(p.eventDate).toBeNull()
        expect(p.followUpAt).toBeNull()
    })

    it('caps a runaway answer at three messages', () => {
        const many = JSON.stringify({ messages: ['a', 'b', 'c', 'd', 'e'], stage: 'engaged' })
        expect(parseAgentJson(many).messages).toHaveLength(3)
    })

    it('drops empty strings the model padded the array with', () => {
        expect(parseAgentJson('{"messages":["שלום","","   "],"stage":"engaged"}').messages).toEqual(['שלום'])
    })
})

describe('resolveFollowUp — no lead falls out of the funnel', () => {
    const today = '2026-08-05'
    const base = { handoff: false, stage: 'engaged', callbackPromised: null, followUpAt: null }
    const run = (p, followUpCount = 0) =>
        resolveFollowUp({ parsed: { ...base, ...p }, todayISO: today, followUpCount, addDays: addDaysISO })

    it('always schedules something for a live conversation', () => {
        // The model forgetting follow_up_at must not mean "never chase".
        expect(run({})).toBe('2026-08-06')
    })

    it('chases the day AFTER a promised callback', () => {
        expect(run({ callbackPromised: '2026-08-10' })).toBe('2026-08-11')
    })

    it('lets a promised callback beat the model’s own suggestion', () => {
        expect(run({ callbackPromised: '2026-08-10', followUpAt: '2026-08-06' })).toBe('2026-08-11')
    })

    it('gives a sent offer two days of air', () => {
        expect(run({ stage: 'offer_sent' })).toBe('2026-08-07')
        expect(run({ stage: 'objection' })).toBe('2026-08-07')
    })

    it('never schedules in the past', () => {
        expect(run({ followUpAt: '2026-01-01' })).toBe('2026-08-06')
    })

    it('stops on handoff, on a closed deal, and on a lost one', () => {
        expect(run({ handoff: true })).toBeNull()
        expect(run({ stage: 'closed_won' })).toBeNull()
        expect(run({ stage: 'closed_lost' })).toBeNull()
    })

    it('stops after the third follow-up instead of nagging forever', () => {
        // Still scheduled, but a week out rather than tomorrow: the
        // ladder widens with each attempt (see followupPolicy.js), and
        // somebody who has ignored two messages is not won by a third
        // one the next morning.
        expect(run({}, 2)).toBe('2026-08-12')
        expect(run({}, 3)).toBeNull()
    })

    it('widens the gap with every attempt', () => {
        const gaps = [0, 1, 2].map(n => run({}, n))
        expect(gaps).toEqual(['2026-08-06', '2026-08-08', '2026-08-12'])
    })

    it('chases harder when the event is close and backs off when it is far', () => {
        const soon = run({ eventDate: '2026-08-14' })
        const far = run({ eventDate: '2027-06-01' })
        expect(soon).toBe('2026-08-06')
        expect(far).toBe('2026-08-07')
    })

    it('stops entirely once the event has already happened', () => {
        // A cheerful nudge about a guest book for last week's wedding.
        expect(run({ eventDate: '2026-08-01' })).toBeNull()
    })
})

describe('conversation history sent to the model', () => {
    it('keeps only the last MAX_TURNS', () => {
        const turns = Array.from({ length: MAX_TURNS + 10 }, (_, i) => ({ role: 'user', text: `m${i}` }))
        const t = trimTurns(turns)
        expect(t).toHaveLength(MAX_TURNS)
        expect(t[t.length - 1].text).toBe(`m${MAX_TURNS + 9}`)
    })

    it('merges consecutive same-role turns — the API rejects them otherwise', () => {
        const msgs = toApiMessages(
            [
                { role: 'user', text: 'היי' },
                { role: 'user', text: 'יש לי בר מצווה' },
                { role: 'assistant', text: 'מעולה, מתי?' },
            ],
            'ב-5.11'
        )
        expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
        expect(msgs[0].content).toBe('היי\nיש לי בר מצווה')
    })

    it('always starts with a user turn', () => {
        const msgs = toApiMessages([{ role: 'assistant', text: 'שלום' }], 'היי')
        expect(msgs[0].role).toBe('user')
    })

    it('skips blank turns rather than sending empty content', () => {
        const msgs = toApiMessages([{ role: 'user', text: '  ' }], 'היי')
        expect(msgs).toEqual([{ role: 'user', content: 'היי' }])
    })
})

describe('human handoff pause', () => {
    it('is not paused for a normal lead', () => {
        expect(isPausedForHuman({ stage: 'engaged' })).toBe(false)
    })

    it('silences the bot right after a handoff', () => {
        const now = Date.now()
        expect(isPausedForHuman({ human: true, humanSince: now }, now + 1000)).toBe(true)
    })

    it('lets the bot resume once the pause expires', () => {
        // A lead nobody remembers to un-pause is lost more quietly than
        // one never contacted, so the mute has to time out.
        const now = Date.now()
        const later = now + (HUMAN_PAUSE_HOURS + 1) * 3600 * 1000
        expect(isPausedForHuman({ human: true, humanSince: now }, later)).toBe(false)
    })

    it('stays quiet when the pause has no timestamp at all', () => {
        expect(isPausedForHuman({ human: true })).toBe(true)
    })
})

// ── Regressions caught in live testing, 2026-08-05 ──────────────────
describe('the concession deadline the model must not compute itself', () => {
    it('renders the ISO date in Hebrew before it reaches the prompt', () => {
        // Handed "2026-08-09", the model wrote "9 בספטמבר" — a month late —
        // twice in production. A bonus deadline a month off destroys the
        // urgency it exists to create.
        expect(formatHebrewDate('2026-08-09')).toBe('9 באוגוסט 2026')
        expect(formatHebrewDate('2026-01-01')).toBe('1 בינואר 2026')
        expect(formatHebrewDate('2026-12-31')).toBe('31 בדצמבר 2026')
    })

    it('passes junk through instead of inventing a date', () => {
        expect(formatHebrewDate('not-a-date')).toBe('not-a-date')
        expect(formatHebrewDate('2026-13-01')).toBe('2026-13-01') // no 13th month
        expect(formatHebrewDate(null)).toBe('')
    })

    it('puts the Hebrew deadline in the prompt, never the raw ISO one', () => {
        const p = buildSystemPrompt({}, '2026-08-05')
        expect(p).toContain('8 באוגוסט 2026') // today + 3
        expect(p).not.toContain('{DATE}')
    })

    it('tells the agent not to emit markdown WhatsApp cannot render', () => {
        // A reply came back with **bold**, which WhatsApp shows as literal
        // asterisks — it uses single ones.
        expect(buildSystemPrompt({}, '2026-08-05')).toContain('Markdown')
    })
})

// ── Sounding human ──────────────────────────────────────────────────
// The prompt asks for all of this. These tests pin the half that does
// not depend on the model complying, because across a few hundred
// messages it eventually will not.

describe('sanitizeReply — the tells that give a bot away', () => {
    it('turns a spaced em dash into the comma it was standing in for', () => {
        expect(sanitizeReply('הספר מגיע תוך שבועיים — כולל משלוח')).toBe('הספר מגיע תוך שבועיים, כולל משלוח')
        expect(sanitizeReply('נשמח לעזור – בכל שאלה')).toBe('נשמח לעזור, בכל שאלה')
    })

    it('leaves real hyphens and phone numbers alone', () => {
        expect(sanitizeReply('תתקשר ל-052-661-8184')).toBe('תתקשר ל-052-661-8184')
        expect(sanitizeReply('בר-מצווה')).toBe('בר-מצווה')
    })

    it('never leaves an em dash behind, in any position', () => {
        for (const s of ['א—ב', '—פתיחה', 'סוף—', 'א — ב — ג']) {
            expect(sanitizeReply(s)).not.toMatch(/[—–]/)
        }
    })

    it('does not stack punctuation when it rewrites a dash', () => {
        expect(sanitizeReply('שלום, — מה שלומך?')).toBe('שלום, מה שלומך?')
        expect(sanitizeReply('בסדר. — נתקדם')).toBe('בסדר. נתקדם')
    })

    it('keeps one emoji and drops the confetti', () => {
        expect(sanitizeReply('מזל טוב 🎉🎊✨🥳')).toBe('מזל טוב 🎉')
        expect(sanitizeReply('בשמחה 😊 נשמח לעזור 🙏')).toBe('בשמחה 😊 נשמח לעזור')
    })

    it('strips an emoji that opens the message', () => {
        // Leading ornament reads as a marketing blast, not a person.
        expect(sanitizeReply('🎉 מזל טוב!')).toBe('מזל טוב!')
    })

    it('removes markdown WhatsApp would show as literal characters', () => {
        expect(sanitizeReply('המחיר הוא **950 שח**')).toBe('המחיר הוא 950 שח')
        expect(sanitizeReply('## כותרת\nטקסט')).toBe('כותרת\nטקסט')
    })

    it('flattens bullet and numbered lists into plain lines', () => {
        expect(sanitizeReply('- ספר מודפס\n- משלוח חינם')).toBe('ספר מודפס\nמשלוח חינם')
        expect(sanitizeReply('1. ראשון\n2. שני')).toBe('ראשון\nשני')
    })

    it('is safe on empty and non-string input', () => {
        expect(sanitizeReply('')).toBe('')
        expect(sanitizeReply(null)).toBe('')
        expect(sanitizeReply(undefined)).toBe('')
    })

    it('runs on every message the model returns', () => {
        const out = parseAgentJson(JSON.stringify({
            messages: ['הכל מוכן — נתחיל?', '🎉🎉 מעולה'],
            stage: 'engaged',
        }))
        expect(out.messages[0]).toBe('הכל מוכן, נתחיל?')
        expect(out.messages[1]).toBe('מעולה')
    })
})

describe('images — a whitelist, not a capability', () => {
    it('resolves every advertised key to a live-looking jpg on our own origin', () => {
        expect(MEDIA_KEYS.length).toBeGreaterThan(0)
        for (const key of MEDIA_KEYS) {
            const m = findMedia(key)
            expect(m.url).toMatch(/^https:\/\/app\.weddingtales\.co\.il\//)
            expect(m.url).toMatch(/\.jpg$/)
            expect(m.when).toBeTruthy()
        }
    })

    it('accepts a key from the list', () => {
        const out = parseAgentJson(JSON.stringify({
            messages: ['ככה זה נראה'], stage: 'engaged', image: 'pages_bar_mitzvah',
        }))
        expect(out.image).toBe('pages_bar_mitzvah')
    })

    it('refuses a key the model made up', () => {
        const out = parseAgentJson(JSON.stringify({
            messages: ['הנה'], stage: 'engaged', image: 'book_brit',
        }))
        expect(out.image).toBeNull()
    })

    it('refuses a raw URL even when it points at us', () => {
        // The whole point of the key indirection: a model that can name a
        // URL will eventually name one that 404s in front of a customer.
        const out = parseAgentJson(JSON.stringify({
            messages: ['הנה'], stage: 'engaged',
            image: 'https://app.weddingtales.co.il/imgs/portfolio/wedding/cover.jpg',
        }))
        expect(out.image).toBeNull()
    })

    it('accepts an uploaded key when the caller passes the merged library', () => {
        // The bug this pins down: the model was TOLD about uploaded
        // media, picked one, and the parser nulled it against the static
        // six. The picture vanished with nothing in any log.
        const out = parseAgentJson(JSON.stringify({
            messages: ['ככה זה נראה'], stage: 'engaged', image: 'flip_video',
        }), { mediaKeys: ['flip_video', 'book_wedding'] })
        expect(out.image).toBe('flip_video')
    })

    it('still rejects a key missing from the merged library', () => {
        const out = parseAgentJson(JSON.stringify({
            messages: ['הנה'], stage: 'engaged', image: 'made_up',
        }), { mediaKeys: ['flip_video'] })
        expect(out.image).toBeNull()
    })

    it('drops an image that would arrive with no words', () => {
        const out = parseAgentJson(JSON.stringify({
            messages: [], stage: 'handoff', handoff: true, image: 'book_wedding',
        }))
        expect(out.image).toBeNull()
    })

    it('offers the agent the media keys and forbids inventing a URL', () => {
        const p = buildSystemPrompt({}, '2026-08-05')
        for (const key of MEDIA_KEYS) expect(p).toContain(key)
        expect(p).toContain('אל תמציא כתובת')
    })

    it('falls back to the built-in six when the library could not be read', () => {
        // A Firestore hiccup must cost the bot the uploaded extras, not
        // the images it has always had.
        const p = buildSystemPrompt({}, '2026-08-05', { media: null })
        for (const key of MEDIA_KEYS) expect(p).toContain(key)
    })

    it('takes an uploaded library and marks video as video', () => {
        const p = buildSystemPrompt({}, '2026-08-05', {
            media: { flip: { kind: 'video', when: 'כששואלים איך זה נראה', url: 'u', caption: 'c' } },
        })
        expect(p).toContain('flip (סרטון)')
        expect(p).toContain('כששואלים איך זה נראה')
    })

    it('answers a price question before it qualifies anybody', () => {
        // The failure Lord reported: asked how much, answered with a
        // question about the event.
        const p = buildSystemPrompt({}, '2026-08-05')
        expect(p).toMatch(/אם הוא שאל מחיר, תגיד מחיר/)
        expect(p).toMatch(/תגיד לו כמה זה עולה/)
    })

    it('never says the owner is called לורד', () => {
        // It went out to real customers. It is a handle, not a name a
        // business uses about itself.
        expect(buildSystemPrompt({}, '2026-08-05')).not.toContain('לורד')
    })
})

describe('returning leads — continuing, not restarting', () => {
    it('tells the agent when it has spoken to this person before', () => {
        const p = buildSystemPrompt({ isNew: false, name: 'דנה', stage: 'offer_sent' }, '2026-08-05')
        expect(p).toContain('זה לא לקוח חדש')
        expect(p).toContain('דנה')
        expect(p).toContain('offer_sent')
    })

    it('says plainly when it is a first contact', () => {
        expect(buildSystemPrompt({ isNew: true }, '2026-08-05')).toContain('ההודעה הראשונה')
    })

    it('surfaces how long the lead has been silent', () => {
        expect(buildSystemPrompt({ isNew: false, daysSinceLastMessage: 9 }, '2026-08-05')).toContain('עברו 9 ימים')
    })

    it('lists photos already sent so it does not repeat one', () => {
        const p = buildSystemPrompt({ isNew: false, imagesSent: ['book_wedding'] }, '2026-08-05')
        expect(p).toContain('book_wedding')
        expect(p).toContain('אל תשלח את אותה תמונה שוב')
    })

    it('bans the em dash in the prompt as well as in code', () => {
        // Belt and braces: the sanitizer is the guarantee, the prompt is
        // what keeps the model from fighting it every single message.
        expect(buildSystemPrompt({}, '2026-08-05')).toContain('מקף ארוך')
        expect(buildFollowUpPrompt({}, '2026-08-05')).toContain('מקף ארוך')
    })
})

// ── Getting out of the way ──────────────────────────────────────────
// A sales bot that talks over its owner, or pitches packages to someone
// who already paid, does more damage than a bot that says nothing. These
// pin the two signals that make it stand down.

describe('isOwnEcho — our voice vs a human typing', () => {
    const withTurns = turns => ({ turns })

    it('recognises the message the bot itself just sent', () => {
        const lead = withTurns([
            { role: 'user', text: 'כמה זה עולה?' },
            { role: 'assistant', text: 'הספר המודפס עולה 950 שח, כולל משלוח.' },
        ])
        expect(isOwnEcho(lead, 'הספר המודפס עולה 950 שח, כולל משלוח.')).toBe(true)
    })

    it('ignores whitespace differences the transport introduces', () => {
        const lead = withTurns([{ role: 'assistant', text: 'שורה ראשונה\nשורה שנייה' }])
        expect(isOwnEcho(lead, 'שורה ראשונה שורה שנייה')).toBe(true)
        expect(isOwnEcho(lead, '  שורה ראשונה\n\nשורה שנייה  ')).toBe(true)
    })

    it('matches the joined form of a multi-bubble reply', () => {
        // The reply goes out as one WhatsApp message but is stored as one
        // turn per bubble, so the echo is the join of the last few turns.
        const lead = withTurns([
            { role: 'user', text: 'מעניין' },
            { role: 'assistant', text: 'הנה הדמו:' },
            { role: 'assistant', text: 'https://app.weddingtales.co.il/demo' },
        ])
        expect(isOwnEcho(lead, 'הנה הדמו: https://app.weddingtales.co.il/demo')).toBe(true)
    })

    it('does NOT match something a human typed', () => {
        const lead = withTurns([{ role: 'assistant', text: 'הספר המודפס עולה 950 שח.' }])
        expect(isOwnEcho(lead, 'היי, מדבר לורד, אני אענה לך אישית')).toBe(false)
    })

    it('does not match an older bot message once the customer replied since', () => {
        // Only the TRAILING run of assistant turns counts. If the customer
        // has spoken since, a repeat of that text is a human quoting it.
        const lead = withTurns([
            { role: 'assistant', text: 'המחיר הוא 950 שח' },
            { role: 'user', text: 'יקר לי' },
        ])
        expect(isOwnEcho(lead, 'המחיר הוא 950 שח')).toBe(false)
    })

    it('is false for an empty lead or empty text', () => {
        expect(isOwnEcho({}, 'משהו')).toBe(false)
        expect(isOwnEcho(withTurns([{ role: 'assistant', text: 'שלום' }]), '')).toBe(false)
        expect(isOwnEcho(null, 'שלום')).toBe(false)
    })
})

describe('parseOwnerCommand', () => {
    it('reads a mute command with any phone formatting', () => {
        for (const s of ['שקט 0501234567', 'שקט 050-123-4567', 'שקט +972 50 1234567', 'שקט  050-1234567']) {
            const c = parseOwnerCommand(s)
            expect(c.action, s).toBe('pause')
            expect(normalizePhone(c.phone), s).toBe('972501234567')
        }
    })

    it('reads resume and status', () => {
        expect(parseOwnerCommand('בוט 0501234567').action).toBe('resume')
        expect(parseOwnerCommand('סטטוס 0501234567').action).toBe('status')
        expect(parseOwnerCommand('status 0501234567').action).toBe('status')
    })

    it('returns the verb with a null phone when the number is missing', () => {
        expect(parseOwnerCommand('שקט')).toEqual({ action: 'pause', phone: null })
    })

    it('returns null for anything that is not a command', () => {
        // This runs only on messages from the owner's own number, but it
        // still must not turn ordinary sentences into actions.
        expect(parseOwnerCommand('מה קורה')).toBeNull()
        expect(parseOwnerCommand('אני רוצה לשאול על המחיר')).toBeNull()
        expect(parseOwnerCommand('')).toBeNull()
        expect(parseOwnerCommand(null)).toBeNull()
    })

    it('only treats the FIRST word as the verb', () => {
        // "תשלח לו שקט" is a sentence, not an instruction to the bot.
        expect(parseOwnerCommand('תשלח לו שקט 0501234567')).toBeNull()
    })
})
