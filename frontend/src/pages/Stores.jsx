import { Store } from 'lucide-react'
import useStores from '../hooks/useStores'

export default function Stores({ token }) {
  const { stores, loading, error } = useStores(token)

  return (
    <div>
      <h3 className="text-2xl font-semibold">Your Stores</h3>
      <p className="mt-1 text-sm text-slate-500">
        Stores assigned to your manager account.
      </p>

      {loading && (
        <p className="mt-6 text-sm text-slate-500">
          Loading stores...
        </p>
      )}

      {error && (
        <p className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && stores.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          No stores are assigned to your account.
        </p>
      )}

      {!loading && !error && stores.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <article
              key={store.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-3">
                  <Store size={22} />
                </div>
                <div>
                  <h4 className="font-semibold">{store.name}</h4>
                  <p className="text-sm text-slate-500">
                    {store.location || 'Location not specified'}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Store ID: {store.id}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}