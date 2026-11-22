// Links to an event's own pages, built in one place so the first e-mail and
// the personal area point at the same address.

// The printable "ברכו את" sign (portal/PosterSheet.jsx). It opens without
// signing in: the event document is publicly readable and the portal shows
// the sign before anything asks for a login.
export function eventSignUrl(baseUrl, weddingId) {
    const base = String(baseUrl || '').replace(/\/+$/, '')
    return `${base}/wedding/${encodeURIComponent(String(weddingId))}/portal?view=poster`
}
