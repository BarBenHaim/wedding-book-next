'use client'

import { useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import mediaSample from '../../../lib/mediaSample.json'
import { useRouter } from 'next/navigation'

import BookPageTemplate from '../../../components/BookPageTemplate'
import './BookBuilder.css'

export default function BookBuilder() {
    const [pages, setPages] = useState(mediaSample)
    const router = useRouter()

    const onDragEnd = result => {
        const { source, destination } = result
        if (!destination) return

        const updated = Array.from(pages)
        const [moved] = updated.splice(source.index, 1)
        updated.splice(destination.index, 0, moved)
        setPages(updated)
    }

    const handleGoToViewer = () => {
        localStorage.setItem('bookPages', JSON.stringify(pages))
        router.push('/viewer')
    }

    return (
        <div className='builder'>
            <h2>📄 סידור עמודים</h2>

            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId='pages'>
                    {provided => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className='page-list'>
                            {pages.map((entry, index) => (
                                <Draggable key={index} draggableId={`page-${index}`} index={index}>
                                    {provided => (
                                        <div
                                            className='page-preview'
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            style={provided.draggableProps.style}
                                        >
                                            <strong>{entry.name}</strong>
                                            <BookPageTemplate entry={entry} />
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            <button className='btn' onClick={handleGoToViewer}>
                📖 הצג כתצוגת ספר פתוח
            </button>
        </div>
    )
}
