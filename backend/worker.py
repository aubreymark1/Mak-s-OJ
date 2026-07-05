from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from billiard.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from celery_app import celery_app
from config import JUDGE_CORE_URL, JUDGE_REQUEST_TIMEOUT_SECONDS
from database import AsyncSessionLocal
from models import Problem, Submission, SubmissionStatus

COMPILE_BINARY_NAME = "main"
FUZZ_GENERATOR_BINARY = "generator"
FUZZ_STD_BINARY = "std"
FUZZ_ROUNDS = 10
COMPILE_TIMEOUT_NS = 15 * 1_000_000_000
COMPILE_MEMORY_BYTES = 512 * 1024 * 1024
COLLECTOR_LIMIT_BYTES = 128 * 1024
HTTP_TIMEOUT = httpx.Timeout(
    connect=min(5.0, JUDGE_REQUEST_TIMEOUT_SECONDS),
    read=JUDGE_REQUEST_TIMEOUT_SECONDS,
    write=min(10.0, JUDGE_REQUEST_TIMEOUT_SECONDS),
    pool=5.0,
)
COMPILE_ERROR_STATUSES = {"Nonzero Exit Status", "Signalled"}
RUNTIME_ERROR_STATUSES = {"Nonzero Exit Status", "Signalled", "Dangerous Syscall", "Output Limit Exceeded"}
SYSTEM_ERROR_STATUSES = {"Internal Error", "File Error"}
CHAR_DIFF_THRESHOLD = 300
MAX_DIFF_LINES = 5
logger = logging.getLogger(__name__)


def _lcs_table(a: list[str], b: list[str]) -> list[list[int]]:
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp


def _char_diff(expected: str, actual: str) -> list[dict[str, Any]]:
    if not expected and not actual:
        return []
    if len(expected) > CHAR_DIFF_THRESHOLD or len(actual) > CHAR_DIFF_THRESHOLD:
        return [{"type": "replace", "expected": expected, "actual": actual}]

    ea = list(expected)
    aa = list(actual)
    dp = _lcs_table(ea, aa)
    result: list[dict[str, Any]] = []
    i, j = len(ea), len(aa)

    while i > 0 or j > 0:
        if i > 0 and j > 0 and ea[i - 1] == aa[j - 1]:
            result.append({"type": "equal", "text": ea[i - 1]})
            i -= 1
            j -= 1
        elif j > 0 and (i == 0 or dp[i][j - 1] >= dp[i - 1][j]):
            result.append({"type": "insert", "text": aa[j - 1]})
            j -= 1
        else:
            result.append({"type": "delete", "text": ea[i - 1]})
            i -= 1

    result.reverse()
    merged: list[dict[str, Any]] = []
    for item in result:
        if merged and merged[-1]["type"] == item["type"] and item["type"] in ("equal", "insert", "delete"):
            merged[-1]["text"] += item["text"]
        else:
            merged.append(dict(item))
    return merged


def build_output_diff(expected: str, actual: str) -> dict[str, Any]:
    exp_lines = expected.split("\n")
    act_lines = actual.split("\n")
    normalized_equal = expected.strip() == actual.strip()

    line_diffs: list[dict[str, Any]] = []
    max_lines = max(len(exp_lines), len(act_lines))
    first_diff_line: int | None = None

    for idx in range(max_lines):
        exp_line = exp_lines[idx] if idx < len(exp_lines) else None
        act_line = act_lines[idx] if idx < len(act_lines) else None
        is_different = exp_line != act_line

        if is_different and first_diff_line is None:
            first_diff_line = idx + 1

        entry: dict[str, Any] = {
            "line_no": idx + 1,
            "expected": exp_line,
            "actual": act_line,
            "is_different": is_different,
        }

        if is_different and exp_line is not None and act_line is not None:
            entry["char_diff"] = _char_diff(exp_line, act_line)

        line_diffs.append(entry)

    return {
        "has_diff": first_diff_line is not None,
        "first_diff_line": first_diff_line,
        "normalized_equal": normalized_equal,
        "line_diffs": line_diffs,
    }


@dataclass
class SubmissionContext:
    submission_id: int
    code: dict[str, str]
    time_limit_ms: int
    memory_limit_kb: int
    judge_cases: list[dict[str, str]]
    generator_code: str | None = None
    std_code: str | None = None


class JudgeSystemError(RuntimeError):
    pass


async def _load_submission_context(submission_id: int) -> SubmissionContext | None:
    async with AsyncSessionLocal() as session:
        stmt = (
            select(Submission)
            .options(selectinload(Submission.problem))
            .where(Submission.id == submission_id)
        )
        submission = (await session.execute(stmt)).scalar_one_or_none()
        if submission is None:
            return None

        problem = submission.problem
        if problem is None:
            raise JudgeSystemError("Submission is missing its problem relation.")

        return SubmissionContext(
            submission_id=submission.id,
            code=dict(submission.code or {}),
            time_limit_ms=problem.time_limit_ms,
            memory_limit_kb=problem.memory_limit_kb,
            judge_cases=list(problem.judge_cases or []),
            generator_code=problem.generator_code,
            std_code=problem.std_code,
        )


async def _update_submission(
    submission_id: int,
    *,
    status: SubmissionStatus,
    runtime_ms: int | None = None,
    memory_kb: int | None = None,
    compiler_output: str | None = None,
    judge_result: dict[str, Any] | None = None,
) -> None:
    async with AsyncSessionLocal() as session:
        submission = await session.get(Submission, submission_id)
        if submission is None:
            return

        submission.status = status
        submission.runtime_ms = runtime_ms
        submission.memory_kb = memory_kb
        submission.compiler_output = compiler_output
        submission.judge_result = judge_result
        await session.commit()


def _build_cpp_compile_command(code: dict[str, str], output_name: str = COMPILE_BINARY_NAME) -> list[str]:
    source_files = sorted(
        name
        for name in code
        if name.endswith((".cpp", ".cc", ".cxx", ".c"))
    )
    if not source_files:
        raise ValueError("No compilable C++ source file was supplied.")

    return [
        "/usr/bin/g++",
        "-std=c++17",
        "-O2",
        "-pipe",
        *source_files,
        "-o",
        output_name,
    ]


def _build_compile_request(code: dict[str, str], output_name: str = COMPILE_BINARY_NAME) -> dict[str, Any]:
    copy_in = {name: {"content": content} for name, content in code.items()}
    return {
        "cmd": [
            {
                "args": _build_cpp_compile_command(code, output_name),
                "env": ["PATH=/usr/bin:/bin"],
                "files": [
                    {"content": ""},
                    {"name": "stdout", "max": COLLECTOR_LIMIT_BYTES},
                    {"name": "stderr", "max": COLLECTOR_LIMIT_BYTES},
                ],
                "cpuLimit": COMPILE_TIMEOUT_NS,
                "clockLimit": COMPILE_TIMEOUT_NS,
                "memoryLimit": COMPILE_MEMORY_BYTES,
                "procLimit": 128,
                "copyIn": copy_in,
                "copyOut": ["stdout", "stderr"],
                "copyOutCached": [output_name],
            }
        ]
    }


def _build_run_request(
    binary_file_id: str,
    case: dict[str, str],
    *,
    time_limit_ms: int,
    memory_limit_kb: int,
) -> dict[str, Any]:
    cpu_limit_ns = max(time_limit_ms, 1) * 1_000_000
    clock_limit_ns = cpu_limit_ns * 2
    memory_limit_bytes = max(memory_limit_kb, 1) * 1024
    return {
        "cmd": [
            {
                "args": [f"./{COMPILE_BINARY_NAME}"],
                "env": ["PATH=/usr/bin:/bin"],
                "files": [
                    {"content": case.get("input", "")},
                    {"name": "stdout", "max": COLLECTOR_LIMIT_BYTES},
                    {"name": "stderr", "max": COLLECTOR_LIMIT_BYTES},
                ],
                "cpuLimit": cpu_limit_ns,
                "clockLimit": clock_limit_ns,
                "memoryLimit": memory_limit_bytes,
                "procLimit": 64,
                "copyIn": {
                    COMPILE_BINARY_NAME: {"fileId": binary_file_id},
                },
                "copyOut": ["stdout", "stderr"],
            }
        ]
    }


def _build_run_request_named(
    binary_file_id: str,
    binary_name: str,
    stdin: str,
    *,
    time_limit_ms: int,
    memory_limit_kb: int,
) -> dict[str, Any]:
    """Build a run request with a specific binary name (for fuzzing mode)."""
    cpu_limit_ns = max(time_limit_ms, 1) * 1_000_000
    clock_limit_ns = cpu_limit_ns * 2
    memory_limit_bytes = max(memory_limit_kb, 1) * 1024
    return {
        "cmd": [
            {
                "args": [f"./{binary_name}"],
                "env": ["PATH=/usr/bin:/bin"],
                "files": [
                    {"content": stdin},
                    {"name": "stdout", "max": COLLECTOR_LIMIT_BYTES},
                    {"name": "stderr", "max": COLLECTOR_LIMIT_BYTES},
                ],
                "cpuLimit": cpu_limit_ns,
                "clockLimit": clock_limit_ns,
                "memoryLimit": memory_limit_bytes,
                "procLimit": 64,
                "copyIn": {
                    binary_name: {"fileId": binary_file_id},
                },
                "copyOut": ["stdout", "stderr"],
            }
        ]
    }


def _normalize_output(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def _extract_stdout(result: dict[str, Any]) -> str:
    """Extract stdout from a judge-core run result."""
    files = result.get("files", {}) or {}
    return files.get("stdout", "") or ""


def _map_runtime_status(result: dict[str, Any], expected_output: str | None) -> SubmissionStatus:
    status = result.get("status")
    if status == "Accepted":
        if expected_output is None:
            return SubmissionStatus.AC
        actual_output = _normalize_output(result.get("files", {}).get("stdout", ""))
        if actual_output == _normalize_output(expected_output):
            return SubmissionStatus.AC
        return SubmissionStatus.WA
    if status == "Time Limit Exceeded":
        return SubmissionStatus.TLE
    if status == "Memory Limit Exceeded":
        return SubmissionStatus.MLE
    if status in RUNTIME_ERROR_STATUSES:
        return SubmissionStatus.RE
    if status in SYSTEM_ERROR_STATUSES:
        return SubmissionStatus.SYSTEM_ERROR
    return SubmissionStatus.SYSTEM_ERROR


def _map_compile_status(result: dict[str, Any]) -> SubmissionStatus:
    status = result.get("status")
    exit_status = result.get("exitStatus")
    if status == "Accepted" and exit_status == 0:
        return SubmissionStatus.AC
    if status in COMPILE_ERROR_STATUSES or exit_status not in (None, 0):
        return SubmissionStatus.CE
    if status in SYSTEM_ERROR_STATUSES:
        return SubmissionStatus.SYSTEM_ERROR
    return SubmissionStatus.SYSTEM_ERROR


async def _request_judge_run(client: httpx.AsyncClient, payload: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        response = await client.post(f"{JUDGE_CORE_URL}/run", json=payload)
        response.raise_for_status()
        data = response.json()
    except httpx.TimeoutException as exc:
        raise JudgeSystemError("judge-core request timed out") from exc
    except httpx.HTTPError as exc:
        raise JudgeSystemError(f"judge-core HTTP failure: {exc}") from exc
    except ValueError as exc:
        raise JudgeSystemError("judge-core returned invalid JSON") from exc

    if not isinstance(data, list) or not data:
        raise JudgeSystemError("judge-core returned an empty result set")
    return data


async def _delete_cached_file(client: httpx.AsyncClient, file_id: str) -> None:
    try:
        await client.delete(f"{JUDGE_CORE_URL}/file/{file_id}")
    except Exception:
        return


async def _compile_code(
    client: httpx.AsyncClient,
    code: dict[str, str],
    output_name: str = COMPILE_BINARY_NAME,
) -> tuple[dict[str, Any], str | None, str | None]:
    """Compile code and return (compile_result, compiler_output, binary_file_id)."""
    compile_results = await _request_judge_run(client, _build_compile_request(code, output_name))
    compile_result = compile_results[0]
    compile_files = compile_result.get("files", {}) or {}
    compiler_output = "\n".join(
        part
        for part in [compile_files.get("stdout", ""), compile_files.get("stderr", "")]
        if part
    ) or None

    if compile_result.get("error"):
        raise JudgeSystemError(str(compile_result["error"]))

    binary_file_id = (compile_result.get("fileIds") or {}).get(output_name)
    return compile_result, compiler_output, binary_file_id


async def run_code_playground(
    *,
    code: dict[str, str],
    stdin: str = "",
    time_limit_ms: int,
    memory_limit_kb: int,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        compile_result, compiler_output, binary_file_id = await _compile_code(client, code)
        compile_status = _map_compile_status(compile_result)
        if compile_status != SubmissionStatus.AC:
            compile_files = compile_result.get("files", {}) or {}
            return {
                "status": compile_status.value,
                "stdout": compile_files.get("stdout", "") or "",
                "stderr": compile_files.get("stderr", "") or "",
                "compiler_output": compiler_output,
                "detail": "Compilation failed.",
                "compile": compile_result,
                "result": None,
            }

        if not binary_file_id:
            raise JudgeSystemError("Compilation succeeded but no cached binary was returned.")

        try:
            run_results = await _request_judge_run(
                client,
                _build_run_request(
                    binary_file_id,
                    {"input": stdin},
                    time_limit_ms=time_limit_ms,
                    memory_limit_kb=memory_limit_kb,
                ),
            )
            run_result = run_results[0]
            run_files = run_result.get("files", {}) or {}
            status_text = str(run_result.get("status") or "Unknown")
            return {
                "status": status_text,
                "stdout": run_files.get("stdout", "") or "",
                "stderr": run_files.get("stderr", "") or "",
                "compiler_output": compiler_output,
                "detail": None if status_text == "Accepted" else f"Program finished with status: {status_text}",
                "compile": compile_result,
                "result": run_result,
            }
        finally:
            await _delete_cached_file(client, binary_file_id)


async def _judge_static_async(
    client: httpx.AsyncClient,
    context: SubmissionContext,
) -> tuple[SubmissionStatus, int | None, int | None, str | None, dict[str, Any]]:
    """Original static judge_cases pipeline."""
    compile_result, compiler_output, binary_file_id = await _compile_code(client, context.code)
    compile_status = _map_compile_status(compile_result)
    if compile_status != SubmissionStatus.AC:
        return (
            compile_status,
            None,
            None,
            compiler_output,
            {"phase": "compile", "result": compile_result},
        )

    if not binary_file_id:
        raise JudgeSystemError("Compilation succeeded but no cached binary was returned.")

    case_results: list[dict[str, Any]] = []
    final_status = SubmissionStatus.AC
    final_runtime_ms: int | None = None
    final_memory_kb: int | None = None
    try:
        cases = context.judge_cases or [{"input": "", "expected_output": None}]
        for case_index, case in enumerate(cases, start=1):
            run_results = await _request_judge_run(
                client,
                _build_run_request(
                    binary_file_id,
                    case,
                    time_limit_ms=context.time_limit_ms,
                    memory_limit_kb=context.memory_limit_kb,
                ),
            )
            run_result = run_results[0]
            mapped_status = _map_runtime_status(run_result, case.get("expected_output"))
            case_entry: dict[str, Any] = {
                "case_index": case_index,
                "status": mapped_status.value,
                "result": run_result,
            }
            if mapped_status == SubmissionStatus.WA:
                run_files = run_result.get("files", {}) or {}
                actual_out = _normalize_output(run_files.get("stdout", "") or "")
                expected_out = _normalize_output(case.get("expected_output") or "")
                case_entry["output_diff"] = build_output_diff(expected_out, actual_out)
            case_results.append(case_entry)
            final_runtime_ms = int((run_result.get("runTime") or 0) / 1_000_000)
            final_memory_kb = int((run_result.get("memory") or 0) / 1024)
            if mapped_status != SubmissionStatus.AC:
                final_status = mapped_status
                break

        return (
            final_status,
            final_runtime_ms,
            final_memory_kb,
            compiler_output,
            {
                "phase": "judge",
                "compile": compile_result,
                "cases": case_results,
            },
        )
    finally:
        await _delete_cached_file(client, binary_file_id)


async def _judge_fuzzing_async(
    client: httpx.AsyncClient,
    context: SubmissionContext,
) -> tuple[SubmissionStatus, int | None, int | None, str | None, dict[str, Any]]:
    """Dynamic fuzzing judge: compile user/generator/std, then stress-test N rounds."""
    assert context.generator_code is not None
    assert context.std_code is not None

    # --- Step A: Compile all three programs ---
    user_code = context.code
    gen_code = {"generator.cpp": context.generator_code}
    std_code_map = {"std.cpp": context.std_code}

    # Compile user code first — CE on failure
    user_compile, user_compiler_output, user_bin_id = await _compile_code(client, user_code, COMPILE_BINARY_NAME)
    user_compile_status = _map_compile_status(user_compile)
    if user_compile_status != SubmissionStatus.AC:
        return (
            user_compile_status,
            None,
            None,
            user_compiler_output,
            {"phase": "fuzz_compile_user", "result": user_compile},
        )

    # Compile generator
    gen_compile, gen_compiler_output, gen_bin_id = await _compile_code(client, gen_code, FUZZ_GENERATOR_BINARY)
    gen_compile_status = _map_compile_status(gen_compile)
    if gen_compile_status != SubmissionStatus.AC:
        # Generator fails to compile — this is a problem config error, fall back to static
        logger.warning("Generator compilation failed for submission %d, falling back to static judge", context.submission_id)
        await _cleanup_files(client, [gen_bin_id])
        return await _judge_static_fallback(client, context, user_bin_id, user_compiler_output, user_compile)

    # Compile std
    std_compile, std_compiler_output, std_bin_id = await _compile_code(client, std_code_map, FUZZ_STD_BINARY)
    std_compile_status = _map_compile_status(std_compile)
    if std_compile_status != SubmissionStatus.AC:
        logger.warning("Std compilation failed for submission %d, falling back to static judge", context.submission_id)
        await _cleanup_files(client, [gen_bin_id, std_bin_id])
        return await _judge_static_fallback(client, context, user_bin_id, user_compiler_output, user_compile)

    # --- Step B: Fuzzing loop ---
    fuzz_cases: list[dict[str, Any]] = []
    final_status = SubmissionStatus.AC
    final_runtime_ms: int | None = None
    final_memory_kb: int | None = None

    try:
        for round_idx in range(1, FUZZ_ROUNDS + 1):
            # B1: Run generator to get random stdin
            gen_results = await _request_judge_run(
                client,
                _build_run_request_named(
                    gen_bin_id,
                    FUZZ_GENERATOR_BINARY,
                    "",
                    time_limit_ms=context.time_limit_ms,
                    memory_limit_kb=context.memory_limit_kb,
                ),
            )
            gen_result = gen_results[0]
            gen_status = gen_result.get("status")
            if gen_status != "Accepted":
                # Generator crashed — treat as system error
                raise JudgeSystemError(f"Generator crashed on round {round_idx}: {gen_status}")

            random_input = _extract_stdout(gen_result)

            # B2: Run std to get expected output
            std_results = await _request_judge_run(
                client,
                _build_run_request_named(
                    std_bin_id,
                    FUZZ_STD_BINARY,
                    random_input,
                    time_limit_ms=context.time_limit_ms,
                    memory_limit_kb=context.memory_limit_kb,
                ),
            )
            std_result = std_results[0]
            std_run_status = std_result.get("status")
            if std_run_status != "Accepted":
                raise JudgeSystemError(f"Std crashed on round {round_idx}: {std_run_status}")

            expected_output = _extract_stdout(std_result)

            # B3: Run user code
            user_results = await _request_judge_run(
                client,
                _build_run_request_named(
                    user_bin_id,
                    COMPILE_BINARY_NAME,
                    random_input,
                    time_limit_ms=context.time_limit_ms,
                    memory_limit_kb=context.memory_limit_kb,
                ),
            )
            user_result = user_results[0]
            user_run_status = user_result.get("status")

            final_runtime_ms = int((user_result.get("runTime") or 0) / 1_000_000)
            final_memory_kb = int((user_result.get("memory") or 0) / 1024)

            # Map user runtime status
            if user_run_status == "Time Limit Exceeded":
                mapped_status = SubmissionStatus.TLE
            elif user_run_status == "Memory Limit Exceeded":
                mapped_status = SubmissionStatus.MLE
            elif user_run_status in RUNTIME_ERROR_STATUSES:
                mapped_status = SubmissionStatus.RE
            elif user_run_status in SYSTEM_ERROR_STATUSES:
                mapped_status = SubmissionStatus.SYSTEM_ERROR
            elif user_run_status == "Accepted":
                actual_output = _normalize_output(_extract_stdout(user_result))
                if actual_output == _normalize_output(expected_output):
                    mapped_status = SubmissionStatus.AC
                else:
                    mapped_status = SubmissionStatus.WA
            else:
                mapped_status = SubmissionStatus.SYSTEM_ERROR

            fuzz_case: dict[str, Any] = {
                "case_index": round_idx,
                "status": mapped_status.value,
                "input": random_input,
                "expected_output": expected_output,
                "actual_output": _extract_stdout(user_result),
                "result": user_result,
            }
            if mapped_status == SubmissionStatus.WA:
                actual_out = _normalize_output(_extract_stdout(user_result))
                expected_out = _normalize_output(expected_output)
                fuzz_case["output_diff"] = build_output_diff(expected_out, actual_out)
            fuzz_cases.append(fuzz_case)

            if mapped_status != SubmissionStatus.AC:
                final_status = mapped_status
                break

        return (
            final_status,
            final_runtime_ms,
            final_memory_kb,
            user_compiler_output,
            {
                "phase": "fuzz",
                "fuzz_rounds_total": FUZZ_ROUNDS,
                "fuzz_rounds_executed": len(fuzz_cases),
                "compile": user_compile,
                "cases": fuzz_cases,
            },
        )
    finally:
        await _cleanup_files(client, [user_bin_id, gen_bin_id, std_bin_id])


async def _judge_static_fallback(
    client: httpx.AsyncClient,
    context: SubmissionContext,
    user_bin_id: str | None,
    compiler_output: str | None,
    compile_result: dict[str, Any],
) -> tuple[SubmissionStatus, int | None, int | None, str | None, dict[str, Any]]:
    """Fall back to static judge when generator/std fail to compile.

    If *user_bin_id* is ``None`` (e.g. the caller already cleaned it up),
    the user code is recompiled here so the fallback is self-contained.
    """
    if not user_bin_id:
        # Recompile user code — the previous binary may have been cleaned up
        # by a concurrent or upstream code path (e.g. fuzzing finally block).
        recompile_result, recompile_output, user_bin_id = await _compile_code(client, context.code)
        recompile_status = _map_compile_status(recompile_result)
        if recompile_status != SubmissionStatus.AC:
            return (
                recompile_status,
                None,
                None,
                recompile_output,
                {"phase": "fallback_recompile", "result": recompile_result},
            )
        compiler_output = recompile_output
        compile_result = recompile_result
        logger.info("Static fallback: recompiled user code, new binary=%s", user_bin_id)

    case_results: list[dict[str, Any]] = []
    final_status = SubmissionStatus.AC
    final_runtime_ms: int | None = None
    final_memory_kb: int | None = None
    try:
        cases = context.judge_cases or [{"input": "", "expected_output": None}]
        for case_index, case in enumerate(cases, start=1):
            run_results = await _request_judge_run(
                client,
                _build_run_request(
                    user_bin_id,
                    case,
                    time_limit_ms=context.time_limit_ms,
                    memory_limit_kb=context.memory_limit_kb,
                ),
            )
            run_result = run_results[0]
            mapped_status = _map_runtime_status(run_result, case.get("expected_output"))
            fallback_entry: dict[str, Any] = {
                "case_index": case_index,
                "status": mapped_status.value,
                "result": run_result,
            }
            if mapped_status == SubmissionStatus.WA:
                run_files = run_result.get("files", {}) or {}
                actual_out = _normalize_output(run_files.get("stdout", "") or "")
                expected_out = _normalize_output(case.get("expected_output") or "")
                fallback_entry["output_diff"] = build_output_diff(expected_out, actual_out)
            case_results.append(fallback_entry)
            final_runtime_ms = int((run_result.get("runTime") or 0) / 1_000_000)
            final_memory_kb = int((run_result.get("memory") or 0) / 1024)
            if mapped_status != SubmissionStatus.AC:
                final_status = mapped_status
                break

        return (
            final_status,
            final_runtime_ms,
            final_memory_kb,
            compiler_output,
            {
                "phase": "judge",
                "compile": compile_result,
                "cases": case_results,
            },
        )
    finally:
        await _delete_cached_file(client, user_bin_id)


async def _cleanup_files(client: httpx.AsyncClient, file_ids: list[str | None]) -> None:
    """Delete multiple cached files, ignoring errors."""
    for fid in file_ids:
        if fid:
            await _delete_cached_file(client, fid)


async def _judge_submission_async(
    context: SubmissionContext,
) -> tuple[SubmissionStatus, int | None, int | None, str | None, dict[str, Any]]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        # Check if fuzzing mode is enabled
        if context.generator_code and context.std_code:
            logger.info("Submission %d entering FUZZ mode (%d rounds)", context.submission_id, FUZZ_ROUNDS)
            return await _judge_fuzzing_async(client, context)

        # Original static judge path
        return await _judge_static_async(client, context)


def _judge_choice_submission(code: dict[str, str], choice_questions: list[dict]) -> tuple[SubmissionStatus, dict[str, Any]]:
    import json
    
    answers_str = code.get("answers.json", "{}")
    try:
        answers_data = json.loads(answers_str)
        user_answers = answers_data.get("answers", {})
    except Exception:
        user_answers = {}

    correct_count = 0
    total_count = len(choice_questions)
    report = {}

    for q in choice_questions:
        q_id = str(q.get("id"))
        correct_ans = q.get("answer", [])
        
        # Normalize and sort correct answers
        sorted_correct = sorted([str(a).strip().upper() for a in correct_ans])
        
        # Normalize and sort user answers
        user_ans = user_answers.get(q_id, [])
        sorted_user = sorted([str(a).strip().upper() for a in user_ans])
        
        is_correct = sorted_correct == sorted_user
        if is_correct:
            correct_count += 1

        report[q_id] = {
            "correct": is_correct,
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "explanation": q.get("explanation", ""),
        }

    status = SubmissionStatus.AC if correct_count == total_count else SubmissionStatus.WA

    judge_result = {
        "phase": "choice_judge",
        "correct_count": correct_count,
        "total_count": total_count,
        "score_percentage": round((correct_count / total_count * 100) if total_count > 0 else 100, 2),
        "report": report,
    }

    return status, judge_result


async def _run_submission_task(submission_id: int) -> dict[str, Any]:
    await _update_submission(
        submission_id,
        status=SubmissionStatus.JUDGING,
        judge_result={"phase": "queued"},
    )

    async with AsyncSessionLocal() as session:
        stmt = (
            select(Submission)
            .options(selectinload(Submission.problem))
            .where(Submission.id == submission_id)
        )
        submission = (await session.execute(stmt)).scalar_one_or_none()
        if submission is None:
            return {"submission_id": submission_id, "status": "missing"}

        problem = submission.problem
        is_choice = getattr(problem, "type", "programming") == "choice"

        if is_choice:
            choice_questions = getattr(problem, "choice_questions", []) or []
            status, judge_result = _judge_choice_submission(submission.code or {}, choice_questions)
            
            await _update_submission(
                submission_id,
                status=status,
                runtime_ms=0,
                memory_kb=0,
                compiler_output="Multiple Choice grading completed.",
                judge_result=judge_result,
            )
            return {"submission_id": submission_id, "status": status.value}

    context = await _load_submission_context(submission_id)
    if context is None:
        return {"submission_id": submission_id, "status": "missing"}

    status, runtime_ms, memory_kb, compiler_output, judge_result = await _judge_submission_async(context)
    await _update_submission(
        submission_id,
        status=status,
        runtime_ms=runtime_ms,
        memory_kb=memory_kb,
        compiler_output=compiler_output,
        judge_result=judge_result,
    )
    return {"submission_id": submission_id, "status": status.value}


@celery_app.task(name="judge_submission", bind=True, soft_time_limit=115, time_limit=120)
def judge_submission(self, submission_id: int) -> dict[str, Any]:
    try:
        return asyncio.run(_run_submission_task(submission_id))
    except SoftTimeLimitExceeded:
        asyncio.run(
            _update_submission(
                submission_id,
                status=SubmissionStatus.SYSTEM_ERROR,
                compiler_output="Judge worker soft timeout exceeded.",
                judge_result={"phase": "system", "reason": "soft_timeout"},
            )
        )
        return {"submission_id": submission_id, "status": SubmissionStatus.SYSTEM_ERROR.value}
    except Exception as exc:
        asyncio.run(
            _update_submission(
                submission_id,
                status=SubmissionStatus.SYSTEM_ERROR,
                compiler_output=str(exc),
                judge_result={"phase": "system", "reason": str(exc)},
            )
        )
        return {"submission_id": submission_id, "status": SubmissionStatus.SYSTEM_ERROR.value}
