
import {
  LayoutDashboard,
  Store,
  Camera,
  ChartNoAxesCombined,
  FileText,
} from 'lucide-react'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Stores', icon: Store },
  { label: 'Sensors', icon: Camera },
  { label: 'Analytics', icon: ChartNoAxesCombined },
  { label: 'Reports', icon: FileText },
]

export default function Sidebar({ activePage, setActivePage }) {
  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
          HM
        </div>
        <div>
          <h1 className="font-semibold text-slate-900">People Counting </h1>
          <p className="text-xs text-slate-500">Store Management</p>
        </div>
      </div>

      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Workspace
      </p>

      <nav className="flex-1 space-y-1">
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => setActivePage(label)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
              activePage === label
                ? 'bg-slate-900 font-medium text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-8 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-medium">Store workspace</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Monitor your sensors and visitor activity in one place.
        </p>
      </div>
    </aside>
  )
}
