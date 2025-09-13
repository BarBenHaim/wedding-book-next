export default function DesignTemplateSelector({ onSelectTemplate }) {
    const templates = [
        { id: 'classic', name: 'ברכה קלאסית' },
        { id: 'photo', name: 'תמונה ממוסגרת' },
        { id: 'floral', name: 'רקע פרחוני' },
    ]

    return (
        <div style={{ marginTop: '20px' }}>
            <h3>בחר תבנית עיצוב לכל הספר:</h3>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {templates.map(tpl => (
                    <button key={tpl.id} onClick={() => onSelectTemplate(tpl.id)}>
                        {tpl.name}
                    </button>
                ))}
            </div>
        </div>
    )
}
