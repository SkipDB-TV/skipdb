export default function Loading() {
  return (
    <div className="container-page py-10">
      {/* Header: poster + metadata */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="skeleton aspect-[2/3] w-36 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="skeleton h-9 w-56" />
          <div className="skeleton h-4 w-32" />
          <div className="mt-3 skeleton h-4 w-full max-w-lg" />
          <div className="skeleton h-4 w-4/5 max-w-md" />
          <div className="mt-4 flex gap-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-20" />
          </div>
        </div>
      </div>

      {/* Coverage summary */}
      <div className="mt-10 skeleton h-36 w-full rounded-2xl" />

      {/* Season list */}
      <div className="mt-10 space-y-10">
        {[6, 4].map((count, s) => (
          <section key={s}>
            <div className="skeleton mb-3 h-6 w-24" />
            <div className="grid gap-2">
              {Array.from({ length: count }).map((_, e) => (
                <div
                  key={e}
                  className="skeleton h-14 w-full rounded-2xl"
                  style={{ opacity: 1 - e * 0.08 }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
