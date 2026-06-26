export default function Loading() {
  return (
    <div className="container-page py-10">
      {/* Search bar placeholder */}
      <div className="skeleton mx-auto h-12 w-full max-w-xl rounded-2xl" />

      {/* Result grid */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2" style={{ opacity: 1 - i * 0.07 }}>
            <div className="skeleton aspect-[2/3] w-full rounded-xl" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
