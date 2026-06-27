from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_current_user, get_optional_current_user
from database import get_db_session
from models import Problem, Submission, SubmissionStatus, User
from schemas import ProblemDetail, ProblemListItem, ProblemListResponse, ProblemSubmissionHistoryItem

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.get("", response_model=ProblemListResponse, status_code=status.HTTP_200_OK)
async def list_problems(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    current_user: User | None = Depends(get_optional_current_user),
) -> ProblemListResponse:
    total = (await session.execute(select(func.count()).select_from(Problem))).scalar_one()
    stmt = (
        select(Problem)
        .order_by(Problem.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    problems = (await session.execute(stmt)).scalars().all()
    user_statuses: dict[int, str | None] = {}

    if current_user is not None and problems:
        problem_ids = [problem.id for problem in problems]
        submission_rows = (
            await session.execute(
                select(Submission.problem_id, Submission.status).where(
                    Submission.user_id == current_user.id,
                    Submission.problem_id.in_(problem_ids),
                )
            )
        ).all()
        statuses_by_problem: dict[int, set[SubmissionStatus]] = defaultdict(set)
        for problem_id, submission_status in submission_rows:
            statuses_by_problem[problem_id].add(submission_status)

        for problem_id, statuses in statuses_by_problem.items():
            if SubmissionStatus.AC in statuses:
                user_statuses[problem_id] = "AC"
            elif statuses:
                user_statuses[problem_id] = "Attempted"

    items = [
        ProblemListItem(
            id=problem.id,
            slug=problem.slug,
            title=problem.title,
            difficulty=problem.difficulty,
            tags=problem.tags or [],
            user_status=user_statuses.get(problem.id),
            created_at=problem.created_at,
            updated_at=problem.updated_at,
        )
        for problem in problems
    ]
    return ProblemListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{problem_id}", response_model=ProblemDetail, status_code=status.HTTP_200_OK)
async def get_problem(problem_id: int, session: AsyncSession = Depends(get_db_session)) -> ProblemDetail:
    problem = await session.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")

    return ProblemDetail(
        id=problem.id,
        slug=problem.slug,
        title=problem.title,
        difficulty=problem.difficulty,
        tags=problem.tags or [],
        description=problem.statement_markdown,
        template_files=problem.template_files,
        readonly_files=problem.readonly_files or [],
        time_limit_ms=problem.time_limit_ms,
        memory_limit_kb=problem.memory_limit_kb,
        judge_cases=problem.judge_cases or [],
        created_at=problem.created_at,
        updated_at=problem.updated_at,
    )


@router.get("/{problem_id}/my_submissions", response_model=list[ProblemSubmissionHistoryItem], status_code=status.HTTP_200_OK)
async def get_my_problem_submissions(
    problem_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ProblemSubmissionHistoryItem]:
    problem = await session.get(Problem, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")

    stmt = (
        select(Submission)
        .where(
            Submission.problem_id == problem_id,
            Submission.user_id == current_user.id,
        )
        .order_by(Submission.created_at.desc(), Submission.id.desc())
    )
    submissions = (await session.execute(stmt)).scalars().all()
    return [ProblemSubmissionHistoryItem.model_validate(submission) for submission in submissions]
