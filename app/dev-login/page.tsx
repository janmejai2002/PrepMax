import { redirect } from 'next/navigation'
import { DevLoginClient } from './dev-login-client'

export default function DevLoginPage() {
  // Hard gate: this page does not exist in production
  if (process.env.NODE_ENV === 'production') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <DevLoginClient />
    </div>
  )
}
