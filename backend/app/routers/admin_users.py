from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, case, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_current_admin_user
from database import get_db_session
from models import User, Problem, Submission, SubmissionStatus
from schemas import AdminUserListResponse, AdminUserStats, AdminUserProblemProgress

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


@router.get("", response_model=AdminUserListResponse, status_code=status.HTTP_200_OK)
async def admin_list_users(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> AdminUserListResponse:
    # Query to fetch all users and aggregate submission stats
    stmt = (
        select(
            User.id,
            User.username,
            User.email,
            User.full_name,
            User.is_admin,
            User.is_active,
            User.last_login_at,
            func.count(Submission.id).label("total_submissions"),
            func.count(distinct(case((Submission.status == SubmissionStatus.AC, Submission.problem_id), else_=None))).label("ac_problems_count"),
            func.count(distinct(Submission.problem_id)).label("attempted_problems_count"),
            func.count(case((Submission.status == SubmissionStatus.AC, 1), else_=None)).label("ac_submissions_count")
        )
        .outerjoin(Submission, User.id == Submission.user_id)
        .group_by(User.id)
        .order_by(User.id.asc())
    )

    result = await session.execute(stmt)
    rows = result.all()

    users_stats = []
    for row in rows:
        total_sub = row.total_submissions
        ac_sub = row.ac_submissions_count
        ac_rate = ac_sub / total_sub if total_sub > 0 else 0.0

        users_stats.append(
            AdminUserStats(
                id=row.id,
                username=row.username,
                email=row.email,
                full_name=row.full_name,
                is_admin=row.is_admin,
                is_active=row.is_active,
                last_login_at=row.last_login_at,
                total_submissions=total_sub,
                ac_problems_count=row.ac_problems_count,
                attempted_problems_count=row.attempted_problems_count,
                ac_submissions_count=ac_sub,
                ac_rate=round(ac_rate, 4),
            )
        )

    return AdminUserListResponse(users=users_stats)


@router.get("/{user_id}/progress", response_model=list[AdminUserProblemProgress], status_code=status.HTTP_200_OK)
async def admin_get_user_progress(
    user_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin_user),
) -> list[AdminUserProblemProgress]:
    # 1. Verify user exists
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    # 2. Fetch all problems
    problems_stmt = select(Problem).order_by(Problem.id.asc())
    problems = (await session.execute(problems_stmt)).scalars().all()

    # 3. Fetch all submissions for this user in chronological order
    submissions_stmt = (
        select(Submission)
        .where(Submission.user_id == user_id)
        .order_by(Submission.id.asc())
    )
    submissions = (await session.execute(submissions_stmt)).scalars().all()

    # 4. Map user progress per problem
    user_progress: dict[int, dict[str, Any]] = {}

    for sub in submissions:
        p_id = sub.problem_id
        if p_id not in user_progress:
            user_progress[p_id] = {
                "status": None,
                "total_submissions": 0,
                "best_runtime_ms": None,
                "best_memory_kb": None,
                "last_submitted_at": None,
            }

        stats = user_progress[p_id]
        stats["total_submissions"] += 1
        stats["last_submitted_at"] = sub.created_at

        if sub.status == SubmissionStatus.AC:
            stats["status"] = "AC"
            if sub.runtime_ms is not None:
                if stats["best_runtime_ms"] is None or sub.runtime_ms < stats["best_runtime_ms"]:
                    stats["best_runtime_ms"] = sub.runtime_ms
            if sub.memory_kb is not None:
                if stats["best_memory_kb"] is None or sub.memory_kb < stats["best_memory_kb"]:
                    stats["best_memory_kb"] = sub.memory_kb
        else:
            if stats["status"] != "AC":
                stats["status"] = "Attempted"

    # 5. Compile final progress list
    response = []
    for p in problems:
        prog = user_progress.get(p.id, {
            "status": None,
            "total_submissions": 0,
            "best_runtime_ms": None,
            "best_memory_kb": None,
            "last_submitted_at": None,
        })
        response.append(
            AdminUserProblemProgress(
                problem_id=p.id,
                slug=p.slug,
                title=p.title,
                difficulty=p.difficulty,
                tags=p.tags or [],
                status=prog["status"],
                total_submissions=prog["total_submissions"],
                best_runtime_ms=prog["best_runtime_ms"],
                best_memory_kb=prog["best_memory_kb"],
                last_submitted_at=prog["last_submitted_at"],
            )
        )

    return response


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def admin_delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    # 1. Check if user exists
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # 2. Prevent admin from deleting themselves
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account.",
        )

    # 3. Delete user (cascade will delete their submissions)
    await session.delete(user)
    await session.commit()

    return {"detail": f"User {user_id} and all related submissions deleted."}

