import { createClient } from '@supabase/supabase-js'

// Service-role client for server-side cached queries that run outside request scope.
// Never expose to the client.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
