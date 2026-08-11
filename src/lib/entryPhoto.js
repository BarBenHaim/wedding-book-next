// src/lib/entryPhoto.js
//
// Swapping the photo on one page of the book.
//
// A guest uploads a photo with their blessing and that is almost always
// the right picture. Almost. Sometimes it is blurry, sometimes it is a
// screenshot, sometimes grandma sent the one where her eyes are closed
// and the family would rather the other one. Until now the only fix was
// to edit the guest's own entry and destroy what they sent.
//
// So the replacement is an OVERRIDE, not an edit. `imageUrlOverride`
// sits beside `imageUrl` and wins at read time; the original is never
// touched and "restore" is one field away. That matters more than it
// sounds: this is somebody else's contribution to a keepsake, and a
// product that quietly overwrites it has made a decision it has no
// right to make.
//
// ── Why the resolution lives at the read, not the render ────────────
//
// Every surface — the flipbook, the digital edition, the three PDF
// paths, the Picabook export, the blessings admin, expandBookPages
// deciding whether a page even HAS a photo — loads entries through
// getEntries(). Resolving there means the override is simply the truth
// everywhere downstream, and nothing else has to know the feature
// exists. Resolving in BookPageTemplate instead would have covered the
// renders and missed pagination, which reads imageUrl to decide whether
// a long blessing splits into two pages.

/**
 * The entry as the book should see it.
 *
 * Returns the SAME object when there is no override, so the common path
 * costs nothing and referential equality upstream is preserved.
 *
 * `originalImageUrl` is carried along deliberately: the editor needs it
 * to offer "restore", and its presence is also the flag that says this
 * page has been overridden at all.
 */
export function resolveEntryPhoto(entry) {
    if (!entry) return entry
    const override = typeof entry.imageUrlOverride === 'string' ? entry.imageUrlOverride.trim() : ''
    if (!override) return entry

    const aspect = Number(entry.imgAspectOverride)
    return {
        ...entry,
        imageUrl: override,
        // A replacement has its own shape. Passing null rather than the
        // old number makes FramedPhoto measure the real image, which is
        // what "do not crop" needs to letterbox correctly — inheriting
        // the previous photo's aspect would letterbox to the wrong box.
        imgAspect: Number.isFinite(aspect) && aspect > 0 ? aspect : null,
        originalImageUrl: entry.imageUrl || null,
    }
}

/** Has this page's photo been swapped? */
export function hasPhotoOverride(entry) {
    return typeof entry?.imageUrlOverride === 'string' && entry.imageUrlOverride.trim().length > 0
}

export default { resolveEntryPhoto, hasPhotoOverride }
