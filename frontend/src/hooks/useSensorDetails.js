
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function useSensorDetails(sensorId, token) {
  const [result, setResult] = useState({
    sensorId: null,
    token: null,
    reloadKey: -1,
    details: null,
    loading: false,
    error: '',
  })
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!sensorId) return

    const controller = new AbortController()

    async function loadDetails() {
      try {
        const data = await apiFetch(`/sensors/${sensorId}/details`, token, {
          signal: controller.signal,
        })
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('The sensor details API returned an unexpected response.')
        }
        if (!controller.signal.aborted) {
          setResult({
            sensorId,
            token,
            reloadKey,
            details: data,
            loading: false,
            error: '',
          })
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setResult({
            sensorId,
            token,
            reloadKey,
            details: null,
            loading: false,
            error: err.message || 'Unable to load sensor details.',
          })
        }
      }
    }

    loadDetails()
    return () => controller.abort()
  }, [sensorId, token, reloadKey])

  const isCurrentRequest = result.sensorId === sensorId &&
    result.token === token &&
    result.reloadKey === reloadKey
  return {
    details: isCurrentRequest ? result.details : null,
    loading: sensorId ? !isCurrentRequest || result.loading : false,
    error: isCurrentRequest ? result.error : '',
    refresh,
  }
}
