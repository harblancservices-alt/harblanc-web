export default function LoadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 animate-pulse rounded-lg bg-elevated" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-elevated" />
        ))}
      </div>
      <div className="h-9 w-64 animate-pulse rounded-md bg-elevated" />
      <div className="h-80 animate-pulse rounded-lg bg-elevated" />
    </div>
  );
}
