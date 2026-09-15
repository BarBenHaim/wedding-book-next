import crypto from 'crypto'

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/
const PROVIDERS = new Set(['anthropic', 'openai', 'gemini'])

function positiveInteger(value, error) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(error)
    return parsed
}

function normalizeArm(input, registry) {
    const id = String(input?.id || '')
    if (!ID_PATTERN.test(id)) throw new Error('INVALID_MODEL_ARM_ID')
    const provider = String(input?.provider || '')
    const model = String(input?.model || '')
    if (!PROVIDERS.has(provider)) throw new Error('INVALID_MODEL_ARM_PROVIDER')
    if (!registry.some(row => row?.id === model && row?.provider === provider)) {
        throw new Error('INVALID_MODEL_ARM_MODEL')
    }
    const weight = Number(input?.weight)
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
        throw new Error('INVALID_MODEL_ARM_WEIGHT')
    }
    return {
        id,
        provider,
        model,
        weight,
        enabled: input?.enabled === true,
        revision: positiveInteger(input?.revision, 'INVALID_MODEL_ARM_REVISION'),
    }
}

export function normalizeModelExperiment(input = {}, registry = []) {
    const id = String(input?.id || '')
    if (!ID_PATTERN.test(id)) throw new Error('INVALID_MODEL_EXPERIMENT_ID')
    const arms = Array.isArray(input?.arms) ? input.arms.map(row => normalizeArm(row, registry)) : []
    if (!arms.length || arms.length > 3) throw new Error('INVALID_MODEL_EXPERIMENT_ARMS')
    if (new Set(arms.map(row => row.id)).size !== arms.length) throw new Error('DUPLICATE_MODEL_ARM')
    const enabled = input?.enabled === true
    const active = arms.filter(row => row.enabled && row.weight > 0)
    if (enabled && (!active.length || active.reduce((sum, row) => sum + row.weight, 0) !== 100)) {
        throw new Error('INVALID_MODEL_EXPERIMENT_WEIGHT')
    }
    const championArmId = String(input?.championArmId || '')
    if (!arms.some(row => row.id === championArmId)) throw new Error('INVALID_MODEL_CHAMPION')
    return {
        id,
        revision: positiveInteger(input?.revision, 'INVALID_MODEL_EXPERIMENT_REVISION'),
        enabled,
        targetVerifiedSalesPerDay: positiveInteger(input?.targetVerifiedSalesPerDay, 'INVALID_MODEL_SALES_TARGET'),
        minimumDeliveredPerArm: positiveInteger(input?.minimumDeliveredPerArm, 'INVALID_MODEL_SAMPLE'),
        minimumDays: positiveInteger(input?.minimumDays, 'INVALID_MODEL_DAYS'),
        championArmId,
        arms,
    }
}

export function assignModelArm(experiment, leadId) {
    const active = (Array.isArray(experiment?.arms) ? experiment.arms : [])
        .filter(row => row?.enabled === true && Number(row?.weight) > 0)
    if (experiment?.enabled !== true || !active.length) throw new Error('MODEL_EXPERIMENT_NO_ARM')
    const digest = crypto.createHash('sha256')
        .update(`${experiment.id}:${experiment.revision}:${String(leadId || '')}`)
        .digest('hex')
    const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100
    let cursor = 0
    for (const arm of active) {
        cursor += Number(arm.weight)
        if (bucket < cursor) {
            return {
                experimentId: String(experiment.id),
                experimentRevision: Number(experiment.revision),
                armId: String(arm.id),
                armRevision: Number(arm.revision),
                provider: String(arm.provider),
                model: String(arm.model),
            }
        }
    }
    throw new Error('MODEL_EXPERIMENT_NO_ARM')
}

export function modelArmKey(assignment = {}) {
    return [
        assignment.experimentId,
        assignment.experimentRevision,
        assignment.armId,
        assignment.armRevision,
    ].map(value => String(value ?? '')).join(':')
}

function toMs(value) {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value?.toMillis === 'function') return value.toMillis()
    if (typeof value?.seconds === 'number') return value.seconds * 1000
    const parsed = Date.parse(String(value))
    return Number.isFinite(parsed) ? parsed : null
}

function ratio(numerator, denominator) {
    return { numerator, denominator, rate: denominator ? numerator / denominator : null }
}

function jerusalemDayKey(value) {
    const timestamp = toMs(value)
    if (timestamp == null) return null
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(timestamp))
}

function percentile(values, fraction) {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function assignmentMatches(lead, experiment, arm) {
    const assignment = lead?.modelAssignment
    return assignment?.experimentId === experiment.id
        && Number(assignment?.experimentRevision) === Number(experiment.revision)
        && assignment?.armId === arm.id
        && Number(assignment?.armRevision) === Number(arm.revision)
}

export function evaluateModelGuardrail(row = {}) {
    const primaryAttempted = Math.max(0, Number(row.primaryAttempted) || 0)
    const providerFailures = Math.max(0, Number(row.providerFailures) || 0)
    const invalidOutputs = Math.max(0, Number(row.invalidOutputs) || 0)
    const policyFailures = Math.max(0, Number(row.policyFailures) || 0)
    if (policyFailures >= 1) return { pause: true, reason: 'policy_violation' }
    if (primaryAttempted >= 5 && providerFailures / primaryAttempted >= 0.4) {
        return { pause: true, reason: 'provider_failure_rate' }
    }
    if (primaryAttempted >= 10 && invalidOutputs / primaryAttempted >= 0.2) {
        return { pause: true, reason: 'invalid_output_rate' }
    }
    return { pause: false, reason: null }
}

export function summarizeModelExperiment(leads = [], { experiment, nowMs = Date.now() } = {}) {
    const arms = Array.isArray(experiment?.arms) ? experiment.arms : []
    const todayKey = jerusalemDayKey(nowMs)
    const rows = arms.map(arm => {
        const assigned = leads.filter(lead => assignmentMatches(lead, experiment, arm))
        const uncontaminated = assigned.filter(lead => lead?.modelFallbackUsed !== true && lead?.modelExecution?.fallback !== true)
        const delivered = uncontaminated.filter(lead => toMs(lead?.modelDeliveredAt) != null)
        const verified = uncontaminated.filter(lead => lead?.paymentVerified === true)
        const verifiedToday = verified.filter(lead => jerusalemDayKey(lead?.modelPaymentAttributedAt) === todayKey)
        const providerFailures = assigned.filter(lead => Boolean(lead?.providerFailureCode)).length
        const invalidOutputs = assigned.filter(lead => lead?.providerFailureCode === 'invalid_json').length
        const policyFailures = assigned.filter(lead => lead?.modelPolicyFailure === true).length
        const latencies = assigned.map(lead => Number(lead?.modelLatencyMs)).filter(Number.isFinite).filter(value => value >= 0)
        const firstAssignedAt = assigned.map(lead => toMs(lead?.modelAssignment?.assignedAt)).filter(value => value != null)
            .reduce((minimum, value) => minimum == null ? value : Math.min(minimum, value), null)
        const exposureDays = firstAssignedAt == null ? 0 : Math.max(1, Math.floor((nowMs - firstAssignedAt) / 86_400_000) + 1)
        const eligible = uncontaminated.length
        const verifiedRevenue = verified.reduce((sum, lead) => sum + (Number.isFinite(Number(lead?.amount)) ? Number(lead.amount) : 0), 0)
        const costUsd = assigned.reduce((sum, lead) => sum + (Number.isFinite(Number(lead?.modelCostUsd)) ? Number(lead.modelCostUsd) : 0), 0)
        const row = {
            armId: String(arm.id),
            armRevision: Number(arm.revision),
            provider: String(arm.provider),
            model: String(arm.model),
            enabled: arm.enabled === true,
            weight: Number(arm.weight) || 0,
            assigned: assigned.length,
            eligible,
            primaryAttempted: assigned.filter(lead => lead?.modelPrimaryAttempted === true).length,
            delivered: delivered.length,
            replied24h: uncontaminated.filter(lead => lead?.modelReply24h === true).length,
            progressed: uncontaminated.filter(lead => lead?.modelProgressed === true).length,
            readyToPay: uncontaminated.filter(lead => ['ready_to_pay', 'closed_won'].includes(lead?.stage)).length,
            verifiedPaid: verified.length,
            verifiedRevenue,
            verifiedPaidToday: verifiedToday.length,
            verifiedRevenueToday: verifiedToday.reduce((sum, lead) => sum + (Number.isFinite(Number(lead?.amount)) ? Number(lead.amount) : 0), 0),
            providerFailures,
            invalidOutputs,
            policyFailures,
            fallbacks: assigned.length - uncontaminated.length,
            costUsd,
            revenuePerEligibleLead: eligible ? verifiedRevenue / eligible : null,
            costPerVerifiedPurchase: verified.length ? costUsd / verified.length : null,
            latencyP50Ms: percentile(latencies, 0.5),
            latencyP95Ms: percentile(latencies, 0.95),
            exposureDays,
            deliveryRate: ratio(delivered.length, eligible),
            reply24hRate: ratio(uncontaminated.filter(lead => lead?.modelReply24h === true).length, eligible),
            progressionRate: ratio(uncontaminated.filter(lead => lead?.modelProgressed === true).length, eligible),
            verifiedPaymentRate: ratio(verified.length, eligible),
        }
        return { ...row, guardrail: evaluateModelGuardrail(row) }
    })
    const active = rows.filter(row => row.enabled && row.weight > 0)
    const minimumDelivered = Math.max(1, Number(experiment?.minimumDeliveredPerArm) || 30)
    const minimumDays = Math.max(1, Number(experiment?.minimumDays) || 7)
    const evidenceReady = experiment?.enabled === true
        && active.length > 1
        && active.every(row => row.delivered >= minimumDelivered && row.exposureDays >= minimumDays)
    const verifiedPaidToday = rows.reduce((sum, row) => sum + row.verifiedPaidToday, 0)
    const verifiedRevenueToday = rows.reduce((sum, row) => sum + row.verifiedRevenueToday, 0)
    const targetVerifiedSalesPerDay = Math.max(1, Number(experiment?.targetVerifiedSalesPerDay) || 2)
    return {
        experimentId: String(experiment?.id || ''),
        experimentRevision: Number(experiment?.revision) || 0,
        enabled: experiment?.enabled === true,
        championArmId: String(experiment?.championArmId || ''),
        targetVerifiedSalesPerDay,
        verifiedPaidToday,
        verifiedRevenueToday,
        targetReachedToday: verifiedPaidToday >= targetVerifiedSalesPerDay,
        minimumDeliveredPerArm: minimumDelivered,
        minimumDays,
        evidenceReady,
        rows,
    }
}

export function recommendModelAllocation(summary = {}) {
    const unsafe = (Array.isArray(summary?.rows) ? summary.rows : []).find(row => row?.guardrail?.pause)
    if (unsafe) return { action: 'pause', armId: unsafe.armId, reason: unsafe.guardrail.reason }
    if (summary?.evidenceReady !== true) return { action: 'insufficient_evidence' }
    const rows = [...summary.rows].filter(row => row.enabled && row.weight > 0)
        .sort((left, right) => {
            const paid = (right.verifiedPaymentRate?.rate || 0) - (left.verifiedPaymentRate?.rate || 0)
            if (paid) return paid
            const revenue = (right.revenuePerEligibleLead || 0) - (left.revenuePerEligibleLead || 0)
            if (revenue) return revenue
            return (right.progressionRate?.rate || 0) - (left.progressionRate?.rate || 0)
        })
    const [winner, runner] = rows
    if (!winner || !runner) return { action: 'insufficient_evidence' }
    const winnerRate = winner.verifiedPaymentRate?.rate || 0
    const runnerRate = runner.verifiedPaymentRate?.rate || 0
    const material = winnerRate > runnerRate && (runnerRate === 0 || winnerRate / runnerRate >= 1.2)
    if (!material || winner.armId === summary.championArmId) {
        return { action: 'keep', winnerArmId: winner.armId, reason: material ? 'champion_leads' : 'no_material_lift' }
    }
    return {
        action: 'promote',
        winnerArmId: winner.armId,
        allocation: Object.fromEntries(rows.map(row => [row.armId, row.armId === winner.armId ? 100 : 0])),
        reason: 'verified_purchase_lift',
    }
}

const modelExperiment = {
    normalizeModelExperiment,
    assignModelArm,
    modelArmKey,
    summarizeModelExperiment,
    evaluateModelGuardrail,
    recommendModelAllocation,
}

export default modelExperiment
