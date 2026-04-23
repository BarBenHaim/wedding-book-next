// src/lib/normalizeText.js
//
// Guests occasionally hit Enter a bunch of times or accidentally leave a run
// of spaces in their blessing. That used to overflow the book page and force
// the admin to hand-edit each entry. This helper normalizes the common cases
// without touching intentional formatting:
//
//   - Unifies line endings (CRLF, CR → LF)
//   - Strips trailing spaces on each line
//   - Collapses 2+ consecutive spaces/tabs within a line into a single space
//   - Collapses 3+ consecutive newlines to at most one blank line
//     (single blank line between paragraphs is preserved)
//   - Trims leading/trailing whitespace on the whole string
//
// Non-destructive: a clean blessing comes out byte-identical.
export function normalizeBlessing(text) {
    if (!text || typeof text !== 'string') return text || ''
    return text
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}
