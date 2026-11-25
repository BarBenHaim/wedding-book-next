// What the bot window may change, what it sends to
// PUT /api/sales-agent/settings, and what Lord is asked before it is saved.
// Pure and safe for the browser; the server validates everything again.

// Opus 5.5 answers leads since 25.11. Sonnet 5.5 is the code's default and is
// priced, but no lead answer from it is on record.
export const BOT_MODELS = [
    { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', hint: 'החזק יותר. נמדד: בערך 7.5 סנט לתשובה.' },
    { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', hint: 'זול יותר, בערך חצי. עוד לא ענה ללידים אצלנו, אז כדאי לבדוק את התשובות הראשונות.' },
]
export const MODE_NAMES = { full_sales: 'מכירה מלאה', opening_only: 'פתיחה בלבד' }
export const MAX_INSTRUCTIONS = 4000

const FIELDS = new Set(['enabled', 'mode', 'model', 'businessInstructions'])
// The server folds all white space in the instructions into single spaces.
const folded = value => String(value || '').replace(/\s+/g, ' ').trim()
const modelName = id => BOT_MODELS.find(model => model.id === id)?.label || id

function changedFields(settings, patch) {
    const changed = {}
    for (const [field, value] of Object.entries(patch)) {
        if (!FIELDS.has(field)) throw new Error('UNKNOWN_FIELD')
        const same = field === 'businessInstructions' ? folded(value) === folded(settings[field]) : value === settings[field]
        if (!same) changed[field] = value
    }
    return changed
}

// Only what differs: the route refuses a whole settings object, and anything
// left out keeps its current value.
export function settingsChange(settings, patch) {
    const changed = changedFields(settings, patch)
    if (!Object.keys(changed).length) return null
    if (changed.model) {
        const model = BOT_MODELS.find(row => row.id === changed.model)
        if (!model) throw new Error('INVALID_MODEL')
        changed.provider = model.provider
    }
    return { revision: settings.revision, ...changed, changeNote: 'שונה ממסך היום' }
}

export function changeWarning(settings, patch) {
    const changed = changedFields(settings, patch)
    const lines = []
    if (changed.enabled === false) lines.push('לכבות את הבוט? לידים שיכתבו לא יקבלו תשובה עד שתדליק אותו.')
    if (changed.enabled === true) lines.push('להדליק את הבוט? הוא יתחיל לענות ללידים שכותבים.')
    if (changed.mode === 'opening_only') lines.push('לעבור לפתיחה בלבד? הבוט ישלח הודעת פתיחה ולא ימשיך את השיחה.')
    if (changed.mode === 'full_sales') lines.push('לעבור למכירה מלאה? הבוט ינהל את כל השיחה מול לידים.')
    if (changed.model) lines.push(`להחליף מודל ל-${modelName(changed.model)}? התשובות הבאות ייכתבו על ידו במקום ${modelName(settings.model)}.`)
    if ('businessInstructions' in changed) lines.push('לשמור את ההנחיות? הן ישפיעו על כל התשובות הבאות ללידים.')
    return lines.join('\n')
}
