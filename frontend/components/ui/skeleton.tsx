import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        "relative overflow-hidden",
        "before:absolute before:inset-0",
        "before:-translate-x-full",
        "before:animate-[shimmer_2s_infinite]",
        "before:bg-gradient-to-r",
        "before:from-transparent",
        "before:via-white/10",
        "before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

// Skeleton variants for common use cases
function SkeletonText({
  className,
  lines = 1,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { lines?: number }) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4 w-full",
            i === lines - 1 && lines > 1 && "w-3/4"
          )}
        />
      ))}
    </div>
  )
}

function SkeletonCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-6 space-y-4",
        className
      )}
      {...props}
    >
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  )
}

function SkeletonAvatar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      className={cn(
        "h-10 w-10 rounded-full",
        className
      )}
      {...props}
    />
  )
}

function SkeletonButton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      className={cn(
        "h-10 w-24 rounded-md",
        className
      )}
      {...props}
    />
  )
}

function SkeletonInput({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      className={cn(
        "h-10 w-full rounded-md",
        className
      )}
      {...props}
    />
  )
}

function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { rows?: number; cols?: number }) {
  return (
    <div
      className={cn("w-full space-y-4", className)}
      {...props}
    >
      {/* Header */}
      <div className="flex gap-4 p-4 border-b">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-5 flex-1" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-4 flex-1",
                colIndex === 0 && "w-1/3",
                colIndex === cols - 1 && "w-1/4"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonInput,
  SkeletonTable
}