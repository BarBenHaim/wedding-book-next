// Is Claude actually answering? A failed call is covered by another model or by
// the catalog reply, so without this record a dead account looks like a bot
// that works. Lord sees it on the customer board and in the "דוח" reply.
//
// Nothing here stores or logs message text, keys or provider bodies.

import { after } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { CLAUDE_AGENT_MODEL, callAnthropic } from './agent'

const COLLECTION = 'sales_runtime'
const DOC_ID = 'claude_health'
const FRESH_MS = 24 * 60 * 60 * 1000
const CHECK_DEADLINE_MS = 20_000

const healthRef = db => db.collection(COLLECTION).doc(DOC_ID)

function reasonWords(errorCode, status) {
    if (errorCode === 'no_key') return 'לא מוגדר מפתח של Anthropic'
    if (status === 401 || status === 403) return 'המפתח של Anthropic לא תקין'
    if (errorCode === 'low_credit') return 'נגמר הקרדיט בחשבון ה-API של Anthropic'
    if (errorCode === 'rate_limit') return 'חרגנו ממגבלת הקצב של Anthropic'
    if (errorCode === 'timeout') return 'הוא לא ענה בזמן'
    if (status === 404) return 'המודל לא זמין בחשבון'
    return 'תקלה אצל Anthropic'
}

// What a model call (its result or its error) says went wrong with Claude, or
// null when it says nothing.
export function claudeFailureOf(outcome) {
    if (outcome?.fallbackFrom === 'anthropic') {
        return { errorCode: outcome.fallbackError, status: outcome.fallbackStatus ?? null }
    }
    if (outcome instanceof Error && outcome.provider === 'anthropic' && outcome.providerStarted) {
        return { errorCode: outcome.errorCode, status: outcome.status ?? null }
    }
    return null
}

export async function recordClaudeFailure({ errorCode, status = null }, { db = adminDb, nowMs = Date.now() } = {}) {
    const ref = healthRef(db)
    await db.runTransaction(async transaction => {
        const snap = await transaction.get(ref)
        const state = snap.exists ? snap.data() : {}
        const sameStreak = Number(state.lastFailureAt) > Number(state.lastOkAt || 0)
            && nowMs - Number(state.lastFailureAt) < FRESH_MS
        transaction.set(ref, {
            failures: sameStreak ? (Number(state.failures) || 0) + 1 : 1,
            failuresSince: sameStreak ? state.failuresSince : nowMs,
            lastFailureAt: nowMs,
            lastErrorCode: String(errorCode || 'provider_error'),
            lastStatus: status,
        }, { merge: true })
    })
}

// Called from the reply paths. Runs after the response has left, so a slow or
// failed write can neither delay nor change what the lead receives.
export function noteClaudeOutcome(outcome, deps) {
    const failure = claudeFailureOf(outcome)
    if (!failure) return
    const run = () => Promise.resolve()
        .then(() => recordClaudeFailure(failure, deps))
        .catch(error => console.warn('[claude-health] not recorded', error?.code || 'UNKNOWN'))
    try {
        after(run)
    } catch {
        run()
    }
}

export function claudeAlert(state, nowMs = Date.now()) {
    const failedAt = Number(state?.lastFailureAt)
    if (!failedAt || nowMs - failedAt >= FRESH_MS || Number(state.lastOkAt || 0) >= failedAt) return null
    const count = Number(state.failures) || 1
    const since = new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(Number(state.failuresSince) || failedAt))
    return `⚠️ Claude לא ענה: ${reasonWords(state.lastErrorCode, state.lastStatus)}. `
        // A Hebrew word before the number, so it does not stick to a name in
        // Latin letters on a right-to-left screen.
        + `קרה ${count === 1 ? 'פעם אחת' : `${count} פעמים`} מאז ${since}. התשובות יוצאות בינתיים מהגיבוי.`
}

// For screens and reports: never throws, whatever is wrong with the database.
export async function readClaudeHealth({ db, nowMs = Date.now() } = {}) {
    try {
        const snap = await healthRef(db || adminDb).get()
        const state = snap.exists ? snap.data() : null
        return {
            alert: claudeAlert(state, nowMs),
            lastCheckAt: state?.lastCheckAt || null,
            lastCheckOk: state?.lastCheckAt ? state.lastCheckOk === true : null,
        }
    } catch (error) {
        console.warn('[claude-health] not read', error?.code || 'UNKNOWN')
        return { alert: null, lastCheckAt: null, lastCheckOk: null }
    }
}

// One small real call to Claude and nothing else: no fallback that could hide a
// failure, and no message to anyone.
export async function checkClaude({ ask = callAnthropic, db = adminDb, nowMs = Date.now() } = {}) {
    // The status number is what tells a refused request from an outage.
    const failed = (errorCode, status = null) => ({
        ok: false, model: CLAUDE_AGENT_MODEL, errorCode, status,
        message: `Claude לא ענה: ${reasonWords(errorCode, status)}.${status ? ` (קוד ${status})` : ''}`,
    })
    if (!String(process.env.ANTHROPIC_API_KEY || '').trim()) return failed('no_key')

    const startedAt = Date.now()
    let answer
    try {
        answer = await ask({
            system: 'זו בדיקת חיבור. השב במילה אחת: תקין.',
            messages: [{ role: 'user', content: 'בדיקה' }],
            model: CLAUDE_AGENT_MODEL,
            maxTokens: 4096,
            deadlineAtMs: startedAt + CHECK_DEADLINE_MS,
        })
    } catch (error) {
        const result = failed(error?.errorCode || 'provider_error', error?.status ?? null)
        console.warn('[claude-health] check failed', result.errorCode, result.status)
        try {
            await recordClaudeFailure({ errorCode: result.errorCode, status: error?.status ?? null }, { db, nowMs })
            await healthRef(db).set({ lastCheckAt: nowMs, lastCheckOk: false }, { merge: true })
        } catch (writeError) {
            console.warn('[claude-health] check not recorded', writeError?.code || 'UNKNOWN')
        }
        return result
    }

    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    try {
        await healthRef(db).set({ lastCheckAt: nowMs, lastCheckOk: true, lastOkAt: nowMs }, { merge: true })
    } catch (writeError) {
        console.warn('[claude-health] check not recorded', writeError?.code || 'UNKNOWN')
    }
    console.log('[claude-health] answered', answer.model)
    return { ok: true, model: answer.model, message: `Claude ענה (${answer.model}), תוך ${seconds} שניות.` }
}
