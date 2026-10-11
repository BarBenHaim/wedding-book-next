// A product recommendation, not an approved offer or a runtime price source.
// The live commercial boundary remains offerCatalog.js / offerStore.js. Never
// spread this draft into their schema: null below means pending verification,
// whereas null in an approved offer means explicitly not applicable. Unknown
// approved-schema fields must remain omitted/undefined and fail validation.
const freeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze)
        Object.freeze(value)
    }
    return value
}

export const COMMERCIAL_DIRECTION = freeze({
    version: '2026-10-06-draft',
    status: 'draft',
    purpose: 'commercial_direction_only',
    heroProductId: 'printed',
    products: {
        printed: {
            productId: 'printed',
            advertisedPrice: { amount: 990, currency: 'ILS' },
            includes: ['digital_book', 'personal_design', 'hardcover_21x21_cm', 'one_printed_copy', 'shipping_as_advertised'],
        },
        digital: {
            productId: 'digital',
            advertisedPrice: { amount: 690, currency: 'ILS' },
            presentWhen: ['direct_request', 'no_print_needed', 'budget_concern', 'comparison_requested'],
        },
    },
    process: {
        customerApprovalBeforePrint: true,
        includedConsolidatedRevisionRounds: 1,
        businessErrorCorrectionsFree: true,
    },
    pendingVerification: {
        pageLimit: null,
        additionalCopyPrice: null,
        productionDuration: null,
        deliveryDuration: null,
        finalCheckoutTotal: null,
        tax: null,
        shippingDestination: null,
        mediaRights: null,
        accessDuration: null,
        refundPolicy: null,
        cancellationPolicy: null,
        humanResponseSla: null,
    },
    safeguards: {
        preserveExistingCustomerTerms: true,
        inferPurchaseConsent: false,
        allowDraftPriceFallback: false,
        allowUnapprovedDiscounts: false,
        allowScarcityClaims: false,
        allowFreeProductClaims: false,
        allowUnlimitedPrintingClaims: false,
        allowUnverifiedTimingPromises: false,
    },
})

const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().trim()
const mentionsDigital = text => /דיגיטל|\bdigital\b/i.test(text)
const mentionsPrinted = text => /מודפס|הדפסה|\bprint(?:ed)?\b|\bhardcover\b/i.test(text)
const noPrintNeeded = text => /(?:בלי|ללא)\s+(?:ה?ספר\s+)?ה?(?:מודפס|הדפסה)|לא\s+(?:(?:צרי(?:ך|כה|כים|כות)|רוצ[היםות]*|מעוניי[ןנתיםות]*)\s+(?:ב|את\s+)?(?:ה?ספר\s+)?)?ה?(?:מודפס|הדפסה)|\b(?:without|no)\s+(?:a\s+)?(?:printed\s+book|print(?:ing)?)\b|\b(?:don'?t|do\s+not)\s+(?:need|want)\s+(?:a\s+)?(?:printed\s+book|print(?:ing)?)\b/i.test(text)
const rejectsDigital = text => /לא\s+(?:(?:צרי(?:ך|כה|כים|כות)|רוצ[היםות]*|מעוניי[ןנתיםות]*)\s+(?:ב|את\s+)?(?:ה?ספר\s+)?)?ה?דיגיטל/i.test(text)
const budgetConcern = text => /יקר|תקציב|זול|\b(?:expensive|budget|cheaper|afford)\b/i.test(text)
const printedChoice = text => /(?:רוצה|רוצים|רוצות|מעדיף|מעדיפה|מעדיפים|מעדיפות|אבחר|בוחר|בוחרת)\s+(?:דווקא\s+|את\s+|ב)?(?:הספר\s+|ספר\s+)?(?:ה)?מודפס|\b(?:want|prefer|choose)\s+(?:the\s+|a\s+)?(?:printed|hardcover)\b/i.test(text)
const digitalChoice = text => /(?:רוצה|רוצים|רוצות|מעדיף|מעדיפה|מעדיפים|מעדיפות|אבחר|בוחר|בוחרת)\s+(?:דווקא\s+|את\s+|ב)?(?:הספר\s+|ספר\s+)?(?:ה)?דיגיטל|\b(?:want|prefer|choose)\s+(?:the\s+|a\s+)?digital\b/i.test(text)

function printingOnlyRequest(text) {
    if (/הדפסה\s+בלבד|רק\s+(?:להדפיס|הדפסה)|\b(?:print(?:ing)?[- ]only|only\s+print(?:ing)?)\b/i.test(text)) return true
    const existingFile = /(?:יש\s+לי|יש\s+לנו|כבר\s+יש).{0,25}(?:קובץ|pdf)|(?:קובץ|pdf)\s+(?:מוכן|קיים)|\b(?:have|ready|existing)\b.{0,20}\b(?:file|pdf)\b/i.test(text)
    return existingFile && /להדפיס|הדפסה|\bprint(?:ing)?\b/i.test(text)
}

function directPriceProduct(text) {
    const priceQuestion = /כמה(?:\s+זה)?\s+(?:עולה|יעלה)|מה(?:ו)?\s+(?:ה)?מחיר|מה\s+העלות|\bhow\s+much\b|\bwhat(?:'s|\s+is)\b.{0,35}\b(?:price|cost)\b/i
    for (const clause of text.split(/[?!;.\n]/)) {
        if (!priceQuestion.test(clause)) continue
        const printed = mentionsPrinted(clause), digital = mentionsDigital(clause)
        if (printed !== digital) return printed ? 'printed' : 'digital'
    }
    return null
}

function requestsComparison(text) {
    const comparison = /מה\s+ההבדל|הבדל\s+בין|השוואה|להשוות|\b(?:compare|comparison|difference|versus|vs)\b/i.test(text)
    const options = /איז(?:ה|ו|לו)\s+(?:עוד\s+)?(?:אפשרויות|אופציות|חבילות|מסלולים)|מה\s+(?:האפשרויות|האופציות|החבילות|המסלולים)|(?:כל|שתי|שני)\s+(?:ה)?(?:אפשרויות|אופציות|חבילות|מסלולים)|\b(?:both|all)\s+(?:options|packages)\b|\b(?:what|which)\s+(?:are\s+(?:the|your)\s+)?(?:options|packages)\b/i.test(text)
    const eitherProduct = mentionsDigital(text) && mentionsPrinted(text)
        && /(?:\s(?:או|וגם|וכמה|ומה)\s|ו(?:ה)?דיגיטל|ו(?:ה)?מודפס|לעומת|מול|\bor\b|\band\b)/i.test(text)
    return comparison || options || eitherProduct
}

// This recognizes requests to see offers, not agreement to purchase one.
// Product/process, service, policy and demo questions keep their own answer
// path. In a mixed turn, the caller must still give those questions priority.
export function requestsOfferOptions(value) {
    const text = normalized(value)
    if (!text) return false
    if (printingOnlyRequest(text)) return false
    const otherQuestion = /איך|כיצד|משלוח|אספקה|ביטול|לבטל|החזר|עמודים|מגבלת|תקופת|דוגמ[אה]|דמו|הדגמה|מתי|\bhow\s+(?!much\b)|\b(?:delivery|shipping|cancel(?:lation)?|refund|pages?|page\s+limit|demo|example|sample|when)\b/i.test(text)
    if (otherQuestion) return false
    if (requestsComparison(text)) return true
    if (/כמה(?:\s+זה)?\s+(?:עולה|יעלה)|(?:מה|אפשר|אשמח|רוצה|רוצים)\s+(?:לדעת\s+)?(?:את\s+ה)?מחיר|מה\s+המחיר|מחירון|^(?:מחיר|כמה)\s*[?!.,]*$|\b(?:how\s+much|price|cost|pricing)\b/i.test(text)) return true
    if (/להזמין|לקנות|לרכוש|לשלם|תשלום|\b(?:order|buy|purchase|pay|checkout)\b/i.test(text)) return false
    if (noPrintNeeded(text) || budgetConcern(text)) return true
    if (!mentionsDigital(text) && !mentionsPrinted(text)) return false
    return /(?:יש|אפשר|ניתן|קיים|קיימת)|\b(?:available|offer|can|is\s+there|do\s+you\s+have)\b/i.test(text)
}

// Inputs must be the already validated results of getActiveOffer. This helper
// only chooses their presentation order; it does not authorize an offer,
// invent a missing alternative, alter terms, or record purchase consent.
export function selectOfferPresentation({ printed, digital, text: value = '', preferredProductId = null } = {}) {
    const text = normalized(value)
    if (requestsComparison(text)) return [printed, digital].filter(Boolean)
    const noPrint = noPrintNeeded(text), noDigital = rejectsDigital(text)
    if (noPrint && noDigital) return []
    if (noPrint) return digital ? [digital] : []
    if (noDigital) return printed ? [printed] : []
    const pricedProduct = directPriceProduct(text)
    if (pricedProduct === 'printed') return printed ? [printed] : []
    if (pricedProduct === 'digital') return digital ? [digital] : []
    if (printedChoice(text)) return printed ? [printed] : []
    if (digitalChoice(text)) return digital ? [digital] : []
    if (budgetConcern(text)) return digital ? [digital] : []
    if (mentionsPrinted(text)) return printed ? [printed] : []
    if (mentionsDigital(text) || preferredProductId === 'digital') return digital ? [digital] : []
    return printed ? [printed] : []
}
