import media from '../../lib/mediaSample.json'

export default function AdminDashboard() {
    return (
        <div className='container'>
            <h1>לוח בקרה לחתן ולכלה</h1>
            <p>בחרו ברכות ותמונות לספר שלכם:</p>

            <div className='grid'>
                {media.map((entry, idx) => (
                    <div key={idx} className='card'>
                        <p>
                            <strong>{entry.type}</strong>
                        </p>
                        {entry.type === 'text' && <p>{entry.content}</p>}
                        {entry.type === 'photo' && <img src={entry.content} width='200' />}
                    </div>
                ))}
            </div>
        </div>
    )
}
