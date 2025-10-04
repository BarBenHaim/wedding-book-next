'use client'

import React from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    return (
        <div
            style={{
                width: scaledWidth,
                height: scaledHeight,
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                fontFamily: 'Heebo, sans-serif',
                color: '#8B5CF6',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* מסגרת דקורטיבית עדינה */}
            <div
                style={{
                    position: 'absolute',
                    width: '70%',
                    height: '70%',
                    top: '15%',
                    left: '15%',
                    border: '2px solid rgba(139, 92, 246, 0.15)',
                    borderRadius: '20px',
                    transform: 'rotate(3deg)',
                }}
            />

            {/* מיתוג מרכזי */}
            <div style={{ textAlign: 'center', zIndex: 2 }}>
                <h1
                    style={{
                        fontSize: scaledWidth * 0.08,
                        fontWeight: 700,
                        marginBottom: '0.4em',
                    }}
                >
                    Wedding Tales
                </h1>
                <p style={{ fontSize: scaledWidth * 0.025, color: '#666' }}>זכרונות שנשארים לנצח</p>
            </div>

            {/* פוטר קטן */}
            <div
                style={{
                    position: 'absolute',
                    bottom: scaledHeight * 0.05,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    fontSize: scaledWidth * 0.02,
                    color: '#aaa',
                }}
            >
                © Wedding Tales · since 2025
            </div>
        </div>
    )
}
