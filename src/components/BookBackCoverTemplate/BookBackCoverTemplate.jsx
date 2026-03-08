'use client'

import React, { useEffect, useRef, useState } from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    const canvasRef = useRef(null)
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')

        // --- הגדרות רזולוציה (High-DPI) לחדות מקסימלית ---
        const dpr = window.devicePixelRatio || 1
        canvas.width = scaledWidth * dpr
        canvas.height = scaledHeight * dpr
        ctx.scale(dpr, dpr)

        const w = scaledWidth
        const h = scaledHeight

        const drawCanvas = async () => {
            // המתנה לטעינת פונטים
            try {
                await document.fonts.ready
            } catch (e) {
                console.warn('Font loading API not supported')
            }

            ctx.clearRect(0, 0, w, h)

            // 1. רקע לבן עם מעבר עדין
            const bg = ctx.createLinearGradient(0, 0, w, h)
            bg.addColorStop(0, '#ffffff')
            bg.addColorStop(1, '#f8f5ff')
            ctx.fillStyle = bg
            ctx.fillRect(0, 0, w, h)

            // 2. לב שקוף ברקע
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

            // --- אזור מרכזי: לוגו וסלוגן ---
            const logoY = h * 0.42
            const subtitleY = logoY + w * 0.1

            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            // לוגו Wedding Tales
            const textGradient = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0)
            textGradient.addColorStop(0, '#ec4899')
            textGradient.addColorStop(1, '#9333ea')
            ctx.fillStyle = textGradient
            ctx.font = `${w * 0.13}px "Great Vibes", cursive`
            ctx.fillText('Wedding Tales', w / 2, logoY)

            // תת־כותרת
            ctx.font = `300 ${w * 0.035}px "Heebo", sans-serif`
            ctx.fillStyle = '#3a3a3a'
            ctx.fillText('זכרונות שנשארים לנצח', w / 2, subtitleY)

            // --- אזור תחתון: כתובת וזכויות יוצרים (נקי ומרווח) ---
            const bottomY = h * 0.93 // הכתובת יושבת מעט גבוה יותר כדי לתת אוויר
            const copyrightY = h * 0.965 // הזכויות שמורות ממש בתחתית, כמו חותמת

            // כתובת האתר - הצבע כהה ('קצת יותר שחור') ובולט בדיוק במידה
            ctx.font = `400 ${w * 0.026}px "Heebo", sans-serif`
            ctx.fillStyle = '#111111'
            ctx.fillText('weddingtales.co.il', w / 2, bottomY)

            // זכויות שמורות - פונט קטן ועדין יותר, לא מתחרה בכתובת האתר
            const currentYear = new Date().getFullYear()
            ctx.font = `300 ${w * 0.016}px "Heebo", sans-serif`
            ctx.fillStyle = '#333333'
            ctx.fillText(`© כל הזכויות שמורות ${currentYear} `, w / 2, copyrightY)

            setIsReady(true)
        }

        drawCanvas()
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                opacity: isReady ? 1 : 0,
                transition: 'opacity 0.4s ease-in-out',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                }}
            />
        </div>
    )
}
