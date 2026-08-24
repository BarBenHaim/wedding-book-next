import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminStorage } from '@/lib/firebaseAdmin'
import { downloadWhatsAppMedia, renderOpeningDesign } from './openingDesign'
import { readSalesSettings } from './settingsStore'
import { prepareFollowUpDelivery, recordDeliveryEvent } from './leads'
import { sendWhatsAppImage } from './whatsapp'

const COLLECTION = 'sales_opening_approvals'
const GENERATION_LEASE_MS = 60_000

function approvalError(code) {
    const error = new Error('opening approval unavailable')
    error.code = code
    return error
}

export function openingApprovalId(leadId, stateVersion) {
    return crypto.createHash('sha256')
        .update(`opening-approval:${String(leadId)}:${Number(stateVersion) || 0}`)
        .digest('hex')
        .slice(0, 32)
}

export function createOpeningApprovalRecord({ leadId, stateVersion, mediaId, templateId, variantId, variantRevision }) {
    const id = openingApprovalId(leadId, stateVersion)
    return {
        id,
        leadId: String(leadId),
        stateVersion: Number(stateVersion),
        mediaId: String(mediaId || '').slice(0, 500),
        templateId: String(templateId || ''),
        variantId: String(variantId || '').slice(0, 1),
        variantRevision: Number(variantRevision || 1),
        status: 'pending_generation',
        storagePath: null,
    }
}

const approvalRef = id => adminDb.collection(COLLECTION).doc(String(id))

async function readApproval(id) {
    const snap = await approvalRef(id).get()
    return snap.exists ? { id: String(id), ...snap.data() } : null
}

async function claimApproval(id) {
    return adminDb.runTransaction(async tx => {
        const ref = approvalRef(id)
        const snap = await tx.get(ref)
        if (!snap.exists) throw approvalError('APPROVAL_NOT_FOUND')
        const approval = { id: String(id), ...snap.data() }
        if (approval.status === 'ready') return { action: 'ready', approval }
        if (approval.status === 'generating' && Number(approval.generationLeaseUntilMs) > Date.now()) {
            return { action: 'busy', approval }
        }
        if (approval.status !== 'pending_generation' && approval.status !== 'generation_failed' && approval.status !== 'generating') {
            throw approvalError('APPROVAL_STATE_MISMATCH')
        }
        tx.set(ref, {
            status: 'generating',
            generationLeaseUntilMs: Date.now() + GENERATION_LEASE_MS,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { action: 'claimed', approval }
    })
}

async function uploadGenerated(id, bytes) {
    const storagePath = `sales-opening-approvals/${String(id)}.png`
    await adminStorage.bucket().file(storagePath).save(bytes, {
        resumable: false,
        contentType: 'image/png',
        metadata: { cacheControl: 'private, max-age=0, no-store' },
    })
    return storagePath
}

async function markReady(id, storagePath) {
    await approvalRef(id).set({
        status: 'ready', storagePath, mediaId: null, generationLeaseUntilMs: null,
        generatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return readApproval(id)
}

export async function generateOpeningApproval(id, deps = {}) {
    const read = deps.read || readApproval
    const current = await read(id)
    if (!current) throw approvalError('APPROVAL_NOT_FOUND')
    if (current.status === 'ready') return current
    const claim = await (deps.claim || claimApproval)(id)
    if (claim.action === 'ready') return claim.approval
    if (claim.action === 'busy') return { ...claim.approval, status: 'generating' }
    try {
        const downloaded = await (deps.download || downloadWhatsAppMedia)(claim.approval.mediaId)
        const rendered = await (deps.render || renderOpeningDesign)({ image: downloaded.bytes, templateId: claim.approval.templateId })
        const storagePath = await (deps.upload || uploadGenerated)(id, rendered)
        return await (deps.markReady || markReady)(id, storagePath)
    } catch (error) {
        if (!deps.markReady) {
            await approvalRef(id).set({
                status: 'generation_failed', generationLeaseUntilMs: null,
                errorCode: String(error?.code || 'DESIGN_RENDER_FAILED').slice(0, 60),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }).catch(() => {})
        }
        throw error?.code ? error : approvalError('DESIGN_RENDER_FAILED')
    }
}

async function updateDecision(id, status) {
    return adminDb.runTransaction(async tx => {
        const approval = approvalRef(id)
        const snap = await tx.get(approval)
        if (!snap.exists) throw approvalError('APPROVAL_NOT_FOUND')
        const row = { id: String(id), ...snap.data() }
        if (status === 'approved' && row.status !== 'ready') throw approvalError('APPROVAL_STATE_MISMATCH')
        if (status === 'rejected' && !['ready', 'pending_generation', 'generation_failed'].includes(row.status)) {
            throw approvalError('APPROVAL_STATE_MISMATCH')
        }
        tx.set(approval, { status, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        if (row.leadId) {
            tx.set(adminDb.collection('sales_leads').doc(String(row.leadId)), {
                openingStatus: status === 'rejected' ? 'approval_rejected' : 'approval_approved',
                openingApprovalId: String(id),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
        }
        return { ...row, status }
    })
}

async function generatedSignedUrl(storagePath) {
    const [url] = await adminStorage.bucket().file(storagePath).getSignedUrl({
        action: 'read', expires: Date.now() + 5 * 60_000,
    })
    return url
}

export async function sendApprovedOpeningDesign(approval) {
    const outboundId = crypto.createHash('sha256').update(`opening-approved:${approval.id}`).digest('hex').slice(0, 32)
    const prepared = await prepareFollowUpDelivery({
        phone: approval.leadId,
        outboundId,
        channel: 'whatsapp_graph',
        part: 'image',
        text: '',
        advancesFollowUp: false,
        demoEvidence: true,
        logicalAttemptId: `opening-approval-${approval.id}`,
    })
    if (prepared.action === 'existing') return { accepted: prepared.status !== 'failed', outboundId, status: prepared.status }
    if (prepared.action !== 'requested') throw approvalError('APPROVAL_SEND_BUSY')
    const url = await generatedSignedUrl(approval.storagePath)
    const transport = await sendWhatsAppImage(approval.leadId, url, 'הכנתי לך דוגמת עיצוב אישית ✨')
    await recordDeliveryEvent({
        eventId: `opening-approval-${approval.id}-accepted`,
        outboundId,
        channel: 'whatsapp_graph',
        status: 'accepted',
        providerMessageId: transport.providerMessageId,
        occurredAt: new Date().toISOString(),
    })
    return { accepted: true, outboundId, status: 'accepted' }
}

export async function decideOpeningApproval(id, decision, deps = {}) {
    if (!['approve', 'reject'].includes(decision)) throw approvalError('INVALID_APPROVAL_DECISION')
    const approval = await (deps.read || readApproval)(id)
    if (!approval) throw approvalError('APPROVAL_NOT_FOUND')
    if (String(approval.id) !== String(id)) throw approvalError('APPROVAL_MISMATCH')
    if (decision === 'reject') {
        return (deps.updateDecision || updateDecision)(id, 'rejected')
    }
    if (approval.status !== 'ready') throw approvalError('APPROVAL_STATE_MISMATCH')
    const settings = await (deps.readSettings || readSalesSettings)()
    const experiment = settings?.openingExperiment
    const variant = experiment?.variants?.find(item => item.id === approval.variantId)
    if (experiment?.enabled !== true || variant?.enabled !== true) throw approvalError('OPENING_EXPERIMENT_STOPPED')
    const approved = await (deps.updateDecision || updateDecision)(id, 'approved')
    const sent = await (deps.send || sendApprovedOpeningDesign)(approved)
    if (deps.markSent) await deps.markSent(id, sent)
    else if (!deps.send) {
        await approvalRef(id).set({ status: 'sent', outboundId: sent.outboundId, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        if (approved.leadId) await adminDb.collection('sales_leads').doc(String(approved.leadId)).set({
            openingStatus: 'completed', openingCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
    }
    return { ...approved, status: 'sent', ...sent }
}

function maskLeadId(value) {
    const text = String(value || '')
    return text.length <= 4 ? '••••' : `${text.slice(0, 2)}••••${text.slice(-2)}`
}

export async function listOpeningApprovals({ limit = 30 } = {}) {
    const snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(Math.max(1, Math.min(50, Number(limit) || 30))).get()
    return Promise.all(snap.docs.map(async doc => {
        const row = doc.data() || {}
        let previewUrl = null
        if (row.storagePath && ['ready', 'approved', 'sent'].includes(row.status)) {
            previewUrl = await generatedSignedUrl(row.storagePath).catch(() => null)
        }
        return {
            id: doc.id,
            status: String(row.status || 'pending_generation'),
            lead: maskLeadId(row.leadId),
            variantId: String(row.variantId || ''),
            variantRevision: Number(row.variantRevision || 0),
            templateId: String(row.templateId || ''),
            previewUrl,
        }
    }))
}

const openingApprovals = {
    openingApprovalId,
    createOpeningApprovalRecord,
    generateOpeningApproval,
    decideOpeningApproval,
    sendApprovedOpeningDesign,
    listOpeningApprovals,
}

export default openingApprovals
