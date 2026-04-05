'use client'

import React, { useEffect, useRef, useState } from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    const canvasRef = useRef(null)
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')

        const dpr = window.devicePixelRatio || 1
        canvas.width = scaledWidth * dpr
        canvas.height = scaledHeight * dpr
        ctx.scale(dpr, dpr)

        const w = scaledWidth
        const h = scaledHeight

        const drawCanvas = async () => {
            try {
                await document.fonts.ready
            } catch (e) {
                console.warn('Font loading API not supported')
            }

            ctx.clearRect(0, 0, w, h)

            // 1. Rich cream/ivory background
            const bg = ctx.createLinearGradient(0, 0, w, h)
            bg.addColorStop(0, '#faf8f4')
            bg.addColorStop(0.5, '#f5f0e8')
            bg.addColorStop(1, '#f0ebe3')
            ctx.fillStyle = bg
            ctx.fillRect(0, 0, w, h)

            // 2. Minimal thin border from margins
            ctx.save()
            ctx.strokeStyle = 'rgba(170,136,64,0.12)'
            ctx.lineWidth = 0.5
            const margin = w * 0.04
            ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2)
            ctx.restore()

            // 3. WT Logo image — centered
            const logoY = h * 0.46
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            try {
                const logoImg = new Image()
                logoImg.crossOrigin = 'anonymous'
                await new Promise((resolve, reject) => {
                    logoImg.onload = resolve
                    logoImg.onerror = reject
                    logoImg.src = '/logo-wt.png'
                })
                const logoSize = w * 0.28
                ctx.drawImage(logoImg, w / 2 - logoSize / 2, logoY - logoSize / 2, logoSize, logoSize)
            } catch (e) {
                // Fallback: draw text if image fails
                const logoGrad = ctx.createLinearGradient(w * 0.3, logoY - w * 0.06, w * 0.7, logoY + w * 0.06)
                logoGrad.addColorStop(0, '#AA8840')
                logoGrad.addColorStop(0.4, '#c9a44e')
                logoGrad.addColorStop(0.6, '#d4b867')
                logoGrad.addColorStop(1, '#AA8840')
                ctx.fillStyle = logoGrad
                ctx.font = `${w * 0.16}px "Great Vibes", cursive`
                ctx.fillText('WT', w / 2, logoY)
            }

            // 4. Tagline
            const subtitleY = h * 0.60
            ctx.font = `300 ${w * 0.032}px "Assistant", sans-serif`
            ctx.fillStyle = '#6b5e4f'
            ctx.fillText('זכרונות שנשארים לנצח', w / 2, subtitleY)

            // 5. Bottom section
            const bottomY = h * 0.88
            const copyrightY = h * 0.92

            ctx.font = `400 ${w * 0.024}px "Assistant", sans-serif`
            ctx.fillStyle = '#AA8840'
            ctx.fillText('weddingtales.co.il', w / 2, bottomY)

            const currentYear = new Date().getFullYear()
            ctx.font = `300 ${w * 0.015}px "Assistant", sans-serif`
            ctx.fillStyle = '#9a9080'
            ctx.fillText(`\u00A9 כל הזכויות שמורות ${currentYear}`, w / 2, copyrightY)

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
                background: '#f5f0e8',
                boxShadow: '0 4px 20px rgba(170,136,64,0.08)',
                opacity: isReady ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
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
