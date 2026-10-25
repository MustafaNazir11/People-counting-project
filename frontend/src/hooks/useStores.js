import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function useStores(token) {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function loadStores() {
      setLoading(true)
      setError('')

      try {
        const data = await apiFetch('/stores/', token)
        if (!cancelled) setStores(data)
      } catch (fetchError) {
        if (!cancelled) setError(fetchError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStores()

    return () => {
      cancelled = true
    }
  }, [token])

  return { stores, loading, error }
}
