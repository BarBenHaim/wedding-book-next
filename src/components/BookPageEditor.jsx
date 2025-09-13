import { useState } from 'react'
import { Rnd } from 'react-rnd'

export default function BookPageEditor({ onSave, onCancel }) {
    const [elements, setElements] = useState([])
    const [bgColor, setBgColor] = useState('#ffffff')

    const addText = () => {
        setElements([
            ...elements,
            {
                id: Date.now(),
                type: 'text',
                content: 'טקסט חדש',
                x: 100,
                y: 100,
                width: 200,
                height: 60,
            },
        ])
    }

    const addImage = () => {
        const url = prompt('קישור לתמונה:')
        if (url) {
            setElements([
                ...elements,
                {
                    id: Date.now(),
                    type: 'image',
                    content: url,
                    x: 100,
                    y: 100,
                    width: 200,
                    height: 150,
                },
            ])
        }
    }

    const updateElement = (id, newProps) => {
        setElements(elements.map(el => (el.id === id ? { ...el, ...newProps } : el)))
    }

    const save = () => {
        onSave({
            id: Date.now().toString(),
            type: 'custom',
            name: 'עיצוב אישי',
            content: { bgColor, elements },
            timestamp: new Date().toISOString(),
        })
    }

    return (
        <div style={{ border: '1px solid #ccc', padding: 10, marginBottom: 20 }}>
            <div style={{ marginBottom: 10 }}>
                <button onClick={addText}>➕ טקסט</button>
                <button onClick={addImage}>🖼️ תמונה</button>
                <input type='color' value={bgColor} onChange={e => setBgColor(e.target.value)} />
                <button onClick={save}>💾 שמור</button>
                <button onClick={onCancel}>❌ ביטול</button>
            </div>

            <div
                style={{
                    width: 600,
                    height: 400,
                    margin: 'auto',
                    backgroundColor: bgColor,
                    border: '1px solid black',
                    position: 'relative',
                }}
            >
                {elements.map(el => (
                    <Rnd
                        key={el.id}
                        default={{
                            x: el.x,
                            y: el.y,
                            width: el.width,
                            height: el.height,
                        }}
                        onDragStop={(e, d) => updateElement(el.id, { x: d.x, y: d.y })}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            updateElement(el.id, {
                                width: parseInt(ref.style.width),
                                height: parseInt(ref.style.height),
                                ...position,
                            })
                        }}
                    >
                        {el.type === 'text' ? (
                            <div
                                contentEditable
                                suppressContentEditableWarning
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    fontSize: 18,
                                    padding: 5,
                                    border: '1px dashed #333',
                                    background: '#fff',
                                }}
                                onBlur={e => updateElement(el.id, { content: e.target.innerText })}
                            >
                                {el.content}
                            </div>
                        ) : (
                            <img
                                src={el.content}
                                alt=''
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        )}
                    </Rnd>
                ))}
            </div>
        </div>
    )
}
