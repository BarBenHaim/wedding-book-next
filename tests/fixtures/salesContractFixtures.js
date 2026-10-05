// Synthetic commercial examples. These are test data, never production approvals.
export const FIXTURE_NOW = Date.parse('2026-10-05T12:00:00Z')
const approval = extra => ({ status: 'approved', approvedBy: 'synthetic-approver', evidenceRef: 'test-only', approvedAt: '2026-10-01T00:00:00Z', ...extra })
const policy = () => ({ version: 'test-v1', summary: 'תנאים סינתטיים לבדיקה', url: 'https://weddingtales.co.il/test-policy' })
export function syntheticOffer(productId = 'printed', overrides = {}) {
    const amount = productId === 'digital' ? 69000 : 99000
    return {
        schemaVersion: 1, offerId: `test-${productId}`, version: 'test-v1', productId,
        name: productId === 'digital' ? 'דיגיטלי לבדיקה' : 'מודפס לבדיקה',
        approval: approval({ offerVersion: 'test-v1' }), validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z',
        price: { currency: 'ILS', totalMinor: amount, subtotalMinor: amount, tax: { amountMinor: 0, summary: 'מסים כלולים לבדיקה' }, shipping: { amountMinor: 0, summary: 'משלוח כלול לבדיקה', destinationCountry: 'IL' }, additionalCharges: [] },
        scope: { includes: ['ספר לדוגמה'], excludes: [], bookType: productId, copies: 1, dimensions: productId === 'digital' ? null : '21x21 cm', pageLimit: 'מגבלה סינתטית', blessingLimit: null, photoLimit: null, accessPeriod: 'תקופה סינתטית' },
        process: { design: 'עיצוב לפי התנאים המאושרים.', editing: 'המשתתפים מעלים תמונה וברכה דרך קישור.', approval: 'מאשרים לפני ההדפסה.', humanAssistance: 'סיוע סינתטי' },
        timing: { production: 'זמן הפקה סינתטי', delivery: 'זמן משלוח סינתטי', startsFrom: 'אישור הדפסה סינתטי' },
        policies: { service: policy(), dateChange: policy(), cancellation: policy(), refunds: policy() },
        upgradeOfferId: null, additionalCopyOfferId: null,
        checkoutUrl: `https://weddingtales.co.il/checkout/?add-to-cart=${productId === 'digital' ? '6258' : '6271'}`,
        ...overrides,
    }
}
export function syntheticCatalog(offers = [syntheticOffer('digital'), syntheticOffer('printed')]) {
    const catalog = { schemaVersion: 1, catalogId: 'synthetic-catalog', version: 'test-v1', approval: approval({ catalogVersion: 'test-v1' }), offers }
    return { ok: true, catalog, offers }
}
export function syntheticMedia() {
    return {
        key: 'test-spread', assetId: 'test-asset', version: 'test-v1', kind: 'image',
        url: 'https://app.weddingtales.co.il/imgs/test-synthetic.jpg', caption: 'כפולה סינתטית לבדיקה', when: 'בדיקת דוגמה',
        audience: 'public', usageScopes: ['sales_demo'], channels: ['whatsapp'],
        rights: { basis: 'owned', evidenceRef: 'test-only', personalData: 'none', minorData: 'none' },
        eventTypes: ['generic', 'wedding', 'bar_mitzvah', 'bat_mitzvah'], purpose: 'spread', representation: 'actual_product',
        approval: approval({ assetVersion: 'test-v1', assetUrl: 'https://app.weddingtales.co.il/imgs/test-synthetic.jpg' }),
        consent: { scope: 'public_marketing', evidenceRef: 'synthetic-consent', approvedAt: '2026-10-01T00:00:00Z' },
        provenance: { source: 'synthetic-test', evidenceRef: 'synthetic-proof' },
    }
}
