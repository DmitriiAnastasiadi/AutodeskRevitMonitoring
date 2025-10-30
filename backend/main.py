from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, date
from typing import Optional, List
from database import SessionLocal, engine, Base
import models, schemas

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Revit Metrics API")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Пользователи ---
@app.post("/users/", response_model=schemas.UserRead)
@app.post("/api/users/", response_model=schemas.UserRead)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.nickname == user.nickname).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким никнеймом уже существует")
    new_user = models.User(**user.dict())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/users/", response_model=List[schemas.UserRead])
@app.get("/api/users/", response_model=List[schemas.UserRead])
def get_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()


# --- Метрики ---
@app.post("/metrics/", response_model=schemas.MetricRead)
@app.post("/api/metrics/", response_model=schemas.MetricRead)
def create_metric(metric: schemas.MetricCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == metric.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    new_metric = models.Metric(**metric.dict())
    db.add(new_metric)
    db.commit()
    db.refresh(new_metric)
    return new_metric


@app.get("/metrics/", response_model=List[schemas.MetricRead])
@app.get("/api/metrics/", response_model=List[schemas.MetricRead])
def get_metrics(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None, description="ID пользователя для фильтрации"),
    start_date: Optional[datetime] = Query(None, description="Начало периода (в формате ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="Конец периода (в формате ISO 8601)")
):
    query = db.query(models.Metric)

    if user_id:
        query = query.filter(models.Metric.user_id == user_id)

    if start_date and end_date:
        query = query.filter(
            and_(
                models.Metric.timestamp >= start_date,
                models.Metric.timestamp <= end_date
            )
        )

    return query.all()


# --- Сводная статистика по пользователю ---
@app.get("/metrics/summary/")
@app.get("/api/metrics/summary/")
def get_user_summary(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None, description="ID пользователя (опционально)"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """
    Возвращает суммарное количество добавленных, изменённых и удалённых элементов
    за указанный период (или за всё время, если период не задан).
    """

    query = db.query(models.Metric)

    if user_id:
        query = query.filter(models.Metric.user_id == user_id)

    if start_date and end_date:
        query = query.filter(
            and_(
                models.Metric.timestamp >= start_date,
                models.Metric.timestamp <= end_date
            )
        )

    metrics = query.all()

    total_added = sum(m.added for m in metrics)
    total_modified = sum(m.modified for m in metrics)
    total_deleted = sum(m.deleted for m in metrics)

    return {
        "user_id": user_id,
        "start_date": start_date,
        "end_date": end_date,
        "total_added": total_added,
        "total_modified": total_modified,
        "total_deleted": total_deleted,
        "records_count": len(metrics)
    }

# --- Статика: отдаем админ-панель и ассеты ---
# Определяем абсолютный путь к директории с фронтендом
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))

# Отдаем index.html по корню
@app.get("/", include_in_schema=False)
def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    return FileResponse(index_path)

# Обслуживаем статические файлы (css/js) по /static
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
