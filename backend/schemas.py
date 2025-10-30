from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    nickname: str
    name: str
    surname: str
    patronymic: Optional[str] = None


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int

    class Config:
        orm_mode = True


class MetricBase(BaseModel):
    project: Optional[str]
    timestamp: datetime
    added: int
    modified: int
    deleted: int


class MetricCreate(MetricBase):
    user_id: int


class MetricRead(MetricBase):
    id: int
    user: UserRead

    class Config:
        orm_mode = True
