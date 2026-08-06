import { describe, it, expect } from 'vitest'
import { PACKAGES, ADDONS, STAGES, findPackage, FACTS } from '@/lib/salesAgent/catalog'
import { buildSystemPrompt, buildFollowUpPrompt, addDaysISO, formatHebrewDate } from '@/lib/salesAgent/prompt'
import { parseAgentJson, normalizePhone, resolveFollowUp } from '@/lib/salesAgent/agent'
// leadsCore, not leads: importing leads.js boots the Firebase Admin SDK,
// which needs service-account credentials the test runner has no business
// holding. The pure logic lives in leadsCore for exactly this reason.
import { toApiMessages, trimTurns, isPausedForHuman, MAX_TURNS, HUMAN_PAUSE_HOURS } from '@/lib/salesAgent/leadsCore'

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
        expect(run({}, 2)).toBe('2026-08-06')
        expect(run({}, 3)).toBeNull()
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
