type PlaceholderProps = {
  title: string;
  description: string;
};

/** Renders a centered dashed placeholder for unfinished authenticated pages. */
export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-xl border border-dashed border-border bg-card px-8 py-10 text-center">
        <h2 className="mb-2 text-base font-semibold text-text">{title}</h2>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
    </div>
  );
}
