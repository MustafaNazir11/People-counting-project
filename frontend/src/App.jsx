import { useEffect, useState } from 'react'
import DashboardLayout from './components/layout/DashboardLayout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Stores from './pages/Stores'
import Analytics from './pages/Analytics'
import { loginManager } from './api'
import Sensors from './pages/Sensors'
import Reports from './pages/Reports'

function readStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('auth_user') || 'null')
  } catch {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('auth_user')
    return null
  }
}

export default function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [auth, setAuth] = useState(() => ({
    token: sessionStorage.getItem('access_token'),
    user: readStoredUser(),
  }))
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function expireSession() {
      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('auth_user')
      setAuth({ token: null, user: null })
    }

    window.addEventListener('auth:expired', expireSession)
    return () => window.removeEventListener('auth:expired', expireSession)
  }, [])

  async function handleLogin({ email, password }) {
    setLoading(true)
    setLoginError('')

    try {
      const data = await loginManager(email, password)
      sessionStorage.setItem('access_token', data.access_token)
      sessionStorage.setItem('auth_user', JSON.stringify(data.user))
      setAuth({ token: data.access_token, user: data.user })
    } catch (error) {
      setLoginError(
        error instanceof TypeError
          ? 'Cannot reach the server. Check that the backend is running.'
          : error.message || 'Unable to sign in.'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('auth_user')
    setAuth({ token: null, user: null })
  }

  if (!auth.token || !auth.user) {
    return (
      <Login
        onLogin={handleLogin}
        error={loginError}
        loading={loading}
      />
    )
  }

  return (
    <DashboardLayout
      activePage={activePage}
      setActivePage={setActivePage}
      user={auth.user}
      onLogout={handleLogout}
    >
      {activePage === 'Analytics' ? (
        <Analytics token={auth.token} />
      ) : activePage === 'Stores' ? (
        <Stores token={auth.token} />
      ) : activePage === 'Sensors' ? (
        <Sensors token={auth.token} />
      ) : activePage === 'Reports' ? (
        <Reports onOpenAnalytics={() => setActivePage('Analytics')} />
      ) : (
        <Overview />
      )}
    </DashboardLayout>
  )
}
