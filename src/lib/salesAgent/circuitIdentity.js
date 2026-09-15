import crypto from 'node:crypto'

/** Server-only Firestore key for one provider/model circuit. */
export function providerCircuitRuntimeId({ provider, model } = {}) {
    const cleanProvider = String(provider || '').trim().toLowerCase()
    const cleanModel = String(model || '').trim()
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(cleanProvider) || !cleanModel || cleanModel.length > 120) {
        throw new Error('INVALID_PROVIDER_CIRCUIT_IDENTITY')
    }
    const digest = crypto.createHash('sha256').update(`${cleanProvider}:${cleanModel}`).digest('hex').slice(0, 32)
    return `provider_${digest}`
}

const circuitIdentity = { providerCircuitRuntimeId }
export default circuitIdentity
