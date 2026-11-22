// src/lib/orderLock.js — pure: what to do with the processing lock of a paid order.
//
// /api/createWedding writes a lock per order so two webhook deliveries do not
// open two events. The lock used to be written first and never released, so if
// anything after it threw (user creation, the event write, the e-mail), every
// WooCommerce retry answered "locked" and a paying customer got nothing, with
// nobody told. The lock now carries a state:
//
//   processing  a delivery is working on it (stale after LOCK_STALE_MS)
//   done        the event exists and the welcome e-mail went out
//   failed      a step threw; the next delivery may take it over
//
// A lock with no state is one written by the old code. This function is only
// asked when no event exists for the order, so such a lock is a failed run and
// can be taken over.

export const LOCK_STALE_MS = 10 * 60 * 1000

/** 'take' (go ahead), 'busy' (another delivery is on it) or 'done'. */
export function lockDecision(lock, now = Date.now()) {
    if (!lock) return 'take'
    if (lock.status === 'done') return 'done'
    if (lock.status === 'processing') {
        const started = Number(lock.startedAtMs)
        return Number.isFinite(started) && now - started < LOCK_STALE_MS ? 'busy' : 'take'
    }
    return 'take' // 'failed' or the old format
}

/**
 * An event that exists for the order but whose welcome e-mail never went out:
 * the delivery that opened it failed afterwards. Only then do we send it now.
 * Orders from before this rule have no lock state, so a later "order updated"
 * webhook can never trigger a second e-mail for them.
 */
export function needsWelcomeResume(lock, weddingData) {
    return lock?.status === 'failed' && !weddingData?.welcomeEmailSentAt
}

/** One short line for the alert e-mail: never the whole error, never a secret. */
export function briefError(err) {
    const msg = String(err?.message || err || 'unknown').replace(/\s+/g, ' ').trim()
    return msg.slice(0, 240)
}
