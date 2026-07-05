from .admin_problems import router as admin_problems_router
from .admin_users import router as admin_users_router
from .auth import get_current_admin_user, get_current_user, get_optional_current_user, router as auth_router
from .problem import router as problem_router

__all__ = [
    "admin_problems_router",
    "admin_users_router",
    "auth_router",
    "problem_router",
    "get_current_user",
    "get_current_admin_user",
    "get_optional_current_user",
]
