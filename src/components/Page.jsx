import { Draggable } from '@hello-pangea/dnd'
import MediaItem from './MediaItem'

export default function Page({ page, index }) {
    const content = Array.isArray(page.content) ? page.content : []

    return (
        <div className='book-page'>
            <h3>{page.name || `עמוד ${index + 1}`}</h3>

            {content.map((entry, idx) => (
                <Draggable key={entry.id} draggableId={entry.id} index={idx}>
                    {provided => (
                        <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className='media-item-wrapper'
                        >
                            <MediaItem entry={entry} />
                        </div>
                    )}
                </Draggable>
            ))}

            <button className='add-button'>+ הוסף</button>
        </div>
    )
}
