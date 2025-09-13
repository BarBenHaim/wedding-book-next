export default function BlessingCard({ entry }) {
    return (
        <div className='card blessing'>
            <h3>{entry.name || 'ברכה אנונימית'}</h3>
            <p>{entry.summary || entry.contentPreview}</p>
            <div>
                <strong>סנטימנט:</strong> {entry.sentiment}
            </div>
            <div>
                <strong>תגיות:</strong>{' '}
                {entry.tags?.map((tag, i) => (
                    <span className='tag' key={i}>
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    )
}
