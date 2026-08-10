"""Read-only dashboard metric endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import get_db
from db.metrics import compute_dashboard, compute_metrics
from schemas import DashboardData, Metrics

router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics", response_model=Metrics)
async def get_metrics(db: Session = Depends(get_db)) -> dict:
    """Current metrics snapshot, computed from the database."""
    return compute_metrics(db)


@router.get("/dashboard", response_model=DashboardData)
async def get_dashboard(db: Session = Depends(get_db)) -> dict:
    """Complete dashboard data (metrics + historical series), from the database."""
    return compute_dashboard(db)
