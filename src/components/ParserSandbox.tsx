import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  buildPresetScenarios,
  bytesToAscii,
  bytesToHexString,
  encodeCrbnContainer,
  formatHexByte,
  formatHexU32,
  parseHexString,
  simulateCarbonParser,
  type ByteHighlight,
} from '../engine/parserSimulator';

interface ParserSandboxProps {
  onOpenSourceFile: (fileId: string) => void;
}

export function ParserSandbox({ onOpenSourceFile }: ParserSandboxProps) {
  const presets = useMemo(() => buildPresetScenarios(), []);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0].id);
  const [activeBytes, setActiveBytes] = useState<Uint8Array>(presets[0].bytes);
  const [hexDraft, setHexDraft] = useState<string>(() => bytesToHexString(presets[0].bytes));
  const [hexError, setHexError] = useState<string | null>(null);
  const [editingHex, setEditingHex] = useState<boolean>(false);

  // Custom chunk encoder state
  const [customTag, setCustomTag] = useState<string>('META');
  const [customPayload, setCustomPayload] = useState<string>('hello-carbon');
  const [showBuilder, setShowBuilder] = useState<boolean>(false);

  // Step-through playback state
  const simulation = useMemo(() => simulateCarbonParser(activeBytes), [activeBytes]);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Selected byte for single-byte bit flip / inspection
  const [selectedByteIndex, setSelectedByteIndex] = useState<number | null>(null);

  useEffect(() => {
    setStepIndex(simulation.steps.length - 1);
    setIsPlaying(false);
  }, [simulation.steps.length, activeBytes]);

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= simulation.steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepIndex((prev) => Math.min(prev + 1, simulation.steps.length - 1));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [isPlaying, stepIndex, simulation.steps.length]);

  const currentStep = simulation.steps[Math.min(stepIndex, simulation.steps.length - 1)];

  const handleSelectPreset = (presetId: string) => {
    const found = presets.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setActiveBytes(found.bytes);
    setHexDraft(bytesToHexString(found.bytes));
    setHexError(null);
    setSelectedByteIndex(null);
    setEditingHex(false);
  };

  const handleApplyHex = () => {
    const parsed = parseHexString(hexDraft);
    if (!parsed) {
      setHexError('Enter an even number of valid hexadecimal characters (0-9, A-F).');
      return;
    }
    setHexError(null);
    setSelectedPresetId('custom');
    setActiveBytes(parsed);
    setHexDraft(bytesToHexString(parsed));
    setEditingHex(false);
    setSelectedByteIndex(null);
  };

  const handleEncodeCustom = () => {
    const encoded = encodeCrbnContainer([
      {
        tag: customTag.trim() || 'DATA',
        payloadText: customPayload,
      },
    ]);
    setSelectedPresetId('custom');
    setActiveBytes(encoded);
    setHexDraft(bytesToHexString(encoded));
    setHexError(null);
    setShowBuilder(false);
    setSelectedByteIndex(null);
  };

  const handleFlipByte = (idx: number, delta: number) => {
    const next = new Uint8Array(activeBytes);
    next[idx] = (next[idx] + delta) & 0xff;
    setSelectedPresetId('custom');
    setActiveBytes(next);
    setHexDraft(bytesToHexString(next));
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (stepIndex >= simulation.steps.length - 1) {
      setStepIndex(0);
    }
    setIsPlaying(true);
  };

  const getByteHighlightStyle = (index: number, highlight: ByteHighlight | null) => {
    const isSelected = selectedByteIndex === index;
    const inHighlight = highlight && index >= highlight.start && index < highlight.end;

    if (inHighlight) {
      if (highlight.kind === 'fault') {
        return isSelected
          ? 'bg-red-600 text-white ring-2 ring-red-400'
          : 'bg-red-500/20 text-red-200 border border-red-500/50';
      }
      if (highlight.kind === 'payload') {
        return isSelected
          ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
          : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40';
      }
      return isSelected
        ? 'bg-sky-600 text-white ring-2 ring-sky-400'
        : 'bg-sky-500/20 text-sky-200 border border-sky-500/40';
    }

    return isSelected
      ? 'bg-slate-700 text-white ring-2 ring-sky-400'
      : 'text-slate-300 hover:bg-slate-800 border border-transparent';
  };

  // Group bytes into 16-byte rows for classic memory inspector alignment
  const byteRows = useMemo(() => {
    const rows: Array<{ offset: number; bytes: number[] }> = [];
    for (let i = 0; i < activeBytes.length; i += 16) {
      rows.push({
        offset: i,
        bytes: Array.from(activeBytes.slice(i, i + 16)),
      });
    }
    return rows;
  }, [activeBytes]);

  return (
    <div className="space-y-8">
      {/* Section Header + Scenario Selector */}
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500">
            Interactive Interop Stage · C++20 FileBuffer to Carbon SafeSlice
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Memory-Safe Binary Chunk Parser
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Inspect how Carbon wraps a raw C++ buffer pointer into a bounds-checked{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-900">
              SafeSlice(u8)
            </code>{' '}
            to trap overreads, integer wraparounds, and corrupted CRC-32 frames.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowBuilder((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Encode Custom Chunk
          </button>
          <button
            type="button"
            onClick={() => onOpenSourceFile('chunk_parser_carbon')}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            View Parser Source
          </button>
        </div>
      </section>

      {/* Preset Test Vectors Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {presets.map((preset) => {
          const isActive = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              className={`flex flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-all ${
                isActive
                  ? 'border-sky-600 bg-white shadow-sm ring-1 ring-sky-600'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span
                    className={`font-medium ${
                      preset.category === 'Nominal'
                        ? 'text-emerald-700'
                        : preset.category === 'Bounds Trap' || preset.category === 'Overflow Trap'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {preset.category}
                  </span>
                  <span className="font-mono tabular-nums">{preset.bytes.length} B</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 leading-snug">
                  {preset.title}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 line-clamp-2">{preset.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Custom Payload Builder Drawer */}
      {showBuilder && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-36">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                4-Byte Tag
              </label>
              <input
                type="text"
                maxLength={4}
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="META"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                UTF-8 Payload String
              </label>
              <input
                type="text"
                value={customPayload}
                onChange={(e) => setCustomPayload(e.target.value)}
                placeholder="Enter payload text..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleEncodeCustom}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
              >
                Encode with CRC-32
              </button>
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Zone Sandbox Stage (Left 65% Stage / Right 35% Control & Safety Deck) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Zone: Hex Memory Map + Execution Trace + Parsed Chunks */}
        <div className="space-y-6 lg:col-span-7">
          {/* Memory Buffer Hex Map */}
          <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-white">C++ FileBuffer Memory Map</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {activeBytes.length} bytes
                </span>
                {currentStep?.highlight && (
                  <>
                    <span className="text-slate-500">·</span>
                    <span
                      className={
                        currentStep.highlight.kind === 'fault'
                          ? 'text-red-400 font-medium'
                          : currentStep.highlight.kind === 'payload'
                            ? 'text-emerald-400 font-medium'
                            : 'text-sky-400 font-medium'
                      }
                    >
                      {currentStep.highlight.label} [{currentStep.highlight.start}..
                      {currentStep.highlight.end})
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingHex((v) => !v);
                  setHexDraft(bytesToHexString(activeBytes));
                  setHexError(null);
                }}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {editingHex ? 'Close Hex Editor' : 'Edit Raw Hex'}
              </button>
            </div>

            {editingHex ? (
              <div className="p-4 space-y-3 bg-slate-900">
                <textarea
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  spellCheck={false}
                />
                {hexError && <p className="text-xs text-red-400">{hexError}</p>}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    Space-separated hex bytes. Corrupt any byte to test Carbon traps.
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyHex}
                    className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                  >
                    Apply Hex Buffer
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <div className="min-w-[540px] space-y-1.5 font-mono text-xs">
                  <div className="flex items-center gap-4 pb-1.5 text-slate-500 border-b border-slate-800/80">
                    <span className="w-14 shrink-0">Offset</span>
                    <span className="flex-1">Hex Bytes (Click a byte to inspect or mutate)</span>
                    <span className="w-32 shrink-0 text-right">ASCII</span>
                  </div>

                  {byteRows.map((row) => (
                    <div key={row.offset} className="flex items-center gap-4">
                      <span className="w-14 shrink-0 text-slate-500 tabular-nums">
                        {row.offset.toString(16).toUpperCase().padStart(4, '0')}
                      </span>
                      <div className="flex flex-1 flex-wrap gap-1">
                        {row.bytes.map((byteVal, col) => {
                          const idx = row.offset + col;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                setSelectedByteIndex((prev) => (prev === idx ? null : idx))
                              }
                              title={`Offset ${idx} (0x${idx.toString(16).toUpperCase()}): 0x${formatHexByte(byteVal)} (${byteVal})`}
                              className={`w-6 rounded px-0.5 py-0.5 text-center transition-colors tabular-nums ${getByteHighlightStyle(
                                idx,
                                currentStep?.highlight ?? null
                              )}`}
                            >
                              {formatHexByte(byteVal)}
                            </button>
                          );
                        })}
                      </div>
                      <span className="w-32 shrink-0 text-right text-slate-400 tracking-wider">
                        {bytesToAscii(new Uint8Array(row.bytes))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Byte Micro-Inspector */}
            {selectedByteIndex !== null && selectedByteIndex < activeBytes.length && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-3 font-mono text-slate-300 tabular-nums">
                  <span>Byte [{selectedByteIndex}]</span>
                  <span className="text-slate-600">·</span>
                  <span>Hex: 0x{formatHexByte(activeBytes[selectedByteIndex])}</span>
                  <span className="text-slate-600">·</span>
                  <span>Dec: {activeBytes[selectedByteIndex]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFlipByte(selectedByteIndex, 1)}
                    className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                  >
                    +1 Byte
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlipByte(selectedByteIndex, 0x20)}
                    className="rounded border border-amber-700/60 bg-amber-950/50 px-2.5 py-1 font-medium text-amber-200 hover:bg-amber-900/50 whitespace-nowrap shrink-0"
                  >
                    Corrupt (+0x20)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step-by-Step Playback Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Parser Execution Trace
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  Step {stepIndex + 1} of {simulation.steps.length} ·{' '}
                  {simulation.status === 'valid' ? 'All checks passed' : `Trapped ${simulation.errorCode}`}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex(0);
                  }}
                  aria-label="Reset trace to step 1"
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex((i) => Math.max(0, i - 1));
                  }}
                  disabled={stepIndex === 0}
                  aria-label="Previous step"
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handlePlayToggle}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Step Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setStepIndex((i) => Math.min(simulation.steps.length - 1, i + 1));
                  }}
                  disabled={stepIndex >= simulation.steps.length - 1}
                  aria-label="Next step"
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Step list */}
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {simulation.steps.map((step, idx) => {
                const isActive = idx === stepIndex;
                return (
                  <button
                    key={step.stepNumber}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setStepIndex(idx);
                    }}
                    className={`w-full flex items-start justify-between gap-4 py-3 px-2 text-left transition-colors rounded-lg ${
                      isActive ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 shrink-0">
                        {step.outcome === 'ok' ? (
                          <CheckCircle2
                            className="h-4 w-4 text-emerald-600"
                            aria-hidden="true"
                          />
                        ) : step.outcome === 'trapped_error' ? (
                          <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900">
                          {step.phase}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium whitespace-nowrap ${
                        step.outcome === 'ok'
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {step.outcome === 'ok' ? 'Safe' : 'Trapped'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Zone: Safety Outcome, Active Carbon Statement, Registers & Parsed Output */}
        <div className="space-y-6 lg:col-span-5">
          {/* Overall Parser Verdict */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-500">
                  Carbon Result(ChunkRecord, ParseError)
                </div>
                <div className="flex items-center gap-2">
                  {simulation.status === 'valid' ? (
                    <>
                      <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      <h2 className="text-base font-bold text-emerald-700">
                        .Ok — {simulation.chunks.length} Verified Chunk
                        {simulation.chunks.length === 1 ? '' : 's'}
                      </h2>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                      <h2 className="text-base font-bold text-red-700">
                        .Err(.{simulation.errorCode})
                      </h2>
                    </>
                  )}
                </div>
              </div>
            </div>

            {simulation.errorDetail && (
              <p className="text-xs leading-relaxed text-slate-700">
                {simulation.errorDetail}
              </p>
            )}

            {/* Active Carbon Statement for Current Step */}
            {currentStep && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700">
                  Active Carbon Expression
                </div>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-sky-300">
                  <code>{currentStep.carbonLine}</code>
                </pre>

                {/* Carbon vs Unsafe C++ Contrast */}
                <div className="grid grid-cols-1 gap-3 pt-1">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Carbon SafeSlice Behavior
                    </div>
                    <p className="text-xs text-emerald-950 leading-relaxed">
                      {currentStep.carbonResult}
                    </p>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Unsafe Legacy C++ Contrast
                    </div>
                    <p className="text-xs text-red-950 leading-relaxed">
                      {currentStep.unsafeCppResult}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Variable / Register Inspector */}
          {currentStep && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Step State &amp; Slice Bounds
              </h3>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {currentStep.registers.map((reg) => (
                  <div
                    key={reg.name}
                    className="flex items-center justify-between gap-4 py-2 text-xs"
                  >
                    <span className="font-mono text-slate-600">{reg.name}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">
                      {reg.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Chunks Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Decoded Chunk Records</h3>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {simulation.chunks.length} emitted
              </span>
            </div>

            {simulation.chunks.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No verified chunks emitted. Parser trapped a safety fault before completing a
                chunk frame.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {simulation.chunks.map((chunk) => (
                  <div key={chunk.index} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-900">
                        Chunk #{chunk.index + 1} · "{chunk.tag}"
                      </span>
                      <span
                        className={`font-medium ${
                          chunk.crcValid ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {chunk.crcValid ? 'CRC-32 Verified' : 'CRC-32 Failed'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                      <span>Length: {chunk.declaredLength} B</span>
                      <span>CRC: {formatHexU32(chunk.computedCrc)}</span>
                    </div>
                    <div className="rounded bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 break-all">
                      {chunk.payloadAscii || '(empty)'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
