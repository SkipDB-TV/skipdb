export default function Loading() {
  return (
    <div className="container-page py-10">
      {/* Breadcrumb */}
      <div className="skeleton h-4 w-40" />
      {/* Title + API link row */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-8 w-24" />
      </div>
      {/* Overview */}
      <div className="mt-3 space-y-2">
        <div className="skeleton h-4 w-full max-w-lg" />
        <div className="skeleton h-4 w-4/5 max-w-md" />
      </div>

      <div className="mt-8 space-y-6">
        {/* Timeline bar */}
        <div className="skeleton h-14 w-full rounded-2xl" />
        {/* Segment rows */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="skeleton h-24 w-full rounded-2xl"
            style={{ opacity: 1 - i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}
