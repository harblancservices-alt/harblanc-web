export default function MaintenanceLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-10 w-48 animate-pulse rounded bg-elevated" />
      <div className="h-24 animate-pulse rounded-lg bg-elevated" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-elevated" />
        <div className="h-28 animate-pulse rounded-lg bg-elevated" />
        <div className="h-28 animate-pulse rounded-lg bg-elevated" />
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-elevated" />
    </div>
  );
}
