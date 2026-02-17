export function Skeleton({ className = "", ...props }) {
    return (
        <div
            className={`skeleton ${className}`}
            aria-hidden="true"
            {...props}
        />
    );
}

export function SkeletonRow({ cols = 4 }) {
    const widths = ["sk-w-55", "sk-w-65", "sk-w-75", "sk-w-85"];
    return (
        <tr className="skeleton-row">
            {Array.from({ length: cols }, (_, i) => (
                <td key={i}>
                    <Skeleton className={`skeleton-line sk-h-14 ${widths[i % widths.length]}`} />
                </td>
            ))}
        </tr>
    );
}

export function SkeletonCard() {
    return (
        <article className="stat-card">
            <Skeleton className="skeleton-line sk-h-12 sk-w-60 sk-mb-12" />
            <Skeleton className="skeleton-line sk-h-28 sk-w-40 sk-mb-8" />
            <Skeleton className="skeleton-line sk-h-12 sk-w-80" />
        </article>
    );
}
