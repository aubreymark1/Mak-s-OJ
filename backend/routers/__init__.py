from .exams import router as exams_router
from .submit import router as submit_router
from .user import router as user_router

__all__ = ["exams_router", "submit_router", "user_router"]
