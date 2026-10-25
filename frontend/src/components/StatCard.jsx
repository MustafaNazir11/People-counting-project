export default function StatCard({ label, value, change, icon: Icon }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon size={19} className="text-slate-400" />
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{change}</p>
    </article>
  )
}