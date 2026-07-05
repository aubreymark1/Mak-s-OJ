from __future__ import annotations

from datetime import datetime
from pathlib import PurePosixPath
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from models import SubmissionStatus

FileName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
CodeContent = Annotated[str, StringConstraints(min_length=0)]
MultiFileCode = dict[FileName, CodeContent]
Slug = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Difficulty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class JudgeCase(StrictSchema):
    input: str = ""
    expected_output: str


class UserBase(StrictSchema):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
    email: EmailStr
    full_name: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] = None


class UserCreate(UserBase):
    password: Annotated[str, StringConstraints(min_length=6, max_length=128)]


class UserLogin(StrictSchema):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
    password: Annotated[str, StringConstraints(min_length=6, max_length=128)]


class UserRead(UserBase):
    id: int
    is_active: bool
    is_superuser: bool
    is_admin: bool = False
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TokenResponse(StrictSchema):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class ProblemBase(StrictSchema):
    slug: Slug
    title: Title
    statement_markdown: Annotated[str, StringConstraints(min_length=1)]
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    template_files: MultiFileCode = Field(min_length=1)
    readonly_files: list[FileName] = Field(default_factory=list)
    time_limit_ms: int = Field(default=2000, ge=100, le=60000)
    memory_limit_kb: int = Field(default=262144, ge=16384, le=1048576)
    judge_cases: list[JudgeCase] = Field(default_factory=list)

    @field_validator("template_files")
    @classmethod
    def validate_template_files(cls, value: MultiFileCode) -> MultiFileCode:
        return validate_multifile_payload(value)

    @field_validator("readonly_files")
    @classmethod
    def validate_readonly_files(cls, value: list[FileName]) -> list[FileName]:
        normalized = validate_multifile_payload({name: "" for name in value})
        return list(normalized.keys())


class ProblemCreate(ProblemBase):
    generator_code: str | None = None
    std_code: str | None = None


class ProblemRead(ProblemBase):
    id: int
    created_at: datetime
    updated_at: datetime


class ProblemListItem(StrictSchema):
    id: int
    slug: Slug
    title: Title
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    user_status: str | None = None
    created_at: datetime
    updated_at: datetime


class ProblemDetail(StrictSchema):
    id: int
    slug: Slug
    title: Title
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    description: Annotated[str, StringConstraints(min_length=1)]
    template_files: MultiFileCode
    readonly_files: list[FileName] = Field(default_factory=list)
    time_limit_ms: int
    memory_limit_kb: int
    judge_cases: list[JudgeCase] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProblemListResponse(StrictSchema):
    items: list[ProblemListItem]
    total: int
    page: int
    page_size: int


class SubmissionBase(StrictSchema):
    problem_id: int
    code: MultiFileCode = Field(min_length=1)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: MultiFileCode) -> MultiFileCode:
        return validate_multifile_payload(value)


class SubmissionCreate(SubmissionBase):
    user_id: int


class SubmissionQueued(StrictSchema):
    submission_id: int
    status: SubmissionStatus


class SubmissionRead(SubmissionBase):
    id: int
    user_id: int
    status: SubmissionStatus
    runtime_ms: int | None
    memory_kb: int | None
    compiler_output: str | None
    judge_result: dict | None = None
    created_at: datetime
    updated_at: datetime


class ProblemSubmissionHistoryItem(StrictSchema):
    id: int
    problem_id: int
    user_id: int
    status: SubmissionStatus
    code: MultiFileCode = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class RunCodeRequest(StrictSchema):
    problem_id: int | None = None
    code: MultiFileCode = Field(min_length=1)
    stdin: str = ""
    time_limit_ms: int | None = Field(default=None, ge=100, le=60000)
    memory_limit_kb: int | None = Field(default=None, ge=16384, le=1048576)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: MultiFileCode) -> MultiFileCode:
        return validate_multifile_payload(value)


class RunCodeResponse(StrictSchema):
    status: str
    stdout: str = ""
    stderr: str = ""
    compiler_output: str | None = None
    detail: str | None = None
    result: dict[str, Any] | None = None
    compile: dict[str, Any] | None = None


class UserStatsResponse(StrictSchema):
    user_id: int
    total_submissions: int
    ac_count: int
    attempted_problems: int
    ac_problems: int
    ac_rate: float


# ── Admin Schemas ──────────────────────────────────────────────────────────────


class AdminProblemCreate(StrictSchema):
    slug: Slug
    title: Title
    statement_markdown: Annotated[str, StringConstraints(min_length=1)]
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    template_files: MultiFileCode = Field(min_length=1)
    readonly_files: list[FileName] = Field(default_factory=list)
    time_limit_ms: int = Field(default=2000, ge=100, le=60000)
    memory_limit_kb: int = Field(default=262144, ge=16384, le=1048576)
    judge_cases: list[JudgeCase] = Field(default_factory=list)
    generator_code: str | None = None
    std_code: str | None = None

    @field_validator("template_files")
    @classmethod
    def validate_template_files(cls, value: MultiFileCode) -> MultiFileCode:
        return validate_multifile_payload(value)

    @field_validator("readonly_files")
    @classmethod
    def validate_readonly_files(cls, value: list[FileName]) -> list[FileName]:
        if not value:
            return []
        normalized = validate_multifile_payload({name: "" for name in value})
        return list(normalized.keys())


class AdminProblemUpdate(StrictSchema):
    slug: Slug | None = None
    title: Title | None = None
    statement_markdown: Annotated[str, StringConstraints(min_length=1)] | None = None
    difficulty: Difficulty | None = None
    tags: list[Tag] | None = None
    template_files: MultiFileCode | None = None
    readonly_files: list[FileName] | None = None
    time_limit_ms: int | None = Field(default=None, ge=100, le=60000)
    memory_limit_kb: int | None = Field(default=None, ge=16384, le=1048576)
    judge_cases: list[JudgeCase] | None = None
    generator_code: str | None = None
    std_code: str | None = None

    @field_validator("template_files")
    @classmethod
    def validate_template_files(cls, value: MultiFileCode | None) -> MultiFileCode | None:
        if value is None:
            return None
        return validate_multifile_payload(value)

    @field_validator("readonly_files")
    @classmethod
    def validate_readonly_files(cls, value: list[FileName] | None) -> list[FileName] | None:
        if value is None:
            return None
        if not value:
            return []
        normalized = validate_multifile_payload({name: "" for name in value})
        return list(normalized.keys())


class AdminProblemDetail(StrictSchema):
    id: int
    slug: Slug
    title: Title
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    statement_markdown: Annotated[str, StringConstraints(min_length=1)]
    template_files: MultiFileCode
    readonly_files: list[FileName] = Field(default_factory=list)
    time_limit_ms: int
    memory_limit_kb: int
    judge_cases: list[JudgeCase] = Field(default_factory=list)
    generator_code: str | None = None
    std_code: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminProblemListItem(StrictSchema):
    id: int
    slug: Slug
    title: Title
    difficulty: Difficulty | None = None
    tags: list[Tag] = Field(default_factory=list)
    has_fuzz: bool = False
    judge_case_count: int = 0
    created_at: datetime
    updated_at: datetime


class AdminProblemListResponse(StrictSchema):
    items: list[AdminProblemListItem]
    total: int
    page: int
    page_size: int


def validate_multifile_payload(value: MultiFileCode) -> MultiFileCode:
    if not value:
        raise ValueError("At least one source file must be supplied.")

    normalized: MultiFileCode = {}
    for raw_name, raw_content in value.items():
        file_name = raw_name.strip()
        if not file_name:
            raise ValueError("File name cannot be empty.")

        path = PurePosixPath(file_name)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"Unsafe file path: {file_name}")

        normalized[file_name] = raw_content

    return normalized


# ── Admin User Statistics Schemas ──────────────────────────────────────────────

class AdminUserStats(StrictSchema):
    id: int
    username: str
    email: str
    full_name: str | None
    is_admin: bool
    is_active: bool
    last_login_at: datetime | None
    total_submissions: int
    ac_problems_count: int
    attempted_problems_count: int
    ac_submissions_count: int
    ac_rate: float


class AdminUserListResponse(StrictSchema):
    users: list[AdminUserStats]


class AdminUserProblemProgress(StrictSchema):
    problem_id: int
    slug: str
    title: str
    difficulty: str | None
    tags: list[str]
    status: str | None  # "AC", "Attempted", or None
    total_submissions: int
    best_runtime_ms: int | None
    best_memory_kb: int | None
    last_submitted_at: datetime | None

