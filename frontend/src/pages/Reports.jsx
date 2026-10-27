export default function Reports({ onOpenAnalytics }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
      <p className="mt-2 text-sm text-slate-600">
        Visitor reports are available in Analytics, using the readings currently
        stored for your assigned sensors.
      </p>
      <button
        type="button"
        onClick={onOpenAnalytics}
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Open Analytics
      </button>
    </section>
  )
}