/**
 * Converts raw problem description text into structured Markdown.
 *
 * If the content already contains Markdown headings (## / ###) or fenced code
 * blocks it is returned as-is.  Otherwise we try to detect common section
 * markers used by Chinese OJ problem statements and inject proper headings.
 */

const SECTION_PATTERNS: Array<{ regex: RegExp; heading: string }> = [
  { regex: /^(?:题目描述|题目背景|Description|Background)\s*[:：]?$/im, heading: '## 题目描述' },
  { regex: /^(?:输入格式|输入描述|输入说明|Input)\s*[:：]?$/im, heading: '## 输入格式' },
  { regex: /^(?:输出格式|输出描述|输出说明|Output)\s*[:：]?$/im, heading: '## 输出格式' },
  { regex: /^(?:样例输入|Sample Input|Input #\d+)\s*[:：]?$/im, heading: '## 样例输入' },
  { regex: /^(?:样例输出|Sample Output|Output #\d+)\s*[:：]?$/im, heading: '## 样例输出' },
  { regex: /^(?:数据范围|数据规模|约束|Constraints|Limits|Range)\s*[:：]?$/im, heading: '## 数据范围' },
  { regex: /^(?:说明|提示|Note|Notes|Hint)\s*[:：]?$/im, heading: '## 说明' },
];

/**
 * If the description already contains Markdown structure (## headings or
 * fenced code blocks) we trust it and return unchanged.
 */
function looksLikeMarkdown(text: string): boolean {
  return /^#{1,3}\s/m.test(text) || /```/.test(text);
}

/**
 * Wrap detected sample I/O blocks into a fenced code block so they render
 * with the proper code-block style.
 */
function wrapSampleBlocks(md: string): string {
  // For each section heading, wrap the content until the next heading
  // in a <div> so that we can style sample blocks differently.
  // Instead, we handle this via CSS classes applied in the component.
  return md;
}

/**
 * Main entry: convert raw text → structured Markdown.
 */
export function toProblemMarkdown(raw: string): string {
  if (!raw) return '';

  if (looksLikeMarkdown(raw)) {
    return raw;
  }

  const lines = raw.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;

    for (const { regex, heading } of SECTION_PATTERNS) {
      if (regex.test(trimmed)) {
        out.push('');
        out.push(heading);
        out.push('');
        matched = true;
        break;
      }
    }

    if (!matched) {
      out.push(line);
    }
  }

  return wrapSampleBlocks(out.join('\n'));
}
