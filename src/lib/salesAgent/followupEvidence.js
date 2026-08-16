const DEMO_URL = /https:\/\/(?:app\.)?weddingtales\.co\.il\/(?:demo\b|wedding\/[^\s/]+\/photo\b)/i

export function followUpEvidence(lead = {}) {
    const media = [...(Array.isArray(lead.imagesSent) ? lead.imagesSent : []), ...(Array.isArray(lead.mediaSent) ? lead.mediaSent : [])]
    const hasDemoUrl = (Array.isArray(lead.turns) ? lead.turns : []).some(turn => turn?.role === 'assistant' && DEMO_URL.test(String(turn?.text || '')))
    return {
        hasDemoEvidence: media.length > 0 || hasDemoUrl,
        hasMediaEvidence: media.length > 0,
    }
}

export default followUpEvidence
