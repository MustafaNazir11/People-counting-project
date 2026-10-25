import { sensor } from 'lucide-react'

const sensorStatuses = [
  ['Front entrance', 'Online'],
  ['Main floor', 'Online'],
  ['Back entrance', 'Offline'],
  ['Warehouse', 'Online'],
]

export default function sensorStatus() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="font-semibold">sensor status</h3>
      <p className="mt-1 text-sm text-slate-500">
        Current sensor connectivity
      </p>

      <div className="mt-6 space-y-5">
        {sensorStatuses.map(([name, status]) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <sensor size={18} className="text-slate-400" />
              <span className="text-sm">{name}</span>
            </div>
            <span
              className={`text-xs font-medium ${status === 'Online' ? 'text-emerald-600' : 'text-red-600'
                }`}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
