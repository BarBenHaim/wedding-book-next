export default function MediaItem({ entry }) {
    if (entry.type === 'text') return <p className='text-item'>{entry.content}</p>
    if (entry.type === 'photo') return <img src={entry.content} alt={entry.name} className='img-item' />
    return null
}
