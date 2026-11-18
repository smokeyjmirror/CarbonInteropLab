import { useState } from 'react';
import { Download } from 'lucide-react';
import { MigrationGuide } from './components/MigrationGuide';
import { ParserSandbox } from './components/ParserSandbox';
import { SourceExplorer } from './components/SourceExplorer';
import { SyntaxDrill } from './components/SyntaxDrill';
import { downloadFullBundle } from './utils/downloadBundle';

type ActiveTab = 'sandbox' | 'sources' | 'migration' | 'drill';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'sandbox', label: 'Parser Sandbox' },
  { id: 'sources', label: 'Source Explorer' },
  { id: 'migration', label: 'C++ Migration' },
  { id: 'drill', label: 'Syntax Drill' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sandbox');
  const [activeSourceFileId, setActiveSourceFileId] = useState<string>('chunk_parser_carbon');

  const handleOpenSourceFile = (fileId: string) => {
    setActiveSourceFileId(fileId);
    setActiveTab('sources');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className="text-left text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            Carbon Interop Lab
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 ${
                    isActive
                      ? 'border-sky-600 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={downloadFullBundle}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download Bundle
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'sandbox' && (
          <ParserSandbox onOpenSourceFile={handleOpenSourceFile} />
        )}
        {activeTab === 'sources' && (
          <SourceExplorer
            activeFileId={activeSourceFileId}
            onSelectFile={setActiveSourceFileId}
          />
        )}
        {activeTab === 'migration' && <MigrationGuide />}
        {activeTab === 'drill' && <SyntaxDrill />}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            Carbon Interop Lab · Educational workbench modeling Carbon &amp; C++20
            interoperability for bounds-safe binary parsing.
          </p>
          <button
            type="button"
            onClick={downloadFullBundle}
            className="text-left font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2 sm:hidden"
          >
            Download Carbon + C++ Source Bundle
          </button>
        </div>
      </footer>
    </div>
  );
}
