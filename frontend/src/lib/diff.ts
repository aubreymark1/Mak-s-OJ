export interface CharDiffEntry {
  type: 'equal' | 'insert' | 'delete' | 'replace';
  text?: string;
  expected?: string;
  actual?: string;
}

export interface LineDiffEntry {
  line_no: number;
  expected: string | null;
  actual: string | null;
  is_different: boolean;
  char_diff?: CharDiffEntry[];
}

export interface OutputDiffResult {
  has_diff: boolean;
  first_diff_line: number | null;
  normalized_equal: boolean;
  line_diffs: LineDiffEntry[];
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

function charDiff(expected: string, actual: string): CharDiffEntry[] {
  if (!expected && !actual) return [];
  if (expected.length > 300 || actual.length > 300) {
    return [{ type: 'replace', expected, actual }];
  }

  const ea = Array.from(expected);
  const aa = Array.from(actual);
  const dp = lcsTable(ea, aa);
  const raw: CharDiffEntry[] = [];
  let i = ea.length;
  let j = aa.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ea[i - 1] === aa[j - 1]) {
      raw.push({ type: 'equal', text: ea[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'insert', text: aa[j - 1] });
      j--;
    } else {
      raw.push({ type: 'delete', text: ea[i - 1] });
      i--;
    }
  }

  raw.reverse();

  const merged: CharDiffEntry[] = [];
  for (const item of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === item.type && (item.type === 'equal' || item.type === 'insert' || item.type === 'delete')) {
      last.text = (last.text || '') + (item.text || '');
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export function buildOutputDiff(expected: string, actual: string): OutputDiffResult {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const normalizedEqual = expected.trim() === actual.trim();

  const lineDiffs: LineDiffEntry[] = [];
  const maxLines = Math.max(expLines.length, actLines.length);
  let firstDiffLine: number | null = null;

  for (let idx = 0; idx < maxLines; idx++) {
    const expLine = idx < expLines.length ? expLines[idx] : null;
    const actLine = idx < actLines.length ? actLines[idx] : null;
    const isDifferent = expLine !== actLine;

    if (isDifferent && firstDiffLine === null) {
      firstDiffLine = idx + 1;
    }

    const entry: LineDiffEntry = {
      line_no: idx + 1,
      expected: expLine,
      actual: actLine,
      is_different: isDifferent,
    };

    if (isDifferent && expLine !== null && actLine !== null) {
      entry.char_diff = charDiff(expLine, actLine);
    }

    lineDiffs.push(entry);
  }

  return {
    has_diff: firstDiffLine !== null,
    first_diff_line: firstDiffLine,
    normalized_equal: normalizedEqual,
    line_diffs: lineDiffs,
  };
}

export function displayWhitespace(str: string | null): string {
  if (str === null || str === undefined) return '<null>';
  if (str === '') return '<empty>';
  return str
    .replace(/ /g, '\u00b7')
    .replace(/\t/g, '\u2192')
    .replace(/\r\n/g, '\u21b5\n')
    .replace(/\r/g, '\u21b5\n');
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
