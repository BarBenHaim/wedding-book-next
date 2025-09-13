import Page from './Page'
import { Droppable } from '@hello-pangea/dnd'

export default function Spread({ left, right, pageIndex, settings }) {
    return (
        <div className='spread'>
            {[left, right].map((page, i) => (
                <Droppable key={i} droppableId={`${pageIndex}`} direction='vertical'>
                    {provided => (
                        <div
                            className='page'
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            style={{
                                fontFamily: settings.fontFamily,
                                backgroundColor: settings.bgColor,
                            }}
                        >
                            {page ? <Page page={page} index={i} /> : <div className='empty-page' />}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            ))}
        </div>
    )
}
