from sqlalchemy import Column, Integer, String, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=False)
    surname = Column(Text, nullable=False)
    patronymic = Column(Text)

    metrics = relationship("Metric", back_populates="user")


class Metric(Base):
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project = Column(Text)
    timestamp = Column(TIMESTAMP)
    added = Column(Integer)
    modified = Column(Integer)
    deleted = Column(Integer)

    user = relationship("User", back_populates="metrics")
