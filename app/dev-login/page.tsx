import { redirect } from 'next/navigation'
import { DevLoginClient } from './dev-login-client'

export default function DevLoginPage() {
  // Only available when ALLOW_DEV_LOGIN=true is set in the environment.
  // This lets us enable it for stakeholder test deployments without exposing
  // it in real production (where the env var is simply absent).
  if (process.env.ALLOW_DEV_LOGIN !== 'true') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <DevLoginClient />
    </div>
  )
}
