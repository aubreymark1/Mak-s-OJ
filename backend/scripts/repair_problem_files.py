from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.util
import itertools
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

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

HEADER_EXTENSIONS = (".h", ".hpp", ".hh")
SOURCE_EXTENSIONS = (".cpp", ".cc", ".cxx")
SCRIPT_NAMES = (
    "import_problem.py",
    "import_two_course_problems.py",
    "import_matrix_variants_batch.py",
    "import_matrix_fresh_variants_batch.py",
)

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


@dataclass(frozen=True)
class SourceDefinition:
    title: str
    slug: str
    template_files: dict[str, str]
    readonly_files: list[str]
    source_path: str


@dataclass
class CompatibilityResult:
    score: int
    reasons: list[str]


@dataclass
class RepairPlan:
    problem_id: int
    title: str
    strategy: str
    reasons: list[str]
    current_template_files: dict[str, str]
    next_template_files: dict[str, str]
    current_readonly_files: list[str] | None
    next_readonly_files: list[str]
    score_delta: int | None = None
    source_path: str | None = None


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


def build_problem_slug(title: str) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    if slug:
        return slug[:120]
    fallback = hashlib.sha1(title.encode("utf-8")).hexdigest()[:12]
    return f"problem-{fallback}"[:120]


def load_module_from_path(module_path: Path) -> object:
    module_name = f"_repair_problem_files_{module_path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_source_definitions() -> tuple[dict[str, SourceDefinition], dict[str, SourceDefinition]]:
    title_index: dict[str, list[SourceDefinition]] = {}
    slug_index: dict[str, list[SourceDefinition]] = {}

    for script_name in SCRIPT_NAMES:
        module_path = BACKEND_DIR / "scripts" / script_name
        if not module_path.exists():
            continue

        module = load_module_from_path(module_path)
        payloads: list[dict[str, Any]] = []

        if hasattr(module, "PROBLEM_DATA"):
            payload = getattr(module, "PROBLEM_DATA")
            if isinstance(payload, dict):
                payloads.append(payload)
        if hasattr(module, "PROBLEMS_DATA"):
            payload = getattr(module, "PROBLEMS_DATA")
            if isinstance(payload, list):
                payloads.extend(item for item in payload if isinstance(item, dict))

        slug_builder = getattr(module, "build_problem_slug", build_problem_slug)

        for payload in payloads:
            title = payload.get("title")
            template_files = payload.get("template_files")
            readonly_files = payload.get("readonly_files")
            if not isinstance(title, str):
                continue
            normalized_template_files = normalize_string_dict(template_files)
            normalized_readonly_files = normalize_string_list(readonly_files)
            if normalized_template_files is None or normalized_readonly_files is None:
                continue

            slug = payload.get("slug")
            if not isinstance(slug, str) or not slug.strip():
                slug = slug_builder(title)

            definition = SourceDefinition(
                title=title,
                slug=slug,
                template_files=normalized_template_files,
                readonly_files=normalized_readonly_files,
                source_path=str(module_path.relative_to(BACKEND_DIR)),
            )
            title_index.setdefault(title, []).append(definition)
            slug_index.setdefault(slug, []).append(definition)

    return collapse_unique_definitions(title_index), collapse_unique_definitions(slug_index)


def collapse_unique_definitions(
    entries: dict[str, list[SourceDefinition]],
) -> dict[str, SourceDefinition]:
    collapsed: dict[str, SourceDefinition] = {}
    for key, definitions in entries.items():
        if not definitions:
            continue
        unique_by_signature: dict[str, SourceDefinition] = {}
        for definition in definitions:
            signature = json.dumps(
                {
                    "template_files": definition.template_files,
                    "readonly_files": definition.readonly_files,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
            unique_by_signature.setdefault(signature, definition)
        if len(unique_by_signature) == 1:
            collapsed[key] = next(iter(unique_by_signature.values()))
    return collapsed


def resolve_source_definition(
    problem: Problem,
    title_index: dict[str, SourceDefinition],
    slug_index: dict[str, SourceDefinition],
) -> SourceDefinition | None:
    if isinstance(problem.slug, str) and problem.slug in slug_index:
        return slug_index[problem.slug]
    if isinstance(problem.title, str) and problem.title in title_index:
        return title_index[problem.title]
    return None


def extract_local_includes(content: str) -> set[str]:
    return {match.strip() for match in LOCAL_INCLUDE_PATTERN.findall(content)}


def has_header_guard(content: str) -> bool:
    return bool(PRAGMA_ONCE_PATTERN.search(content)) or (
        bool(HEADER_IFNDEF_PATTERN.search(content))
        and bool(HEADER_DEFINE_PATTERN.search(content))
    )


def score_assignment(
    file_name: str,
    content: str,
    all_file_names: set[str],
) -> CompatibilityResult:
    score = 0
    reasons: list[str] = []
    lower_name = file_name.lower()
    base_name = PurePosixPath(file_name).name
    includes = extract_local_includes(content)
    has_main = bool(MAIN_PATTERN.search(content))
    has_iostream = bool(IOSTREAM_PATTERN.search(content))
    guard = has_header_guard(content)
    has_class = bool(CLASS_PATTERN.search(content))
    has_function_body = bool(FUNCTION_BODY_PATTERN.search(content))
    local_include_hits = sorted(name for name in includes if name in all_file_names and name != base_name)

    if guard:
        score += 4
        reasons.append("contains header guard")
    if has_main:
        score += 3
        reasons.append("contains int main")
    if local_include_hits:
        score += 2
        reasons.append(f'includes local file(s): {", ".join(local_include_hits)}')

    if lower_name.endswith(HEADER_EXTENSIONS):
        if guard:
            score += 20
        else:
            score -= 12
            reasons.append("header key without header guard")
        if has_main:
            score -= 30
            reasons.append("header key contains main program")
        if has_class:
            score += 5
        if has_function_body:
            score -= 2
    elif base_name.lower().startswith("main.") or lower_name.endswith("main.cpp"):
        if has_main:
            score += 28
        else:
            score -= 20
            reasons.append("main-like key without int main")
        if has_iostream:
            score += 4
        if guard:
            score -= 24
            reasons.append("main-like key contains header guard")
    elif lower_name.endswith(SOURCE_EXTENSIONS):
        if has_main:
            score -= 14
            reasons.append("implementation key contains main program")
        if guard:
            score -= 22
            reasons.append("implementation key contains header guard")
        if has_function_body:
            score += 10
        if any(include.lower().endswith(HEADER_EXTENSIONS) for include in includes):
            score += 8
        if has_iostream:
            score += 1

    if base_name in includes:
        score -= 8
        reasons.append("self-include detected")

    return CompatibilityResult(score=score, reasons=reasons)


def build_heuristic_plan(problem: Problem) -> RepairPlan | None:
    current_template_files = normalize_string_dict(problem.template_files)
    current_readonly_files = normalize_string_list(problem.readonly_files)
    if current_template_files is None:
        return None
    if len(current_template_files) <= 1:
        if current_readonly_files is not None and all(
            name in current_template_files for name in current_readonly_files
        ):
            return None
        next_readonly_files = [
            name for name in (current_readonly_files or []) if name in current_template_files
        ]
        if current_readonly_files == next_readonly_files:
            return None
        return RepairPlan(
            problem_id=problem.id,
            title=problem.title,
            strategy="readonly-filter",
            reasons=["Filtered readonly_files entries that do not exist in template_files."],
            current_template_files=current_template_files,
            next_template_files=dict(current_template_files),
            current_readonly_files=current_readonly_files,
            next_readonly_files=next_readonly_files,
        )

    file_names = list(current_template_files.keys())
    if len(file_names) > 7:
        return None

    current_contents = [current_template_files[name] for name in file_names]
    file_name_set = set(file_names)

    current_score = 0
    for index, file_name in enumerate(file_names):
        current_score += score_assignment(file_name, current_contents[index], file_name_set).score

    best_score = current_score
    best_order = tuple(range(len(file_names)))
    for order in itertools.permutations(range(len(file_names))):
        total = 0
        for slot, content_index in enumerate(order):
            total += score_assignment(
                file_names[slot],
                current_contents[content_index],
                file_name_set,
            ).score
        if total > best_score:
            best_score = total
            best_order = order

    next_template_files = {
        file_names[index]: current_contents[content_index]
        for index, content_index in enumerate(best_order)
    }
    next_readonly_files = [
        name for name in (current_readonly_files or []) if name in next_template_files
    ]

    changed_files = [
        file_name
        for file_name in file_names
        if next_template_files[file_name] != current_template_files[file_name]
    ]
    readonly_changed = current_readonly_files != next_readonly_files
    if not changed_files and not readonly_changed:
        return None

    score_delta = best_score - current_score
    if changed_files and score_delta < 12:
        return None

    reasons: list[str] = []
    if changed_files:
        reasons.append(
            "Reassigned file contents using filename/content heuristic matching: "
            + ", ".join(changed_files)
            + "."
        )
    if readonly_changed:
        reasons.append("Dropped readonly_files entries that are missing from template_files.")

    return RepairPlan(
        problem_id=problem.id,
        title=problem.title,
        strategy="heuristic",
        reasons=reasons,
        current_template_files=current_template_files,
        next_template_files=next_template_files,
        current_readonly_files=current_readonly_files,
        next_readonly_files=next_readonly_files,
        score_delta=score_delta,
    )


def build_canonical_plan(
    problem: Problem,
    definition: SourceDefinition,
) -> RepairPlan | None:
    current_template_files = normalize_string_dict(problem.template_files)
    current_readonly_files = normalize_string_list(problem.readonly_files)
    if current_template_files is None:
        return RepairPlan(
            problem_id=problem.id,
            title=problem.title,
            strategy="canonical",
            reasons=["Current template_files is malformed; replacing from import source definition."],
            current_template_files={},
            next_template_files=dict(definition.template_files),
            current_readonly_files=current_readonly_files,
            next_readonly_files=list(definition.readonly_files),
            source_path=definition.source_path,
        )

    if (
        current_template_files == definition.template_files
        and current_readonly_files == definition.readonly_files
    ):
        return None

    reasons = [f"Matched canonical import definition from {definition.source_path}."]
    if set(current_template_files.keys()) != set(definition.template_files.keys()):
        reasons.append("Current template_files keys differ from canonical source; replacing full mapping.")
    elif current_template_files != definition.template_files:
        reasons.append("Current template_files content differs from canonical source; restoring canonical mapping.")
    if current_readonly_files != definition.readonly_files:
        reasons.append("readonly_files differs from canonical source; restoring canonical list.")

    return RepairPlan(
        problem_id=problem.id,
        title=problem.title,
        strategy="canonical",
        reasons=reasons,
        current_template_files=current_template_files,
        next_template_files=dict(definition.template_files),
        current_readonly_files=current_readonly_files,
        next_readonly_files=list(definition.readonly_files),
        source_path=definition.source_path,
    )


def build_repair_plan(
    problem: Problem,
    title_index: dict[str, SourceDefinition],
    slug_index: dict[str, SourceDefinition],
) -> RepairPlan | None:
    definition = resolve_source_definition(problem, title_index, slug_index)
    if definition is not None:
        plan = build_canonical_plan(problem, definition)
        if plan is not None:
            return plan
    return build_heuristic_plan(problem)


def print_plan(plan: RepairPlan, applied: bool) -> None:
    action_text = "Applied" if applied else "Planned"
    action_color = ANSI_GREEN if applied else ANSI_YELLOW
    print()
    print(
        style(
            f"[{action_text}] Problem {plan.problem_id} - {plan.title}",
            ANSI_BOLD,
            action_color,
        )
    )
    print(f"  strategy: {plan.strategy}")
    if plan.source_path:
        print(f"  source: {plan.source_path}")
    if plan.score_delta is not None:
        print(f"  score_delta: {plan.score_delta}")
    for reason in plan.reasons:
        print(f"  - {reason}")
    changed_keys = [
        key
        for key, value in plan.next_template_files.items()
        if plan.current_template_files.get(key) != value
    ]
    if changed_keys:
        print(f"  changed_files: {', '.join(changed_keys)}")
    if plan.current_readonly_files != plan.next_readonly_files:
        print(
            "  readonly_files: "
            f"{plan.current_readonly_files or []} -> {plan.next_readonly_files}"
        )


async def apply_repairs(plans: list[RepairPlan], apply_changes: bool) -> int:
    if not plans:
        return 0

    if not apply_changes:
        for plan in plans:
            print_plan(plan, applied=False)
        return 0

    applied_count = 0
    async with AsyncSessionLocal() as session:
        problems_by_id = {
            problem.id: problem
            for problem in (
                await session.execute(
                    select(Problem).where(Problem.id.in_([plan.problem_id for plan in plans]))
                )
            ).scalars().all()
        }

        for plan in plans:
            problem = problems_by_id.get(plan.problem_id)
            if problem is None:
                continue
            problem.template_files = dict(plan.next_template_files)
            problem.readonly_files = list(plan.next_readonly_files)
            applied_count += 1
            print_plan(plan, applied=True)

        await session.commit()

    return applied_count


async def main() -> None:
    parser = argparse.ArgumentParser(description="Repair misaligned multi-file problem templates.")
    parser.add_argument("--apply", action="store_true", help="Apply changes to the database.")
    parser.add_argument("--problem-id", type=int, default=None, help="Only process a single problem ID.")
    args = parser.parse_args()

    title_index, slug_index = load_source_definitions()

    async with AsyncSessionLocal() as session:
        stmt = select(Problem).order_by(Problem.id.asc())
        if args.problem_id is not None:
            stmt = stmt.where(Problem.id == args.problem_id)
        problems = (await session.execute(stmt)).scalars().all()

    plans: list[RepairPlan] = []
    scanned_count = 0
    for problem in problems:
        template_files = normalize_string_dict(problem.template_files)
        readonly_files = normalize_string_list(problem.readonly_files)
        is_multifile = template_files is not None and len(template_files) > 1
        has_readonly_issue = readonly_files is None or any(
            name not in (template_files or {}) for name in (readonly_files or [])
        )
        if not is_multifile and not has_readonly_issue:
            continue
        scanned_count += 1
        plan = build_repair_plan(problem, title_index, slug_index)
        if plan is not None:
            plans.append(plan)

    print(style("\nProblem File Repair Report", ANSI_BOLD, ANSI_CYAN))
    print(style("=" * 72, ANSI_CYAN))
    print(f"Scanned {scanned_count} suspicious or multi-file problem(s).")
    print(f"Prepared {len(plans)} repair plan(s).")

    applied_count = await apply_repairs(plans, apply_changes=args.apply)
    if args.apply:
        print(style(f"\nApplied {applied_count} repair(s).", ANSI_BOLD, ANSI_GREEN))
    elif plans:
        print(style("\nDry run complete. Re-run with --apply to persist changes.", ANSI_BOLD, ANSI_YELLOW))
    else:
        print(style("\nNo repairs were necessary.", ANSI_BOLD, ANSI_GREEN))


if __name__ == "__main__":
    asyncio.run(main())
