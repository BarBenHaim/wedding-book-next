'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import Cropper from 'react-easy-crop'
import { enqueue, genId } from '../../../../lib/offlineQueue'
import { uploadQueuedEntry } from '../../../../lib/uploadEntry'
import { normalizeBlessing } from '../../../../lib/normalizeText'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'
import { logEvent } from '@/lib/logEvent'

// Outer wrapper — fetches locale, eventType, AND the recipient names
// from the wedding doc once, then wraps the form in
// NextIntlClientProvider so every string speaks the language the
// super-admin configured. The names are used to personalise the page
// title ("Leave a blessing for {name}" or "for {bride} & {groom}").
export default function TextPage() {
    const { weddingId } = useParams()
    const [locale, setLocale] = useState('he')
    const [eventType, setEventType] = useState('wedding')
    // Visual style variant within an event type. Wedding has 'classic'
    // (default ivory premium) and 'romantic' (botanical floral arch).
    // Empty string = use the type's default. We branch on this in
    // PhotoApp to swap background, palette, and copy.
    const [designVariant, setDesignVariant] = useState('')
    const [recipients, setRecipients] = useState({ bride: '', groom: '', celebrant: '' })
    // Per-event admin overrides for the form-field labels + placeholders.
    // Empty strings → fall back to the i18n default in PhotoApp.
    const [formCopy, setFormCopy] = useState({
        nameLabel: '',
        namePlaceholder: '',
        blessingLabel: '',
        blessingPlaceholder: '',
    })
    // Gate the first paint on the wedding doc fetch. Without this the
    // initial render uses the wedding/classic defaults and the user
    // sees a brief flash of the ivory premium look before the
    // poker/romantic theme swaps in.
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (snap.exists()) {
                    const data = snap.data()
                    setLocale(normalizeLocale(data.locale))
                    if (data.eventType) setEventType(data.eventType)
                    if (data.designVariant) setDesignVariant(data.designVariant)
                    // Prefer the Hebrew-script names for the headline
                    // ("השאירו ברכה ל..."). Fall back to the original
                    // names when the super-admin didn't fill the Hebrew
                    // version — that way old wedding docs (no Hebrew
                    // field) keep working unchanged.
                    setRecipients({
                        bride: (data.brideNameHe || data.brideName || '').trim(),
                        groom: (data.groomNameHe || data.groomName || '').trim(),
                        celebrant: (data.celebrantNameHe || data.celebrantName || '').trim(),
                    })
                    setFormCopy({
                        nameLabel: (data.customNameLabel || '').trim(),
                        namePlaceholder: (data.customNamePlaceholder || '').trim(),
                        blessingLabel: (data.customBlessingLabel || '').trim(),
                        blessingPlaceholder: (data.customBlessingPlaceholder || '').trim(),
                    })
                }
            } catch {
                /* keep Hebrew default */
            } finally {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId])

    if (!loaded) {
        // Neutral centered spinner — no theme yet, so we render on
        // a plain white page until the doc tells us which design to
        // use. Typical fetch is well under a second, so no fake delay.
        return (
            <div className='min-h-screen flex items-center justify-center bg-white'>
                <div
                    className='w-8 h-8 rounded-full animate-spin'
                    style={{
                        border: '2.5px solid #ead9b3',
                        borderTopColor: '#c9a44e',
                    }}
                />
            </div>
        )
    }

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <PhotoApp eventType={eventType} designVariant={designVariant} recipients={recipients} formCopy={formCopy} />
        </NextIntlClientProvider>
    )
}

// ── Step badge ──
// Tiny circular chip used in the stepper. For poker it's an SVG
// "casino chip" (radial fill + dashed cream rim + bold number). For
// every other event type it's a flat coloured circle in either the
// gold-gradient (active), tan (idle), or sage-green (done) state.
function ChipBadge({ number, active, done, isPoker }) {
    if (isPoker) {
        // Casino chip: red+gold for active, charcoal for idle, green for done.
        const ring = done ? '#7da76a' : active ? '#c43b3b' : '#3a4a40'
        const innerRing = done ? '#5e8a51' : active ? '#7d1414' : '#2a3630'
        const center = done ? '#3d6b32' : active ? '#a81f1f' : '#1a2620'
        const numColor = '#fde9b3'
        return (
            <svg viewBox='0 0 28 28' className='w-7 h-7 shrink-0'>
                <circle cx='14' cy='14' r='13' fill={ring} />
                <circle
                    cx='14'
                    cy='14'
                    r='13'
                    fill='none'
                    stroke='#fde9b3'
                    strokeWidth='0.6'
                    strokeDasharray='2.4 2'
                    opacity='0.7'
                />
                <circle cx='14' cy='14' r='9' fill={innerRing} />
                <circle cx='14' cy='14' r='6' fill={center} />
                {done ? (
                    <path
                        d='M9.5 14 L13 17 L19 11'
                        stroke={numColor}
                        strokeWidth='2'
                        fill='none'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    />
                ) : (
                    <text x='14' y='17.5' textAnchor='middle' fontSize='10.5' fontWeight='800' fill={numColor}>
                        {number}
                    </text>
                )}
            </svg>
        )
    }
    // Default flat-circle badge (wedding/birthday/bar/bat/travel).
    return (
        <span
            className='inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white'
            style={{
                background: done ? '#7da76a' : active ? 'linear-gradient(180deg,#c9a44e 0%,#a8843a 100%)' : '#d6cab2',
                boxShadow: active ? '0 2px 6px rgba(170,136,64,0.35)' : 'none',
            }}
        >
            {done ? '✓' : number}
        </span>
    )
}

function PhotoApp({ eventType, designVariant, recipients, formCopy }) {
    const t = useTranslations('photo')

    // Resolve every form string to either the per-event admin override
    // (if non-empty) or the i18n default. Poker uses its own copy keys
    // so the labels lean into the casino voice ("שם הנשבר", "שפכו את
    // שעל ליבכם", etc) instead of the generic blessing-form wording.
    // Romantic wedding uses softer, "from-the-heart" copy ("מי משאיר
    // לנו ברכה?", "כתבו לנו משהו מהלב"). The admin override (formCopy)
    // still wins over both.
    const isPoker = eventType === 'poker'
    const isRomantic = eventType === 'wedding' && designVariant === 'romantic'
    const variantLabel = isPoker ? 'Poker' : isRomantic ? 'Romantic' : ''
    const nameLabel = formCopy?.nameLabel || (variantLabel ? t(`nameLabel${variantLabel}`) : t('nameLabel'))
    const namePlaceholder =
        formCopy?.namePlaceholder || (variantLabel ? t(`namePlaceholder${variantLabel}`) : t('namePlaceholder'))
    const blessingLabel =
        formCopy?.blessingLabel || (variantLabel ? t(`blessingLabel${variantLabel}`) : t('blessingLabel'))
    const blessingPlaceholder =
        formCopy?.blessingPlaceholder ||
        (variantLabel ? t(`blessingPlaceholder${variantLabel}`) : t('blessingPlaceholder'))
    const continueToPhotoLabel = variantLabel ? t(`continueToPhoto${variantLabel}`) : t('continueToPhoto')

    // ── Theme palette ──
    // Three variants:
    //   • Poker → dark felt-green page (real photo bg) + house-red button
    //   • Romantic wedding → botanical floral arch photo bg + cream form
    //     card + dusty-pink accents + forest-green button
    //   • Default (wedding/birthday/bar/bat/travel) → champagne-ivory
    //     premium look
    const theme = isPoker
        ? {
              // Real poker-felt photograph — chips + cards already baked
              // into the corners of the asset, plus a subtle club/spade
              // pattern in the felt itself. We don't need any of the SVG
              // decorations we used to layer on top.
              pageBg: '#0a2818',
              pageBgImage: 'url(/backgrounds/pokerbg.png)',
              pageBgSize: 'cover',
              pageBgPosition: 'center',
              pageBgRepeat: 'no-repeat',
              orbA: 'transparent',
              orbB: 'transparent',
              // Title hero
              titleColor: '#fde9b3',
              subtitleColor: '#94b09b',
              accentColor: '#d4af37',
              // Form card — DARK
              cardBg: 'linear-gradient(180deg, #1c2820 0%, #131d17 100%)',
              cardBorder: '1px solid rgba(212,175,55,0.28)',
              cardShadow:
                  '0 28px 60px -28px rgba(0,0,0,0.65), 0 4px 12px -4px rgba(0,0,0,0.40), inset 0 1px 0 rgba(212,175,55,0.18)',
              // Labels + body text INSIDE the dark card (must be light)
              cardLabelColor: '#e8d9a8',
              cardCounterColor: '#94a892',
              // Inputs nest INSIDE the dark card — even darker so they
              // read as recessed surfaces, gold border on focus.
              inputBg: '#0d1812',
              inputBorder: 'rgba(212,175,55,0.30)',
              inputFocusBorder: '#d4af37',
              inputTextColor: '#fde9b3',
              inputPlaceholderColor: '#5e7466',
              // Spade divider on dark — slightly brighter so it pops
              dividerLine: 'rgba(212,175,55,0.20)',
              // Continue button — house red, not gold. Sparkle + chevron
              // stay white. Deep dark-red shadow gives the "tap me" feel.
              buttonGradient: 'linear-gradient(180deg, #c43b3b 0%, #7d1414 100%)',
              buttonShadow:
                  '0 18px 38px -10px rgba(124,18,18,0.55), 0 4px 10px -4px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
              trustText: 'rgba(232,217,168,0.55)',
              showCrown: true,
              showRings: false,
          }
        : isRomantic
          ? {
                // Botanical floral arch photograph (white roses,
                // eucalyptus, dusty pink florals, hanging lights). The
                // arch frames the form card, so we keep the page bg as
                // the photo and let the cream card sit centred over the
                // greenery in the lower third.
                pageBg: '#1f3527',
                pageBgImage: 'url(/backgrounds/weddingdesign1.png)',
                pageBgSize: 'cover',
                pageBgPosition: 'center top',
                pageBgRepeat: 'no-repeat',
                orbA: 'transparent',
                orbB: 'transparent',
                // Title hero — cream on dark green to read against the
                // photo's darker upper third.
                titleColor: '#f5ead2',
                subtitleColor: '#e7d6b4',
                accentColor: '#d8a4a4',
                // Form card — user-supplied formbg.png as the card's
                // own background (cream paper styled to match the
                // romantic palette). center/cover keeps the asset
                // crisp at any card height, no-repeat avoids tiling.
                // The cream layer underneath is a fallback so the
                // card stays readable if the image fails to load.
                cardBg: 'url(/backgrounds/formbg.png) center/cover no-repeat, #fbf3e1',
                cardBorder: '1px solid rgba(255,255,255,0.35)',
                cardShadow: '0 28px 60px -28px rgba(31,53,39,0.55), 0 4px 12px -4px rgba(31,53,39,0.20)',
                cardLabelColor: '#2d4233',
                cardCounterColor: '#9a8870',
                inputBg: '#fffaf0',
                inputBorder: '#e8d3c5',
                inputFocusBorder: '#b07b7b',
                inputTextColor: '#2d4233',
                inputPlaceholderColor: '#c8b59e',
                dividerLine: '#e6c9c9',
                // Forest-green button to echo the eucalyptus in the bg.
                buttonGradient: 'linear-gradient(180deg, #4a6b54 0%, #2d4233 100%)',
                buttonShadow:
                    '0 18px 38px -10px rgba(45,66,51,0.55), 0 4px 10px -4px rgba(45,66,51,0.30), inset 0 1px 0 rgba(255,255,255,0.18)',
                trustText: 'rgba(245,234,210,0.85)',
                showCrown: false,
                showRings: true,
            }
          : {
                pageBg: '#f8f4ec',
                pageBgImage: [
                    'radial-gradient(ellipse 900px 480px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 520px 520px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                    'radial-gradient(ellipse 440px 440px at 8% 105%, rgba(186,156,108,0.05) 0%, rgba(186,156,108,0) 60%)',
                ].join(', '),
                pageBgSize: 'auto',
                pageBgPosition: 'center',
                pageBgRepeat: 'no-repeat',
                orbA: 'rgba(211,182,103,0.08)',
                orbB: 'rgba(170,136,64,0.06)',
                titleColor: '#1a1410',
                subtitleColor: '#9a8a72',
                accentColor: '#c9a44e',
                cardBg: '#ffffff',
                cardBorder: '1px solid rgba(212,184,103,0.22)',
                cardShadow: '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                cardLabelColor: '#1a1410',
                cardCounterColor: '#b9a684',
                inputBg: '#ffffff',
                inputBorder: '#ead9b3',
                inputFocusBorder: '#c9a44e',
                inputTextColor: '#1a1410',
                inputPlaceholderColor: '#c9b888',
                dividerLine: '#e1d4b4',
                buttonGradient: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                buttonShadow:
                    '0 14px 32px -10px rgba(170,136,64,0.55), 0 4px 10px -4px rgba(170,136,64,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                trustText: '#b9a684',
                showCrown: false,
                showRings: false,
            }

    // ── Page title (personalised) ───────────────────────────────────────
    // Build the "Leave a blessing for X" headline from the doc's names:
    //   wedding + both names    → "for {bride} & {groom}"
    //   wedding + one name      → "for {name}"   (whichever is filled)
    //   wedding + no names      → "for the couple"   (legacy default)
    //   bar/bat/birthday + name → "for {name}"
    //   bar/bat/birthday + ∅    → "Leave a blessing"   (no recipient)
    //
    // We compute it in a memoless helper since both inputs (eventType +
    // recipients) come from props that only change when the doc reload
    // bubbles up — re-running this on every render is cheap.
    function buildPageTitle() {
        const bride = recipients?.bride || ''
        const groom = recipients?.groom || ''
        const celebrant = recipients?.celebrant || ''
        if (eventType === 'wedding') {
            // Romantic variant uses a softer, single-line headline
            // ("רגע מהלב" / "A moment from the heart") regardless of
            // whether names are filled in — the names show up
            // separately on the guest landing, the photo page hero
            // here is intentionally about the FEELING, not the people.
            if (isRomantic) return t('pageTitleRomantic')
            if (bride && groom) return t('pageTitleWithCouple', { first: bride, second: groom })
            if (bride) return t('pageTitleWithName', { name: bride })
            if (groom) return t('pageTitleWithName', { name: groom })
            return t('pageTitleWedding')
        }
        // Poker — title is always just the venue name (e.g. "הממלכה")
        // with no "המשחק ב" prefix. If no venue was set in admin, fall
        // back to the brand default ("הממלכה" / "The Kingdom").
        if (eventType === 'poker') {
            return celebrant || t('pageTitlePoker')
        }
        // Travel — celebrantName slot holds the traveler's name.
        if (eventType === 'travel') {
            return celebrant ? t('pageTitleTravelWithName', { name: celebrant }) : t('pageTitleTravel')
        }
        // birthday / bar mitzvah / bat mitzvah and everything else.
        if (celebrant) return t('pageTitleWithName', { name: celebrant })
        return t('pageTitleGeneric')
    }
    const pageTitle = buildPageTitle()
    const [step, setStep] = useState(1) // 1: Text, 2: Photo
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [photoUrl, setPhotoUrl] = useState('')
    const [photoBlob, setPhotoBlob] = useState(null)

    // מצלמה
    const [stream, setStream] = useState(null)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraFacing, setCameraFacing] = useState('user')

    // חיתוך (Crop)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
    const [isUpload, setIsUpload] = useState(false)

    const [submitting, setSubmitting] = useState(false)
    const liveVideoRef = useRef(null)
    const router = useRouter()
    const { weddingId } = useParams()

    // Prefetch /thanks on mount so an offline router.push at submit time
    // doesn't fall through to Chrome's "no internet" error page —
    // Next.js stores the route's chunk + RSC payload in the local
    // cache while we still have network.
    useEffect(() => {
        if (!weddingId) return
        router.prefetch(`/wedding/${weddingId}/thanks`)
    }, [weddingId, router])

    // Funnel analytics — guest opened the blessing form. Pairs with the
    // 'scan' event logged on the guest landing page; together they let
    // the super-admin see "X scanned, Y started the form, Z submitted"
    // for any given wedding.
    useEffect(() => {
        logEvent(weddingId, 'start_blessing')
    }, [weddingId])

    // --- לוגיקת מצלמה ---
    useEffect(() => {
        if (cameraOpen) startCamera()
        return () => stopCamera()
    }, [cameraOpen, cameraFacing])

    async function startCamera() {
        stopCamera()
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: cameraFacing,
                    width: { ideal: 1920 },
                    height: { ideal: 1440 }, // יחס 4:3
                },
            })
            setStream(s)
            if (liveVideoRef.current) liveVideoRef.current.srcObject = s
        } catch (err) {
            console.error('Camera Error:', err)
            alert(t('cameraError'))
            setCameraOpen(false)
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
    }

    function takePhoto() {
        const video = liveVideoRef.current
        if (!video) return

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')

        // תיקון מראה למצלמה קדמית
        if (cameraFacing === 'user') {
            ctx.translate(canvas.width, 0)
            ctx.scale(-1, 1)
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
            blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob)
                    setPhotoBlob(blob)
                    setPhotoUrl(url)
                    setIsUpload(false)
                    setCameraOpen(false)
                }
            },
            'image/jpeg',
            0.95,
        )
    }

    // --- שליחה ---
    // The submit handler does NOT wait for Firebase. It produces a compressed
    // JPEG blob (applying the crop if needed), saves the full blessing to
    // IndexedDB, and hands control to the thanks page immediately. The thanks
    // page is the component that actually ships the entry to Firebase — with
    // retry + offline detection. Guests see "thanks!" in <1s regardless of
    // how spotty the venue's reception is.
    async function onSubmit(e) {
        e.preventDefault()
        if (!text.trim() || !photoUrl) return

        setSubmitting(true)

        // Step 1 — produce the final image blob (with crop if needed).
        // Failures here are LOCAL (canvas / decode), not network. We want
        // to fall back gracefully to "save without image" instead of
        // blocking the whole blessing.
        let finalBlob = photoBlob
        let imageProcessingError = null

        if (isUpload && photoUrl && croppedAreaPixels) {
            try {
                // Guard against degenerate crop boxes that the cropper can
                // briefly emit (zero width/height crashes canvas creation).
                if (
                    !croppedAreaPixels.width ||
                    !croppedAreaPixels.height ||
                    croppedAreaPixels.width < 1 ||
                    croppedAreaPixels.height < 1
                ) {
                    throw new Error('crop-invalid-size')
                }

                const image = await createImage(photoUrl)
                const canvas = document.createElement('canvas')
                canvas.width = croppedAreaPixels.width
                canvas.height = croppedAreaPixels.height
                const ctx = canvas.getContext('2d')
                if (!ctx) throw new Error('canvas-no-2d-context')

                ctx.drawImage(
                    image,
                    croppedAreaPixels.x,
                    croppedAreaPixels.y,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height,
                    0,
                    0,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height,
                )

                const cropped = await new Promise((resolve, reject) => {
                    canvas.toBlob(
                        blob => {
                            // Some browsers (low memory / large images) call
                            // back with null instead of throwing. Treat that
                            // as an error so we can fall back.
                            if (!blob) reject(new Error('toblob-null'))
                            else resolve(blob)
                        },
                        'image/jpeg',
                        0.95,
                    )
                })
                finalBlob = cropped
            } catch (err) {
                console.error('[photo] image processing failed:', err)
                imageProcessingError = err
                // Fall back to the un-cropped original blob if we have one.
                // Better to ship the full photo than nothing.
                if (photoBlob) {
                    finalBlob = photoBlob
                    imageProcessingError = null // recovered
                }
            }
        }

        // If image processing definitively failed AND we have no blob to
        // ship, ask the user whether to save without a photo.
        if (imageProcessingError && !finalBlob) {
            const proceed = window.confirm(t('imageProcessFail'))
            if (!proceed) {
                setSubmitting(false)
                return
            }
            finalBlob = null
        }

        // Step 2 — persist + upload. Two-tier strategy:
        //
        // Tier 1 (preferred): IDB enqueue → optimistic redirect → upload
        //   on the thanks page. Best UX: guest sees "thanks!" instantly,
        //   the upload happens with retry + survives bad reception.
        //
        // Tier 2 (fallback): direct upload to Firebase. Used when IDB
        //   throws — common on iOS Safari with strict cookie/storage
        //   settings, or in private mode. Slower (we wait for the upload)
        //   but it actually works.
        //
        // The old code only had tier 1, so guests with strict iOS Safari
        // settings could never submit. The fallback ensures everyone
        // can blesss successfully, even if they pay a few seconds for it.

        const entry = {
            id: genId(),
            weddingId,
            name: name || '',
            text: normalizeBlessing(text),
            image: finalBlob,
        }

        // Tier 1 — try IDB enqueue.
        let enqueued = false
        try {
            await enqueue(entry)
            enqueued = true
        } catch (err) {
            // Don't surface to user yet. Log for debugging and try direct
            // upload instead. IDB rejections often surface with a null
            // error object (Safari) — guard against that in logging.
            console.warn(
                '[photo] IDB enqueue failed, falling back to direct upload:',
                err?.message || err?.name || 'unknown IDB error',
                err,
            )
        }

        // ── Confirmed-send strategy ─────────────────────────────────────
        // We used to redirect to /thanks the moment IDB accepted the
        // entry, leaving the actual upload to fire-and-forget on that
        // page. That felt instant but masked real failures (Firebase
        // permission denied, malformed payload, etc) — by the time the
        // guest noticed, the tab was already on the thanks screen and
        // the entry was stuck.
        //
        // New flow: ALWAYS wait for the upload to complete (or hit a
        // 5-second budget). Common path takes 1–2s on a decent venue
        // network, which feels like a real "send" instead of a magic
        // skip. Network errors and timeouts are silently deferred to
        // the thanks page (IDB still has the entry, retries kick in).
        // The only thing that surfaces back to the form is a permanent
        // server-side rejection — those won't recover by retrying, so
        // the guest needs to see them immediately.
        const UPLOAD_BUDGET_MS = 5000

        async function uploadWithBudget() {
            return Promise.race([
                uploadQueuedEntry(entry),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('upload-budget-exceeded')), UPLOAD_BUDGET_MS),
                ),
            ])
        }

        if (enqueued) {
            // We're safe regardless — the entry is persisted locally.
            // Try to confirm the server received it. If we time out or
            // the network errors, redirect anyway and let the thanks
            // page's retry loop finish the job.
            try {
                await uploadWithBudget()
            } catch (err) {
                const rawMsg = err?.message || err?.name || ''
                if (/permission|PERMISSION_DENIED|unauthor/i.test(rawMsg)) {
                    // Permanent — show it now, don't pretend it worked.
                    alert(t('errPermission'))
                    setSubmitting(false)
                    return
                }
                // Network / timeout / unknown — keep going. Thanks page
                // will retry on `online` / `visibilitychange` / `pageshow`.
                console.warn('[photo] upload not confirmed in time, deferring to thanks page:', rawMsg)
            }
            router.push(`/wedding/${weddingId}/thanks`)
            return
        }

        // Tier 2 — IDB rejected our enqueue, so we have NO local safety
        // net. Wait fully for the direct upload (no budget timeout —
        // we'd rather make the guest wait an extra few seconds than
        // silently lose their blessing).
        try {
            await uploadQueuedEntry(entry)
            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error('[photo] direct upload also failed:', err)
            const rawMsg = err?.message || err?.name || ''
            let userMessage
            if (/Failed to fetch|NetworkError|network|ETIMEDOUT|ERR_INTERNET/i.test(rawMsg)) {
                userMessage = t('errNetwork')
            } else if (/permission|PERMISSION_DENIED|unauthor/i.test(rawMsg)) {
                userMessage = t('errPermission')
            } else if (rawMsg) {
                userMessage = t('errSpecific', { reason: rawMsg })
            } else {
                userMessage = t('errGeneric')
            }
            alert(userMessage)
            setSubmitting(false)
        }
    }

    function createImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.addEventListener('load', () => resolve(img))
            img.addEventListener('error', () => reject(new Error('image-load-failed')))
            // IMPORTANT: do NOT set crossOrigin for blob: URLs.
            // On iOS Safari, setting crossOrigin='anonymous' on a blob URL
            // makes the load fail silently (Safari treats it as a CORS request
            // and rejects). Only blob URLs are passed here (from camera capture
            // or `<input type=file>`), and they're always same-origin, so we
            // don't need CORS at all.
            img.src = url
        })
    }

    const isTextDone = text.trim().length > 0
    const isPhotoDone = !!photoUrl

    // Poker reverses the user's path: snap the table first, then write
    // the roast. Everything else keeps the original blessing → photo
    // order. `textStep` / `photoStep` are the ordinal step number
    // (1 = first, 2 = last) each panel sits on for the active variant.
    const textStep = isPoker ? 2 : 1
    const photoStep = isPoker ? 1 : 2
    const firstStepDone = isPoker ? isPhotoDone : isTextDone
    const lastStepDone = isPoker ? isTextDone : isPhotoDone
    // Chip labels — non-poker reads the keys straight, poker swaps so
    // chip 1 says "Photo" (תמונה) and chip 2 says "Blessing" (ברכה).
    const firstChipLabel = t(isPoker ? 'step2Label' : 'step1Label')
    const secondChipLabel = t(isPoker ? 'step1Label' : 'step2Label')
    // Continue label for the photo→text transition (poker only).
    // Falls back gracefully if a translator hasn't added the key yet.
    const continueToTextLabel = isPoker ? t('continueToTextPoker') : ''

    // The previous PokerCornerDecor (SVG chips + cards) was retired —
    // the new pokerbg.png asset already bakes those decorations into
    // the felt at higher fidelity than we could draw inline.

    // Poker only — hide the global Header + Footer so the felt page
    // takes the FULL viewport height. The Header/Footer live in the
    // ROOT layout, which we can't touch from a per-page component
    // without prop drilling, so we toggle their visibility via DOM
    // manipulation in an effect. Cleanup restores the original
    // display value when the user navigates away (or the variant
    // changes).
    useEffect(() => {
        if (!isPoker || typeof document === 'undefined') return
        const header = document.querySelector('body > header')
        const footer = document.querySelector('body > footer')
        const prevHeader = header?.style.display
        const prevFooter = footer?.style.display
        if (header) header.style.display = 'none'
        if (footer) footer.style.display = 'none'
        return () => {
            if (header) header.style.display = prevHeader || ''
            if (footer) footer.style.display = prevFooter || ''
        }
    }, [isPoker])

    return (
        <div
            className={`flex items-start justify-center px-4 py-8 font-sans relative overflow-hidden ${
                isPoker ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'
            }`}
            style={{
                // Premium ivory wash — base is a near-white warm neutral
                // (#f8f4ec, "fine paper"). Two very low-opacity radial
                // glows give the surface depth without any saturated
                // yellow: a cool white halo at the top opens the space,
                // a barely-there gold pool in the bottom-right corner
                // hints at the brand colour without dominating.
                backgroundColor: theme.pageBg,
                backgroundImage: theme.pageBgImage,
                backgroundSize: theme.pageBgSize,
                backgroundPosition: theme.pageBgPosition,
                backgroundRepeat: theme.pageBgRepeat,
                backgroundAttachment: 'fixed',
            }}
        >
            {/* Layout container — narrower max-width matches the mockup's
                phone-first composition. Each section sits directly on the
                champagne wash. */}
            <div className='relative z-10 w-full max-w-[26rem] animate-scaleIn'>
                {/* Stepper — slim pill bar. Wedding/etc: white pill with
                    gold number badges. Poker: dark pill with red+gold
                    chip-style badges. Romantic: dark wood-tone brown pill
                    with cream-on-brown text + gold active badge — picks
                    up the warmth of the floral arch background. */}
                <div
                    className='rounded-full mb-7 mx-auto flex items-center justify-center'
                    style={{
                        maxWidth: '20rem',
                        padding: '4px',
                        background: isPoker
                            ? 'linear-gradient(180deg, #1c2820, #131d17)'
                            : isRomantic
                              ? 'linear-gradient(180deg, #4a3528 0%, #2d2018 100%)'
                              : '#ffffff',
                        boxShadow: isPoker
                            ? '0 8px 22px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(212,175,55,0.18)'
                            : isRomantic
                              ? '0 10px 28px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(245,234,210,0.16)'
                              : '0 6px 20px -6px rgba(170,136,64,0.18), 0 1px 3px rgba(170,136,64,0.10)',
                        border: isPoker
                            ? '1px solid rgba(212,175,55,0.30)'
                            : isRomantic
                              ? '1px solid rgba(245,234,210,0.30)'
                              : '1px solid rgba(212,184,103,0.35)',
                    }}
                >
                    {/* Step 1 button. The number badge swaps between
                        the standard gold gradient and a poker-chip look
                        (radial red/gold fill + dashed cream rim). */}
                    <button
                        onClick={() => setStep(1)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full transition-colors duration-200 ${
                            step === 1
                                ? isPoker || isRomantic
                                    ? 'text-[#fde9b3]'
                                    : 'text-[#3d2e1a]'
                                : isPoker
                                  ? 'text-[#7a8c80]'
                                  : isRomantic
                                    ? 'text-[#c9b598]'
                                    : 'text-[#a89378]'
                        }`}
                    >
                        <ChipBadge number={1} active={step === 1} done={firstStepDone} isPoker={isPoker} />
                        <span className='font-bold text-[13px] tracking-wide'>{firstChipLabel}</span>
                    </button>

                    {/* Connecting line — hairline tan that turns gold once
                        the first step is complete. */}
                    <div
                        className='h-px w-8 mx-1 transition-colors duration-300'
                        style={{
                            background: firstStepDone
                                ? '#c9a44e'
                                : isPoker
                                  ? 'rgba(212,175,55,0.30)'
                                  : isRomantic
                                    ? 'rgba(245,234,210,0.30)'
                                    : '#e1d4b4',
                        }}
                    />

                    {/* Step 2 */}
                    <button
                        onClick={() => firstStepDone && setStep(2)}
                        disabled={!firstStepDone}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full transition-colors duration-200 ${
                            step === 2
                                ? isPoker || isRomantic
                                    ? 'text-[#fde9b3]'
                                    : 'text-[#3d2e1a]'
                                : isPoker
                                  ? 'text-[#7a8c80]'
                                  : isRomantic
                                    ? 'text-[#c9b598]'
                                    : 'text-[#a89378]'
                        } ${!firstStepDone ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        <ChipBadge number={2} active={step === 2} done={lastStepDone} isPoker={isPoker} />
                        <span className='font-bold text-[13px] tracking-wide'>{secondChipLabel}</span>
                    </button>
                </div>

                {/* --- תוכן שלב הטקסט --- */}
                {/* Redesigned to match the cleaner mockup: a heart-and-title
                    block above the form, the form itself in a soft white
                    card divided by a heart separator, then a full-width
                    gold gradient continue button, and a tiny lock-icon
                    trust line at the bottom. The state hooks and validation
                    below are unchanged — only the JSX shell was redrawn.
                    For non-poker variants this panel is step 1; for poker
                    it's step 2 (the user took the photo first). */}
                {step === textStep && (
                    <div className='animate-fadeIn'>
                        {/* ── Title block ──
                            Generous breathing room above and below; the
                            small gold heart anchors the title without
                            competing with it. */}
                        <div className='text-center mb-7 relative'>
                            {/* Romantic — irregular dark shadow blob
                                behind the title + subtitle. Built from
                                four overlapping blurred radial
                                gradients so the silhouette is NOT a
                                rectangle: each ellipse softens at a
                                different point, the union reads like a
                                cloud of dark mist sitting on the
                                photo. Sits BEHIND the text (z-0) while
                                the title / subtitle ride on top (the
                                rest of this div's children are inline
                                in the document flow and stack
                                naturally above an absolutely-positioned
                                sibling). pointer-events:none keeps it
                                out of any tap target. */}
                            {isRomantic && (
                                <div
                                    aria-hidden='true'
                                    className='absolute pointer-events-none'
                                    style={{
                                        top: '-30px',
                                        bottom: '-30px',
                                        left: '-30px',
                                        right: '-30px',
                                        background: [
                                            'radial-gradient(ellipse 65% 55% at 32% 38%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%)',
                                            'radial-gradient(ellipse 70% 45% at 68% 60%, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0) 70%)',
                                            'radial-gradient(ellipse 55% 50% at 50% 25%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)',
                                            'radial-gradient(ellipse 50% 60% at 55% 78%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0) 65%)',
                                            'radial-gradient(ellipse 40% 35% at 18% 62%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)',
                                        ].join(', '),
                                        filter: 'blur(10px)',
                                        zIndex: 0,
                                    }}
                                />
                            )}
                            {/* Variant-specific ornament above the title:
                                  • Poker → crown
                                  • Romantic wedding → intertwined rings
                                    inside an oval medallion (rendered
                                    BELOW the title further down)
                                  • Default → just the heart row below. */}
                            {theme.showCrown && (
                                <svg
                                    viewBox='0 0 64 28'
                                    className='w-[58px] h-[26px] mx-auto mb-1.5'
                                    fill={theme.accentColor}
                                >
                                    {/* Stylised crown — 5 points, gem in
                                        the center, base band. */}
                                    <path d='M4 22 L8 9 L16 17 L24 6 L32 14 L40 6 L48 17 L56 9 L60 22 Z' />
                                    <rect x='4' y='23' width='56' height='3.5' rx='0.5' />
                                    <circle cx='32' cy='12' r='1.7' fill='#7d1414' />
                                </svg>
                            )}
                            {/* Heart/spade icon row. Hidden for the
                                romantic variant — the rings medallion
                                below the subtitle is the only ornament
                                we want. */}
                            {!isRomantic && (
                                <div
                                    className={`flex items-center justify-center gap-2.5 ${theme.showCrown ? 'mb-2.5' : 'mb-3.5'}`}
                                >
                                    {/* Left flourish — only on poker */}
                                    {theme.showCrown && (
                                        <span
                                            className='block h-px w-12'
                                            style={{
                                                background:
                                                    'linear-gradient(to left, transparent, rgba(212,175,55,0.50), transparent)',
                                            }}
                                        />
                                    )}
                                    <svg
                                        viewBox='0 0 24 24'
                                        className={isPoker ? 'w-[24px] h-[24px]' : 'w-[20px] h-[20px] mx-auto'}
                                        fill={theme.accentColor}
                                    >
                                        {isPoker ? (
                                            <path d='M12 2 C 14.5 5.5, 19 8, 19 13 C 19 16, 16.5 18, 14 17.4 L 14.8 21 L 9.2 21 L 10 17.4 C 7.5 18, 5 16, 5 13 C 5 8, 9.5 5.5, 12 2 Z' />
                                        ) : (
                                            <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                                        )}
                                    </svg>
                                    {theme.showCrown && (
                                        <span
                                            className='block h-px w-12'
                                            style={{
                                                background:
                                                    'linear-gradient(to right, transparent, rgba(212,175,55,0.50), transparent)',
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                            <h2
                                className='font-bold mb-2 leading-[1.15] relative'
                                style={
                                    isPoker
                                        ? {
                                              // Metallic gold sheen via
                                              // background-clip:text. The
                                              // 3-stop gradient gives the
                                              // letters a subtle highlight
                                              // band, like polished brass.
                                              fontSize: '36px',
                                              letterSpacing: '-0.02em',
                                              backgroundImage:
                                                  'linear-gradient(180deg, #fde9b3 0%, #d4af37 50%, #a8843a 100%)',
                                              WebkitBackgroundClip: 'text',
                                              backgroundClip: 'text',
                                              WebkitTextFillColor: 'transparent',
                                              color: 'transparent',
                                              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 16px rgba(212,175,55,0.25))',
                                          }
                                        : isRomantic
                                          ? {
                                                // Romantic — Assistant
                                                // (the app's default font)
                                                // in cream on the dark
                                                // green photo bg. The
                                                // irregular shadow blob
                                                // behind the whole title
                                                // block does the
                                                // legibility heavy
                                                // lifting; we only need a
                                                // tiny text-shadow to
                                                // crisp the edges.
                                                // zIndex:1 + position:
                                                // relative ensures the
                                                // text paints above the
                                                // dark blob sibling.
                                                color: theme.titleColor,
                                                fontSize: '38px',
                                                letterSpacing: '0.005em',
                                                textShadow: '0 1px 6px rgba(0,0,0,0.45)',
                                                zIndex: 1,
                                            }
                                          : {
                                                color: theme.titleColor,
                                                fontSize: '26px',
                                                letterSpacing: '-0.01em',
                                            }
                                }
                            >
                                {pageTitle}
                            </h2>
                            <p
                                className='leading-relaxed relative'
                                style={{
                                    color: theme.subtitleColor,
                                    fontSize: isRomantic ? '14.5px' : '13.5px',
                                    letterSpacing: isRomantic ? '0.01em' : 'normal',
                                    textShadow: isRomantic ? '0 1px 5px rgba(0,0,0,0.4)' : 'none',
                                    // Match the title — keep the
                                    // subtitle on top of the dark blob.
                                    zIndex: isRomantic ? 1 : 'auto',
                                }}
                            >
                                {isRomantic ? t('pageSubtitleRomantic') : t('pageSubtitle')}
                            </p>
                        </div>

                        {/* ── Form card ──
                            Pure white, soft warm shadow, very subtle gold
                            border. Two sections divided by an inline-heart
                            ornament. Section labels are dark/bold and the
                            small gold icon hugs the trailing edge. The
                            romantic variant attaches a small rings
                            medallion to the top edge — the medallion
                            overflows upward and reads as part of the
                            form's frame, not a free-floating ornament. */}
                        <div
                            className='rounded-[22px] px-5 pt-5 pb-5 relative'
                            style={{
                                background: theme.cardBg,
                                backgroundSize: isRomantic ? '100% 100%' : undefined,
                                boxShadow: theme.cardShadow,
                                border: theme.cardBorder,
                                overflow: isRomantic ? 'visible' : 'hidden',
                                // Lock the romantic card to the same
                                // 130×190 (w×h) aspect ratio as the
                                // formbg.png asset so the image fills
                                // the card exactly without cropping
                                // OR distortion (`background-size:100%
                                // 100%` paired with the matching ratio
                                // means every pixel of the asset is
                                // visible). The contents (label +
                                // input + divider + textarea +
                                // counter) are sized to fit comfortably
                                // inside this aspect — if a future
                                // change makes them taller we can
                                // either trim or relax this lock.
                                ...(isRomantic ? { aspectRatio: '130 / 190' } : {}),
                            }}
                        >
                            {/* Name section */}
                            <div className='relative z-10'>
                                <div className='flex items-center justify-between mb-2.5'>
                                    <span
                                        style={{
                                            color: theme.cardLabelColor,
                                            fontSize: isRomantic ? '15px' : '14px',
                                            fontWeight: 700,
                                            letterSpacing: isRomantic ? '0.01em' : 'normal',
                                        }}
                                    >
                                        {nameLabel}
                                    </span>
                                    {/* Outlined people icon —
                                        same SVG used in the default
                                        wedding/etc variants. Romantic
                                        strokes it in the dark forest
                                        green of the card label so it
                                        reads as part of the heading. */}
                                    <svg
                                        viewBox='0 0 24 24'
                                        className='w-[20px] h-[20px] shrink-0'
                                        fill='none'
                                        stroke={isRomantic ? theme.cardLabelColor : theme.accentColor}
                                        strokeWidth={1.8}
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            d='M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z'
                                        />
                                    </svg>
                                </div>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={namePlaceholder}
                                    className='w-full rounded-xl outline-none transition'
                                    style={{
                                        background: theme.inputBg,
                                        border: `1px solid ${theme.inputBorder}`,
                                        padding: '12px 16px',
                                        color: theme.inputTextColor,
                                        // 16px+ on inputs is the iOS Safari rule —
                                        // anything smaller triggers the auto-zoom
                                        // that warps the page when a guest taps in.
                                        fontSize: '16px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = theme.inputFocusBorder)}
                                    onBlur={e => (e.currentTarget.style.borderColor = theme.inputBorder)}
                                />
                            </div>

                            {/* Divider — heart for warm themes, spade for
                                poker. Lines on each side use theme.dividerLine
                                so they read on both light and dark cards. */}
                            <div className='flex items-center justify-center gap-2.5 my-5'>
                                <span
                                    className='block h-px flex-1'
                                    style={{
                                        background: `linear-gradient(to left, transparent, ${theme.dividerLine}, transparent)`,
                                    }}
                                />
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[12px] h-[12px] shrink-0'
                                    fill={theme.accentColor}
                                >
                                    {isPoker ? (
                                        <path d='M12 2 C 14.5 5.5, 19 8, 19 13 C 19 16, 16.5 18, 14 17.4 L 14.8 21 L 9.2 21 L 10 17.4 C 7.5 18, 5 16, 5 13 C 5 8, 9.5 5.5, 12 2 Z' />
                                    ) : (
                                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                                    )}
                                </svg>
                                <span
                                    className='block h-px flex-1'
                                    style={{
                                        background: `linear-gradient(to right, transparent, ${theme.dividerLine}, transparent)`,
                                    }}
                                />
                            </div>

                            {/* Blessing section */}
                            <div className='relative z-10'>
                                <div className='flex items-center justify-between mb-2.5'>
                                    <span
                                        style={{
                                            color: theme.cardLabelColor,
                                            fontSize: isRomantic ? '15px' : '14px',
                                            fontWeight: 700,
                                            letterSpacing: isRomantic ? '0.01em' : 'normal',
                                        }}
                                    >
                                        {blessingLabel}
                                    </span>
                                    {/* Outlined pencil icon — same
                                        SVG used in the default
                                        wedding/etc variants. Romantic
                                        strokes it in the dark forest
                                        green of the card label. */}
                                    <svg
                                        viewBox='0 0 24 24'
                                        className='w-[20px] h-[20px] shrink-0'
                                        fill='none'
                                        stroke={isRomantic ? theme.cardLabelColor : theme.accentColor}
                                        strokeWidth={1.8}
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            d='M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13L2.25 21.75l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Zm0 0L19.5 7.125'
                                        />
                                    </svg>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    placeholder={blessingPlaceholder}
                                    className='w-full rounded-xl outline-none transition resize-none leading-relaxed'
                                    style={{
                                        background: theme.inputBg,
                                        border: `1px solid ${theme.inputBorder}`,
                                        padding: '12px 16px',
                                        color: theme.inputTextColor,
                                        // Same 16px rule as the name input — see
                                        // comment above. iOS Safari otherwise
                                        // zooms in on focus and breaks the layout.
                                        fontSize: '16px',
                                        height: '128px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = theme.inputFocusBorder)}
                                    onBlur={e => (e.currentTarget.style.borderColor = theme.inputBorder)}
                                    maxLength={210}
                                />
                                <div
                                    className='text-end mt-1.5'
                                    style={{ color: theme.cardCounterColor, fontSize: '11px' }}
                                >
                                    {t('charCount', { used: text.length, max: 210 })}
                                </div>
                            </div>

                            {/* Floral ornament — romantic only.
                                User-provided flowers.png pinned to
                                the exact bottom-right corner of the
                                form card. pointer-events:none keeps
                                the textarea + counter taps
                                unobstructed. */}
                            {isRomantic && (
                                <img
                                    src='/backgrounds/flowers.png'
                                    alt=''
                                    aria-hidden='true'
                                    className='absolute pointer-events-none'
                                    style={{
                                        width: '120px',
                                        height: 'auto',
                                        right: '0',
                                        bottom: '0',
                                        objectFit: 'contain',
                                    }}
                                />
                            )}
                        </div>

                        {/* ── Continue button ──
                            Only when this panel is the FIRST step
                            (non-poker variants — text → photo). Solid
                            antique-gold gradient, deep warm shadow.
                            Sparkle leads the row, chevron follows the
                            label and rotates per direction so it always
                            points "forward" in the user's reading flow. */}
                        {step === 1 && (
                            <button
                                onClick={() => setStep(2)}
                                disabled={!text.trim()}
                                className='w-full mt-7 rounded-2xl text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.99]'
                                style={{
                                    background: theme.buttonGradient,
                                    boxShadow: theme.buttonShadow,
                                    padding: '15px 18px',
                                    fontSize: isRomantic ? '16px' : '15.5px',
                                    letterSpacing: '0.01em',
                                }}
                            >
                                {/* Leading icon — sparkle on default/poker,
                                    small heart on romantic so the floral
                                    page doesn't carry a stray gold star. */}
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[15px] h-[15px] opacity-95 shrink-0'
                                    fill='currentColor'
                                >
                                    {isRomantic ? (
                                        <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                                    ) : (
                                        <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                                    )}
                                </svg>
                                <span>{continueToPhotoLabel}</span>
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[15px] h-[15px] rtl:rotate-180 shrink-0'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth={2.6}
                                >
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                                </svg>
                            </button>
                        )}

                        {/* ── Submit + back row ──
                            Only when this panel is the LAST step
                            (poker — photo first, blessing last). The
                            submit handler is the same `onSubmit` the
                            photo step uses; by the time the user
                            reaches the poker text step, photoUrl is
                            already set, so the only extra gate is the
                            blessing text itself. */}
                        {step === 2 && (
                            <button
                                onClick={onSubmit}
                                disabled={submitting || !text.trim()}
                                className='w-full mt-7 rounded-2xl text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-[0.99]'
                                style={{
                                    background: theme.buttonGradient,
                                    boxShadow: theme.buttonShadow,
                                    padding: '15px 18px',
                                    fontSize: '15.5px',
                                    letterSpacing: '0.01em',
                                }}
                            >
                                {submitting ? (
                                    <>
                                        <svg className='w-4 h-4 animate-spin' fill='none' viewBox='0 0 24 24'>
                                            <circle
                                                className='opacity-25'
                                                cx='12'
                                                cy='12'
                                                r='10'
                                                stroke='currentColor'
                                                strokeWidth='3'
                                            />
                                            <path
                                                className='opacity-75'
                                                fill='currentColor'
                                                d='M4 12a8 8 0 018-8v8z'
                                            />
                                        </svg>
                                        <span>{t('submitting')}</span>
                                    </>
                                ) : (
                                    <>
                                        <svg
                                            viewBox='0 0 24 24'
                                            className='w-[15px] h-[15px] opacity-95'
                                            fill='currentColor'
                                        >
                                            <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                                        </svg>
                                        <span>{t('submit')}</span>
                                    </>
                                )}
                            </button>
                        )}
                        {step === 2 && (
                            <button
                                onClick={() => setStep(1)}
                                className='w-full mt-3 text-[13px] flex items-center justify-center gap-1.5 transition-colors'
                                style={{ color: theme.subtitleColor }}
                            >
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[14px] h-[14px] rtl:rotate-180'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth={2}
                                >
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                                </svg>
                                <span>{t('backToEdit')}</span>
                            </button>
                        )}

                        {/* ── Trust line ──
                            Default/poker carries a small lock to signal
                            "private + quick". The romantic variant
                            swaps the lock for a tiny heart and a serif
                            voice so the bottom of the page doesn't end
                            on a security icon that fights the floral
                            mood. */}
                        <div
                            className='flex items-center justify-center gap-1.5 mt-4'
                            style={{
                                color: theme.trustText,
                                fontSize: isRomantic ? '12px' : '11px',
                                textShadow: isRomantic ? '0 1px 5px rgba(0,0,0,0.4)' : 'none',
                            }}
                        >
                            <svg
                                viewBox='0 0 24 24'
                                className='w-[12px] h-[12px]'
                                fill={isRomantic ? 'currentColor' : 'none'}
                                stroke={isRomantic ? 'none' : 'currentColor'}
                                strokeWidth={1.7}
                            >
                                {isRomantic ? (
                                    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                                ) : (
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        d='M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z'
                                    />
                                )}
                            </svg>
                            <span>{t('securityNote')}</span>
                        </div>
                    </div>
                )}

                {/* --- תוכן שלב התמונה --- */}
                {/* Visually mirrors the text step: title block above +
                    premium white card. The interactive guts (camera,
                    cropper, file upload) are intentionally untouched
                    — only the surrounding chrome was restyled. For
                    non-poker variants this panel is step 2; for poker
                    it's step 1 (snap the table first). */}
                {step === photoStep && (
                    <div className='animate-fadeIn'>
                        {/* ── Title block — same composition as step 1 ── */}
                        <div className='text-center mb-7'>
                            <svg viewBox='0 0 24 24' className='w-[18px] h-[18px] mx-auto mb-3.5' fill='#c9a44e'>
                                <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                            </svg>
                            <h2
                                className='font-bold mb-2 leading-[1.15]'
                                style={{ color: '#1a1410', fontSize: '26px', letterSpacing: '-0.01em' }}
                            >
                                {t('pageTitleStep2')}
                            </h2>
                            <p className='leading-relaxed' style={{ color: '#9a8a72', fontSize: '13.5px' }}>
                                {t('pageSubtitleStep2')}
                            </p>
                        </div>

                        {/* ── Photo card ── */}
                        <div
                            className='rounded-[22px] p-5'
                            style={{
                                background: theme.cardBg,
                                boxShadow: theme.cardShadow,
                                border: theme.cardBorder,
                            }}
                        >
                            {/* קונטיינר תמונה (יחס 4:3) — recessed input
                                surface that picks up the same palette
                                as the text inputs in step 1, so the
                                photo well matches the rest of the form.
                                Poker → dark recessed felt; everything
                                else → cream paper. */}
                            <div
                                className='relative w-full aspect-[4/3] rounded-2xl overflow-hidden group'
                                style={{
                                    background: isPoker ? theme.inputBg : '#fbf6ec',
                                    border: `1px solid ${isPoker ? theme.inputBorder : '#ead9b3'}`,
                                }}
                            >
                                {/* 1. מצב בחירה (ריק) */}
                                {!photoUrl && !cameraOpen && (
                                    <div className='absolute inset-0 flex flex-col items-center justify-center gap-6 px-4'>
                                        {/* Camera-icon disc — picks up
                                            the variant's accent colour
                                            so it reads as "tap me" on
                                            both the dark felt (poker)
                                            and the cream card (others). */}
                                        <div
                                            className='rounded-full flex items-center justify-center'
                                            style={{
                                                width: 72,
                                                height: 72,
                                                background: isPoker
                                                    ? 'rgba(212,175,55,0.10)'
                                                    : '#fff8e8',
                                                border: `1px solid ${theme.inputBorder}`,
                                            }}
                                        >
                                            <svg
                                                xmlns='http://www.w3.org/2000/svg'
                                                fill='none'
                                                viewBox='0 0 24 24'
                                                strokeWidth={1.5}
                                                stroke={theme.accentColor}
                                                className='w-9 h-9'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z'
                                                />
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z'
                                                />
                                            </svg>
                                        </div>

                                        <div className='flex gap-3 w-full max-w-[280px]'>
                                            <button
                                                onClick={() => setCameraOpen(true)}
                                                className='flex-1 rounded-full text-white font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]'
                                                style={{
                                                    background: theme.buttonGradient,
                                                    padding: '11px 14px',
                                                    boxShadow: theme.buttonShadow,
                                                }}
                                            >
                                                <svg
                                                    viewBox='0 0 24 24'
                                                    className='w-[15px] h-[15px]'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    strokeWidth={2}
                                                >
                                                    <path
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z'
                                                    />
                                                    <path
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z'
                                                    />
                                                </svg>
                                                <span>{t('camera')}</span>
                                            </button>
                                            <label
                                                className='flex-1 rounded-full font-bold text-[13px] cursor-pointer flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]'
                                                style={{
                                                    background: isPoker
                                                        ? 'rgba(212,175,55,0.08)'
                                                        : '#ffffff',
                                                    border: `1px solid ${theme.inputBorder}`,
                                                    color: isPoker ? theme.accentColor : '#a8843a',
                                                    padding: '11px 14px',
                                                }}
                                            >
                                                <svg
                                                    viewBox='0 0 24 24'
                                                    className='w-[15px] h-[15px]'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    strokeWidth={1.8}
                                                >
                                                    <path
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z'
                                                    />
                                                </svg>
                                                <span>{t('gallery')}</span>
                                                <input
                                                    type='file'
                                                    accept='image/*'
                                                    className='hidden'
                                                    onChange={e => {
                                                        const file = e.target.files?.[0]
                                                        if (file) {
                                                            setPhotoBlob(file)
                                                            setPhotoUrl(URL.createObjectURL(file))
                                                            setIsUpload(true)
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* 2. מצב מצלמה חיה */}
                                {cameraOpen && (
                                    <div className='absolute inset-0 bg-black'>
                                        <video
                                            ref={liveVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`w-full h-full object-cover ${
                                                cameraFacing === 'user' ? 'scale-x-[-1]' : ''
                                            }`}
                                        />
                                        {/* כפתורי שליטה צפים ויפים */}
                                        <div className='absolute bottom-6 left-0 w-full flex justify-center items-center gap-10'>
                                            <button
                                                onClick={() => setCameraOpen(false)}
                                                className='w-12 h-12 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 active:scale-[0.98] transition'
                                            >
                                                <svg
                                                    xmlns='http://www.w3.org/2000/svg'
                                                    fill='none'
                                                    viewBox='0 0 24 24'
                                                    strokeWidth={2}
                                                    stroke='currentColor'
                                                    className='w-6 h-6'
                                                >
                                                    <path
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        d='M6 18 18 6M6 6l12 12'
                                                    />
                                                </svg>
                                            </button>

                                            <button
                                                onClick={takePhoto}
                                                className='w-20 h-20 rounded-full border-4 border-white/80 flex items-center justify-center active:scale-[0.98] transition'
                                            >
                                                <div className='w-16 h-16 bg-white rounded-full' />
                                            </button>

                                            <button
                                                onClick={() =>
                                                    setCameraFacing(prev => (prev === 'user' ? 'environment' : 'user'))
                                                }
                                                className='w-12 h-12 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 active:scale-[0.98] transition'
                                            >
                                                <svg
                                                    xmlns='http://www.w3.org/2000/svg'
                                                    fill='none'
                                                    viewBox='0 0 24 24'
                                                    strokeWidth={2}
                                                    stroke='currentColor'
                                                    className='w-6 h-6'
                                                >
                                                    <path
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        d='M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99'
                                                    />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 3. עריכה (Cropper) */}
                                {photoUrl && isUpload && !cameraOpen && (
                                    <div className='absolute inset-0'>
                                        <Cropper
                                            image={photoUrl}
                                            crop={crop}
                                            zoom={zoom}
                                            aspect={4 / 3}
                                            onCropChange={setCrop}
                                            onZoomChange={setZoom}
                                            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                                        />
                                    </div>
                                )}

                                {/* 4. תצוגה סופית */}
                                {photoUrl && !isUpload && !cameraOpen && (
                                    <img src={photoUrl} className='w-full h-full object-cover' alt='Preview' />
                                )}
                            </div>
                        </div>
                        {/* ── Action buttons (close out the photo card) ── */}
                        {photoUrl && !cameraOpen && (
                            <div className='flex gap-3 mt-6'>
                                <button
                                    onClick={() => {
                                        setPhotoUrl('')
                                        setPhotoBlob(null)
                                        setIsUpload(false)
                                    }}
                                    className='flex-1 rounded-2xl font-bold text-[13.5px] transition-all active:scale-[0.99]'
                                    style={{
                                        background: isPoker
                                            ? 'rgba(212,175,55,0.08)'
                                            : '#ffffff',
                                        border: `1px solid ${theme.inputBorder}`,
                                        color: isPoker ? theme.cardLabelColor : '#9a8a72',
                                        padding: '13px 14px',
                                    }}
                                >
                                    {t('replacePhoto')}
                                </button>
                                {/* Final/forward action — submit when this
                                    panel is the LAST step (non-poker:
                                    photo → submit), or continue when
                                    this panel is the FIRST step (poker:
                                    photo → blessing). Same gold gradient
                                    + dimensions in either mode; only the
                                    label, icon trail, and click handler
                                    differ. */}
                                {step === 2 ? (
                                    <button
                                        onClick={onSubmit}
                                        disabled={submitting}
                                        className='flex-[2] rounded-2xl text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-[0.99]'
                                        style={{
                                            background: theme.buttonGradient,
                                            boxShadow: theme.buttonShadow,
                                            padding: '14px 18px',
                                            fontSize: '15px',
                                            letterSpacing: '0.01em',
                                        }}
                                    >
                                        {submitting ? (
                                            <>
                                                <svg className='w-4 h-4 animate-spin' fill='none' viewBox='0 0 24 24'>
                                                    <circle
                                                        className='opacity-25'
                                                        cx='12'
                                                        cy='12'
                                                        r='10'
                                                        stroke='currentColor'
                                                        strokeWidth='3'
                                                    />
                                                    <path
                                                        className='opacity-75'
                                                        fill='currentColor'
                                                        d='M4 12a8 8 0 018-8v8z'
                                                    />
                                                </svg>
                                                <span>{t('submitting')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg
                                                    viewBox='0 0 24 24'
                                                    className='w-[15px] h-[15px] opacity-95'
                                                    fill='currentColor'
                                                >
                                                    <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                                                </svg>
                                                <span>{t('submit')}</span>
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setStep(2)}
                                        className='flex-[2] rounded-2xl text-white font-bold transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.99]'
                                        style={{
                                            background: theme.buttonGradient,
                                            boxShadow: theme.buttonShadow,
                                            padding: '14px 18px',
                                            fontSize: '15px',
                                            letterSpacing: '0.01em',
                                        }}
                                    >
                                        <svg
                                            viewBox='0 0 24 24'
                                            className='w-[15px] h-[15px] opacity-95 shrink-0'
                                            fill='currentColor'
                                        >
                                            <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                                        </svg>
                                        <span>{continueToTextLabel}</span>
                                        <svg
                                            viewBox='0 0 24 24'
                                            className='w-[15px] h-[15px] rtl:rotate-180 shrink-0'
                                            fill='none'
                                            stroke='currentColor'
                                            strokeWidth={2.6}
                                        >
                                            <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Back to the previous step. Only when photo
                            is the LAST step (non-poker), no photo has
                            been taken, and the camera isn't open —
                            otherwise there's nowhere to go back to. */}
                        {step === 2 && !photoUrl && !cameraOpen && (
                            <button
                                onClick={() => setStep(1)}
                                className='w-full mt-5 text-[13px] flex items-center justify-center gap-1.5 transition-colors'
                                style={{ color: theme.subtitleColor }}
                            >
                                {/* Chevron points "back" — flips on dir so
                                    it's correct in RTL (←) and LTR (←). */}
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[14px] h-[14px] rtl:rotate-180'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth={2}
                                >
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                                </svg>
                                <span>{t('backToEdit')}</span>
                            </button>
                        )}

                        {/* "All blessings" gallery shortcut — poker
                            only. Lets a player browse every blessing
                            already submitted to this event so they
                            see the room before adding their own. */}
                        {isPoker && (
                            <button
                                onClick={() => router.push(`/wedding/${weddingId}/gallery`)}
                                className='w-full mt-4 rounded-2xl font-bold transition-all active:scale-[0.99] flex items-center justify-center gap-2'
                                style={{
                                    background: 'rgba(212,175,55,0.10)',
                                    border: `1px solid ${theme.inputBorder}`,
                                    color: theme.accentColor,
                                    padding: '12px 16px',
                                    fontSize: '14px',
                                }}
                            >
                                <svg
                                    viewBox='0 0 24 24'
                                    className='w-[16px] h-[16px]'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth={1.8}
                                >
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z' />
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' />
                                </svg>
                                <span>כל הברכות</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
