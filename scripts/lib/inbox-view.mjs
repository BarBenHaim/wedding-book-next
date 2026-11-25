// Pure logic of scripts/inbox.mjs. The script cannot import from src/ (the
// package is CommonJS on Node 20), so the little it needs lives here.

const DAY_MS = 86_400_000

export function normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '')
    if (digits.startsWith('00')) digits = digits.slice(2)
    if (digits.startsWith('0')) digits = `972${digits.slice(1)}`
    if (digits.length === 9 && digits.startsWith('5')) digits = `972${digits}`
    return digits
}

export function bookLabel(id, wedding) {
    const couple = [wedding?.brideName, wedding?.groomName].filter(Boolean).join(' ו-')
    return wedding?.celebrantName || couple || wedding?.ownerName || id
}

// A customer can be known from the bot's own list while no book carries the
// phone; the book recorded there links their items when they are read.
export function withLeadBooks(items, leadWeddingIds) {
    return items.map(item => {
        const id = leadWeddingIds.get(item.phone)
        if ((item.weddingIds || []).length || !id) return item
        return { ...item, weddingId: id, weddingIds: [id] }
    })
}

export function groupOpenItems(items, weddings) {
    const open = items.filter(item => item.status === 'new')
        .sort((a, b) => (a.receivedAtMs || 0) - (b.receivedAtMs || 0))
    const groups = new Map()
    for (const item of open) {
        if (!groups.has(item.phone)) groups.set(item.phone, { phone: item.phone, customerName: item.customerName, books: [], items: [] })
        const group = groups.get(item.phone)
        for (const id of item.weddingIds || []) {
            if (!group.books.some(book => book.id === id)) group.books.push({ id, label: bookLabel(id, weddings.get(id)) })
        }
        group.items.push(item)
    }
    return [...groups.values()]
}

export function expiredItems(items, nowMs, days = 90) {
    return items.filter(item => item.status === 'handled'
        && Number(item.handledAtMs) > 0 && item.handledAtMs < nowMs - days * DAY_MS)
}

// Used for deletion, so it matches one whole number and nothing looser.
export function itemsForPhone(items, rawPhone) {
    const phone = normalizePhone(rawPhone)
    if (phone.length < 11) return []
    return items.filter(item => item.phone === phone)
}
