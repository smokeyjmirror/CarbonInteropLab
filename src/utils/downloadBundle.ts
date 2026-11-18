import { SOURCE_FILES, type SourceFile } from '../data/carbonSources';

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSourceFile(file: SourceFile): void {
  downloadTextFile(file.filename, file.code + '\n');
}

export function downloadFullBundle(): void {
  const header = [
    '# Carbon + C++20 Interoperability Safe File Parser Bundle',
    '# Generated from Carbon Interop Lab',
    '# Files included:',
    ...SOURCE_FILES.map((f) => `#   - ${f.filename} (${f.languageLabel})`),
    '',
  ].join('\n');

  const body = SOURCE_FILES.map(
    (file) =>
      `========================================================================\nFILE: ${file.filename}\nROLE: ${file.role}\n========================================================================\n${file.code}\n`
  ).join('\n');

  downloadTextFile('carbon_safe_parser_bundle.txt', header + '\n' + body);
}
