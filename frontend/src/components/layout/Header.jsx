import { Bell, LogOut, Search } from 'lucide-react'

export default function Header({ activePage, user, onLogout }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
      <div>
        <p className="text-sm text-slate-500">Store workspace / {activePage}</p>
        <h2 className="mt-1 text-xl font-semibold">{activePage}</h2>
      </div>

      <div className="flex items-center gap-3">
        <button
          aria-label="Search"
          className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <Search size={18} />
        </button>
        <button
          aria-label="Notifications"
          className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-slate-500">Store Manager</p>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
