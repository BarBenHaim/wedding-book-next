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

    const handleGenerateAI = async () => {
        const prompt = `אתה מחולל ספר חתונה על בסיס התוכן הבא:\n\n${JSON.stringify(
            pages,
            null,
            2
        )}\n\nצור מבנה לספר: פרקים, עמודים, תוכן וכו'. הפלט בפורמט JSON.`

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
            }),
        })

        const data = await res.json()
        const output = data.choices?.[0]?.message?.content
        console.log('📘 AI Response:', output)
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

            <button className='btn generate' onClick={handleGenerateAI}>
                🧠 צור ספר עם AI
            </button>
        </div>
    )
}
