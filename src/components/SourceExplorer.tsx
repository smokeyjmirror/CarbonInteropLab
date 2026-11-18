import { useMemo, useState } from 'react';
import { Check, Copy, Download, Info } from 'lucide-react';
import { SOURCE_FILES, type LineAnnotation, type SourceFile } from '../data/carbonSources';
import { downloadSourceFile } from '../utils/downloadBundle';

interface SourceExplorerProps {
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
}

const CARBON_KEYWORDS = new Set([
  'package',
  'api',
  'impl',
  'import',
  'Cpp',
  'library',
  'fn',
  'class',
  'interface',
  'choice',
  'match',
  'case',
  'let',
  'var',
  'return',
  'if',
  'else',
  'private',
  'as',
  'or',
  'and',
  'self',
  'Self',
  'type',
  'array',
]);

const CPP_KEYWORDS = new Set([
  'namespace',
  'class',
  'struct',
  'public',
  'private',
  'explicit',
  'const',
  'noexcept',
  'return',
  'size_t',
  'uint8_t',
  'uint32_t',
  'static_cast',
  'char',
  'void',
]);

function renderHighlightedLine(line: string, lang: 'carbon' | 'cpp') {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return <span className="text-slate-500">{line}</span>;
  }

  const keywords = lang === 'carbon' ? CARBON_KEYWORDS : CPP_KEYWORDS;
  // Split while preserving strings, words, and punctuation
  const tokens = line.split(/("[^"]*"|\b[A-Za-z_][A-Za-z0-9_]*\b)/g);

  return tokens.map((token, idx) => {
    if (!token) return null;
    if (token.startsWith('"') && token.endsWith('"')) {
      return (
        <span key={idx} className="text-emerald-300">
          {token}
        </span>
      );
    }
    if (keywords.has(token)) {
      return (
        <span key={idx} className="text-sky-300 font-medium">
          {token}
        </span>
      );
    }
    if (/^(u8|u32|u64|i32|String|SafeSlice|Result|ParseError|ChunkRecord|Diagnostic)$/.test(token)) {
      return (
        <span key={idx} className="text-amber-300">
          {token}
        </span>
      );
    }
    return <span key={idx}>{token}</span>;
  });
}

export function SourceExplorer({ activeFileId, onSelectFile }: SourceExplorerProps) {
  const activeFile: SourceFile = useMemo(
    () => SOURCE_FILES.find((f) => f.id === activeFileId) ?? SOURCE_FILES[2],
    [activeFileId]
  );

  const [selectedAnnotation, setSelectedAnnotation] = useState<LineAnnotation | null>(
    activeFile.annotations[0] ?? null
  );
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => activeFile.code.split('\n'), [activeFile.code]);

  const annotationMap = useMemo(() => {
    const map = new Map<number, LineAnnotation>();
    for (const ann of activeFile.annotations) {
      map.set(ann.line, ann);
    }
    return map;
  }, [activeFile]);

  const handleFileSwitch = (file: SourceFile) => {
    onSelectFile(file.id);
    setSelectedAnnotation(file.annotations[0] ?? null);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500">
            Annotated Interoperability Sources · 5 Modules
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Carbon &amp; C++20 Source Explorer
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Click any highlighted line with an annotation marker to inspect how Carbon imports
            C++ headers, enforces bounds via <code className="font-mono text-xs">SafeSlice</code>,
            and models errors with <code className="font-mono text-xs">choice</code> types.
          </p>
        </div>
      </div>

      {/* File Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {SOURCE_FILES.map((file) => {
          const isActive = file.id === activeFile.id;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => handleFileSwitch(file)}
              className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="font-mono">{file.filename}</span>
            </button>
          );
        })}
      </div>

      {/* Main Split: Code Pane (7 cols) + Line Annotations Deck (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Code Viewport */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-mono font-semibold text-white">{activeFile.filename}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{activeFile.languageLabel}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{activeFile.role}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => downloadSourceFile(activeFile)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Save File
              </button>
            </div>
          </div>

          <div className="overflow-x-auto py-3 font-mono text-xs leading-6">
            {lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const ann = annotationMap.get(lineNum);
              const isSelected = selectedAnnotation?.line === lineNum;
              return (
                <div
                  key={lineNum}
                  onClick={() => {
                    if (ann) setSelectedAnnotation(ann);
                  }}
                  className={`flex items-start px-4 transition-colors ${
                    ann ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-sky-500/15'
                      : ann
                        ? 'hover:bg-slate-900/90'
                        : ''
                  }`}
                >
                  <span className="w-9 shrink-0 select-none text-right pr-3 text-slate-600 tabular-nums">
                    {lineNum}
                  </span>
                  <span className="w-5 shrink-0 select-none flex items-center justify-center pt-1">
                    {ann && (
                      <Info
                        className={`h-3.5 w-3.5 ${
                          isSelected ? 'text-sky-400' : 'text-slate-500'
                        }`}
                        aria-label={`Annotation on line ${lineNum}`}
                      />
                    )}
                  </span>
                  <pre className="flex-1 whitespace-pre text-slate-200">
                    {renderHighlightedLine(lineText, activeFile.language)}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>

        {/* Annotation & Summary Deck */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-xs font-medium text-slate-500">{activeFile.role}</div>
            <h2 className="text-base font-semibold text-slate-900">{activeFile.filename}</h2>
            <p className="text-xs leading-relaxed text-slate-600">{activeFile.summary}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Line Annotations</h3>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {activeFile.annotations.length} notes
              </span>
            </div>

            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {activeFile.annotations.map((ann) => {
                const isSelected = selectedAnnotation?.line === ann.line;
                return (
                  <button
                    key={ann.line}
                    type="button"
                    onClick={() => setSelectedAnnotation(ann)}
                    className={`w-full py-3 px-2.5 text-left rounded-lg transition-colors ${
                      isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          isSelected ? 'text-sky-900' : 'text-slate-900'
                        }`}
                      >
                        {ann.concept}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums shrink-0">
                        Line {ann.line}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {ann.explanation}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
