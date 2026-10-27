
const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function apiFetch(path, token, { signal } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(
      data.detail ||
      (response.status === 403
        ? 'You are not authorized to access this resource.'
        : `Request failed (HTTP ${response.status}).`)
    )
  }

  return response.json();
}

export async function loginManager(email, password) {
  const formData = new URLSearchParams()
  formData.set('username', email)
  formData.set('password', password)

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'Invalid email or password.'
        : data.detail || 'Unable to sign in. Please try again.'
    )
  }

  if (!data.access_token || !data.user) {
    throw new Error('The server returned an unexpected login response.')
  }

  return data
}
