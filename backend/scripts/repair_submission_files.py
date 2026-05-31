from __future__ import annotations

import argparse
import asyncio
import itertools
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from sqlalchemy import select
from sqlalchemy.orm import selectinload

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import AsyncSessionLocal
from models import Problem, Submission


ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_GREEN = "\033[32m"
ANSI_YELLOW = "\033[33m"
ANSI_CYAN = "\033[36m"

HEADER_EXTENSIONS = (".h", ".hpp", ".hh")
SOURCE_EXTENSIONS = (".cpp", ".cc", ".cxx")

MAIN_PATTERN = re.compile(r"\bint\s+main\s*\(")
IOSTREAM_PATTERN = re.compile(r"#\s*include\s*<iostream>")
HEADER_IFNDEF_PATTERN = re.compile(r"(?m)^\s*#ifndef\b")
HEADER_DEFINE_PATTERN = re.compile(r"(?m)^\s*#define\b")
PRAGMA_ONCE_PATTERN = re.compile(r"(?m)^\s*#pragma\s+once\b")
LOCAL_INCLUDE_PATTERN = re.compile(r'#\s*include\s*"([^"]+)"')
CLASS_PATTERN = re.compile(r"\b(class|struct)\s+[A-Za-z_]\w*")
FUNCTION_BODY_PATTERN = re.compile(
    r"\b[A-Za-z_~][\w:<>*&\s]*\s+[A-Za-z_~]\w*\s*\([^;{}]*\)\s*\{",
    re.MULTILINE,
)


@dataclass
class SubmissionRepairPlan:
    submission_id: int
    problem_id: int
    problem_title: str
    reasons: list[str]
    current_code: dict[str, str]
    next_code: dict[str, str]
    score_delta: int | None = None


@dataclass
class CompatibilityResult:
    score: int


def style(text: str, *codes: str) -> str:
    return f"{''.join(codes)}{text}{ANSI_RESET}"


def is_string_dict(value: object) -> bool:
    return isinstance(value, dict) and all(
        isinstance(key, str) and isinstance(item, str)
        for key, item in value.items()
    )


def is_string_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def normalize_string_dict(value: object) -> dict[str, str] | None:
    if not is_string_dict(value):
        return None
    return dict(value)


def normalize_string_list(value: object) -> list[str] | None:
    if not is_string_list(value):
        return None
    return list(value)


def extract_local_includes(content: str) -> set[str]:
    return {match.strip() for match in LOCAL_INCLUDE_PATTERN.findall(content)}


def has_header_guard(content: str) -> bool:
    return bool(PRAGMA_ONCE_PATTERN.search(content)) or (
        bool(HEADER_IFNDEF_PATTERN.search(content))
        and bool(HEADER_DEFINE_PATTERN.search(content))
    )


def score_assignment(file_name: str, content: str, all_file_names: set[str]) -> CompatibilityResult:
    score = 0
    lower_name = file_name.lower()
    base_name = PurePosixPath(file_name).name
    includes = extract_local_includes(content)
    has_main = bool(MAIN_PATTERN.search(content))
    has_iostream = bool(IOSTREAM_PATTERN.search(content))
    guard = has_header_guard(content)
    has_class = bool(CLASS_PATTERN.search(content))
    has_function_body = bool(FUNCTION_BODY_PATTERN.search(content))

    if lower_name.endswith(HEADER_EXTENSIONS):
        if guard:
            score += 20
        else:
            score -= 12
        if has_main:
            score -= 30
        if has_class:
            score += 5
        if has_function_body:
            score -= 2
    elif base_name.lower().startswith("main.") or lower_name.endswith("main.cpp"):
        if has_main:
            score += 28
        else:
            score -= 20
        if has_iostream:
            score += 4
        if guard:
            score -= 24
    elif lower_name.endswith(SOURCE_EXTENSIONS):
        if has_main:
            score -= 14
        if guard:
            score -= 22
        if has_function_body:
            score += 10
        if any(include.lower().endswith(HEADER_EXTENSIONS) for include in includes):
            score += 8
        if has_iostream:
            score += 1

    if base_name in includes:
        score -= 8

    if any(include in all_file_names for include in includes):
        score += 2

    return CompatibilityResult(score=score)


def build_submission_plan(submission: Submission, problem: Problem) -> SubmissionRepairPlan | None:
    current_code = normalize_string_dict(submission.code)
    template_files = normalize_string_dict(problem.template_files)
    readonly_files = normalize_string_list(problem.readonly_files) or []
    if current_code is None or template_files is None:
        return None
    if len(template_files) <= 1:
        return None
    if set(current_code.keys()) != set(template_files.keys()):
        return None

    target_keys = list(template_files.keys())
    source_keys = list(current_code.keys())
    assigned_sources: dict[str, str] = {}
    used_source_keys: set[str] = set()
    reasons: list[str] = []

    exact_targets = list(dict.fromkeys(readonly_files + target_keys))
    for target_key in exact_targets:
        expected_content = template_files.get(target_key)
        if expected_content is None:
            continue
        matches = [
            source_key
            for source_key, source_content in current_code.items()
            if source_key not in used_source_keys and source_content == expected_content
        ]
        if len(matches) == 1:
            assigned_sources[target_key] = matches[0]
            used_source_keys.add(matches[0])

    remaining_targets = [key for key in target_keys if key not in assigned_sources]
    remaining_sources = [key for key in source_keys if key not in used_source_keys]

    if remaining_targets:
        all_file_names = set(target_keys)
        current_score = 0
        best_score = None
        best_order: tuple[int, ...] | None = None
        remaining_contents = [current_code[key] for key in remaining_sources]

        for order in itertools.permutations(range(len(remaining_sources))):
            total = 0
            for slot, source_index in enumerate(order):
                target_key = remaining_targets[slot]
                total += score_assignment(
                    target_key,
                    remaining_contents[source_index],
                    all_file_names,
                ).score
                if remaining_targets[slot] == remaining_sources[source_index]:
                    current_score = total if slot == len(order) - 1 else current_score
            if best_score is None or total > best_score:
                best_score = total
                best_order = order

        if best_order is None or best_score is None:
            return None

        identity_order = tuple(range(len(remaining_sources)))
        identity_score = sum(
            score_assignment(
                remaining_targets[index],
                remaining_contents[index],
                all_file_names,
            ).score
            for index in range(len(remaining_targets))
        )

        if best_order != identity_order and best_score - identity_score >= 12:
            for slot, source_index in enumerate(best_order):
                assigned_sources[remaining_targets[slot]] = remaining_sources[source_index]
            reasons.append("Reassigned submission file contents using template anchors and filename heuristics.")
            score_delta = best_score - identity_score
        else:
            for target_key in remaining_targets:
                assigned_sources[target_key] = target_key
            score_delta = None
    else:
        score_delta = None

    next_code = {
        target_key: current_code[assigned_sources[target_key]]
        for target_key in target_keys
    }
    if next_code == current_code:
        return None

    anchored_moves = [
        f"{target_key} <= {source_key}"
        for target_key, source_key in assigned_sources.items()
        if target_key != source_key
    ]
    if anchored_moves:
        reasons.append("Moved contents: " + ", ".join(anchored_moves) + ".")

    return SubmissionRepairPlan(
        submission_id=submission.id,
        problem_id=problem.id,
        problem_title=problem.title,
        reasons=reasons,
        current_code=current_code,
        next_code=next_code,
        score_delta=score_delta,
    )


def print_plan(plan: SubmissionRepairPlan, applied: bool) -> None:
    action_text = "Applied" if applied else "Planned"
    action_color = ANSI_GREEN if applied else ANSI_YELLOW
    print()
    print(
        style(
            f"[{action_text}] Submission {plan.submission_id} (Problem {plan.problem_id} - {plan.problem_title})",
            ANSI_BOLD,
            action_color,
        )
    )
    if plan.score_delta is not None:
        print(f"  score_delta: {plan.score_delta}")
    for reason in plan.reasons:
        print(f"  - {reason}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Repair misaligned submission multi-file code.")
    parser.add_argument("--apply", action="store_true", help="Apply changes to the database.")
    parser.add_argument("--problem-id", type=int, default=None, help="Only process submissions of a single problem.")
    args = parser.parse_args()

    async with AsyncSessionLocal() as session:
        stmt = (
            select(Submission)
            .options(selectinload(Submission.problem))
            .order_by(Submission.id.asc())
        )
        if args.problem_id is not None:
            stmt = stmt.where(Submission.problem_id == args.problem_id)
        submissions = (await session.execute(stmt)).scalars().all()

        plans: list[SubmissionRepairPlan] = []
        scanned_count = 0
        for submission in submissions:
            problem = submission.problem
            if problem is None:
                continue
            template_files = normalize_string_dict(problem.template_files)
            if template_files is None or len(template_files) <= 1:
                continue
            scanned_count += 1
            plan = build_submission_plan(submission, problem)
            if plan is not None:
                plans.append(plan)

        print(style("\nSubmission File Repair Report", ANSI_BOLD, ANSI_CYAN))
        print(style("=" * 72, ANSI_CYAN))
        print(f"Scanned {scanned_count} multi-file submission(s).")
        print(f"Prepared {len(plans)} repair plan(s).")

        if args.apply:
            for plan in plans:
                submission = next(
                    (item for item in submissions if item.id == plan.submission_id),
                    None,
                )
                if submission is None:
                    continue
                submission.code = dict(plan.next_code)
                print_plan(plan, applied=True)
            await session.commit()
            print(style(f"\nApplied {len(plans)} repair(s).", ANSI_BOLD, ANSI_GREEN))
        else:
            for plan in plans:
                print_plan(plan, applied=False)
            if plans:
                print(style("\nDry run complete. Re-run with --apply to persist changes.", ANSI_BOLD, ANSI_YELLOW))
            else:
                print(style("\nNo repairs were necessary.", ANSI_BOLD, ANSI_GREEN))


if __name__ == "__main__":
    asyncio.run(main())
