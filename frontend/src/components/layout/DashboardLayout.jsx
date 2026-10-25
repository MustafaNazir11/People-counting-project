import Sidebar from '../Sidebar'
import Header from './Header'

export default function DashboardLayout({
  activePage,
  setActivePage,
  user,
  onLogout,
  children,
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="hidden md:block">
        <Sidebar activePage={activePage} setActivePage={setActivePage} />
      </div>

      <main className="min-w-0 flex-1">
        <Header activePage={activePage} user={user} onLogout={onLogout} />
        <section className="p-5 md:p-8">{children}</section>
      </main>
    </div>
  )
}
