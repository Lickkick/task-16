# Smart Deadline Estimator

A collaborative task suite tool that leverages historical task data to estimate task durations, calculate uncertainty ranges, and display estimation evolution as more details are provided.

---

## 🛠️ Model Type & Architecture

The Smart Deadline Estimator uses a machine learning approach based on **TF-IDF Text Vectorization**, **One-Hot Category Encoding**, and a **Weighted K-Nearest Neighbors (KNN) Regressor**:

1. **Feature Extraction**:
   - **Text Fields**: The task `title` and `description` are combined and vectorized using a `TfidfVectorizer` (unigrams and bigrams, stop words removed, capped at 500 features).
   - **Category Fields**: The task `category` is encoded using a `OneHotEncoder` (one-hot categorical mapping).
2. **Feature Fusion**:
   - The text TF-IDF vector and the one-hot category vector are concatenated. 
   - A `CATEGORY_WEIGHT` (default `0.35`) is applied to the category features to control its influence relative to the textual description.
3. **Estimation Logic**:
   - **Point Estimate**: Computed as the similarity-weighted average of the actual durations of the $K$ nearest neighbors ($K=5$). Cosine similarity is used as the distance metric.
   - **Uncertainty Range**: Defined by the minimum and maximum actual durations among the $K$ nearest neighbor tasks.

---

## 🔄 What We Did (Key Features & Changes)

We implemented several enhancements across the frontend and backend:

1. **Deadline Estimation Evolution (Backend & UI)**:
   - Added an endpoint `/api/estimate/evolution` that splits a detailed description into sentences and calculates the estimated timeline sequentially as each sentence is added.
   - Built a dynamic **Evolution Timeline UI** on the frontend where users can click through each sentence step to see how detail accumulation shifts the predicted duration.
2. **Dark Monochrome Theme**:
   - Revamped the UI to feature a premium dark monochrome theme using modern CSS variables, clean typography, custom range bars, and interactive hover effects.
   - Removed all emojis for a sleek, enterprise-grade aesthetic.
3. **Dataset Conversion**:
   - Converted the raw task data into a clean CSV format (`tasks.csv`) for fast parsing and modeling.
4. **Backend CORS Configuration Fix**:
   - Fixed a CORS issue in `backend/main.py` where `allow_credentials=True` was used alongside the wildcard origin `allow_origins=["*"]`. This was resolved by setting `allow_credentials=False` to prevent browser blockages and startup config errors.

---

## 📋 API Documentation

### GET `/`
Returns API status message.

### GET `/api/health`
Health check endpoint.
* **Response**: `{"status": "ok"}`

### GET `/api/categories`
Retrieves list of all valid task categories.
* **Response**: `{"categories": ["Frontend", "Backend", "DevOps", ...]}`

### GET `/api/evaluation`
Evaluates the KNN model performance on a pre-defined holdout set (20% of tasks) and returns predictions and Mean Absolute Error (MAE).
* **Response**:
```json
{
  "holdout_count": 20,
  "training_count": 80,
  "mean_absolute_error_days": 1.52,
  "predictions": [...]
}
```

### POST `/api/estimate`
Generates a point estimate and uncertainty range for a single task.
* **Request Body**:
```json
{
  "title": "Fix OAuth login redirect",
  "description": "The redirect URI is not properly handled on mobile safari browsers.",
  "category": "Bug Fix"
}
```
* **Response**:
```json
{
  "point_estimate_days": 3.0,
  "range_min_days": 1.0,
  "range_max_days": 5.0,
  "similar_tasks": [
    { "id": 12, "title": "...", "category": "...", "actual_days": 3.0, "similarity": 0.85 }
  ]
}
```

### POST `/api/estimate/evolution`
Generates step-by-step estimates as each sentence in the description is accumulated.
* **Request Body**: Same as `/api/estimate`.
* **Response**:
```json
{
  "evolution": [
    {
      "step": 1,
      "added_text": "Sentence 1.",
      "accumulated_text": "Sentence 1.",
      "point_estimate_days": 2.5,
      "range_min_days": 1.0,
      "range_max_days": 4.0,
      "similar_tasks": [...]
    }
  ]
}
```

---

## 🚀 Running the App Locally

### Backend Setup
1. Navigate to the `backend/` directory.
2. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the API server:
   ```bash
   python -m uvicorn main:app --reload
   ```

### Frontend Setup
1. Navigate to the `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
