"""SmartDeadlineEstimator API - Vercel Serverless Entry Point."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from estimator import DeadlineEstimator

app = FastAPI(title="SmartDeadlineEstimator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

estimator = DeadlineEstimator()

VALID_CATEGORIES = sorted({t["category"] for t in estimator.all_tasks})


class EstimateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    category: str


class SimilarTask(BaseModel):
    id: int
    title: str
    category: str
    actual_days: float
    similarity: float


class EstimateResponse(BaseModel):
    point_estimate_days: float
    range_min_days: float
    range_max_days: float
    similar_tasks: list[SimilarTask]


class EvolutionStep(BaseModel):
    step: int
    added_text: str
    accumulated_text: str
    point_estimate_days: float
    range_min_days: float
    range_max_days: float
    similar_tasks: list[SimilarTask]


class EvolutionResponse(BaseModel):
    evolution: list[EvolutionStep]


@app.get("/")
def read_root():
    return {"message": "SmartDeadlineEstimator API is running."}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/categories")
def categories():
    return {"categories": VALID_CATEGORIES}


@app.get("/api/evaluation")
def evaluation():
    return estimator.evaluate_holdout()


@app.post("/api/estimate", response_model=EstimateResponse)
def estimate(body: EstimateRequest):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Choose from: {', '.join(VALID_CATEGORIES)}",
        )
    return estimator.estimate(body.title, body.description, body.category)


@app.post("/api/estimate/evolution", response_model=EvolutionResponse)
def estimate_evolution(body: EstimateRequest):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Choose from: {', '.join(VALID_CATEGORIES)}",
        )
    evolution_steps = estimator.estimate_evolution(body.title, body.description, body.category)
    return {"evolution": evolution_steps}
