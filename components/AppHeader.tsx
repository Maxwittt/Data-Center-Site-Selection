export default function AppHeader() {
  return (
    <header className="pointer-events-none absolute top-4 left-4 z-10">
      <div className="pointer-events-auto rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md">
        <h1 className="text-sm font-medium tracking-tight text-zinc-50">
          Data Center Site Selection Evaluator
        </h1>
        <p className="mt-0.5 text-xs text-zinc-400">MISO / PJM region</p>
      </div>
    </header>
  );
}
