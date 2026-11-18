import { useState } from 'react';
import { Check } from 'lucide-react';
import { MIGRATION_TOPICS } from '../data/carbonSources';

export function MigrationGuide() {
  const [selectedId, setSelectedId] = useState<string>(MIGRATION_TOPICS[0].id);
  const activeTopic =
    MIGRATION_TOPICS.find((t) => t.id === selectedId) ?? MIGRATION_TOPICS[0];

  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-medium tracking-wide text-slate-500">
          Incremental Modernization · C++20 to Carbon
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
          C++ to Carbon Migration Reference
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          Explore the five core architectural differences between modern C++ and Carbon, using
          patterns drawn directly from our memory-safe file parser.
        </p>
      </div>

      {/* Topic Selector */}
      <div className="flex flex-wrap gap-2">
        {MIGRATION_TOPICS.map((topic) => {
          const isActive = topic.id === activeTopic.id;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => setSelectedId(topic.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {topic.title}
            </button>
          );
        })}
      </div>

      {/* Comparison Stage */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-sky-700">{activeTopic.category}</div>
          <h2 className="text-xl font-bold text-slate-900">{activeTopic.title}</h2>
          <p className="text-sm leading-relaxed text-slate-600 max-w-3xl">
            {activeTopic.summary}
          </p>
        </div>

        {/* Side-by-side C++ vs Carbon Code */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs">
              <span className="font-semibold text-slate-200">C++20 Pattern</span>
              <span className="text-slate-500">Legacy / Template</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-200">
              <code>{activeTopic.cppCode}</code>
            </pre>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs">
              <span className="font-semibold text-sky-300">Carbon Equivalent</span>
              <span className="text-slate-400">Checked &amp; Explicit</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-100">
              <code>{activeTopic.carbonCode}</code>
            </pre>
          </div>
        </div>

        {/* Key Takeaways */}
        <div className="border-t border-slate-100 pt-5 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Design Takeaways
          </h3>
          <ul className="space-y-2">
            {activeTopic.keyTakeaways.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
