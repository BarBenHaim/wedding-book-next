// src/lib/normalizeText.js
//
// Guests sometimes hit Enter several times in a row or accidentally leave
// runs of spaces inside their blessing. The book page template assumes a
// single flowing paragraph — multi-line / multi-space input used to overflow
// the page and force the admin to hand-edit each entry.
//
// This normalizer is intentionally aggressive: every whitespace run
// (newlines, tabs, multiple spaces, non-breaking spaces, etc.) collapses to
// a single space, and the whole string is trimmed. The blessing always ends
// up as one logical line, so it can never bust out of the page template no
// matter what the guest types.
//
// Trade-off: paragraph breaks written by the guest (e.g. signature on its
// own line) are flattened. We accept that — preserving layout integrity is
// more important than preserving formatting intent for a 210-character
// guest blessing.
//
// Call sites:
//   - photo/page.js  → onSubmit (cleans before IndexedDB enqueue + Firestore)
//   - BookPageTemplate → at display time (safety net for legacy entries)
//   - wedding/[id]/admin/page.js → when the couple edits an entry
//
// The function is a no-op for null/undefined/empty/non-string input.
export function normalizeBlessing(text) {
    if (!text || typeof text !== 'string') return text || ''
    // \s in JS already matches: space, tab, CR, LF, FF, VT, and Unicode
    // whitespace including NBSP ( ) and the various exotic spaces.
    // One pass collapses everything down to a single space.
    return text.replace(/\s+/g, ' ').trim()
}
