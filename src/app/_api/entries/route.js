export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

import handler from '@/server/api/entries'

export { handler as GET, handler as POST }
