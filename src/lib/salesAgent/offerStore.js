import { validateOfferCatalog, freezeCommercialRecord } from './offerCatalog'

export const OFFER_CATALOG_COLLECTION = 'sales_offer_catalog'
export const OFFER_CATALOG_DOCUMENT = 'current'

// Read-only and uncached by design. No seeds, inferred approvals, provider calls,
// credentials, or live migration. The existing server Admin SDK is loaded only
// when the route uses the store; unit tests inject a synthetic Firestore object.
export async function readActiveOfferCatalog({ db = null, nowMs = Date.now() } = {}) {
    try {
        const database = db || (await import('@/lib/firebaseAdmin')).adminDb
        const document = await database.collection(OFFER_CATALOG_COLLECTION).doc(OFFER_CATALOG_DOCUMENT).get()
        if (!document.exists) return { ok: false, catalog: null, offers: [], reason: 'catalog_missing' }
        const catalog = document.data()
        const result = validateOfferCatalog(catalog, { nowMs })
        return freezeCommercialRecord({ ...result, catalog: result.ok ? catalog : null, readAt: new Date(nowMs).toISOString() })
    } catch {
        return { ok: false, catalog: null, offers: [], reason: 'catalog_unavailable' }
    }
}
