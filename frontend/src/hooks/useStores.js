import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function useStores(token) {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    async function loadStores() {
      setLoading(true)
      setError('')

      try {
        const data = await apiFetch('/stores/', token, {
          signal: controller.signal,
        })
        if (!Array.isArray(data)) {
          throw new Error('The stores API returned an unexpected response.')
        }
        if (!controller.signal.aborted) setStores(data)
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError' && !controller.signal.aborted) {
          setError(fetchError.message || 'Could not load stores.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadStores()

    return () => controller.abort()
  }, [token, reloadKey])

  return {
    stores: token ? stores : [],
    loading: token ? loading : false,
    error: token ? error : '',
    refresh,
  }
}
