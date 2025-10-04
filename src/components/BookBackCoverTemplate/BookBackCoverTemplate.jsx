'use client'

import React from 'react'

export default function BookBackCoverTemplate({ scaledWidth, scaledHeight }) {
    return (
        <div
            style={{
                width: scaledWidth,
                height: scaledHeight,
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Heebo, sans-serif',
                position: 'relative',
                overflow: 'hidden',
                color: '#8B5CF6',
            }}
        >
            {/* לב חצי שקוף ברקע */}
            <div
                style={{
                    position: 'absolute',
                    width: scaledWidth * 0.7,
                    height: scaledWidth * 0.7,
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) rotate(-15deg)',
                    background: 'radial-gradient(circle at center, rgba(139,92,246,0.08) 0%, transparent 70%)',
                    maskImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.59C11.09 5.01 12.76 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/></svg>\")",
                    WebkitMaskImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.59C11.09 5.01 12.76 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/></svg>\")",
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                }}
            />

            {/* לוגו */}
            <div
                style={{
                    fontFamily: "'Great Vibes', cursive",
                    fontSize: scaledWidth * 0.12,
                    backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    fontWeight: '100',
                    zIndex: 2,
                    textAlign: 'center',
                }}
            >
                Wedding Tales
            </div>

            {/* תת כותרת */}
            <p
                style={{
                    fontSize: scaledWidth * 0.03,
                    color: '#777',
                    marginTop: '0.3em',
                    zIndex: 2,
                    textAlign: 'center',
                }}
            >
                זכרונות שנשארים לנצח
            </p>

            {/* פוטר */}
            <div
                style={{
                    position: 'absolute',
                    bottom: scaledHeight * 0.05,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    fontSize: scaledWidth * 0.02,
                    color: '#aaa',
                    zIndex: 2,
                }}
            ></div>
        </div>
    )
}
