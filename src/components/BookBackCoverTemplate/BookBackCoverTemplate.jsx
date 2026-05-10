'use client'

import React from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    return (
        <div
            style={{
                width: scaledWidth,
                height: scaledHeight,
                position: 'relative',
                overflow: 'hidden',
                background: '#f5f0e8',
            }}
        >
            <img
                src='/backgrounds/backcover.webp'
                alt='Back Cover'
                crossOrigin='anonymous'
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                }}
            />
        </div>
    )
}
