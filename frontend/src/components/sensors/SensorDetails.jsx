import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Clock3,
  Cpu,
  RefreshCw,
  Users,
} from 'lucide-react'

function formatDate(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function formatLabel(value) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function displayValue(value) {
  if (value == null || value === '') return 'Not available'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function StatusBadge({ status }) {
  const normalizedStatus = String(status || '').toLowerCase()
  const online = normalizedStatus === 'online'
  const offline = normalizedStatus === 'offline'
  const className = online
    ? 'bg-emerald-50 text-emerald-700'
    : offline
      ? 'bg-slate-100 text-slate-600'
      : 'bg-amber-50 text-amber-700'

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${className}`}>
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : offline ? 'bg-slate-400' : 'bg-amber-500'}`} />
      {online ? 'Online' : offline ? 'Offline' : 'Status unavailable'}
    </span>
  )
}

function DataCard({ label, value, mono = false }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>
        {displayValue(value)}
      </p>
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

function Section({ icon: Icon, title, subtitle, children, action }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-slate-100 p-2.5 text-slate-600"><Icon size={18} /></span>
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function SensorReadings({ readings }) {
  if (!readings.length) {
    return <EmptyState>No stored readings are available for this sensor yet.</EmptyState>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-3 pr-4 font-medium">Line</th>
            <th className="pb-3 pr-4 font-medium">Recorded</th>
            <th className="pb-3 pr-4 text-right font-medium">In</th>
            <th className="pb-3 pr-4 text-right font-medium">Out</th>
            <th className="pb-3 pr-4 text-right font-medium">Male in/out</th>
            <th className="pb-3 text-right font-medium">Female in/out</th>
            <th className="pb-3 pl-4 text-right font-medium">Group in/out</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => (
            <tr key={reading.id} className="border-b border-slate-50 last:border-0">
              <td className="py-3 pr-4 font-medium text-slate-900">
                {reading.line_name || `Line ${reading.line_id}`}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-slate-500">{formatDate(reading.recorded_at)}</td>
              <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{displayValue(reading.individuals_in)}</td>
              <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{displayValue(reading.individuals_out)}</td>
              <td className="py-3 pr-4 text-right tabular-nums text-slate-700">
                {displayValue(reading.male_in)} / {displayValue(reading.male_out)}
              </td>
              <td className="py-3 text-right tabular-nums text-slate-700">
                {displayValue(reading.female_in)} / {displayValue(reading.female_out)}
              </td>
              <td className="py-3 pl-4 text-right tabular-nums text-slate-700">
                {displayValue(reading.group_in)} / {displayValue(reading.group_out)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SensorDetails({
  sensor,
  details,
  loading,
  error,
  onBack,
  onRefresh,
}) {
  const currentSensor = details || sensor
  const deviceInfo = details?.device_info
  const configuration = details?.configuration
  const readings = Array.isArray(details?.latest_readings) ? details.latest_readings.slice(0, 5) : []
  const deviceFields = deviceInfo
    ? Object.entries(deviceInfo).filter(([key, value]) =>
      !['device_name', 'device_info_id', 'updated_at'].includes(key) && value != null && value !== '')
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <ArrowLeft size={16} /> All sensors
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh details'}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="inline-flex items-center gap-2"><AlertCircle size={17} /> {error}</span>
          <button type="button" onClick={onRefresh} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {!details && loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading sensor details...
        </div>
      )}

      {details && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="rounded-xl bg-slate-100 p-3 text-slate-700"><Camera size={22} /></span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sensor details</p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                    {currentSensor.name || `Sensor ${currentSensor.id}`}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Sensor ID <span className="font-mono text-slate-700">{currentSensor.id}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    Assigned to store <span className="font-medium text-slate-700">{currentSensor.store_id ?? 'Not assigned'}</span>
                  </p>
                </div>
              </div>
              <StatusBadge status={currentSensor.status} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DataCard label="Model" value={currentSensor.model} />
              <DataCard label="Device ID" value={currentSensor.milesight_device_id} mono />
              <DataCard label="Serial number" value={currentSensor.serial_number || deviceInfo?.device_sn} mono />
              <DataCard label="Firmware" value={currentSensor.firmware_version || deviceInfo?.firmware_version} />
              <DataCard label="IP address" value={currentSensor.ip_address || deviceInfo?.ip_address} mono />
              <DataCard label="Last seen" value={formatDate(currentSensor.last_seen_at)} />
            </div>
          </section>

          <Section
            icon={Cpu}
            title="Device information"
            subtitle={deviceInfo?.updated_at ? `Updated ${formatDate(deviceInfo.updated_at)}` : 'Hardware details reported by the sensor'}
          >
            {!deviceInfo ? (
              <EmptyState>No device information has been reported yet. Details will appear here when the sensor is connected.</EmptyState>
            ) : deviceFields.length === 0 ? (
              <EmptyState>Device information is registered, but no metadata values are available yet.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {deviceFields.map(([key, value]) => (
                  <DataCard key={key} label={formatLabel(key)} value={value} />
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={Cpu}
            title="Configuration"
            subtitle={configuration?.fetched_at ? `Saved configuration · fetched ${formatDate(configuration.fetched_at)}` : 'Saved sensor configuration'}
          >
            {!configuration || configuration.values == null ? (
              <EmptyState>No saved configuration is available for this sensor yet.</EmptyState>
            ) : Object.keys(configuration.values).length === 0 ? (
              <EmptyState>A configuration record exists, but it contains no settings.</EmptyState>
            ) : (
              <pre className="max-h-[28rem] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(configuration.values, null, 2)}
              </pre>
            )}
            <p className="mt-3 text-xs text-slate-400">Read-only view. Changes are not sent to the hardware.</p>
          </Section>

          <Section
            icon={Users}
            title="Latest readings"
            subtitle="Up to five most recent readings stored for this sensor"
            action={readings.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {readings.length} {readings.length === 1 ? 'reading' : 'readings'}
              </span>
            )}
          >
            <SensorReadings readings={readings} />
          </Section>

          <p className="flex items-center gap-2 px-1 text-xs text-slate-400">
            <Clock3 size={13} />
            Device data and readings reflect records currently available in the backend.
          </p>
        </>
      )}

      {!details && !loading && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Sensor details are not available yet.
        </div>
      )}
    </div>
  )
}
