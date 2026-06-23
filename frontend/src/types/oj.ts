export type Difficulty = 'Easy' | 'Medium' | 'Hard' | string;

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_admin: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ProblemListItem {
  id: number;
  slug: string;
  title: string;
  difficulty?: Difficulty | null;
  tags: string[];
  user_status?: 'AC' | 'Attempted' | null;
  created_at: string;
  updated_at: string;
}

export interface ProblemListResponse {
  items: ProblemListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface JudgeCase {
  input: string;
  expected_output?: string;
  output?: string;
  explanation?: string;
}

export interface ProblemDetail {
  id: number;
  slug: string;
  title: string;
  difficulty?: Difficulty | null;
  tags: string[];
  description: string;
  template_files: Record<string, string>;
  readonly_files?: string[] | null;
  time_limit_ms: number;
  memory_limit_kb: number;
  judge_cases: JudgeCase[];
  created_at: string;
  updated_at: string;
}

export type SubmissionStatus = 'Pending' | 'Judging' | 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'System Error';

export interface SubmissionResponse {
  id: number;
  user_id: number;
  problem_id: number;
  code: Record<string, string>;
  status: SubmissionStatus;
  runtime_ms?: number | null;
  memory_kb?: number | null;
  error_log?: string | null;
  compiler_output?: string | null;
  judge_result?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProblemSubmissionHistoryItem {
  id: number;
  problem_id: number;
  user_id: number;
  code: Record<string, string>;
  status: SubmissionStatus;
  created_at: string;
  updated_at: string;
}

export interface SubmissionQueued {
  submission_id: number;
  status: SubmissionStatus;
}

export interface RunExecutionResponse {
  output?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  actual_output?: string | null;
  run_output?: string | null;
  message?: string | null;
  detail?: string | null;
  result?: Record<string, unknown> | null;
  compile?: Record<string, unknown> | null;
  files?: Record<string, unknown> | null;
  diff?: OutputDiff | null;
}

export interface OutputDiff {
  first_diff_index: number;
  line: number;
  column: number;
  expected_char: string | null;
  actual_char: string | null;
  expected_display: string;
  actual_display: string;
  message: string;
}

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

export interface UserStatsResponse {
  user_id: number;
  total_submissions: number;
  ac_count: number;
  attempted_problems: number;
  ac_problems: number;
  ac_rate: number;
}

// ── Admin Types ──────────────────────────────────────────────────────────────

export interface AdminProblemListItem {
  id: number;
  slug: string;
  title: string;
  difficulty?: Difficulty | null;
  tags: string[];
  has_fuzz: boolean;
  judge_case_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminProblemListResponse {
  items: AdminProblemListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminProblemDetail {
  id: number;
  slug: string;
  title: string;
  difficulty?: Difficulty | null;
  tags: string[];
  statement_markdown: string;
  template_files: Record<string, string>;
  readonly_files: string[];
  time_limit_ms: number;
  memory_limit_kb: number;
  judge_cases: JudgeCase[];
  generator_code: string | null;
  std_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminProblemPayload {
  slug: string;
  title: string;
  statement_markdown: string;
  difficulty?: string | null;
  tags: string[];
  template_files: Record<string, string>;
  readonly_files: string[];
  time_limit_ms: number;
  memory_limit_kb: number;
  judge_cases: JudgeCase[];
  generator_code?: string | null;
  std_code?: string | null;
}
