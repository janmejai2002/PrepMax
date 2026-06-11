import { Suspense } from 'react'
import LoginClient from './login-client'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const allowDevLogin = process.env.ALLOW_DEV_LOGIN?.trim() === 'true'
  return (
    <Suspense>
      <LoginClient allowDevLogin={allowDevLogin} />
    </Suspense>
  )
}
