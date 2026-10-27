import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Camera,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react'
import SensorDetails from '../components/sensors/SensorDetails'
import useSensorDetails from '../hooks/useSensorDetails'
import useSensors from '../hooks/useSensors'

function StatusBadge({ status }) {
  const normalizedStatus = String(status || '').toLowerCase()
  const online = normalizedStatus === 'online'
  const offline = normalizedStatus === 'offline'

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
      online ? 'bg-emerald-50 text-emerald-700' : offline ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : offline ? 'bg-slate-400' : 'bg-amber-500'}`} />
      {online ? 'Online' : offline ? 'Offline' : 'Status unavailable'}
    </span>
  )
}

function SensorCard({ sensor, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg bg-slate-100 p-3 text-slate-600 transition group-hover:bg-slate-900 group-hover:text-white">
            <Camera size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-slate-900">{sensor.name || `Sensor ${sensor.id}`}</h2>
            <p className="mt-1 text-xs text-slate-500">Sensor ID {sensor.id}</p>
          </div>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-500">Store {sensor.store_id ?? 'Not assigned'}</span>
        <StatusBadge status={sensor.status} />
      </div>
      <p className="mt-3 text-xs text-slate-400">View sensor information and readings</p>
    </button>
  )
}

export default function Sensors({ token }) {
  const {
    sensors,
    loading,
    error,
    refresh: refreshSensors,
  } = useSensors(token)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const filteredSensors = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sensors.filter((sensor) => {
      const matchesText = !query ||
        String(sensor.name || '').toLowerCase().includes(query) ||
        String(sensor.id).includes(query) ||
        String(sensor.store_id ?? '').includes(query)
      const matchesStatus = statusFilter === 'all' ||
        String(sensor.status || '').toLowerCase() === statusFilter
      return matchesText && matchesStatus
    })
  }, [sensors, search, statusFilter])

  const selectedSensor = sensors.find((sensor) => String(sensor.id) === String(selectedId))
  const {
    details,
    loading: detailsLoading,
    error: detailsError,
    refresh: refreshDetails,
  } = useSensorDetails(selectedSensor?.id, token)

  if (selectedSensor) {
    return (
      <SensorDetails
        sensor={selectedSensor}
        details={details}
        loading={detailsLoading}
        error={detailsError}
        onBack={() => setSelectedId(null)}
        onRefresh={refreshDetails}
      />
    )
  }

  const onlineCount = sensors.filter(
    (sensor) => String(sensor.status || '').toLowerCase() === 'online',
  ).length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Device management</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Sensors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor registered sensors and inspect their saved data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5">
            <p className="text-xs text-slate-500">Registered</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">
              {sensors.length}
              <span className="ml-2 text-xs font-medium text-emerald-700">{onlineCount} online</span>
            </p>
          </div>
          <button
            type="button"
            onClick={refreshSensors}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-[220px] flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Search sensors</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, sensor ID, or store..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          >
            <option value="all">All statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="inline-flex items-center gap-2"><AlertCircle size={17} /> {error}</span>
          <button type="button" onClick={refreshSensors} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {loading && sensors.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading sensors...
        </div>
      )}

      {!loading && !error && sensors.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto inline-flex rounded-xl bg-slate-100 p-3 text-slate-500"><Camera size={22} /></span>
          <h2 className="mt-4 font-semibold text-slate-900">No sensors registered</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Sensors assigned to stores you can access will appear here.
          </p>
        </div>
      )}

      {sensors.length > 0 && filteredSensors.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          No sensors match the selected search or status filter.
        </p>
      )}

      {filteredSensors.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSensors.map((sensor) => (
            <SensorCard
              key={sensor.id}
              sensor={sensor}
              onSelect={() => setSelectedId(sensor.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
