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

// Display-time helper. The admin can opt an individual entry into "keep
// the line breaks the guest typed" via the per-entry preserveLineBreaks
// flag on the Firestore doc. Default is off — the text is collapsed into
// one logical line just like before. When ON, the raw text is returned
// as-stored; the page templates already set white-space: pre-line so
// embedded \n characters render as line breaks.
//
// Caveat for legacy entries: text submitted before the save-time
// normalizer was removed has already had its line breaks flattened on
// the way into Firestore. Flipping preserveLineBreaks on for those
// entries won't bring the breaks back — the admin has to re-type them
// in the edit panel.
export function getBlessingText(entry) {
    if (!entry) return ''
    if (entry.preserveLineBreaks) return entry.text || ''
    return normalizeBlessing(entry.text)
}

// "Smart paragraphs" formatter for the blessing-management editor.
//
// Turns a continuous blessing into a clean, readable block by putting each
// sentence on its own line: it first flattens any messy whitespace the guest
// typed, then inserts a line break AFTER every sentence-ending punctuation
// run (. ! ? …, plus an optional closing quote/bracket) that is followed by
// more text. Pairs with preserveLineBreaks=true so the breaks render in the
// book. The owner reviews/tweaks the result in the textarea before saving, so
// the occasional false break (e.g. an abbreviation like "Mr.") is easy to fix.
//
// No sentence punctuation → returns the flattened single line unchanged, so a
// one-sentence blessing simply stays on one line.
export function formatBlessingSmart(text) {
    if (!text || typeof text !== 'string') return text || ''
    let t = text.replace(/\s+/g, ' ').trim()
    if (!t) return ''
    t = t.replace(/([.!?…]+["'”’)\]]?)\s+(?=\S)/g, '$1\n')
    return t.trim()
}
