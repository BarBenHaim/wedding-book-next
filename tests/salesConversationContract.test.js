import { describe, expect, it } from 'vitest'
import { decideSalesTurn } from '@/lib/salesAgent/decisionPolicy'
import { buildConversationalTurn } from '@/lib/salesAgent/conversationRuntime'
import { createOfferSnapshot } from '@/lib/salesAgent/offerCatalog'
import { prepareCheckout } from '@/lib/salesAgent/checkoutContract'
import { sanitizeConversationContract } from '@/lib/salesAgent/salesContract'
import { readStrictFollowUpPolicy } from '@/lib/salesAgent/followupPolicy'
import { FIXTURE_NOW as NOW, syntheticCatalog } from './fixtures/salesContractFixtures'
const run = (text, lead = {}, extra = {}) => buildConversationalTurn({ lead, incomingText: text, eventId: 'synthetic-event', revision: 3, decision: decideSalesTurn({ lead, incomingText: text, todayISO: '2026-10-05' }), catalogResult: syntheticCatalog(), nowMs: NOW, ...extra })
const words = result => result.parsed.messages.join(' ')
const policy = () => readStrictFollowUpPolicy({ SALES_CONVERSATIONAL_POLICY_ENABLED: 'true', SALES_CONSENT_FOLLOWUPS_ENABLED: 'true', SALES_CONSENT_FOLLOWUPS_ACTIVATED_AT: '2026-10-01T00:00:00Z', SALES_CONSENT_FOLLOWUP_HOURS_JSON: JSON.stringify({ timeZone: 'Asia/Jerusalem', weekly: { 1: [['09:00','18:00']] } }), SALES_CONSENT_FOLLOWUP_DELAYS_HOURS: '[4,72]' })
describe('conversational spec contextual acceptance', () => {
    it('captures a supplied event, name and approximate month without demanding date or photo', async () => {
        const result = await run('בר מצווה לשםבדיקה בעוד חודשיים, כמה עולה?')
        expect(result.parsed).toMatchObject({ eventType: 'bar_mitzvah', celebrantName: 'שםבדיקה' })
        expect(result.contract.eventDatePrecision).toBe('approximate')
        expect(words(result)).not.toMatch(/מה השם|מתי האירוע|שלחו תמונה/)
    })
    it('uses specific participation reassurance without promising guest count', async () => {
        const result = await run('ואם אנשים לא ישלחו?')
        expect(words(result)).toContain('אין הבטחה שכולם ישתתפו')
        expect(result.parsed.stage).toBe('objection')
    })
    it('quotes verified assistance scope for workload concern', async () => {
        expect(words(await run('אין לי זמן להתעסק בזה'))).toContain('סיוע סינתטי')
    })
    it('can offer approved digital alternative without automatic discount', async () => {
        const result = await run('יקר לי')
        expect(words(result)).toContain('690')
        expect(words(result)).not.toMatch(/במתנה|300|מבצע|הנחה/)
    })
    it('uses approved access period and distinguishes urgent physical deadline', async () => {
        expect(words(await run('אפשר רק אחרי האירוע?'))).toContain('תקופה סינתטית')
        expect((await run('זה יגיע מחר?')).parsed.handoff).toBe(true)
    })
    it('answers verified generic delivery terms but never promises an unverified date', async () => {
        expect(words(await run('מה זמני האספקה?'))).toContain('זמן משלוח סינתטי')
        expect(words(await run('מה זמני האספקה?'))).not.toContain('14')
    })
    it('retains snapshots for both quoted products so later price changes cannot vanish', async () => {
        const quoted = await run('כמה עולה?')
        const changed = syntheticCatalog()
        changed.offers[1].price.totalMinor = changed.offers[1].price.subtotalMinor = 100000
        const later = await run('רוצה להזמין מודפס', { ...quoted.contract, turns: [] }, {
            catalogResult: changed,
            checkout: args => Promise.resolve(prepareCheckout({ ...args, nowMs: NOW })),
        })
        expect(later.contract.lastQuestion).toBe('offer_change_confirmation')
        expect(words(later)).not.toContain('add-to-cart')
    })
    it.each(['איך זה עובד?', 'אפשר דוגמה?', 'אני רוצה להזמין אבל קודם מה מקבלים?', 'כן אבל קודם מה כלול?'])('answers the new question %s instead of reusing stale checkout consent', async text => {
        let requested = false
        const result = await run(text, { lastQuestion: 'checkout_confirmation', packageInterest: 'printed', turns: [{ role: 'user', text: 'מודפס' }, { role: 'assistant', text: 'להמשיך להזמנה?' }] }, {
            checkout: async () => { requested = true; return { status: 'ready', checkoutUrl: 'https://weddingtales.co.il/checkout/?add-to-cart=6271' } },
        })
        expect(requested).toBe(false)
        expect(result.contract.conversationalState).not.toBe('CHECKOUT')
        expect(words(result)).not.toContain('add-to-cart')
    })

    it('does not claim missing media was sent', async () => {
        const result = await run('שלח דוגמה')
        expect(result.parsed.image).toBeNull()
        expect(result.parsed.stage).not.toBe('demo_sent')
        expect(words(result)).toContain('אין כרגע דוגמה')
    })
    it('hands over after two unresolved turns, preserving the customer request', async () => {
        const result = await run('הפרט האחר שהתכוונתי אליו', { turns: [{ role: 'user', text: 'synthetic earlier request' }], misunderstandingCount: 1 })
        expect(result.parsed.handoffReason).toBe('two_unresolved_turns')
    })
    it('callback clarification never overwrites the event date and never sends earlier', async () => {
        const first = await run('תדברו איתי בשבוע הבא', { eventDate: '2027-01-01' })
        expect(first.contract.followUpSchedule).toBeNull()
        const later = await run('12.10.2026 בשעה 10:00', { ...first.contract, eventDate: '2027-01-01', lastInboundAtMs: NOW }, { followUpPolicy: policy() })
        expect(later.parsed.eventDate).toBeNull()
        expect(later.contract.eventDateText).toBeUndefined()
        expect(later.contract.followUpConsent.callbackAtMs).toBe(Date.parse('2026-10-12T07:00:00Z'))
        expect(later.contract.followUpSchedule.dueAtMs).toBe(Date.parse('2026-10-12T07:00:00Z'))
    })
    it('new generic consent schedules once against actual persisted inbound timestamp', async () => {
        const result = await run('תזכירו לי פעם אחת', { lastInboundAtMs: NOW - 100, marketingSuppressed: true }, { followUpPolicy: policy() })
        expect(result.contract.marketingSuppressed).toBe(false)
        expect(result.contract.followUpConsent.maxReminders).toBe(1)
        expect(result.contract.followUpSchedule.lastInboundAtMs).toBe(NOW - 100)
    })
    it('preserves a pending human request even if a newer turn would otherwise be a courtesy silence', async () => {
        const result = await run('תודה', { stage: 'closed_lost', handoffPending: true })
        expect(result.parsed.handoff).toBe(true)
        expect(result.parsed.noReply).not.toBe(true)
        expect(result.contract.conversationalState).toBe('HUMAN')
    })

    it('prior opt-out still blocks scheduling after a newer ordinary price question', async () => {
        const result = await run('כמה עולה?', { marketingSuppressed: true, lastInboundAtMs: NOW, followUpConsent: null }, { followUpPolicy: policy() })
        expect(result.contract.followUpSchedule).toBeNull()
        expect(result.contract.followUpConsent).toBeUndefined()
        expect(result.followUpAt).toBeNull()
    })

    it('sanitizer retains bounded offer changes but cannot manufacture payment or customer identity', () => {
        const snapshot = createOfferSnapshot(syntheticCatalog().offers[0], { nowMs: NOW })
        const contract = sanitizeConversationContract({ conversationalPolicyVersion: '2026-10-05.v1', offerSnapshots: { digital: snapshot }, paymentVerified: true, verifiedOrderId: 'invented', verifiedCustomer: { uid: 'invented' } })
        expect(contract.offerSnapshots.digital.price.totalMinor).toBe(69000)
        expect(contract.paymentVerified).toBeUndefined()
        expect(contract.verifiedCustomer).toBeUndefined()
    })
})
