from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session
from models import Problem, Submission, SubmissionStatus, User
from schemas import UserStatsResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}/stats", response_model=UserStatsResponse, status_code=status.HTTP_200_OK)
async def get_user_stats(
    user_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> UserStatsResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    total_submissions = (
        await session.execute(
            select(func.count()).select_from(Submission).where(Submission.user_id == user_id)
        )
    ).scalar_one()

    ac_count = (
        await session.execute(
            select(func.count())
            .select_from(Submission)
            .where(Submission.user_id == user_id, Submission.status == SubmissionStatus.AC)
        )
    ).scalar_one()

    attempted_problems = (
        await session.execute(
            select(func.count(func.distinct(Submission.problem_id)))
            .select_from(Submission)
            .where(Submission.user_id == user_id)
        )
    ).scalar_one()

    ac_problems = (
        await session.execute(
            select(func.count(func.distinct(Submission.problem_id)))
            .select_from(Submission)
            .where(Submission.user_id == user_id, Submission.status == SubmissionStatus.AC)
        )
    ).scalar_one()

    ac_rate = ac_count / total_submissions if total_submissions > 0 else 0.0

    return UserStatsResponse(
        user_id=user_id,
        total_submissions=total_submissions,
        ac_count=ac_count,
        attempted_problems=attempted_problems,
        ac_problems=ac_problems,
        ac_rate=round(ac_rate, 4),
    )
