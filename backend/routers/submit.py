from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import DEFAULT_MEMORY_LIMIT_KB, DEFAULT_TIME_LIMIT_MS
from database import get_db_session
from models import Problem, Submission, SubmissionStatus, User
from schemas import RunCodeRequest, RunCodeResponse, SubmissionCreate, SubmissionQueued, SubmissionRead
from worker import JudgeSystemError, judge_submission, run_code_playground

router = APIRouter(tags=["submissions"])


@router.post("/api/submissions", response_model=SubmissionQueued, status_code=status.HTTP_200_OK)
@router.post("/submissions", response_model=SubmissionQueued, status_code=status.HTTP_200_OK, include_in_schema=False)
async def create_submission(
    payload: SubmissionCreate,
    session: AsyncSession = Depends(get_db_session),
) -> SubmissionQueued:
    problem = await session.get(Problem, payload.problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")

    user = await session.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    submission = Submission(
        user_id=payload.user_id,
        problem_id=payload.problem_id,
        code=payload.code,
        status=SubmissionStatus.PENDING,
    )
    session.add(submission)
    await session.commit()
    await session.refresh(submission)

    judge_submission.delay(submission.id)

    return SubmissionQueued(submission_id=submission.id, status=submission.status)


@router.get("/api/submissions/{submission_id}", response_model=SubmissionRead)
@router.get("/submissions/{submission_id}", response_model=SubmissionRead, include_in_schema=False)
async def get_submission(
    submission_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> SubmissionRead:
    stmt = select(Submission).where(Submission.id == submission_id)
    submission = (await session.execute(stmt)).scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    return SubmissionRead.model_validate(submission)


@router.post("/api/run", response_model=RunCodeResponse, status_code=status.HTTP_200_OK)
@router.post("/run", response_model=RunCodeResponse, status_code=status.HTTP_200_OK, include_in_schema=False)
async def run_code(
    payload: RunCodeRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RunCodeResponse:
    time_limit_ms = payload.time_limit_ms or DEFAULT_TIME_LIMIT_MS
    memory_limit_kb = payload.memory_limit_kb or DEFAULT_MEMORY_LIMIT_KB

    if payload.problem_id is not None:
        problem = await session.get(Problem, payload.problem_id)
        if problem is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found.")
        time_limit_ms = problem.time_limit_ms
        memory_limit_kb = problem.memory_limit_kb

    try:
        result = await run_code_playground(
            code=payload.code,
            stdin=payload.stdin,
            time_limit_ms=time_limit_ms,
            memory_limit_kb=memory_limit_kb,
        )
    except (JudgeSystemError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return RunCodeResponse.model_validate(result)
