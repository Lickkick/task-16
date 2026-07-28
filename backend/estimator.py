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

        return {
            "point_estimate_days": round(point_estimate, 1),
            "range_min_days": round(range_min, 1),
            "range_max_days": round(range_max, 1),
            "similar_tasks": similar_tasks,
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
                "similar_tasks": est["similar_tasks"]
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
