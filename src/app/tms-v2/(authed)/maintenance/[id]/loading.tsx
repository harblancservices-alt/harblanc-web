export default function RepairEntryDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-5 w-32 animate-pulse rounded bg-elevated" />
      <div className="h-16 animate-pulse rounded-lg bg-elevated" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg bg-elevated" />
        <div className="h-72 animate-pulse rounded-lg bg-elevated" />
      </div>
    </div>
  );
}
