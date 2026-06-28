import type { GeneratedFile } from '@repotune/schemas';

export function render(file: GeneratedFile, currentContent: string | null): string {
  const { strategy, content } = file;

  if (strategy === 'create' || strategy === 'overwrite') return content;
  if (strategy === 'skip') return currentContent ?? '';

  // managed-block
  const m = file.managedBlockMarker!;
  const block = `${m.start}\n${content}\n${m.end}`;

  if (currentContent === null) return block;

  const si = currentContent.indexOf(m.start);
  const ei = currentContent.indexOf(m.end);

  if (si === -1 || ei === -1) return `${currentContent}\n${block}`;

  return currentContent.slice(0, si) + block + currentContent.slice(ei + m.end.length);
}
