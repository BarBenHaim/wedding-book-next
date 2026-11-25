// The five places a customer can be, in order. Shared with the browser, so this
// file imports nothing.
export const STAGES = [
    { key: 'talk', label: 'בשיחה' },
    { key: 'collect', label: 'כותבים ברכות' },
    { key: 'print', label: 'להדפיס' },
    { key: 'way', label: 'בדרך' },
    { key: 'done', label: 'הסתיים' },
]
export const stageIndex = key => STAGES.findIndex(stage => stage.key === key)
export const stageLabel = key => STAGES[stageIndex(key)]?.label || ''
