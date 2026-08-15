// src/lib/salesAgent/pricing.js
//
// What the bot costs to run, counted here rather than read from a
// provider dashboard.
//
// There are two ways to answer "how much am I spending". One is to ask
// Anthropic and OpenAI through their usage APIs, which is authoritative
// and needs a second, admin-scoped key from each of them - more secrets
// to create, store and rotate, for a number that arrives a day late and
// lumps every project in the account together.
//
// The other is to count what we spend as we spend it. Every Messages API
// response carries a `usage` block; so does every image response. We are
// already reading both. Multiplying by the published rate is arithmetic,
// and it buys something the dashboards cannot: the cost is attributable.
// Cost per lead, cost per closed deal, cost of a conversation that ended
// in a handoff. For a sales bot those are the only cost questions worth
// asking - the monthly total tells you nothing you can act on.
//
// Two honest limits, both surfaced in the UI rather than buried here.
//
// This counts what THIS APP spends, from the day it shipped. It is not
// the invoice. Anything else on the same API key - another project, a
// script, a console session - is invisible to it, and nothing before
// deployment exists at all. "Total" means total since counting started.
//
// And the rates below are hardcoded. Published prices move; when they
// do, this file is wrong until someone edits it. That is the trade for
// not holding an admin key. RATES_CHECKED_ON is here so the number on
// screen can say how old its assumptions are instead of pretending.

export const RATES_CHECKED_ON = '2026-08-08'

// USD per million tokens.
//
// Anthropic publishes cache writes and cache reads separately; both are
// counted because a cached prompt is most of what this bot sends and
// billing them as ordinary input would overstate the cost roughly
// tenfold on the read side.
export const PRICES = {
    'claude-haiku-4-5': {
        provider: 'anthropic',
        input: 1.0,
        output: 5.0,
        cacheWrite: 1.25,
        cacheRead: 0.1,
    },
    'claude-sonnet-4-5': {
        provider: 'anthropic',
        input: 3.0,
        output: 15.0,
        cacheWrite: 3.75,
        cacheRead: 0.3,
    },
    'gpt-4.1-mini': {
        provider: 'openai',
        input: 0.4,
        output: 1.6,
        cacheRead: 0.1,
    },
    'gpt-4.1-mini-2025-04-14': {
        provider: 'openai',
        input: 0.4,
        output: 1.6,
        cacheRead: 0.1,
    },
    // Image models are billed per token like everything else; the
    // per-picture figure people quote is that arithmetic already done.
    // Text in and image in are different rates, which is why the image
    // response reports them separately.
    'gpt-image-2': {
        provider: 'openai',
        input: 5.0,
        imageInput: 8.0,
        cacheRead: 1.25,
        imageCacheRead: 2.0,
        output: 30.0,
    },
    'gpt-image-1.5': {
        provider: 'openai',
        input: 5.0,
        imageInput: 8.0,
        cacheRead: 1.25,
        imageCacheRead: 2.0,
        output: 32.0,
    },
    'gpt-image-1-mini': {
        provider: 'openai',
        input: 2.0,
        imageInput: 2.5,
        cacheRead: 0.2,
        imageCacheRead: 0.25,
        output: 8.0,
    },
}

// An id we do not know must not silently cost zero. A model swap is
// exactly when someone would trust a suddenly cheaper number, so an
// unknown id is reported as unknown and the UI says so.
export function ratesFor(model) {
    return PRICES[String(model || '')] || null
}

const per = (tokens, rate) => (Number(tokens) || 0) * (Number(rate) || 0) / 1_000_000

/**
 * Cost of one text-model call, from the normalized `usage` block it returned.
 *
 * `input_tokens` excludes cache reads and writes for every provider at this
 * boundary, so the three are added rather than subtracted from each other.
 * Getting that normalization backwards double-counts a cached prompt.
 */
export function costOfTextUsage(usage, model) {
    const rates = ratesFor(model)
    if (!usage || !rates) return { usd: 0, known: false }
    const usd =
        per(usage.input_tokens, rates.input) +
        per(usage.output_tokens, rates.output) +
        per(usage.cache_creation_input_tokens, rates.cacheWrite) +
        per(usage.cache_read_input_tokens, rates.cacheRead)
    return { usd, known: true }
}

// Kept for callers and reports that predate the provider fallback.
export const costOfClaudeUsage = costOfTextUsage

/**
 * Cost of one image call.
 *
 * The image APIs report a total `input_tokens` and break it down in
 * `input_tokens_details`. Text and image inputs are billed differently,
 * so the split matters; when the breakdown is missing we bill the whole
 * input at the image rate, which is the higher of the two. Guessing high
 * on your own costs is the only safe direction to guess.
 */
export function costOfImageUsage(usage, model) {
    const rates = ratesFor(model)
    if (!usage || !rates) return { usd: 0, known: false }
    const details = usage.input_tokens_details || {}
    const hasSplit = details.text_tokens != null || details.image_tokens != null
    const textIn = hasSplit ? Number(details.text_tokens) || 0 : 0
    const imageIn = hasSplit ? Number(details.image_tokens) || 0 : Number(usage.input_tokens) || 0
    const usd =
        per(textIn, rates.input) +
        per(imageIn, rates.imageInput ?? rates.input) +
        per(usage.output_tokens, rates.output)
    return { usd, known: true }
}

/**
 * Money, at a precision that does not lie.
 *
 * A single reply costs a fraction of a cent. Rounded to two decimals it
 * reads as $0.00 and the whole screen looks broken, so small amounts
 * keep more digits. Anything past a dollar rounds to cents, because
 * nobody wants six decimals on their monthly total.
 */
export function formatUsd(usd) {
    const n = Number(usd) || 0
    if (n === 0) return '$0'
    if (n < 0.01) return `$${n.toFixed(4)}`
    if (n < 1) return `$${n.toFixed(3)}`
    return `$${n.toFixed(2)}`
}

/** Cost per lead and per closed deal — the two numbers worth acting on. */
export function unitEconomics({ usd, leads, won }) {
    const spend = Number(usd) || 0
    const l = Number(leads) || 0
    const w = Number(won) || 0
    return {
        perLead: l > 0 ? spend / l : null,
        perWon: w > 0 ? spend / w : null,
    }
}

export default { PRICES, ratesFor, costOfClaudeUsage, costOfTextUsage, costOfImageUsage, formatUsd, unitEconomics, RATES_CHECKED_ON }
