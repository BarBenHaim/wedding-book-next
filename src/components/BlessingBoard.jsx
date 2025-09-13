import BlessingCard from './BlessingCard'

export default function BlessingsBoard({ entries }) {
    return (
        <div className='grid'>
            {entries.map(entry => {
                if (entry.type === 'text') return <BlessingCard key={entry.id} entry={entry} />
                if (entry.type === 'video') return <div key={entry.id}>🎥 וידאו</div>
                if (entry.type === 'audio') return <div key={entry.id}>🎙️ הודעת קול</div>
                return null
            })}
        </div>
    )
}
