export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// POST /api/blessing-assist
//
// AI helper that helps GUESTS write warmer, more personal, less generic
// blessings. Two modes:
//   • improve — polish the guest's own draft (keep their voice + meaning,
//     warmer, more specific, fix grammar, within the event's length cap).
//   • ideas   — from a few quick inputs (relationship, a memory/wish, tone)
//     generate 2–3 distinct short drafts the guest can pick and edit.
//
// Engine: Anthropic Claude (Haiku — cheap + fast). Requires ANTHROPIC_API_KEY
// in the environment (add it in Vercel → Project → Settings → Environment
// Variables). If the key is missing the route returns a clear, non-fatal
// error so the UI can fall back to the offline "smart prompts".

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { normalizeEventType } from '@/lib/eventTypes'

const MODEL = 'claude-haiku-4-5-20251001' // small, cheap, good at Hebrew
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// ── Tiny best-effort in-memory rate limit (per IP). Serverless instances
// are ephemeral so this only throttles bursts on a warm instance — paired
// with the small model + token cap it keeps costs bounded. ──
const RL = new Map()
const RL_MAX = 12 // requests
const RL_WINDOW = 60_000 // per minute
function rateLimited(ip) {
    const now = Date.now()
    const slot = RL.get(ip)
    if (!slot || now - slot.start > RL_WINDOW) {
        RL.set(ip, { start: now, count: 1 })
        return false
    }
    slot.count += 1
    return slot.count > RL_MAX
}

const LANG = { he: 'Hebrew', en: 'English', es: 'Spanish', it: 'Italian' }

// Human descriptor of the occasion + how to address the recipient, per
// event type. Used to ground the model so output isn't generic.
function eventContext(type, names) {
    switch (type) {
        case 'wedding':
            return { occasion: 'a wedding', who: names || 'the couple' }
        case 'bar_mitzvah':
            return { occasion: 'a bar mitzvah', who: names || 'the bar mitzvah boy' }
        case 'bat_mitzvah':
            return { occasion: 'a bat mitzvah', who: names || 'the bat mitzvah girl' }
        case 'birthday':
            return { occasion: 'a birthday', who: names || 'the birthday person' }
        case 'poker':
            return { occasion: 'a game night', who: names || 'the host' }
        case 'travel':
            return { occasion: 'a trip', who: names || 'the traveler' }
        default:
            return { occasion: 'a celebration', who: names || 'the guest of honor' }
    }
}

function recipientNames(data, type) {
    const bride = (data.brideNameHe || data.brideName || '').trim()
    const groom = (data.groomNameHe || data.groomName || '').trim()
    const celebrant = (data.celebrantNameHe || data.celebrantName || '').trim()
    if (type === 'wedding') return [bride, groom].filter(Boolean).join(' & ')
    return celebrant
}

async function callClaude({ system, user, maxTokens }) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return { error: 'NO_KEY' }
    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            temperature: 0.85,
            system,
            messages: [{ role: 'user', content: user }],
        }),
    })
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        console.error('[blessing-assist] Anthropic error', res.status, t.slice(0, 300))
        return { error: 'UPSTREAM' }
    }
    const json = await res.json()
    const text = (json?.content || []).map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    return { text }
}

export async function POST(req) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
        if (rateLimited(ip)) {
            return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד רגע.' }, { status: 429 })
        }

        const body = await req.json().catch(() => ({}))
        const weddingId = (body?.weddingId || '').toString().trim()
        const mode = body?.mode === 'improve' ? 'improve' : 'ideas'
        const locale = LANG[body?.locale] ? body.locale : 'he'
        const lang = LANG[locale]
        const draft = (body?.draft || '').toString().slice(0, 800)
        const relationship = (body?.relationship || '').toString().slice(0, 80)
        const memory = (body?.memory || '').toString().slice(0, 400)
        const tone = (body?.tone || '').toString().slice(0, 40)

        if (!weddingId) return NextResponse.json({ error: 'Missing weddingId' }, { status: 400 })
        if (mode === 'improve' && draft.trim().length < 2) {
            return NextResponse.json({ error: 'כתבו קודם טיוטה קצרה כדי שאוכל לשפר אותה.' }, { status: 400 })
        }

        // Event context for grounding.
        let type = 'wedding'
        let names = ''
        let maxChars = 210
        try {
            const snap = await adminDb.collection('weddings').doc(weddingId).get()
            if (snap.exists) {
                const data = snap.data() || {}
                type = normalizeEventType(data.eventType) || 'wedding'
                names = recipientNames(data, type)
                const mc = Number(data.blessingMaxChars)
                if (Number.isFinite(mc) && mc >= 50) maxChars = Math.min(1200, mc)
            }
        } catch {
            /* grounding is best-effort */
        }
        const { occasion, who } = eventContext(type, names)

        const system =
            `You help everyday guests write a short, heartfelt ${occasion} blessing for ${who}. ` +
            `Write ONLY in ${lang}. ` +
            `Rules: warm and sincere; SPECIFIC and personal, never generic; avoid clichés and filler ` +
            `("מאחלים לכם חיים מאושרים", "כל הכבוד", "המון אהבה" alone are too generic); ` +
            `natural spoken tone, not flowery or pompous; no hashtags; emojis only if they truly fit (at most one); ` +
            `keep each blessing under ${maxChars} characters. Use the recipient's name naturally when known. ` +
            `Return plain text only — no preamble, no quotes, no numbering, no labels.`

        if (mode === 'improve') {
            const user =
                `Improve this ${occasion} blessing. Keep the writer's intent and personal voice, ` +
                `make it warmer, smoother and more specific, fix any grammar/spelling, remove clichés, ` +
                `and keep it under ${maxChars} characters. Return ONLY the improved blessing.\n\n` +
                `Draft:\n"""${draft}"""`
            const r = await callClaude({ system, user, maxTokens: 400 })
            if (r.error) return errOut(r.error)
            const cleaned = stripWrap(r.text).slice(0, maxChars + 40)
            return NextResponse.json({ suggestions: cleaned ? [cleaned] : [] })
        }

        // ideas
        const details = [
            relationship ? `Relationship to ${who}: ${relationship}.` : '',
            memory ? `A detail / memory / wish to weave in: ${memory}.` : '',
            tone ? `Desired tone: ${tone}.` : '',
        ].filter(Boolean).join(' ')
        const user =
            `Write 3 DISTINCT short ${occasion} blessings for ${who}. ` +
            `${details || 'No extra details were given, so keep them broadly warm but still fresh and specific in feel.'} ` +
            `Each must be a complete standalone blessing, different in angle/wording from the others, under ${maxChars} characters. ` +
            `Return ONLY a JSON array of 3 strings, nothing else. Example: ["...","...","..."]`
        const r = await callClaude({ system, user, maxTokens: 700 })
        if (r.error) return errOut(r.error)
        const suggestions = parseList(r.text).map(s => s.slice(0, maxChars + 40)).slice(0, 3)
        return NextResponse.json({ suggestions })
    } catch (err) {
        console.error('[blessing-assist] failed:', err)
        return NextResponse.json({ error: 'שגיאה בעוזר הכתיבה. נסו שוב.' }, { status: 500 })
    }
}

function errOut(code) {
    if (code === 'NO_KEY') {
        return NextResponse.json(
            { error: 'עוזר ה-AI לא מוגדר עדיין (חסר מפתח). אפשר לכתוב ידנית בינתיים.' },
            { status: 503 },
        )
    }
    return NextResponse.json({ error: 'העוזר עמוס כרגע, נסו שוב בעוד רגע.' }, { status: 502 })
}

// Strip surrounding quotes / stray "Blessing:" labels the model might add.
function stripWrap(s) {
    let t = (s || '').trim()
    t = t.replace(/^["'“”]+|["'“”]+$/g, '').trim()
    return t
}

// Parse the ideas response into an array of strings — prefers a JSON array,
// falls back to splitting on blank lines / leading bullets/numbers.
function parseList(raw) {
    const s = (raw || '').trim()
    const start = s.indexOf('[')
    const end = s.lastIndexOf(']')
    if (start >= 0 && end > start) {
        try {
            const arr = JSON.parse(s.slice(start, end + 1))
            if (Array.isArray(arr)) return arr.map(x => stripWrap(String(x))).filter(Boolean)
        } catch {
            /* fall through to line parsing */
        }
    }
    return s
        .split(/\n{2,}|\n(?=\d+[.)]\s)|\n(?=[-•]\s)/)
        .map(line => stripWrap(line.replace(/^\s*(\d+[.)]|[-•])\s*/, '')))
        .filter(Boolean)
        .slice(0, 3)
}
