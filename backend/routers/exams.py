from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_current_user
from database import get_db_session
from models import Exam, ExamStatus, Problem, Submission, SubmissionStatus, User
from schemas import (
    ExamCreate,
    ExamListItem,
    ExamProblemResult,
    ExamRead,
    ExamResults,
)

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.post("", response_model=ExamRead, status_code=status.HTTP_201_CREATED)
async def create_exam(
    payload: ExamCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamRead:
    exam = Exam(
        user_id=current_user.id,
        title=payload.title,
        problem_ids=payload.problem_ids,
        duration_minutes=payload.duration_minutes,
        status=ExamStatus.PENDING,
    )
    session.add(exam)
    await session.commit()
    await session.refresh(exam)
    return ExamRead.model_validate(exam)


@router.post("/{exam_id}/start", response_model=ExamRead)
async def start_exam(
    exam_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamRead:
    exam = await _get_user_exam(exam_id, current_user.id, session)
    if exam.status != ExamStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam has already started.")
    exam.start_time = datetime.now(timezone.utc)
    exam.status = ExamStatus.IN_PROGRESS
    await session.commit()
    await session.refresh(exam)
    return ExamRead.model_validate(exam)


@router.post("/{exam_id}/pause", response_model=ExamRead)
async def pause_exam(
    exam_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamRead:
    exam = await _get_user_exam(exam_id, current_user.id, session)
    if exam.status != ExamStatus.IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam is not in progress.")
    exam.status = ExamStatus.PAUSED
    await session.commit()
    await session.refresh(exam)
    return ExamRead.model_validate(exam)


@router.post("/{exam_id}/resume", response_model=ExamRead)
async def resume_exam(
    exam_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamRead:
    exam = await _get_user_exam(exam_id, current_user.id, session)
    if exam.status != ExamStatus.PAUSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam is not paused.")
    now = datetime.now(timezone.utc)
    pause_duration = (now - exam.updated_at).total_seconds()
    exam.total_paused_seconds += int(pause_duration)
    exam.status = ExamStatus.IN_PROGRESS
    await session.commit()
    await session.refresh(exam)
    return ExamRead.model_validate(exam)


@router.post("/{exam_id}/submit", response_model=ExamResults)
async def submit_exam(
    exam_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamResults:
    exam = await _get_user_exam(exam_id, current_user.id, session)
    if exam.status not in (ExamStatus.IN_PROGRESS, ExamStatus.PAUSED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam cannot be submitted.")
    exam.status = ExamStatus.COMPLETED
    exam.end_time = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(exam)
    return await _build_exam_results(exam, session)


@router.get("/{exam_id}/results", response_model=ExamResults)
async def get_exam_results(
    exam_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExamResults:
    exam = await _get_user_exam(exam_id, current_user.id, session)
    return await _build_exam_results(exam, session)


@router.get("", response_model=list[ExamListItem])
async def list_exams(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ExamListItem]:
    stmt = (
        select(Exam)
        .where(Exam.user_id == current_user.id)
        .order_by(Exam.created_at.desc())
    )
    exams = (await session.execute(stmt)).scalars().all()
    result: list[ExamListItem] = []
    for exam in exams:
        total_score: float | None = None
        if exam.status == ExamStatus.COMPLETED:
            total_score = await _compute_total_score(exam, session)
        result.append(
            ExamListItem(
                id=exam.id,
                title=exam.title,
                problem_ids=exam.problem_ids,
                duration_minutes=exam.duration_minutes,
                status=exam.status,
                total_score=total_score,
                created_at=exam.created_at,
                updated_at=exam.updated_at,
            )
        )
    return result


async def _get_user_exam(exam_id: int, user_id: int, session: AsyncSession) -> Exam:
    exam = await session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")
    if exam.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return exam


async def _build_exam_results(exam: Exam, session: AsyncSession) -> ExamResults:
    now = datetime.now(timezone.utc)
    end = exam.end_time or now
    start = exam.start_time or now
    elapsed_seconds = int((end - start).total_seconds()) - exam.total_paused_seconds

    per_problem_score = round(100.0 / len(exam.problem_ids), 2) if exam.problem_ids else 0
    remainder = round(100.0 - per_problem_score * len(exam.problem_ids), 2)

    problems: list[ExamProblemResult] = []
    passed_count = 0

    for idx, problem_id in enumerate(exam.problem_ids):
        problem = await session.get(Problem, problem_id)
        slug = problem.slug if problem else f"unknown-{problem_id}"

        stmt = (
            select(Submission)
            .where(
                Submission.user_id == exam.user_id,
                Submission.problem_id == problem_id,
                Submission.created_at >= exam.start_time,
                Submission.created_at <= end,
            )
            .order_by(Submission.created_at.desc())
            .limit(1)
        )
        submission = (await session.execute(stmt)).scalar_one_or_none()

        if submission and submission.status == SubmissionStatus.AC:
            score = per_problem_score + (remainder if idx == len(exam.problem_ids) - 1 else 0)
            passed = True
            passed_count += 1
        else:
            score = 0.0
            passed = False

        problems.append(
            ExamProblemResult(
                problem_id=problem_id,
                slug=slug,
                status=submission.status if submission else None,
                score=score,
                passed=passed,
            )
        )

    total_score = sum(p.score for p in problems)

    return ExamResults(
        exam_id=exam.id,
        title=exam.title,
        duration_minutes=exam.duration_minutes,
        elapsed_seconds=elapsed_seconds,
        total_score=total_score,
        passed_count=passed_count,
        total_problems=len(exam.problem_ids),
        problems=problems,
    )


async def _compute_total_score(exam: Exam, session: AsyncSession) -> float:
    results = await _build_exam_results(exam, session)
    return results.total_score
