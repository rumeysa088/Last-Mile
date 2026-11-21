// frontend/src/auth/useRoleGuard.ts
// Member D. Co-owned with C (they own auth/ broadly — this file is only the
// officer_admin route guard).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Me } from '../api/client'

export function useRoleGuard(required: Me['role']) {
  const nav = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.me()
      .then(m => {
        setMe(m)
        if (m.role !== required) {
          setError('Not authorized for this area.')
          nav('/')
        }
      })
      .catch(e => { setError(String(e)); nav('/login') })
  }, [required, nav])

  return { me, error }
}
