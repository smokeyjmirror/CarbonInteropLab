import { useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { DRILL_QUESTIONS } from '../data/carbonSources';

export function SyntaxDrill() {
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const answeredCount = Object.keys(answers).length;
  const correctCount = DRILL_QUESTIONS.filter(
    (q) => answers[q.id] === q.correctIndex
  ).length;

  const handleSelectOption = (questionId: string, optionIdx: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx,
    }));
  };

  const handleReset = () => {
    setAnswers({});
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500">
            Self-Check · Carbon Syntax &amp; Memory Safety
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Carbon Interop Concept Drill
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Verify your grasp of Carbon’s C++ import model, checked generics, receiver
            mutability, and bounds-safe slice mechanics.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">Progress</div>
            <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
              {correctCount} / {DRILL_QUESTIONS.length} correct ({answeredCount} answered)
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={answeredCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Drill
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {DRILL_QUESTIONS.map((q, qIdx) => {
          const chosen = answers[q.id];
          const hasAnswered = chosen !== undefined;
          const isCorrect = chosen === q.correctIndex;

          return (
            <div
              key={q.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Question {qIdx + 1} · {q.topic}
                  </span>
                  {hasAnswered && (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        isCorrect ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Correct
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          Review
                        </>
                      )}
                    </span>
                  )}
                </div>

                <h2 className="text-sm font-semibold leading-snug text-slate-900">
                  {q.prompt}
                </h2>

                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-sky-200">
                  <code>{q.codeSnippet}</code>
                </pre>

                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = chosen === optIdx;
                    const isRightAnswer = optIdx === q.correctIndex;

                    let btnClass =
                      'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
                    if (hasAnswered) {
                      if (isRightAnswer) {
                        btnClass =
                          'border-emerald-500 bg-emerald-50 text-emerald-950 font-medium';
                      } else if (isSelected) {
                        btnClass = 'border-red-400 bg-red-50 text-red-950';
                      } else {
                        btnClass = 'border-slate-200 bg-white text-slate-400';
                      }
                    }

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectOption(q.id, optIdx)}
                        className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-xs leading-relaxed transition-colors ${btnClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {hasAnswered && (
                <div className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-900">Explanation: </span>
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
