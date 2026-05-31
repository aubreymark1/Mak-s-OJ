from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_current_admin_user
from database import get_db_session
from models import Problem, Submission, User
from schemas import (
    AdminProblemCreate,
    AdminProblemDetail,
    AdminProblemListItem,
    AdminProblemListResponse,
    AdminProblemUpdate,
)

router = APIRouter(prefix="/api/admin/problems", tags=["admin-problems"])


def _problem_to_admin_detail(problem: Problem) -> AdminProblemDetail:
    return AdminProblemDetail(
        id=problem.id,
        slug=problem.slug,
        title=problem.title,
        difficulty=problem.difficulty,
        tags=problem.tags or [],
        statement_markdown=problem.statement_markdown,
        template_files=problem.template_files or {},
        readonly_files=problem.readonly_files or [],
        time_limit_ms=problem.time_limit_ms,
        memory_limit_kb=problem.memory_limit_kb,
        judge_cases=problem.judge_cases or [],
        generator_code=problem.generator_code,
        std_code=problem.std_code,
        created_at=problem.created_at,
        updated_at=problem.updated_at,
    )


def _problem_to_admin_list_item(problem: Problem) -> AdminProblemListItem:
    return AdminProblemListItem(
        id=problem.id,
        slug=problem.slug,
        title=problem.title,
        difficulty=problem.difficulty,
        tags=problem.tags or [],
        has_fuzz=bool(problem.generator_code and problem.std_code),
        judge_case_count=len(problem.judge_cases or []),
        created_at=problem.created_at,
        updated_at=problem.updated_at,
    )


@router.get("", response_model=AdminProblemListResponse, status_code=status.HTTP_200_OK)
async def admin_list_problems(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> AdminProblemListResponse:
    total = (await session.execute(select(func.count()).select_from(Problem))).scalar_one()
    stmt = (
        select(Problem)
        .order_by(Problem.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    problems = (await session.execute(stmt)).scalars().all()
    items = [_problem_to_admin_list_item(p) for p in problems]
    return AdminProblemListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{problem_id}", response_model=AdminProblemDetail, status_code=status.HTTP_200_OK)
async def admin_get_problem(
    problem_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> AdminProblemDetail:
    problem = await session.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")
    return _problem_to_admin_detail(problem)


@router.post("", response_model=AdminProblemDetail, status_code=status.HTTP_201_CREATED)
async def admin_create_problem(
    payload: AdminProblemCreate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> AdminProblemDetail:
    # Check slug uniqueness
    existing = (
        await session.execute(select(Problem).where(Problem.slug == payload.slug))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A problem with slug '{payload.slug}' already exists.",
        )

    problem = Problem(
        slug=payload.slug,
        title=payload.title,
        statement_markdown=payload.statement_markdown,
        difficulty=payload.difficulty,
        tags=payload.tags,
        template_files=payload.template_files,
        readonly_files=payload.readonly_files,
        time_limit_ms=payload.time_limit_ms,
        memory_limit_kb=payload.memory_limit_kb,
        judge_cases=[{"input": c.input, "expected_output": c.expected_output} for c in payload.judge_cases],
        generator_code=payload.generator_code.strip() if payload.generator_code else None,
        std_code=payload.std_code.strip() if payload.std_code else None,
    )
    session.add(problem)
    await session.commit()
    await session.refresh(problem)
    return _problem_to_admin_detail(problem)


@router.put("/{problem_id}", response_model=AdminProblemDetail, status_code=status.HTTP_200_OK)
async def admin_update_problem(
    problem_id: int,
    payload: AdminProblemUpdate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> AdminProblemDetail:
    problem = await session.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")

    update_data = payload.model_dump(exclude_unset=True)

    # Check slug uniqueness if slug is being changed
    if "slug" in update_data and update_data["slug"] != problem.slug:
        existing = (
            await session.execute(select(Problem).where(Problem.slug == update_data["slug"]))
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A problem with slug '{update_data['slug']}' already exists.",
            )

    # Normalize judge_cases — model_dump already converts to dicts
    if "judge_cases" in update_data and update_data["judge_cases"] is not None:
        normalized_cases = []
        for c in update_data["judge_cases"]:
            if isinstance(c, dict):
                normalized_cases.append(c)
            else:
                normalized_cases.append({"input": c.input, "expected_output": c.expected_output})
        update_data["judge_cases"] = normalized_cases

    # Normalize empty strings to None for fuzzing fields
    for field in ("generator_code", "std_code"):
        if field in update_data and isinstance(update_data[field], str) and not update_data[field].strip():
            update_data[field] = None

    for field_name, field_value in update_data.items():
        setattr(problem, field_name, field_value)

    await session.commit()
    await session.refresh(problem)
    return _problem_to_admin_detail(problem)


@router.delete("/{problem_id}", status_code=status.HTTP_200_OK)
async def admin_delete_problem(
    problem_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    problem = await session.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")

    # Delete related submissions first (cascade should handle this, but be explicit)
    await session.execute(
        select(Submission).where(Submission.problem_id == problem_id)
    )

    await session.delete(problem)
    await session.commit()
    return {"detail": f"Problem {problem_id} and related submissions deleted."}
