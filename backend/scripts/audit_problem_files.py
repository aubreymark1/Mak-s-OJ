from __future__ import annotations

import asyncio
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import AsyncSessionLocal
from models import Problem


ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_RED = "\033[31m"
ANSI_GREEN = "\033[32m"
ANSI_YELLOW = "\033[33m"
ANSI_CYAN = "\033[36m"

HEADER_EXTENSIONS = (".h", ".hpp")
SOURCE_EXTENSIONS = (".cpp",)
MAIN_PROGRAM_PATTERNS = (
    (re.compile(r"\bint\s+main\s*\("), "contains `int main(...)`"),
    (re.compile(r"#\s*include\s*<iostream>"), "contains `#include <iostream>`"),
)
HEADER_GUARD_PATTERNS = (
    re.compile(r"(?m)^\s*#ifndef\b"),
    re.compile(r"(?m)^\s*#define\b"),
)


@dataclass
class AuditFinding:
    problem_id: int
    title: str
    reasons: list[str]


def style(text: str, *codes: str) -> str:
    return f"{''.join(codes)}{text}{ANSI_RESET}"


def is_string_dict(value: object) -> bool:
    return isinstance(value, dict) and all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    )


def is_string_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def audit_problem(problem: Problem) -> AuditFinding | None:
    reasons: list[str] = []
    template_files = problem.template_files
    readonly_files = problem.readonly_files

    if not is_string_dict(template_files):
        reasons.append("template_files is not a string-to-string JSON object.")
        return AuditFinding(problem.id, problem.title, reasons)

    if len(template_files) <= 1:
        return None

    for file_name, content in template_files.items():
        normalized_name = file_name.lower()

        if normalized_name.endswith(HEADER_EXTENSIONS):
            matched = [label for pattern, label in MAIN_PROGRAM_PATTERNS if pattern.search(content)]
            if matched:
                reasons.append(
                    f"{file_name}: header-like key matched main-program heuristics ({', '.join(matched)})."
                )

        if normalized_name.endswith(SOURCE_EXTENSIONS):
            if all(pattern.search(content) for pattern in HEADER_GUARD_PATTERNS):
                reasons.append(
                    f"{file_name}: source-like key matched header-guard heuristics (#ifndef + #define)."
                )

    if not is_string_list(readonly_files):
        reasons.append("readonly_files is not a string array.")
    else:
        missing_files = [file_name for file_name in readonly_files if file_name not in template_files]
        if missing_files:
            reasons.append(
                "readonly_files references missing template_files keys: "
                + ", ".join(sorted(missing_files))
                + "."
            )

    if not reasons:
        return None
    return AuditFinding(problem.id, problem.title, reasons)


def print_report(scanned_count: int, findings: list[AuditFinding]) -> None:
    print(style("\nProblem File Audit Report", ANSI_BOLD, ANSI_CYAN))
    print(style("=" * 72, ANSI_CYAN))
    print(
        f"Scanned {scanned_count} multi-file problems, "
        f"flagged {len(findings)} suspicious problem(s)."
    )

    if not findings:
        print(style("No suspicious file-key mismatches detected.", ANSI_GREEN))
        return

    for index, finding in enumerate(findings, start=1):
        print()
        print(
            style(
                f"[Mismatch #{index}] Problem {finding.problem_id} - {finding.title}",
                ANSI_BOLD,
                ANSI_RED,
            )
        )
        for reason in finding.reasons:
            print(style(f"  - {reason}", ANSI_YELLOW))


async def main() -> None:
    async with AsyncSessionLocal() as session:
        problems = (
            await session.execute(select(Problem).order_by(Problem.id.asc()))
        ).scalars().all()

    multi_file_problems = [
        problem
        for problem in problems
        if isinstance(problem.template_files, dict) and len(problem.template_files) > 1
    ]
    findings = [finding for problem in multi_file_problems if (finding := audit_problem(problem))]
    print_report(len(multi_file_problems), findings)


if __name__ == "__main__":
    asyncio.run(main())
