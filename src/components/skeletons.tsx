import { cn } from "@/lib/utils";

const SKELETON_ROWS = 3;

export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded bg-muted", className)} />;
}

function CardSkeleton() {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <SkeletonBlock className="h-4 w-36" />
      <SkeletonBlock className="mt-4 h-9 w-40" />
      <SkeletonBlock className="mt-2 h-4 w-24" />
    </article>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="mt-2 h-3 w-36" />
      </div>
      <SkeletonBlock className="h-7 w-28" />
      <SkeletonBlock className="h-4 w-20" />
      <SkeletonBlock className="h-7 w-24" />
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-4 w-20" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading portfolio" className="flex flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="mt-1 h-4 w-52" />
          </div>
          <SkeletonBlock className="h-8 w-48 rounded-lg" />
        </div>
        <div className="border-b border-border px-5 py-4">
          <SkeletonBlock className="h-9 w-full max-w-2xl rounded-lg" />
        </div>
        <div className="h-window-main divide-y divide-border overflow-hidden">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => <TableRowSkeleton key={index} />)}
        </div>
      </section>
    </div>
  );
}

export function AlertListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading alerts" className="mt-2 divide-y divide-border">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-1 h-3.5 w-44" />
          </div>
          <SkeletonBlock className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function AccountPillSkeleton() {
  return (
    <span role="status" aria-busy="true" aria-label="Loading account" className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3">
      <SkeletonBlock className="size-8 rounded-full" />
      <SkeletonBlock className="h-6 w-20" />
    </span>
  );
}
