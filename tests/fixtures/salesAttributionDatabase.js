// In-memory Firestore boundary for synthetic route integration. Transactions
// stage atomic writes, enforce create preconditions and reject reads after writes.
// No sales, attribution, payment, or report behavior is implemented here.
export const syntheticFieldValue = {
    serverTimestamp: () => Date.now(),
    increment: value => ({ __operation: 'increment', value }),
    arrayUnion: (...items) => ({ __operation: 'arrayUnion', items }),
}

const clone = value => value === undefined ? undefined : structuredClone(value)
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const field = (value, path) => path.split('.').reduce((current, key) => current?.[key], value)

export function createSalesAttributionDatabase() {
    const docs = new Map(), writes = [], reads = []
    let queue = Promise.resolve()
    function resolve(value, previous, merge) {
        if (value?.__operation === 'increment') return (Number(previous) || 0) + value.value
        if (value?.__operation === 'arrayUnion') {
            const result = clone(Array.isArray(previous) ? previous : [])
            for (const item of value.items) if (!result.some(old => JSON.stringify(old) === JSON.stringify(item))) result.push(clone(item))
            return result
        }
        if (!plain(value)) return clone(value)
        // Firestore merge writes an explicit empty map as an empty map.
        if (!Object.keys(value).length) return {}
        const result = merge && plain(previous) ? clone(previous) : {}
        for (const [key, child] of Object.entries(value)) result[key] = resolve(child, previous?.[key], merge)
        return result
    }
    const snapshot = key => ({ id: key.split('/').at(-1), exists: docs.has(key), data: () => clone(docs.get(key)) })
    const put = (key, value, options) => {
        docs.set(key, resolve(value, docs.get(key), options?.merge === true))
        writes.push({ key, value: clone(docs.get(key)) })
    }
    const ref = key => ({
        key, id: key.split('/').at(-1),
        get: async () => { reads.push(key); return snapshot(key) },
        set: async (value, options) => put(key, value, options),
        update: async value => { if (!docs.has(key)) throw Error('Missing synthetic document'); put(key, value, { merge: true }) },
    })
    const query = (name, filters = [], sort = null, maximum = Infinity) => ({
        doc: id => ref(`${name}/${id}`),
        where: (key, op, value) => query(name, [...filters, [key, op, value]], sort, maximum),
        orderBy: (key, direction = 'asc') => query(name, filters, [key, direction], maximum),
        limit: maximum => query(name, filters, sort, maximum),
        get: async () => {
            reads.push(`${name}/*`)
            let matches = [...docs.keys()].filter(key => key.startsWith(`${name}/`) && !key.slice(name.length + 1).includes('/'))
                .filter(key => filters.every(([name, op, expected]) => {
                    const actual = field(docs.get(key), name)
                    if (op === '==') return actual === expected
                    if (op === 'in') return expected.includes(actual)
                    throw Error(`Unsupported synthetic query operator ${op}`)
                }))
            if (sort) matches.sort((a, b) => (field(docs.get(a), sort[0]) - field(docs.get(b), sort[0])) * (sort[1] === 'desc' ? -1 : 1))
            const result = matches.slice(0, maximum).map(snapshot)
            return { docs: result, empty: !result.length, size: result.length }
        },
    })
    const db = {
        collection: name => query(name),
        runTransaction: work => {
            const run = queue.then(async () => {
                const staged = []
                const result = await work({
                    get: async target => {
                        if (staged.length) throw Error('Read after synthetic transaction write')
                        return target.get()
                    },
                    set: (target, value, options) => staged.push({ target, value, options }),
                    create: (target, value) => staged.push({ target, value, create: true }),
                })
                const created = new Set()
                for (const write of staged) if (write.create) {
                    if (docs.has(write.target.key) || created.has(write.target.key)) throw Error('Synthetic create conflict')
                    created.add(write.target.key)
                }
                for (const { target, value, options } of staged) put(target.key, value, options)
                return result
            })
            queue = run.catch(() => {})
            return run
        },
        batch: () => {
            const staged = []
            return { set: (target, value, options) => staged.push({ target, value, options }),
                commit: async () => { for (const { target, value, options } of staged) put(target.key, value, options) } }
        },
    }
    return { db, docs, writes, reads,
        reset: () => { docs.clear(); writes.length = 0; reads.length = 0; queue = Promise.resolve() },
        rows: name => [...docs.entries()].filter(([key]) => key.startsWith(`${name}/`)).map(([key, value]) => ({ id: key.split('/').at(-1), ...clone(value) })),
    }
}
