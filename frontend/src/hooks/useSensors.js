import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function useSensors(token) {
  const [sensors, setSensors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSensors() {
      setLoading(true)
      setError('')

      try {
        const data = await apiFetch('/sensors/', token, { signal: controller.signal })
        if (!Array.isArray(data)) {
          throw new Error('The sensors API returned an unexpected response.')
        }
        if (!controller.signal.aborted) setSensors(data)
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message || 'Could not load sensors.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadSensors()
    return () => controller.abort()
  }, [token, reloadKey])

  return { sensors, loading, error, refresh }
}
