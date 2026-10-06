// The opt-in contract layer uses the existing intent policy, CRM, delivery and
// handoff pipeline. Business assertions and action results stay server-owned.
import { confirmedPackageId, explicitPackageChoice, isAffirmative } from './decisionPolicy'
import { eventTypeOf } from './eventType'
import { getActiveOffer, createOfferSnapshot, formatOfferQuote } from './offerCatalog'
import { requestsOfferOptions, selectOfferPresentation } from './commercialDirection'
import { pickApprovedDemo } from './mediaGuard'
import { captureExplicitFollowUpConsent, resolveExplicitCallbackConsent } from './followupEvidence'
import { createStrictFollowUpSchedule, strictFollowUpDate } from './followupPolicy'
import { CONVERSATIONAL_POLICY_VERSION, extractSuppliedTiming, sourceAttributionFromInbound, isMarketingStopRequest, isHumanServiceRequest, isProductAlternativeRequest } from './salesContract'

export const AUTOMATION_DISCLOSURE = 'כאן העוזרת האוטומטית של Wedding Tales.'
export const HANDOFF_CONFIRMED = 'העברתי לצוות את השיחה והפרטים שכבר מסרתם לבדיקה.'
export const HANDOFF_FAILED = 'ההעברה לצוות לא הושלמה כרגע. אפשר לפנות לתמיכה דרך האתר: https://weddingtales.co.il/'
export const isStopRequest = isMarketingStopRequest
export const isPaymentClaim = text => /(?:כבר\s+)?שילמ(?:תי|נו)|כבר\s+(?:קניתי|קנינו|רכשתי|רכשנו|הזמנתי|הזמנו)|\b(?:i|we)\s+(?:already\s+)?paid\b/i.test(String(text))
const wantsHuman = isHumanServiceRequest
const freeClaim = text => /בחינם|חינמי|\bfree\b/i.test(text)
const uncertainPolicy = text => /יגיע\s+מחר|דחוף|אספקה|משלוח|מתי.{0,15}(?:מגיע|מוכן)|הנחה|קופון|כמה\s+עמודים|מגבלת|תקופת|לנצח|שדרוג|עותק\s+נוסף|רולאפ|מעמד|ביטול|החזר/i.test(text)
const correctEvent = text => /בעצם|תיקון|התכוונתי|זו\s+|זה\s+/.test(text)
const designQuestion = text => /(?:סבב|תיקונ|אישור|מאשרים|לאשר|טעות|טעויות).{0,35}(?:עיצוב|דפוס|הדפס|כלול|שלכם)|(?:עיצוב|דפוס|הדפס).{0,35}(?:אישור|מאשרים|לאשר|תיקונ)|כמה.{0,15}(?:סבב|תיקונ)|(?:טעות|טעויות)\s+שלכם/.test(text)
const finalTotalQuestion = text => /(?:סכום|מחיר|עלות).{0,20}סופי|סופי.{0,20}(?:סכום|מחיר|קופה)|(?:מה|כמה).{0,20}(?:בפועל\s+בקופה|לתשלום\s+בקופה)/.test(text)
const processQuestion = text => /מה.{0,20}(?:מקבלים|כלול)|איך.{0,20}עובד/.test(text)
const includedCorrectionQuestion = text => /(?:טעות|טעויות)\s+שלכם/.test(text)
    && !/(?:ספר|אלבום).{0,20}(?:בחינם|חינמי)|פרסומ|פרסומת|מודעה/.test(text)

function approved(catalogResult, productId, lead, nowMs) {
    if (!catalogResult?.ok) return null
    const campaignId = lead?.sourceAttribution?.campaignId || null
    const result = getActiveOffer({ catalog: catalogResult.catalog, productId, campaignId, nowMs })
    if (result.ok) return result.offer
    // A standard paid quote is distinct from an unverified campaign benefit.
    return campaignId ? getActiveOffer({ catalog: catalogResult.catalog, productId, nowMs }).offer : null
}

function quote(offer, nowMs) {
    return formatOfferQuote(offer, { nowMs })
}

export async function buildConversationalTurn({ lead = {}, incomingText = '', body = {}, eventId, revision, decision = {}, catalogResult, library = {}, checkout, nowMs = Date.now(), followUpPolicy } = {}) {
    const text = String(incomingText).trim()
    const eventType = eventTypeOf(text) || lead.eventType || null
    const timing = extractSuppliedTiming(text)
    const contract = {
        conversationalPolicyVersion: CONVERSATIONAL_POLICY_VERSION,
        conversationalState: 'DISCOVERY',
        automationDisclosed: true,
        handoffPending: false,
        conversationRevision: Number.isSafeInteger(revision) ? revision : (lead.conversationRevision || 0) + 1,
        sourceAttribution: sourceAttributionFromInbound(body, lead.sourceAttribution, nowMs),
        followUpSchedule: null,
        lastQuestion: null,
        ...timing,
    }
    delete contract.eventDate
    const parsed = {
        malformed: false, messages: [], stage: lead.stage || 'engaged', image: null,
        handoff: false, handoffReason: null, eventType, eventDate: timing.eventDate || null,
        packageInterest: lead.packageInterest || null,
        customerDeferred: lead.customerDeferred === true, customerCallbackAt: lead.customerCallbackAt || null,
        callbackPromised: null,
    }
    const suppliedName = text.match(/(?:מצוו?ה|הולדת)\s+ל([א-ת]{2,24})(?=\s|[,!?]|$)/)?.[1]
    if (suppliedName && !['בן', 'בת', 'בני', 'בתי', 'ילד', 'ילדה', 'אחיין', 'אחיינית'].includes(suppliedName)) parsed.celebrantName = suppliedName
    const answer = (message, state = 'DISCOVERY', stage = 'engaged') => {
        parsed.messages = [message]; parsed.stage = stage; contract.conversationalState = state
    }
    const handoff = (reason, message, state = 'HUMAN') => {
        parsed.handoff = true; parsed.handoffReason = reason
        answer(message, state, 'handoff')
    }
    const selected = confirmedPackageId(lead, text)
    const selectedOffer = selected ? approved(catalogResult, selected, { ...lead, sourceAttribution: contract.sourceAttribution }, nowMs) : null
    const digital = approved(catalogResult, 'digital', lead, nowMs)
    const printed = approved(catalogResult, 'printed', lead, nowMs)
    const presentation = selectOfferPresentation({ printed, digital, text, preferredProductId: selected })
    const informationalProduct = presentation[0] || null
    const lastQuestion = lead.lastQuestion || ''
    const consent = captureExplicitFollowUpConsent({ text, sourceMessageId: eventId, nowMs })
        || resolveExplicitCallbackConsent({ lead, text, sourceMessageId: eventId, nowMs })
    if (consent) {
        delete contract.eventDateText; delete contract.eventDatePrecision; parsed.eventDate = null
    }

    if (isStopRequest(text) || (decision.intent === 'negative_exit' && !isProductAlternativeRequest(text))) {
        contract.marketingSuppressed = true
        contract.followUpConsent = null
        parsed.customerDeferred = true; parsed.customerCallbackAt = null
        answer('ברור, אעצור כאן את הודעות המכירה.', 'STOPPED', 'closed_lost')
    } else if (decision.nextBestAction === 'silence' && !lead.handoffPending) {
        parsed.noReply = true; parsed.messages = []
        contract.conversationalState = lead.stage === 'closed_lost' ? 'STOPPED' : 'HUMAN'
    } else if (wantsHuman(text) || decision.intent === 'call_request' || lead.handoffPending === true) {
        handoff('customer_requested_human', HANDOFF_CONFIRMED)
    } else if (lead.customerLookupUnavailable === true) {
        handoff('customer_lookup_unavailable', `לא הצלחתי לבדוק כרגע אם כבר קיימת הזמנה. ${HANDOFF_CONFIRMED}`, 'SERVICE')
    } else if (lead.verifiedCustomer) {
        handoff('verified_existing_customer_service', HANDOFF_CONFIRMED, 'SERVICE')
    } else if (body.messageType && body.messageType !== 'text') {
        handoff('attachment_requires_human_review', `קיבלתי את הקובץ. ${HANDOFF_CONFIRMED}`)
    } else if (isPaymentClaim(text)) {
        handoff('payment_claim_requires_verification', `אין לי עדיין אישור תשלום מאומת להזמנה הזו. ${HANDOFF_CONFIRMED}`, 'SERVICE')
    } else if (decision.intent === 'print_only' || decision.nextBestAction === 'handoff_print') {
        handoff('print_only_requires_separate_quote', `הדפסה של קובץ מוכן דורשת תמחור נפרד. ${HANDOFF_CONFIRMED}`)
    } else if (decision.intent === 'not_our_product') {
        handoff('requested_product_unapproved', `אין לי הצעה מאומתת לסוג הספר שביקשתם. ${HANDOFF_CONFIRMED}`)
    } else if (freeClaim(text) && !includedCorrectionQuestion(text)) {
        // Free scope can only come from a specifically matched approved campaign.
        const campaign = contract.sourceAttribution.campaignId
        const matches = catalogResult?.offers?.filter(o => o.free && o.campaignId === campaign && campaign) || []
        const validFree = matches.length === 1 ? getActiveOffer({ catalog: catalogResult.catalog, productId: matches[0].productId, campaignId: campaign, nowMs }) : null
        if (validFree?.ok) {
            const offer = validFree.offer
            answer(`${offer.free.scope} בחינם. ${offer.free.limitations}\nבתשלום: ${offer.free.paidScope}\nכאן פותחים בהתאם לתנאים: ${offer.free.startUrl}\nהתנאים: ${offer.free.termsUrl}`, 'FREE_ACTIVATION')
            contract.offerSnapshot = createOfferSnapshot(offer, { nowMs })
        } else {
            contract.offerMismatch = { reason: 'unverified_free_offer', source: contract.sourceAttribution, detectedAtMs: nowMs }
            handoff('unverified_free_offer', `כרגע אין לי תנאים מאומתים להטבה שהוצגה לכם. ${HANDOFF_CONFIRMED}`, 'OFFER_MISMATCH')
        }
    } else if (consent) {
        contract.followUpConsent = consent
        contract.marketingSuppressed = false
        parsed.customerDeferred = true
        if (consent.callbackPending) {
            // Relative dates are not exact callback appointments. Preserve the
            // pause and ask once rather than inventing a clock time or date.
            contract.lastQuestion = 'callback_exact_time'
            answer('באיזה תאריך ובאיזו שעה לפי שעון ישראל נוח לקבל את התזכורת? עד שנסכם, לא תישלח תזכורת מוקדמת.', 'FOLLOWUP_SCHEDULED', 'commit_later')
        } else {
            parsed.customerDeferred = !!consent.callbackAtMs
            answer('רשמתי את בקשת התזכורת. השליחה כפופה למדיניות ולשעות הפעילות.', 'FOLLOWUP_SCHEDULED', 'engaged')
        }
    } else if (decision.intent === 'defer_request') {
        parsed.customerDeferred = true; parsed.customerCallbackAt = null
        const summary = selectedOffer ? ` הנה תקציר להעברה: ${quote(selectedOffer, nowMs)}` : ''
        answer(`בטח, אפשר לקחת זמן ולהמשיך כאן כשיהיה מתאים.${summary}`, 'OBJECTION', 'commit_later')
    } else if (/אנשים.{0,20}(?:לא|פחות).{0,15}(?:ישלח|יכתב)|לא.{0,15}(?:ישלחו|ישתתפו)|מעט.{0,10}ברכות/.test(text)) {
        answer('זה חשש מובן. אין הבטחה שכולם ישתתפו. אפשר להתחיל בכמה אנשים קרובים ולשתף את הקישור מראש, כשיש זמן לכתוב בנחת.', 'OBJECTION', 'objection')
        contract.lastObjection = text.slice(0, 400)
    } else if (/אין.{0,8}זמן|להתעסק|מסובך/.test(text)) {
        const product = informationalProduct
        if (product) answer(`${product.process.editing} ${product.process.approval} הסיוע הכלול: ${product.process.humanAssistance}`, 'OBJECTION', 'objection')
        else handoff('assistance_scope_unverified', `אין לי כרגע פירוט מאומת של הסיוע הכלול. ${HANDOFF_CONFIRMED}`)
    } else if (/אלבום.{0,15}(?:צלם|הצלם)|(?:כבר|יש לי).{0,20}אלבום/.test(text)) {
        const product = informationalProduct
        if (product) {
            answer(`אפשר להשוות למה שכבר יש לכם. החבילה כאן כוללת: ${product.scope.includes.join(', ')}.`, 'OBJECTION', 'objection')
            parsed.image = pickApprovedDemo({ incomingText: text, eventType, seen: [...(lead.mediaSent || []), ...(lead.mediaRequested || [])], library, nowMs })
        } else handoff('product_scope_unapproved', `אין לי כרגע פירוט מאומת להשוואה. ${HANDOFF_CONFIRMED}`)
    } else if (finalTotalQuestion(text)) {
        // Even a complete catalog is not evidence of a buyer's payable cart.
        answer('אין לי כרגע אימות של הסכום הסופי בקופה. לפני שליחת קישור תשלום נבדוק את המחיר, המסים והמשלוח לפי ההצעה וההזמנה.', 'OFFER')
    } else if (uncertainPolicy(text) || decision.intent === 'needs_verified_answer' || /אחרי.{0,8}האירוע/.test(text)) {
        const product = informationalProduct
        const unsafeSpecific = /מחר|דחוף|עד.{0,12}\d|הנחה|קופון|שדרוג|עותק\s+נוסף|רולאפ|מעמד|אמיתי|לתרגם|תרגום/.test(text)
        let policyAnswer = null
        if (product && !unsafeSpecific) {
            if (/כמה\s+עמודים|מגבלת/.test(text)) policyAnswer = product.scope.pageLimit
            else if (/אחרי.{0,8}האירוע|תקופת|לנצח/.test(text)) policyAnswer = product.scope.accessPeriod
            else if (/ביטול/.test(text)) policyAnswer = product.policies.cancellation.summary
            else if (/החזר/.test(text)) policyAnswer = product.policies.refunds.summary
            else if (/(?:כולל|כלול|עלות|מחיר|עולה).{0,15}משלוח|משלוח.{0,15}(?:כולל|כלול|עולה)/.test(text)) policyAnswer = product.price.shipping.summary
            else if (/משלוח|אספקה|מתי/.test(text)) policyAnswer = `${product.timing.production}. ${product.timing.delivery}. הספירה מתחילה: ${product.timing.startsFrom}.`
        }
        if (policyAnswer) answer(policyAnswer, 'OFFER', 'offer_sent')
        else handoff('product_policy_requires_verified_answer', `אין לי תשובה מאומתת לפרט הזה. ${HANDOFF_CONFIRMED}`)
    } else if (designQuestion(text)) {
        if (informationalProduct) answer(`${informationalProduct.process.design} ${informationalProduct.process.editing} ${informationalProduct.process.approval}`, 'DISCOVERY')
        else handoff('design_terms_unapproved', `אין לי כרגע תנאי עיצוב מאומתים. ${HANDOFF_CONFIRMED}`)
    } else if (decision.intent === 'price' || requestsOfferOptions(text)) {
        const prices = presentation
        if (!prices.length) {
            handoff('offer_not_approved', `אין לי כרגע מחיר מאומת להצגה. ${HANDOFF_CONFIRMED}`)
        } else {
            answer(prices.map(offer => quote(offer, nowMs)).join('\n') + (!eventType ? '\nלאיזה אירוע מחפשים ספר?' : ''), 'OFFER', 'offer_sent')
            contract.lastQuestion = eventType ? null : 'event_type'
            contract.offerSnapshots = { ...(lead.offerSnapshots || {}), ...Object.fromEntries(prices.map(offer => [offer.productId, createOfferSnapshot(offer, { nowMs })])) }
            if (prices.length === 1) contract.offerSnapshot = createOfferSnapshot(prices[0], { nowMs })
        }
    } else if (decision.nextBestAction === 'send_payment_link'
        || decision.intent === 'payment_intent'
        || (selected && ['package_choice', 'checkout_confirmation'].includes(lastQuestion) && (isAffirmative(text) || explicitPackageChoice(text)))
        || (lastQuestion === 'offer_change_confirmation' && isAffirmative(text))) {
        const target = selectedOffer || (lastQuestion === 'offer_change_confirmation' && lead.pendingOfferSnapshot
            ? approved(catalogResult, lead.pendingOfferSnapshot.productId, lead, nowMs) : null)
        if (!selected && !target) {
            answer('איזה ספר תרצו להזמין, דיגיטלי או מודפס?', 'OFFER', 'engaged')
            contract.lastQuestion = 'package_choice'
        } else if (!target) {
            handoff('selected_offer_not_approved', `אין לי כרגע הצעה מאומתת לחבילה שבחרתם. ${HANDOFF_CONFIRMED}`)
        } else {
            parsed.packageInterest = target.productId
            const acceptedSnapshot = lastQuestion === 'offer_change_confirmation' && isAffirmative(text) ? lead.pendingOfferSnapshot : null
            const result = typeof checkout === 'function'
                ? await checkout({ offer: target, previousSnapshot: lead.offerSnapshots?.[target.productId] || lead.offerSnapshot, acceptedSnapshot })
                : { status: 'blocked', reason: 'checkout_not_verified' }
            if (result.status === 'reconfirm_required') {
                answer(`פרטי ההצעה השתנו. ${quote(target, nowMs)}\nלהמשיך לפי ההצעה המעודכנת?`, 'OFFER', 'offer_sent')
                contract.pendingOfferSnapshot = result.snapshot
                contract.lastQuestion = 'offer_change_confirmation'
            } else if (result.status === 'ready') {
                answer(`${quote(target, nowMs)}\nכאן משלימים הזמנה: ${result.checkoutUrl}`, 'CHECKOUT', 'ready_to_pay')
                contract.offerSnapshot = result.snapshot
                contract.pendingOfferSnapshot = null
                contract.checkoutSnapshot = { checkoutId: result.checkoutId, offerId: target.offerId, offerVersion: target.version, url: result.checkoutUrl, totalMinor: target.price.totalMinor, currency: target.price.currency, createdAtMs: nowMs }
                parsed.customerDeferred = false
            } else {
                handoff(result.reason || 'checkout_not_verified', `לא הצלחתי לאמת כרגע קישור תשלום עם הסכום והתנאים הנכונים. ${HANDOFF_CONFIRMED}`)
            }
        }
    } else if (explicitPackageChoice(text)) {
        if (selectedOffer) {
            parsed.packageInterest = selectedOffer.productId
            answer(`${quote(selectedOffer, nowMs)}\nלהמשיך להזמנה?`, 'OFFER', 'offer_sent')
            contract.offerSnapshot = createOfferSnapshot(selectedOffer, { nowMs })
            contract.offerSnapshots = { ...(lead.offerSnapshots || {}), [selectedOffer.productId]: contract.offerSnapshot }
            contract.lastQuestion = 'checkout_confirmation'
        } else handoff('selected_offer_not_approved', `אין לי כרגע הצעה מאומתת לחבילה שבחרתם. ${HANDOFF_CONFIRMED}`)
    } else if (decision.intent === 'demo' || ['send_demo', 'show_proof'].includes(decision.nextBestAction) || (isAffirmative(text) && lastQuestion === 'demo_permission')) {
        parsed.image = pickApprovedDemo({ incomingText: text, eventType, seen: [...(lead.mediaSent || []), ...(lead.mediaRequested || [])], library, nowMs })
        if (parsed.image) answer(library[parsed.image].caption || 'זו דוגמה מאושרת להצגה של הספר.', 'DEMO', 'demo_sent')
        else answer('אין כרגע דוגמה מאושרת ומתאימה זמינה לשליחה. אפשר לברר עם הצוות לגבי דוגמה נוספת.', 'DISCOVERY', 'engaged')
    } else if (eventType === 'memorial') {
        answer('אפשר להתאים את השיחה לספר הנצחה ברגישות. חשוב לכם ספר מודפס או דיגיטלי?', 'DISCOVERY')
        contract.lastQuestion = 'package_choice'
    } else if (decision.intent === 'process' || decision.intent === 'question_before_checkout' || decision.intent === 'event_answer' || processQuestion(text) || (eventTypeOf(text) && correctEvent(text))) {
        if (!informationalProduct) handoff('product_scope_unapproved', `אין לי כרגע פירוט מאומת לחבילה הזו. ${HANDOFF_CONFIRMED}`)
        else {
            const product = informationalProduct
            const detail = /מה.{0,20}(?:מקבלים|כלול)/.test(text) ? product.scope.includes.join(', ') : [product.process.design, product.process.editing, product.process.approval].join(' ')
            if (decision.intent === 'question_before_checkout' && !processQuestion(text)) handoff('purchase_condition_unverified', `אין לי תשובה מאומתת לתנאי הזה. ${HANDOFF_CONFIRMED}`)
            else answer(detail, 'DISCOVERY')
        }
    } else if (decision.intent === 'objection') {
        contract.lastObjection = text.slice(0, 400)
        const cheaper = /יקר|תקציב/.test(text) && digital
            ? ` אם לא נדרש עותק פיזי, זו האפשרות הדיגיטלית: ${quote(digital, nowMs)}` : ''
        answer(`מבינה. אפשר לקחת זמן להחליט, בלי התחייבות נוספת.${cheaper}`, 'OBJECTION', 'objection')
    } else if (decision.intent === 'general' && !lead.turns?.length) {
        answer(eventType ? 'מה חשוב לכם לדעת על הספר?' : 'לאיזה אירוע מחפשים ספר?', 'DISCOVERY')
        contract.lastQuestion = eventType ? 'customer_question' : 'event_type'
    } else {
        const count = (lead.misunderstandingCount || 0) + 1
        contract.misunderstandingCount = count
        if (count >= 2) handoff('two_unresolved_turns', `אני לא מצליחה להבין מספיק טוב את הבקשה. ${HANDOFF_CONFIRMED}`)
        else {
            answer('איזה פרט תרצו לברר?', 'DISCOVERY')
            contract.lastQuestion = 'clarification'
        }
    }
    if (contract.misunderstandingCount == null) contract.misunderstandingCount = 0
    if (parsed.messages.length && !lead.automationDisclosed && contract.conversationalState !== 'STOPPED') parsed.messages[0] = `${AUTOMATION_DISCLOSURE}\n${parsed.messages[0]}`
    const schedule = createStrictFollowUpSchedule({ ...lead, ...parsed, ...contract, lastInboundAtMs: lead.lastInboundAtMs || nowMs }, { nowMs, ...(followUpPolicy ? { policy: followUpPolicy } : {}) })
    contract.followUpSchedule = schedule
    // A scheduler returning null is never described as a scheduled success.
    if (consent && !schedule && !consent.callbackPending) parsed.messages = [`${!lead.automationDisclosed ? `${AUTOMATION_DISCLOSURE}\n` : ''}רשמתי את בקשת התזכורת, אבל כרגע היא לא תוזמנה. אפשר לחזור לשיחה כאן בכל זמן.`]
    return { parsed, contract, followUpAt: strictFollowUpDate(schedule), selectedOffer }
}
