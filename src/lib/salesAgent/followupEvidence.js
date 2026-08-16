const DEMO_URL = /https:\/\/(?:app\.)?weddingtales\.co\.il\/(?:demo\b|wedding\/[^\s/]+\/photo\b)/i

export function isDemoEvidenceContent({ part, text } = {}) {
    return part === 'image'
        || part === 'video'
        || (part === 'text' && DEMO_URL.test(String(text || '')))
}

export function followUpEvidence(lead = {}) {
    // Draft turns and `imagesSent`/`mediaSent` are persisted before Make or
    // Graph transport. They prove intent to send, not customer delivery.
    // Only acknowledgement-backed fields may unlock "what did you think?".
    const acknowledgedDemo = lead.demoEvidenceDelivered === true
    return {
        hasDemoEvidence: acknowledgedDemo,
        hasMediaEvidence: acknowledgedDemo,
    }
}

export default followUpEvidence
