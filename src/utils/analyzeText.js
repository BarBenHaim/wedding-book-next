export async function analyzeText(content) {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY

    const systemPrompt = `
אתה מערכת חכמה שמסווגת ברכות חתונה.
בהינתן טקסט ברכה, החזר JSON עם:
- sentiment: happy / emotional / funny / neutral
- tags: רשימה של מילות מפתח או נושאים מתוך הברכה
- summary: סיכום קצר של הברכה

ענה רק בפורמט JSON.
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content },
            ],
            temperature: 0.5,
        }),
    })

    const data = await response.json()

    try {
        const parsed = JSON.parse(data.choices[0].message.content)
        return parsed
    } catch (err) {
        console.error('❌ שגיאה בניתוח:', err)
        return {
            sentiment: 'neutral',
            tags: [],
            summary: '',
        }
    }
}
