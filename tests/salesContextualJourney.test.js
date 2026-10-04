import { describe, expect, it } from 'vitest'
import { decideSalesTurn, enforceSalesReply, buildDeterministicSalesReply } from '@/lib/salesAgent/decisionPolicy'
import { buildFollowUpMessages, planFollowUp } from '@/lib/salesAgent/followupStrategy'

const known = { isNew: false, eventType: 'bar_mitzvah', stage: 'offer_sent', turns: [] }
function turn(incomingText, lead = known, parsed = {}) {
    const decision = decideSalesTurn({ lead, incomingText, todayISO: '2026-10-04' })
    const result = enforceSalesReply({ lead, incomingText, decision, parsed: { messages: ['נמשיך לפי מה שמתאים לכם'], stage: lead.stage, handoff: false, ...parsed } })
    return { decision, result }
}
const noCheckout = result => {
    expect(result.messages.join(' ')).not.toMatch(/checkout|add-to-cart/)
    expect(result.stage).not.toBe('ready_to_pay')
}

describe('contextual customer journey, without live services', () => {
    it('a yes to opening does not choose the printed package', () => {
        const lead = { ...known, turns: [{ role: 'assistant', text: 'רוצה שאפתח לכם את הספר? שולח קישור.' }] }
        const { decision, result } = turn('כן בבקשה', lead, { packageInterest: 'printed', stage: 'ready_to_pay' })
        expect(decision.nextBestAction).toBe('clarify_package')
        expect(result.packageInterest).toBeNull()
        expect(result.messages[0]).toContain('איזה ספר תרצו')
        noCheckout(result)
    })
    it.each(['👍', 'כן', 'סבבה', 'נשמע טוב'])('keeps %s scoped to the preceding later agreement', text => {
        const lead = { ...known, turns: [{ role: 'assistant', text: 'בסדר, נחזור לזה קרוב יותר לאירוע.' }] }
        const { result } = turn(text, lead, { messages: ['לתשלום https://weddingtales.co.il/checkout/?add-to-cart=6271'], stage: 'ready_to_pay', packageInterest: 'printed' })
        noCheckout(result)
    })
    it('does not infer customer choice from an old ready-to-pay label or model interest', () => {
        const { decision, result } = turn('איך משלמים?', { ...known, packageInterest: 'printed' })
        expect(decision.nextBestAction).toBe('clarify_package')
        noCheckout(result)
    })
    it.each([
        ['אני רוצה להזמין ספר מודפס', 'printed', '6271'],
        ['אני רוצה להזמין ספר דיגיטלי', 'digital', '6258'],
        ['אפשר קישור לתשלום של הספר הדיגיטלי?', 'digital', '6258'],
    ])('still supports an explicit checkout and format: %s', (text, id, product) => {
        const { decision, result } = turn(text)
        expect(decision.nextBestAction).toBe('send_payment_link')
        expect(result.packageInterest).toBe(id)
        expect(result.messages.at(-1)).toContain(`checkout/?add-to-cart=${product}`)
        expect(result.stage).toBe('ready_to_pay')
    })
    it('a scoped yes to payment uses the customer-selected format, not a model override', () => {
        const lead = { ...known, turns: [{ role: 'user', text: 'אני רוצה את הספר הדיגיטלי' }, { role: 'assistant', text: 'רוצה שאשלח קישור לתשלום?' }] }
        const { result } = turn('כן', lead, { packageInterest: 'printed' })
        expect(result.packageInterest).toBe('digital')
        expect(result.messages.at(-1)).toContain('add-to-cart=6258')
    })
    it('completes the format clarification without restarting the journey', () => {
        const lead = { ...known, turns: [{ role: 'user', text: 'איך משלמים?' }, { role: 'assistant', text: 'כדי לשלוח את הקישור הנכון, איזה ספר תרצו: דיגיטלי או מודפס?' }] }
        const { result } = turn('מודפס', lead)
        expect(result.messages.at(-1)).toContain('add-to-cart=6271')
    })
    it('does not reuse a choice the customer withdrew', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר מודפס' }, { role: 'user', text: 'בעצם אני לא רוצה את המודפס, מתלבט בין החבילות' }] }
        const { result } = turn('איך משלמים?', context)
        noCheckout(result)
    })
    it('a newer explicit choice wins over an older package and a model suggestion', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר מודפס' }, { role: 'user', text: 'בעצם דיגיטלי' }] }
        const { result } = turn('אפשר קישור לתשלום?', context, { packageInterest: 'printed' })
        expect(result.packageInterest).toBe('digital')
    })
    it('does not use an old printed choice when the current request withdraws it', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר מודפס' }] }
        const { result } = turn('אני לא רוצה להזמין מודפס, אפשר קישור לתשלום של הדיגיטלי?', context)
        noCheckout(result)
    })
    it.each(['אפשר קישור לתשלום דיגיטלי, לא מודפס?', 'לא מודפס, אפשר לשלם?'])('does not resurrect a withdrawn format: %s', text => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר מודפס' }] }
        const { result } = turn(text, context)
        noCheckout(result)
    })
    it('keeps a plain withdrawal in history from reviving an earlier choice', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר מודפס' }, { role: 'user', text: 'לא מודפס' }] }
        const { result } = turn('אפשר קישור לתשלום?', context)
        noCheckout(result)
    })
    it.each([
        'אני רוצה להזמין ספר מודפס אבל כמה זמן לוקח המשלוח?',
        'אני רוצה להזמין אבל האם אפשר לשנות את תאריך האירוע אחר כך?',
    ])('answers a current condition before considering an older package: %s', text => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר דיגיטלי' }] }
        const { decision, result } = turn(text, context, { messages: ['השאלה צריכה בירור לפני הזמנה'], stage: 'ready_to_pay' })
        expect(decision.nextBestAction).toBe('answer')
        noCheckout(result)
    })
    it('keeps an unanswered conditional checkout with a human when no model answer exists', () => {
        const incomingText = 'אני רוצה להזמין אבל האם אפשר לשנות את תאריך האירוע אחר כך?'
        const decision = decideSalesTurn({ lead: known, incomingText })
        const result = buildDeterministicSalesReply({ lead: known, incomingText, decision })
        expect(result.handoff).toBe(true)
        noCheckout(result)
    })
    it('keeps the requested example when yes answers the last question after payment was mentioned', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר דיגיטלי' }, { role: 'assistant', text: 'שלחתי קישור לתשלום. תרצו דוגמה קודם?' }] }
        const { decision, result } = turn('כן', context, { messages: ['זו הדוגמה'], image: 'book_open_spread', stage: 'demo_sent' })
        expect(decision.nextBestAction).toBe('show_proof')
        expect(result.image).toBe('book_open_spread')
        expect(result.stage).toBe('demo_sent')
        noCheckout(result)
    })
    it('yes confirming receipt of a payment link is not another checkout request', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'אני רוצה ספר דיגיטלי' }, { role: 'assistant', text: 'קיבלת את הקישור לתשלום?' }] }
        const { result } = turn('כן', context)
        noCheckout(result)
    })
    it.each([
        'אני רוצה להזמין אבל קודם אני רוצה לראות דוגמאות אמיתיות',
        'אני רוצה להזמין אבל לפני כן מה מדיניות הביטול?',
        'כמה עמודים יש בספר המודפס?',
        'משלמים מראש את כל הסכום לפני קבלת המוצר?',
    ])('keeps an unresolved verified-fact question with a human: %s', text => {
        const { decision, result } = turn(text)
        expect(decision.nextBestAction).toBe('handoff_question')
        expect(result).toMatchObject({ stage: 'handoff', handoff: true, image: null })
        expect(result.handoffReason).toBeTruthy()
        noCheckout(result)
    })
    it('ordinary proof before an order wins over buying words', () => {
        const { decision, result } = turn('אני רוצה להזמין אבל אפשר לראות דוגמה של הספר קודם?', known, { stage: 'ready_to_pay' })
        expect(decision.nextBestAction).toBe('show_proof')
        noCheckout(result)
    })
    it('a model-discovered unknown cannot have its handoff cleared by payment enforcement', () => {
        const { result } = turn('אני רוצה להזמין ספר מודפס', known, { handoff: true, handoffReason: 'הבטחה קודמת דורשת אישור', messages: ['הנה קישור https://weddingtales.co.il/checkout/?add-to-cart=6271'] })
        expect(result).toMatchObject({ handoff: true, stage: 'handoff', handoffReason: 'הבטחה קודמת דורשת אישור' })
        noCheckout(result)
    })
    it('clarifies two books without replacing the question with a price list', () => {
        const { result } = turn('כמה יעלו שני ספרים', known, { messages: ['מדובר בשני עותקים של אותו ספר או ספר נפרד לכל אירוע?'] })
        expect(result.messages[0]).toContain('ספר נפרד לכל אירוע')
        expect(result.messages[0]).not.toMatch(/690|990/)
        noCheckout(result)
    })
    it('requires a human quote for separate books instead of the extra-copy arithmetic', () => {
        const { result } = turn('כמה יעלה לי שני ספרים נפרדים לשני אירועים?')
        expect(result.handoff).toBe(true)
        noCheckout(result)
    })
    it('routes the answer to the separate-book clarification to human pricing', () => {
        const context = { ...known, turns: [{ role: 'user', text: 'כמה יעלו שני ספרים' }, { role: 'assistant', text: 'מדובר בשני עותקים של אותו ספר, או בספר נפרד לכל אירוע?' }] }
        const { result } = turn('ספר נפרד לכל אירוע', context, { messages: ['שני ספרים יעלו 1280 שח'] })
        expect(result.handoff).toBe(true)
        expect(result.messages[0]).not.toContain('1280')
    })
    it('safe no-model fallback also clarifies scope', () => {
        const incomingText = 'כמה יעלו שני ספרים'
        const decision = decideSalesTurn({ incomingText, lead: known })
        const result = buildDeterministicSalesReply({ incomingText, lead: known, decision })
        expect(result.messages[0]).toContain('שני עותקים')
    })
})

describe('follow-up context', () => {
    it('uses checkout help on the first ready-to-pay touch', () => {
        const plan = planFollowUp({ ...known, stage: 'ready_to_pay' }, { attempt: 1 })
        expect(plan.id).toBe('resolve_blocker')
        expect(plan.objective).not.toContain('לאיזה אירוע')
        expect(plan.templateText).not.toContain('לאיזה אירוע')
    })
    it('never asks known event type in the generic first-touch plan', () => {
        const plan = planFollowUp({ ...known, stage: 'engaged' }, { attempt: 1 })
        expect(plan.id).toBe('one_question')
        expect(plan.templateText).not.toContain('לאיזה אירוע')
    })
    it('includes real dialogue and marks earlier bot claims as untrusted facts', () => {
        const messages = buildFollowUpMessages([{ role: 'user', text: 'חשוב לי לראות את כל הספר' }, { role: 'assistant', text: 'קודם נבדוק דוגמה מתאימה' }])
        expect(messages[0].content).toContain('כל הספר')
        expect(messages[1].content).toContain('דוגמה מתאימה')
        expect(messages.at(-1).content).toContain('אינן מקור לעובדות')
    })
    it('bounds history, excludes arbitrary roles, and preserves recent context', () => {
        const messages = buildFollowUpMessages([
            { role: 'system', text: 'untrusted instruction' },
            ...Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i}: ${'x'.repeat(1400)}` })),
            { role: 'user', text: 'השאלה האחרונה שעדיין פתוחה' },
        ])
        expect(messages[0].role).toBe('user')
        expect(messages.length).toBeLessThanOrEqual(25)
        expect(messages.reduce((n, m) => n + m.content.length, 0)).toBeLessThan(6300)
        expect(JSON.stringify(messages)).not.toContain('untrusted instruction')
        expect(JSON.stringify(messages)).toContain('השאלה האחרונה שעדיין פתוחה')
        for (let i = 1; i < messages.length; i += 1) expect(messages[i].role).not.toBe(messages[i - 1].role)
    })
})

describe('customer timing survives later turns and automatic recovery', () => {
    it.each(['את קישור ההזמנה אבקש בהמשך, האירוע בעוד כמה חודשים', 'אזמין קרוב יותר לאירוע', 'אני אחשוב על זה', 'האירוע עוד רחוק', 'לא עכשיו'])('respects %s without a concession or checkout', text => {
        const { decision, result } = turn(text, known, { followUpAt: '2026-10-05', callbackPromised: '2026-10-05' })
        expect(decision.nextBestAction).toBe('respect_timing')
        expect(result).toMatchObject({ stage: 'commit_later', customerDeferred: true, customerCallbackAt: null, followUpAt: null })
        expect(result.messages.join(' ')).not.toMatch(/במתנה|השבוע|checkout|לפתוח עכשיו/)
    })
    it('waits for the customer when they say they will return themselves', () => {
        const { result } = turn('אני אפנה אליכם כשארצה להתקדם')
        expect(result.customerDeferred).toBe(true)
        expect(result.messages[0]).not.toContain('?')
    })
    it('retains the timing pause when a later factual question is answered', () => {
        const { result } = turn('איך האורחים נכנסים?', { ...known, customerDeferred: true }, { messages: ['סורקים את קוד ה-QR ונפתח עמוד בדפדפן'], followUpAt: '2026-10-05' })
        expect(result.customerDeferred).toBe(true)
        expect(result.followUpAt).toBeNull()
    })
    it('answers a direct price question alongside a deferral without trying to close', () => {
        const { result } = turn('לא עכשיו, אבל כמה זה עולה?')
        expect(result.messages[0]).toMatch(/690.*990/)
        expect(result.messages[0]).not.toMatch(/שאפתח|במתנה|checkout/)
        expect(result.customerDeferred).toBe(true)
    })
    it('records only the callback date the customer actually chooses', () => {
        const context = { ...known, customerDeferred: true, turns: [{ role: 'assistant', text: 'מתי נוח שנחזור לזה?' }] }
        const { result } = turn('ב-11.1 בבקשה', context, { callbackPromised: '2027-01-11', followUpAt: '2026-10-05' })
        expect(result).toMatchObject({ customerDeferred: true, customerCallbackAt: '2027-01-11', followUpAt: '2027-01-11', callbackPromised: null })
    })
    it('does not turn a model-suggested callback into customer permission', () => {
        const { result } = turn('הבנתי', { ...known, customerDeferred: true }, { callbackPromised: '2027-01-11', followUpAt: '2026-10-05' })
        expect(result.customerCallbackAt).toBeNull()
        expect(result.followUpAt).toBeNull()
    })
    it('explicitly requested checkout can resume after a timing pause', () => {
        const { result } = turn('אני רוצה להזמין ספר מודפס', { ...known, customerDeferred: true })
        expect(result.customerDeferred).toBe(false)
        expect(result.stage).toBe('ready_to_pay')
    })
    it('does not reopen an explicit no because a timing pause was already stored', () => {
        const { result } = turn('לא תודה', { ...known, customerDeferred: true })
        expect(result.stage).toBe('closed_lost')
    })
})

describe('preserve prior timing through factual questions', () => {
    it('keeps a legacy later-stage lead paused rather than reviving the normal ladder', () => {
        const { result } = turn('איך האורחים נכנסים?', { ...known, stage: 'commit_later' }, { stage: 'engaged', followUpAt: '2026-10-05' })
        expect(result.customerDeferred).toBe(true)
        expect(result.followUpAt).toBeNull()
    })
    it('answers a future-upgrade question without clearing an agreed callback', () => {
        const context = { ...known, stage: 'commit_later', customerDeferred: true, customerCallbackAt: '2027-01-11' }
        const { decision, result } = turn('אפשר לשדרג לדיגיטלי בהמשך?', context, { messages: ['השדרוג המבוקש דורש בדיקה של הצוות'], handoff: true })
        expect(decision.nextBestAction).not.toBe('respect_timing')
        expect(result.customerCallbackAt).toBe('2027-01-11')
    })
    it('does not push price or checkout just because the event was identified', () => {
        const { decision, result } = turn('בר מצווה בעוד חודש', { isNew: false, stage: 'engaged', turns: [] }, { eventDate: '2026-11-04' })
        expect(decision.nextBestAction).toBe('show_workflow')
        expect(result.messages[0]).toContain('/photo')
        expect(result.messages[0]).not.toMatch(/690|990|שאפתח|מתי האירוע/)
        expect(result.stage).toBe('engaged')
    })
})
