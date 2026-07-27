import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'

/** 401 yanıtlarında tam sayfa yenileme yerine SPA yönlendirmesi */
export default function AuthSessionHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const onPosExpired = () => {
      useAuthStore.getState().logout()
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:session-expired', onPosExpired)
    return () => window.removeEventListener('auth:session-expired', onPosExpired)
  }, [navigate])

  return null
}
