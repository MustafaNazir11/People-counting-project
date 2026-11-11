export default function SectionHeading({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#171717]">{title}</h2>
        <p className="mt-1 text-sm text-[#8f8f8f]">{description}</p>
      </div>
      {action}
    </div>
  )
}
