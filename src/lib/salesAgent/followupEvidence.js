const DEMO_URL = /https:\/\/(?:app\.)?weddingtales\.co\.il\/(?:demo\b|wedding\/[^\s/]+\/photo\b)/i

export function followUpEvidence(lead = {}) {
    // Draft turns and `imagesSent`/`mediaSent` are persisted before Make or
    // Graph transport. They prove intent to send, not customer delivery.
    // Only acknowledgement-backed fields may unlock "what did you think?".
    const media = Array.isArray(lead.deliveredMediaKeys) ? lead.deliveredMediaKeys : []
    const hasDemoUrl = (Array.isArray(lead.deliveredDemoUrls) ? lead.deliveredDemoUrls : [])
        .some(url => DEMO_URL.test(String(url || '')))
    return {
        hasDemoEvidence: media.length > 0 || hasDemoUrl,
        hasMediaEvidence: media.length > 0,
    }
}

export default followUpEvidence
