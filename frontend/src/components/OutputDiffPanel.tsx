import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react';
import type { OutputDiffResult, LineDiffEntry } from '../lib/diff';
import { displayWhitespace, escapeHtml } from '../lib/diff';

interface OutputDiffPanelProps {
  diff: OutputDiffResult;
  maxInitialDiffs?: number;
}

export function OutputDiffPanel({ diff, maxInitialDiffs = 5 }: OutputDiffPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!diff.has_diff) return null;

  const diffLines = diff.line_diffs.filter((l) => l.is_different);
  const shownLines = expanded ? diffLines : diffLines.slice(0, maxInitialDiffs);
  const hasMore = diffLines.length > maxInitialDiffs;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/25 bg-amber-950/10">
      <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <span>{'输出差异'}</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
            {`第 ${diff.first_diff_line} 行起`}
          </span>
          <span className="text-xs text-amber-400/70">
            {`共 ${diffLines.length} 行不同`}
          </span>
        </div>
        {diff.normalized_equal && (
          <span className="flex items-center gap-1 text-xs text-emerald-300">
            <Info className="h-3.5 w-3.5" />
            {'仅空白字符不同'}
          </span>
        )}
      </div>

      <div className="divide-y divide-border/30">
        {shownLines.map((line) => (
          <DiffLineRow key={line.line_no} line={line} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-amber-500/20 bg-amber-950/10 px-4 py-2 text-xs text-amber-300 transition hover:bg-amber-950/20"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              {'收起差异'}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              {`展开全部 ${diffLines.length} 行差异`}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: LineDiffEntry }) {
  return (
    <div className="px-4 py-2">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded border px-1.5 py-0.5 font-mono text-foreground">
          {`行 ${line.line_no}`}
        </span>
      </div>

      {line.expected !== null && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-16 shrink-0 text-right text-xs font-medium" style={{ color: 'var(--status-wa)' }}>{'期望'}</span>
          <pre
            className="min-w-0 flex-1 rounded border px-3 py-1.5 font-mono text-xs leading-5"
            dangerouslySetInnerHTML={{ __html: renderExpectedLine(line) }}
          />
        </div>
      )}

      {line.actual !== null && (
        <div className="mt-1 flex items-start gap-2">
          <span className="mt-0.5 w-16 shrink-0 text-right text-xs font-medium text-primary">{'实际'}</span>
          <pre
            className="min-w-0 flex-1 rounded border px-3 py-1.5 font-mono text-xs leading-5"
            dangerouslySetInnerHTML={{ __html: renderActualLine(line) }}
          />
        </div>
      )}

      {line.expected === null && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-16 shrink-0 text-right text-xs font-medium text-muted-foreground">{'期望'}</span>
          <pre className="min-w-0 flex-1 rounded border border-border/30 bg-card/30 px-3 py-1.5 font-mono text-xs leading-5 text-muted-foreground italic">{'<无此行>'}</pre>
        </div>
      )}

      {line.actual === null && (
        <div className="mt-1 flex items-start gap-2">
          <span className="mt-0.5 w-16 shrink-0 text-right text-xs font-medium text-muted-foreground">{'实际'}</span>
          <pre className="min-w-0 flex-1 rounded border border-border/30 bg-card/30 px-3 py-1.5 font-mono text-xs leading-5 text-muted-foreground italic">{'<无此行>'}</pre>
        </div>
      )}
    </div>
  );
}

function renderExpectedLine(line: LineDiffEntry): string {
  if (!line.char_diff || line.char_diff.length === 0) {
    return escapeHtml(displayWhitespace(line.expected ?? ''));
  }

  const parts: string[] = [];
  for (const entry of line.char_diff) {
    const text = displayWhitespace(entry.text || entry.expected || '');
    const escaped = escapeHtml(text);
    if (entry.type === 'equal') {
      parts.push(escaped);
    } else if (entry.type === 'delete') {
      parts.push(`<mark class="diff-highlight-del">${escaped}</mark>`);
    } else if (entry.type === 'replace') {
      const repText = displayWhitespace(entry.expected || '');
      parts.push(`<mark class="diff-highlight-del">${escapeHtml(repText)}</mark>`);
    }
  }
  return parts.join('');
}

function renderActualLine(line: LineDiffEntry): string {
  if (!line.char_diff || line.char_diff.length === 0) {
    return escapeHtml(displayWhitespace(line.actual ?? ''));
  }

  const parts: string[] = [];
  for (const entry of line.char_diff) {
    const text = displayWhitespace(entry.text || entry.actual || '');
    const escaped = escapeHtml(text);
    if (entry.type === 'equal') {
      parts.push(escaped);
    } else if (entry.type === 'insert') {
      parts.push(`<mark class="diff-highlight-ins">${escaped}</mark>`);
    } else if (entry.type === 'replace') {
      const repText = displayWhitespace(entry.actual || '');
      parts.push(`<mark class="diff-highlight-ins">${escapeHtml(repText)}</mark>`);
    }
  }
  return parts.join('');
}
