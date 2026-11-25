// Books the cost of a model call made outside the reply route, so the spend
// screen counts it too. Bookkeeping only: it never throws into the work it
// measures.

import { recordSpend } from './leads'
import { costOfClaudeUsage, costOfImageUsage } from './pricing'

const PROVIDERS = ['anthropic', 'openai', 'gemini']

async function book(record, entry, known) {
    if (!known) console.warn('[spend] no price known for model', entry.model)
    try {
        await (record || recordSpend)(entry)
    } catch {
        console.error('[spend] not recorded')
    }
}

// `answer` is what callAnthropic and callClaude return.
export async function meterAnswer(answer, { record } = {}) {
    if (!answer?.usage) return
    const { usd, known } = costOfClaudeUsage(answer.usage, answer.model)
    const provider = PROVIDERS.includes(answer.provider) ? answer.provider : 'anthropic'
    await book(record, { provider, model: answer.model, usd, usage: answer.usage }, known)
}

// One picture from OpenAI. Counted even when no usage came back.
export async function meterImage({ usage, model }, { record } = {}) {
    const { usd, known } = costOfImageUsage(usage, model)
    await book(record, { provider: 'openai', model, usd, usage, images: 1 }, known || !usage)
}
