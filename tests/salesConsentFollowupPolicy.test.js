import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    readStrictFollowUpPolicy, strictFollowUpEligibility, strictSendableNow,
    createStrictFollowUpSchedule, strictFollowUpDate, isInsideWhatsAppWindow,
} from '@/lib/salesAgent/followupPolicy'
import { captureExplicitFollowUpConsent, parseExplicitCallbackAt, resolveExplicitCallbackConsent, parseJerusalemCallbackAt } from '@/lib/salesAgent/followupEvidence'
import { planFollowUp } from '@/lib/salesAgent/followupStrategy'
import { findOrphans } from '@/lib/salesAgent/sweep'

// All approval/consent/config below is synthetic. It does not activate a job.
const NOW = Date.parse('2026-10-05T09:00:00Z')
const HOUR = 3600_000
const env = {
    SALES_CONVERSATIONAL_POLICY_ENABLED: 'true',
    SALES_CONSENT_FOLLOWUPS_ENABLED: 'true',
    SALES_CONSENT_FOLLOWUPS_ACTIVATED_AT: '2026-10-01T00:00:00Z',
    SALES_CONSENT_FOLLOWUP_HOURS_JSON: JSON.stringify({ timeZone: 'Asia/Jerusalem', weekly: { 0: [['09:30', '17:30']], 1: [['09:30', '17:30']] } }),
    SALES_CONSENT_FOLLOWUP_DELAYS_HOURS: '[4,72]',
    SALES_FOLLOWUP_TEMPLATE_ENABLED: 'true',
    SALES_FOLLOWUP_TEMPLATE_NAME: 'wt_followup_he',
    SALES_FOLLOWUP_TEMPLATE_APPROVAL_JSON: JSON.stringify({ name: 'wt_followup_he', language: 'he', status: 'APPROVED', category: 'MARKETING', purpose: 'sales_reminders', source: 'synthetic-test-fixture', checkedAtMs: NOW - HOUR }),
}
const policy = () => readStrictFollowUpPolicy(env)
function lead(patch = {}) {
    const value = {
        phone: 'synthetic-not-a-number', stage: 'offer_sent', conversationRevision: 7,
        lastInboundAt: NOW - 4 * HOUR, unansweredSalesReminders: 0,
        followUpConsent: { status: 'granted', scope: 'sales_reminders', source: 'customer_message',
            sourceMessageId: 'synthetic-inbound-seven', recordedAtMs: NOW - 4 * HOUR, maxReminders: 2, usedReminders: 0 },
        ...patch,
    }
    return { ...value, followUpSchedule: createStrictFollowUpSchedule(value, { nowMs: NOW, policy: policy() }) }
}
const check = (value, options = {}) => strictFollowUpEligibility(value, { nowMs: NOW, policy: policy(), ...options })

beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value) })
afterEach(() => vi.unstubAllEnvs())

describe('strict consent follow-up configuration and evidence', () => {
    it('keeps rollout off by default and requires separately approved activation/configuration', () => {
        expect(readStrictFollowUpPolicy({}).enabled).toBe(false)
        expect(readStrictFollowUpPolicy({ SALES_CONVERSATIONAL_POLICY_ENABLED: 'true' }).active).toBe(false)
        expect(check(lead(), { policy: readStrictFollowUpPolicy({ ...env, SALES_CONSENT_FOLLOWUP_HOURS_JSON: '' }) }).ok).toBe(false)
        expect(check(lead(), { policy: readStrictFollowUpPolicy({ ...env, SALES_CONSENT_FOLLOWUP_DELAYS_HOURS: '' }) }).ok).toBe(false)
    })
    it.each(['כמה עולה?', 'אפשר מידע נוסף', 'כן', 'כן תשלחי דוגמה', 'לא מעוניין', 'אל תזכירו לי'])('does not treat %s as sales-reminder consent', text => {
        expect(captureExplicitFollowUpConsent({ text, sourceMessageId: 'synthetic', nowMs: NOW })).toBeNull()
    })
    it('records source, time and narrow one-reminder scope for an explicit request', () => {
        expect(captureExplicitFollowUpConsent({ text: 'תזכירו לי', sourceMessageId: 'synthetic', nowMs: NOW })).toMatchObject({
            scope: 'sales_reminders', source: 'customer_message', sourceMessageId: 'synthetic', recordedAtMs: NOW, maxReminders: 1,
        })
        expect(captureExplicitFollowUpConsent({ text: 'שלחו לי שתי תזכורות', sourceMessageId: 'synthetic', nowMs: NOW }).maxReminders).toBe(2)
    })
    it('cannot invent a callback timestamp for an unresolved later request', () => {
        const consent = captureExplicitFollowUpConsent({ text: 'תדברו איתי בשבוע הבא', sourceMessageId: 'synthetic', nowMs: NOW })
        expect(consent.callbackPending).toBe(true)
        expect(lead({ followUpConsent: consent }).followUpSchedule).toBeNull()
    })
    it.each(['sourceMessageId', 'recordedAtMs', 'scope', 'source', 'maxReminders'])('requires durable %s on permission', key => {
        const value = lead()
        delete value.followUpConsent[key]
        expect(check(value).ok).toBe(false)
    })
    it('does not downgrade a strict consent lead into the legacy ladder when rollout is disabled', () => {
        expect(check(lead(), { policy: readStrictFollowUpPolicy({}) }).ok).toBe(false)
        expect(findOrphans([{ ...lead(), followUpAt: null, lastInboundAt: NOW - 72 * HOUR }], { nowMs: NOW, policy: readStrictFollowUpPolicy({}) })).toEqual([])
    })
    it('never recovers old orphan leads or implicitly enrolls a legacy due date', () => {
        const old = { ...lead(), followUpAt: '2026-10-01', followUpSchedule: null }
        expect(check(old).reason).toBe('stale-or-missing-followup-schedule')
        expect(findOrphans([{ ...old, followUpAt: null }], { nowMs: NOW, policy: policy() })).toEqual([])
        expect(lead({ followUpConsent: { ...lead().followUpConsent, recordedAtMs: Date.parse('2026-09-01T00:00:00Z') } }).followUpSchedule).toBeNull()
    })
})

describe('strict dispatch safety', () => {
    it('permits only an explicitly consented current schedule', () => {
        const value = lead()
        expect(check(value)).toMatchObject({ ok: true, withinWindow: true })
        expect(strictFollowUpDate(value.followUpSchedule)).toBe('2026-10-05')
    })
    it('invalidates schedule after a new inbound or revision, including same-millisecond inbound', () => {
        expect(check({ ...lead(), lastInboundAt: NOW }).ok).toBe(false)
        expect(check({ ...lead(), conversationRevision: 8 }).ok).toBe(false)
        const snapshot = lead().followUpSchedule
        expect(check(lead(), { expectedSchedule: { ...snapshot, generation: 6 } }).ok).toBe(false)
    })
    it.each([
        { human: true, humanSince: NOW - 1000 * HOUR }, { humanTakeover: true }, { human_takeover: true },
        { humanTaskStatus: 'open' }, { paymentVerified: true }, { paymentClaimed: true }, { existingCustomer: true },
        { stage: 'SERVICE' }, { stage: 'PAID' }, { marketingSuppressed: true }, { optedOut: true },
        { stage: 'STOPPED' }, { offerMismatch: true }, { stage: 'OFFER_MISMATCH' },
    ])('stops for %j', patch => {
        expect(check({ ...lead(), ...patch }).ok).toBe(false)
    })
    it('honors exact customer callback time without same-day early delivery', () => {
        const value = lead({ followUpConsent: { ...lead().followUpConsent, callbackAtMs: NOW + HOUR } })
        expect(check(value).reason).toBe('customer-callback-not-due')
        expect(check(value, { nowMs: NOW + HOUR }).ok).toBe(true)
        expect(check({ ...value, followUpSchedule: { ...value.followUpSchedule, dueAtMs: NOW } }).ok).toBe(false)
    })
    it('caps at two unanswered reminders and respects one-reminder-only permission', () => {
        expect(check({ ...lead(), unansweredSalesReminders: 2 }).reason).toBe('reminder-limit')
        const value = lead()
        value.followUpConsent = { ...value.followUpConsent, maxReminders: 1, usedReminders: 1 }
        expect(createStrictFollowUpSchedule(value, { nowMs: NOW, policy: policy() })).toBeNull()
        expect(check(value).ok).toBe(false)
        expect(check({ ...value, unansweredSalesReminders: 1 }, { claimedAttemptNumber: 1 }).ok).toBe(true)
        expect(check({ ...value, unansweredSalesReminders: 3 }, { claimedAttemptNumber: 1 }).ok).toBe(false)
    })
    it('cannot accidentally resend expired uncertain attempts', () => {
        expect(check({ ...lead(), lastDeliveryStatus: 'requested', deliveryRequestUntilMs: NOW - 1 }).reason).toBe('followup-attempt-unsettled')
        expect(check({ ...lead(), lastDeliveryStatus: 'accepted', deliveryPendingUntilMs: NOW - 1 }).reason).toBe('followup-attempt-unsettled')
    })
    it('spaces a second reminder by configured 72 hours without inventing a third', () => {
        const value = lead({ lastSalesReminderClaimedAtMs: NOW, followUpConsent: { ...lead().followUpConsent, usedReminders: 1 } })
        expect(value.followUpSchedule.dueAtMs).toBe(NOW + 72 * HOUR)
        expect(value.followUpSchedule.attemptNumber).toBe(2)
        expect(lead({ followUpConsent: { ...lead().followUpConsent, usedReminders: 2 } }).followUpSchedule).toBeNull()
    })
})

describe('real 24-hour window and template purpose', () => {
    it('uses only actual last customer message, never outbound/admin activity', () => {
        expect(isInsideWhatsAppWindow({ lastMessageAt: NOW, updatedAt: NOW }, NOW)).toBe(false)
        expect(isInsideWhatsAppWindow({ lastInboundAt: NOW - 24 * HOUR, lastMessageAt: NOW }, NOW)).toBe(false)
        expect(isInsideWhatsAppWindow({ lastInboundAt: NOW - 24 * HOUR + 1 }, NOW)).toBe(true)
    })
    const expired = () => lead({ lastInboundAt: NOW - 25 * HOUR })
    it('requires approved correct-category template outside 24 hours even with consent', () => {
        expect(check(expired(), { transport: 'text' }).reason).toBe('whatsapp-window-closed')
        expect(check(expired(), { transport: 'template', templateName: 'wt_followup_he' }).ok).toBe(true)
        expect(check(expired(), { policy: { ...policy(), template: null } }).reason).toBe('approved-marketing-template-required')
        const bad = JSON.parse(env.SALES_FOLLOWUP_TEMPLATE_APPROVAL_JSON)
        bad.category = 'UTILITY'
        expect(readStrictFollowUpPolicy({ ...env, SALES_FOLLOWUP_TEMPLATE_APPROVAL_JSON: JSON.stringify(bad) }).template).toBeNull()
    })
    it('does not treat an approved template as consent', () => {
        expect(check({ ...expired(), followUpConsent: null }, { transport: 'template', templateName: 'wt_followup_he' }).ok).toBe(false)
    })
})

describe('Jerusalem business hours and conservative content', () => {
    it('uses approved minute boundaries in local time through winter/summer offsets', () => {
        expect(strictSendableNow(Date.parse('2026-10-05T06:29:00Z'), policy()).ok).toBe(false)
        expect(strictSendableNow(Date.parse('2026-10-05T06:30:00Z'), policy()).ok).toBe(true)
        expect(strictSendableNow(Date.parse('2026-10-05T14:30:00Z'), policy()).ok).toBe(false)
        expect(strictSendableNow(Date.parse('2026-11-02T07:30:00Z'), policy()).ok).toBe(true)
        expect(strictSendableNow(Date.parse('2026-11-02T15:30:00Z'), policy()).ok).toBe(false)
    })
    it('never adds a coupon, bonus, testimony, urgency, or media to a strict reminder', () => {
        for (const stage of ['offer_sent', 'ready_to_pay', 'demo_sent', 'objection']) {
            const result = planFollowUp({ ...lead(), stage }, { policy: policy(), offer: { code: 'UNAPPROVED' } })
            expect(result.strict).toBe(true)
            expect(result.mediaPreference).toBe('none')
            expect(result.coupon).toBeNull()
            expect(result.messageText).not.toMatch(/מתנה|הנחה|פוסטר|UNAPPROVED|שמרתי|ראיתי שנכנס/)
        }
    })
})


describe('explicit callback timestamp resolution', () => {
    it('accepts one exact future ISO timestamp with an explicit offset', () => {
        expect(parseExplicitCallbackAt('ביום 2026-10-12T15:30:00+03:00', NOW)).toBe(Date.parse('2026-10-12T12:30:00Z'))
        expect(parseExplicitCallbackAt('2026-10-12 12:30Z', NOW)).toBe(Date.parse('2026-10-12T12:30:00Z'))
        const consent = captureExplicitFollowUpConsent({ text: 'תדברו איתי 2026-10-12T15:30+03:00', sourceMessageId: 'synthetic', nowMs: NOW })
        expect(consent.callbackAtMs).toBe(Date.parse('2026-10-12T12:30:00Z'))
        expect(consent.callbackPending).toBe(false)
    })
    it.each([
        'מחר בשלוש', '2026-10-12T15:30', '2026-02-30T15:30+03:00',
        '2026-10-12T25:30+03:00', '2026-10-12T15:30+14:30',
        '2026-10-01T15:30+03:00', '2026-10-12T15:30+03:00 או 2026-10-13T15:30+03:00',
    ])('leaves ambiguous/invalid/past time %s unresolved', text => {
        expect(parseExplicitCallbackAt(text, NOW)).toBeNull()
    })
    it('records callback evidence without broadening or resetting one-reminder permission', () => {
        const prior = captureExplicitFollowUpConsent({ text: 'תדברו איתי בשבוע הבא', sourceMessageId: 'original-synthetic', nowMs: NOW - HOUR })
        const result = resolveExplicitCallbackConsent({ lead: { lastQuestion: 'callback_exact_time', followUpConsent: prior }, text: '2026-10-12T15:30+03:00', sourceMessageId: 'clarification-synthetic', nowMs: NOW })
        expect(result).toMatchObject({ maxReminders: 1, usedReminders: 0, sourceMessageId: 'original-synthetic', recordedAtMs: NOW - HOUR, callbackSourceMessageId: 'clarification-synthetic', callbackRecordedAtMs: NOW, callbackPending: false })
        const scheduled = lead({ followUpConsent: result, customerDeferred: true, stage: 'commit_later' })
        expect(scheduled.followUpSchedule.dueAtMs).toBe(result.callbackAtMs)
    })
    it('does not infer new consent from an unrelated date or consumed prior request', () => {
        const text = '2026-10-12T15:30+03:00'
        expect(resolveExplicitCallbackConsent({ lead: {}, text, sourceMessageId: 'synthetic', nowMs: NOW })).toBeNull()
        const followUpConsent = { ...lead().followUpConsent, callbackPending: true, usedReminders: 1 }
        expect(resolveExplicitCallbackConsent({ lead: { followUpConsent, lastQuestion: 'callback_exact_time' }, text, sourceMessageId: 'synthetic', nowMs: NOW })).toBeNull()
    })
})


describe('customer clarification in Israel local time', () => {
    it('resolves an ordinary Hebrew date/time only after an existing pending request', () => {
        expect(parseJerusalemCallbackAt('12.10.2026 בשעה 10:00', NOW)).toBe(Date.parse('2026-10-12T07:00:00Z'))
        expect(parseJerusalemCallbackAt('12.11.2026 בשעה 10:00 לפי שעון ישראל', NOW)).toBe(Date.parse('2026-11-12T08:00:00Z'))
        const consent = captureExplicitFollowUpConsent({ text: 'תדברו איתי בשבוע הבא', sourceMessageId: 'original-synthetic', nowMs: NOW - HOUR })
        expect(resolveExplicitCallbackConsent({ lead: { lastQuestion: 'callback_exact_time', followUpConsent: consent }, text: '12.10.2026 בשעה 10:00', sourceMessageId: 'clarification-synthetic', nowMs: NOW })).toMatchObject({ callbackAtMs: Date.parse('2026-10-12T07:00:00Z'), maxReminders: 1 })
    })
    it.each(['31.11.2026 בשעה 10:00', '12.10.2026', '12.10.2026 בשעה 25:00', 'בשבוע הבא', '12.10.2026 בשעה 10:00 או 11:00'])('rejects incomplete or invalid %s', text => {
        expect(parseJerusalemCallbackAt(text, NOW)).toBeNull()
    })
    it('rejects Jerusalem spring gaps and autumn ambiguous hours', () => {
        const before = Date.parse('2026-01-01T00:00:00Z')
        expect(parseJerusalemCallbackAt('27.3.2026 בשעה 02:30', before)).toBeNull()
        expect(parseJerusalemCallbackAt('25.10.2026 בשעה 01:30', before)).toBeNull()
        expect(parseJerusalemCallbackAt('25.10.2026 בשעה 03:30', before)).toBe(Date.parse('2026-10-25T01:30:00Z'))
    })
})
