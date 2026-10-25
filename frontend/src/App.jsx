import { useState } from 'react'
import DashboardLayout from './components/layout/DashboardLayout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Stores from './pages/Stores'
import Analytics from './pages/Analytics'
import { loginManager } from './api'

export default function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [auth, setAuth] = useState(() => ({
    token: sessionStorage.getItem('access_token'),
    user: JSON.parse(sessionStorage.getItem('auth_user') || 'null'),
  }))
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

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
      ) : (
        <Overview />
      )}
    </DashboardLayout>
  )
}
