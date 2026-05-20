type ComingSoonProps = {
  title: string;
  description: string;
};

/**
 * Stub page shell — used by routes that are not yet implemented.
 * Per Issue 02: stubs show a title and description; nav links to them are live.
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div className="max-w-4xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Coming soon
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            {title}
          </h1>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-8 py-8">
        <div className="max-w-4xl">
          <div className="rounded-lg border border-dashed border-stone-200 bg-white px-8 py-12 text-center">
            <p className="text-sm font-medium text-stone-500">{description}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
