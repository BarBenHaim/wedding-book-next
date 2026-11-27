'use client'

// The guest's entry on a real page of this event's book: the same renderer the
// printed book uses, in the owner's own interior design. Read-only. Kept apart
// so the book renderer loads after the page's controls, not before them.

import { useMemo } from 'react'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'

export default function BookSheet({ entry, bookDoc, locale = 'he', size }) {
    const style = useMemo(() => ({ ...defaultStyle, ...(resolveInteriorDesign(bookDoc) || {}), locale }), [bookDoc, locale])
    return <BookPageTemplate entry={entry} styleSettings={style} scaledWidth={size} scaledHeight={size} />
}
