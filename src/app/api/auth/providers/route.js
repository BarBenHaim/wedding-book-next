// /api/auth/providers — is "Continue with Google" switched on?
//
//   GET → { google: true | false | null }
//
// Google sign-in only works once it is enabled in the Firebase console
// AND app.weddingtales.co.il is an authorized domain there. Asking the
// Identity Toolkit admin API (with the server's service account) lets the
// login page show the button exactly when it will work — the moment it is
// switched on, without a redeploy. null = could not tell (e.g. the
// service account may not read auth config); the page then shows the
// button and handles the error if it comes.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getApp } from 'firebase-admin/app'
import '@/lib/firebaseAdmin' // initialises the default admin app

const TTL_MS = 5 * 60 * 1000
let cache = null // { at, value }

async function googleEnabled(host) {
    const project = process.env.FIREBASE_PROJECT_ID
    const credential = getApp().options.credential
    if (!project || !credential?.getAccessToken) return null
    const { access_token: token } = await credential.getAccessToken()
    const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}`
    const headers = { Authorization: `Bearer ${token}` }

    const idp = await fetch(`${base}/defaultSupportedIdpConfigs/google.com`, { headers, cache: 'no-store' })
    if (idp.status === 404) return false // never configured
    if (!idp.ok) return null
    if ((await idp.json())?.enabled !== true) return false

    const cfg = await fetch(`${base}/config`, { headers, cache: 'no-store' })
    if (!cfg.ok) return null
    const domains = (await cfg.json())?.authorizedDomains || []
    return host ? domains.includes(host) : true
}

export async function GET(req) {
    const host = new URL(req.url).hostname
    if (cache && Date.now() - cache.at < TTL_MS && cache.host === host) {
        return NextResponse.json({ google: cache.value })
    }
    let value = null
    try {
        value = await googleEnabled(host)
    } catch (err) {
        console.error('[auth/providers] check failed:', err?.message || err)
    }
    cache = { at: Date.now(), host, value }
    return NextResponse.json({ google: value })
}
