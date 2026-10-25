
const API_URL = import.meta.env.VITE_API_URL;

export async function apiFetch(path, token) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    throw new Error("Could not load stores.");
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
