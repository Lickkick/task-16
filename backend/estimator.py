"""K-nearest-neighbors deadline estimator using text + category features."""

from __future__ import annotations

import csv
import json
from pathlib import Path
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import OneHotEncoder

from vector_db import ProjectVectorDB

DATA_PATH = Path(__file__).parent / "data" / "tasks.csv"
K_NEIGHBORS = 5
CATEGORY_WEIGHT = 0.35


def _task_text(task: dict) -> str:
    return f"{task['title']} {task['description']}"


class DeadlineEstimator:
    def __init__(self, data_path: Path = DATA_PATH):
        with open(data_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            self.all_tasks = []
            for row in reader:
                self.all_tasks.append({
                    "id": int(row["id"]),
                    "title": row["title"],
                    "description": row["description"],
                    "category": row["category"],
                    "actual_days": float(row["actual_days"]),
                    "holdout": row["holdout"].lower() == "true"
                })

        self.training_tasks = [t for t in self.all_tasks if not t["holdout"]]
        self.holdout_tasks = [t for t in self.all_tasks if t["holdout"]]

        texts = [_task_text(t) for t in self.training_tasks]
        categories = [[t["category"]] for t in self.training_tasks]

        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=500,
        )
        self.text_matrix = self.vectorizer.fit_transform(texts)

        self.category_encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
        self.category_matrix = self.category_encoder.fit_transform(categories)

        self.durations = np.array([t["actual_days"] for t in self.training_tasks])
        
        # Initialize Vector DB for Projects
        self.project_db = ProjectVectorDB()

    def _feature_vector(self, title: str, description: str, category: str) -> np.ndarray:
        text_vec = self.vectorizer.transform([f"{title} {description}"]).toarray()
        cat_vec = self.category_encoder.transform([[category]])
        return np.hstack([text_vec, cat_vec * CATEGORY_WEIGHT])

    def _training_matrix(self) -> np.ndarray:
        cat_weighted = self.category_matrix * CATEGORY_WEIGHT
        return np.hstack([self.text_matrix.toarray(), cat_weighted])

    def estimate(self, title: str, description: str, category: str) -> dict:
        query = self._feature_vector(title, description, category)
        train_matrix = self._training_matrix()

        similarities = cosine_similarity(query, train_matrix)[0]
        top_indices = np.argsort(similarities)[::-1][:K_NEIGHBORS]

        neighbor_sims = similarities[top_indices]
        neighbor_durations = self.durations[top_indices]

        # Weighted average by similarity (with floor to avoid zero-weight)
        weights = np.maximum(neighbor_sims, 0.01)
        point_estimate = float(np.average(neighbor_durations, weights=weights))

        range_min = float(np.min(neighbor_durations))
        range_max = float(np.max(neighbor_durations))

        similar_tasks = []
        for idx, sim in zip(top_indices, neighbor_sims):
            task = self.training_tasks[idx]
            similar_tasks.append(
                {
                    "id": task["id"],
                    "title": task["title"],
                    "category": task["category"],
                    "actual_days": task["actual_days"],
                    "similarity": round(float(sim), 3),
                }
            )

        # Retrieve similar project using Vector DB (RAG)
        similar_project, proj_similarity = self.project_db.search(title, description)
        
        # Adjust estimate based on the similar project reference
        baseline_estimate = point_estimate
        if proj_similarity > 0.05:
            # Shift estimate toward project actual days scaled by similarity
            weight = proj_similarity * 0.4
            adjusted_estimate = baseline_estimate * (1.0 - weight) + similar_project["actual_days"] * weight
            
            # Incorporate project complexity variance into range bounds
            rag_adjusted_min = min(range_min, similar_project["actual_days"] * 0.75)
            rag_adjusted_max = max(range_max, similar_project["actual_days"] * 1.25)
        else:
            adjusted_estimate = baseline_estimate
            rag_adjusted_min = range_min
            rag_adjusted_max = range_max

        # Construct RAG Comparative Analysis & Explanation
        sim_pct = int(proj_similarity * 100)
        diff_days = round(adjusted_estimate - float(similar_project["actual_days"]), 1)
        if diff_days > 0:
            diff_str = f"adding approximately {diff_days} extra day(s)"
        elif diff_days < 0:
            diff_str = f"saving approximately {abs(diff_days)} day(s)"
        else:
            diff_str = "matching the historical baseline scope"

        effort_bk = similar_project.get("effort_breakdown", {
            "API Integration": 45,
            "Frontend Integration": 35,
            "Testing & Security": 20
        })

        effort_items = [f"{k} accounts for {v}%" for k, v in effort_bk.items()]
        breakdown_text = ", while ".join(effort_items) if effort_items else "API integration consumes around 45% of effort"

        reason_text = (
            f"The current task introduces {category.lower()} requirements, {diff_str} compared to "
            f"retrieved project '{similar_project['name']}' ({sim_pct}% similarity, actual completion: {similar_project['actual_days']}d). "
            f"Based on similar projects, {breakdown_text}."
        )

        risks = similar_project.get("blockers", [
            "Dependency changes and API compatibility issues",
            "Environment configuration and permissions delay"
        ])

        recommendations = [
            "Perform early schema validation and API mock tests before frontend binding.",
            "Pre-allocate CI pipeline runners to prevent build bottleneck delays.",
            "Audit environment secrets and permissions prior to deployment."
        ]

        rag_analysis = {
            "similar_project": {
                "id": similar_project["id"],
                "name": similar_project["name"],
                "description": similar_project["description"],
                "actual_days": similar_project["actual_days"],
                "complexity": similar_project["complexity"],
                "team_size": similar_project["team_size"],
                "technologies": similar_project["technologies"],
                "key_outcomes": similar_project["key_outcomes"],
                "blockers": similar_project.get("blockers", []),
                "effort_breakdown": effort_bk,
                "implementation_details": similar_project.get("implementation_details", ""),
                "similarity": proj_similarity
            },
            "actual_completion_days": similar_project["actual_days"],
            "current_estimate_days": round(adjusted_estimate, 1),
            "reason": reason_text,
            "effort_breakdown": effort_bk,
            "potential_risks": risks,
            "recommendations": recommendations
        }

        # Explain how the project affected the estimate
        impact_diff = adjusted_estimate - baseline_estimate
        if abs(impact_diff) < 0.1:
            impact_text = f"Matched '{similar_project['name']}' ({int(proj_similarity*100)}% similarity). No significant impact on estimates."
        elif impact_diff > 0:
            impact_text = f"Matched '{similar_project['name']}' ({int(proj_similarity*100)}% similarity, took {similar_project['actual_days']}d). Increased estimate by +{round(impact_diff, 1)}d due to reference project scale."
        else:
            impact_text = f"Matched '{similar_project['name']}' ({int(proj_similarity*100)}% similarity, took {similar_project['actual_days']}d). Reduced estimate by {round(impact_diff, 1)}d based on reference project execution."

        return {
            "point_estimate_days": round(adjusted_estimate, 1),
            "range_min_days": round(rag_adjusted_min, 1),
            "range_max_days": round(rag_adjusted_max, 1),
            "rag_analysis": rag_analysis,
            "rag_impact": impact_text,
            "baseline_estimate_days": round(baseline_estimate, 1)
        }

    def estimate_evolution(self, title: str, description: str, category: str) -> list[dict]:
        # Split description into sentences.
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', description) if s.strip()]
        if not sentences:
            sentences = [description]

        evolution = []
        accumulated = ""
        for i, sentence in enumerate(sentences):
            if accumulated:
                accumulated += " " + sentence
            else:
                accumulated = sentence

            est = self.estimate(title, accumulated, category)
            evolution.append({
                "step": i + 1,
                "added_text": sentence,
                "accumulated_text": accumulated,
                "point_estimate_days": est["point_estimate_days"],
                "range_min_days": est["range_min_days"],
                "range_max_days": est["range_max_days"],
                "rag_analysis": est["rag_analysis"],
                "rag_impact": est["rag_impact"],
                "baseline_estimate_days": est["baseline_estimate_days"]
            })
        return evolution

    def evaluate_holdout(self) -> dict:
        errors = []
        predictions = []

        for task in self.holdout_tasks:
            result = self.estimate(task["title"], task["description"], task["category"])
            actual = task["actual_days"]
            predicted = result["point_estimate_days"]
            error = abs(actual - predicted)
            errors.append(error)
            predictions.append(
                {
                    "id": task["id"],
                    "title": task["title"],
                    "category": task["category"],
                    "actual_days": actual,
                    "predicted_days": predicted,
                    "error_days": round(error, 2),
                }
            )

        mae = float(np.mean(errors))
        return {
            "holdout_count": len(self.holdout_tasks),
            "training_count": len(self.training_tasks),
            "mean_absolute_error_days": round(mae, 2),
            "predictions": predictions,
        }

