import { recommendModelAllocation, summarizeModelExperiment } from './modelExperiment'

/**
 * Aggregate live experiment truth without returning lead rows, identifiers,
 * transcripts, or provider payloads to an admin caller.
 */
export function summarizeLiveModelExperiment(leads = [], options = {}) {
    const summary = summarizeModelExperiment(leads, options)
    return {
        summary,
        recommendation: recommendModelAllocation(summary),
    }
}

const modelExperimentAnalytics = { summarizeLiveModelExperiment }
export default modelExperimentAnalytics
