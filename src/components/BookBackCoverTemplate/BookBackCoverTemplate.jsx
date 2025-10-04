'use client'

import React, { useEffect, useRef } from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height

        // רקע לבן עם מעבר עדין
        const bg = ctx.createLinearGradient(0, 0, w, h)
        bg.addColorStop(0, '#ffffff')
        bg.addColorStop(1, '#f8f5ff')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)

        // לב שקוף ברקע
        const heartGradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.35)
        heartGradient.addColorStop(0, 'rgba(139,92,246,0.08)')
        heartGradient.addColorStop(1, 'transparent')
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.rotate(-Math.PI / 12)
        ctx.fillStyle = heartGradient
        ctx.beginPath()
        const size = w * 0.25
        ctx.moveTo(0, size)
        ctx.bezierCurveTo(size, size * 0.5, size, -size * 0.4, 0, -size)
        ctx.bezierCurveTo(-size, -size * 0.4, -size, size * 0.5, 0, size)
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        // טקסט גרדיאנט Wedding Tales
        const textGradient = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0)
        textGradient.addColorStop(0, '#ec4899')
        textGradient.addColorStop(1, '#9333ea')
        ctx.fillStyle = textGradient
        ctx.font = `${w * 0.12}px "Great Vibes"`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Wedding Tales', w / 2, h / 2)

        // תת־כותרת
        ctx.font = `${w * 0.03}px "Heebo"`
        ctx.fillStyle = '#777'
        ctx.fillText('זכרונות שנשארים לנצח', w / 2, h / 2 + w * 0.1)
    }, [scaledWidth, scaledHeight])

    return (
        <div
            style={{
                width: scaledWidth,
                height: scaledHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
            }}
        >
            <canvas
                ref={canvasRef}
                width={scaledWidth}
                height={scaledHeight}
                style={{
                    width: scaledWidth,
                    height: scaledHeight,
                }}
            />
        </div>
    )
}
