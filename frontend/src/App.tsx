import React, { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface SimilarTask {
  id: number
  title: string
  category: string
  actual_days: number
  similarity: number
}

interface EstimateResult {
  point_estimate_days: number
  range_min_days: number
  range_max_days: number
  similar_tasks: SimilarTask[]
}

interface EvaluationInfo {
  mean_absolute_error_days: number
  holdout_count: number
  training_count: number
}

interface EvolutionStep {
  step: number
  added_text: string
  accumulated_text: string
  point_estimate_days: number
  range_min_days: number
  range_max_days: number
  similar_tasks: SimilarTask[]
}

function RangeBar({
  min,
  max,
  point,
  scaleMax,
}: {
  min: number
  max: number
  point: number
  scaleMax: number
}) {
  const toPercent = (v: number) => Math.min(100, (v / scaleMax) * 100)

  return (
    <div className="range-bar" aria-label={`Estimated range ${min} to ${max} days, most likely ${point}`}>
      <div className="range-track">
        <div
          className="range-fill"
          style={{
            left: `${toPercent(min)}%`,
            width: `${Math.max(toPercent(max) - toPercent(min), 2)}%`,
          }}
        />
        <div
          className="range-marker"
          style={{ left: `${toPercent(point)}%` }}
          title={`Most likely: ${point} days`}
        />
      </div>
      <div className="range-labels">
        <span>0d</span>
        <span>{scaleMax} days</span>
      </div>
    </div>
  )
}

function App() {
  const [categories, setCategories] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [evolution, setEvolution] = useState<EvolutionStep[] | null>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVerdict, setShowVerdict] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/categories`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories)
        if (data.categories.length > 0) {
          setCategory(data.categories[0])
        }
      })
      .catch(() => setError('Could not connect to the estimator API.'))

    fetch(`${API_URL}/api/evaluation`)
      .then((r) => r.json())
      .then(setEvaluation)
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    setEvolution(null)
    setActiveStep(null)

    try {
      const res = await fetch(`${API_URL}/api/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.detail || 'Estimation failed')
      }

      const mainResult = await res.json()
      setResult(mainResult)

      // Fetch evolution
      const evoRes = await fetch(`${API_URL}/api/estimate/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category }),
      })

      if (evoRes.ok) {
        const evoData = await evoRes.json()
        setEvolution(evoData.evolution)
        if (evoData.evolution.length > 0) {
          setActiveStep(evoData.evolution.length)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Determine scaleMax dynamically based on maximum days predicted
  const getScaleMax = () => {
    let maxDays = 15
    if (result) {
      maxDays = Math.max(maxDays, result.range_max_days, result.point_estimate_days)
    }
    if (evolution) {
      evolution.forEach((step) => {
        maxDays = Math.max(maxDays, step.range_max_days, step.point_estimate_days)
      })
    }
    return Math.ceil(maxDays * 1.2)
  }

  const scaleMax = getScaleMax()

  // Get current step details (either selected from evolution timeline, or final result)
  const currentStepData =
    evolution && activeStep !== null
      ? evolution.find((s) => s.step === activeStep)
      : null

  const displayPoint = currentStepData ? currentStepData.point_estimate_days : result?.point_estimate_days
  const displayMin = currentStepData ? currentStepData.range_min_days : result?.range_min_days
  const displayMax = currentStepData ? currentStepData.range_max_days : result?.range_max_days
  const displaySimilar = currentStepData ? currentStepData.similar_tasks : result?.similar_tasks

  return (
    <div className="app">
      <header className="header">
        <div className="header-badge">SFCollab Task Suite</div>
        <h1>Smart Deadline Estimator</h1>
        <p className="subtitle">
          Leverage historical task patterns to predict development duration and map team uncertainty.
        </p>

        {evaluation && (
          <div className="mae-container">
            <div className="mae-badge" onClick={() => setShowVerdict(!showVerdict)}>
              Model MAE on Held-out Set: <strong>{evaluation.mean_absolute_error_days} days</strong>
            </div>
            {showVerdict && (
              <div className="verdict-popup">
                <h4>Honest Verdict & Model Performance</h4>
                <p>
                  Evaluated on <strong>{evaluation.holdout_count}</strong> held-out tasks and trained on <strong>{evaluation.training_count}</strong>.
                  With a Mean Absolute Error of {evaluation.mean_absolute_error_days} days, the model is a reliable baseline for small-to-medium tasks.
                </p>
                <p className="warning-text">
                  <strong>Caution:</strong> The model struggles with large architectural migrations (e.g. REST to event-driven) which have high variance. Use these estimates as general guidelines, not strict commitments.
                </p>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="main">
        <div className="form-container">
          <form className="estimate-form" onSubmit={handleSubmit}>
            <h2>Estimate New Task</h2>
            <p className="form-helper">Enter details below to generate a statistical deadline range.</p>

            <label className="input-label">
              <span>Task Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fix oauth login redirect on mobile Safari"
                required
                minLength={3}
              />
            </label>

            <label className="input-label">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what needs to be built. Add multiple sentences to see the estimate evolution over time!"
                required
                minLength={10}
                rows={6}
              />
            </label>

            <label className="input-label">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="submit-btn" disabled={loading || categories.length === 0}>
              {loading ? (
                <span className="spinner-container">
                  <span className="spinner" /> Estimating...
                </span>
              ) : (
                'Get Smart Estimate'
              )}
            </button>

            {error && <div className="error-message">{error}</div>}
          </form>
        </div>

        <div className="results-container">
          {result ? (
            <div className="result-card">
              <div className="result-header">
                <h2>Prediction Result</h2>
                {currentStepData && (
                  <span className="step-badge">
                    Step {activeStep} of {evolution?.length}
                  </span>
                )}
              </div>

              {/* Estimate values */}
              <div className="estimate-summary">
                <div className="estimate-row">
                  <div className="estimate-block">
                    <span className="block-label">Expected Range</span>
                    <span className="block-val">{displayMin} – {displayMax} days</span>
                  </div>
                  <div className="estimate-block primary">
                    <span className="block-label">Most Likely</span>
                    <span className="block-val">{displayPoint} days</span>
                  </div>
                </div>

                {displayMin !== undefined && displayMax !== undefined && displayPoint !== undefined && (
                  <RangeBar
                    min={displayMin}
                    max={displayMax}
                    point={displayPoint}
                    scaleMax={scaleMax}
                  />
                )}

                <div className="legend">
                  <span><span className="dot range" /> Range from neighbors</span>
                  <span><span className="dot point" /> Point estimate</span>
                </div>
              </div>

              {/* Evolution timeline (Stretch Goal) */}
              {evolution && evolution.length > 1 && (
                <div className="evolution-section">
                  <h3>Estimate Evolution (per sentence added)</h3>
                  <p className="evolution-helper">
                    Click steps below to see how adding more detail shifted the model's estimate:
                  </p>
                  <div className="evolution-timeline">
                    {evolution.map((step) => {
                      const isActive = step.step === activeStep
                      return (
                        <div
                          key={step.step}
                          className={`timeline-step ${isActive ? 'active' : ''}`}
                          onClick={() => setActiveStep(step.step)}
                        >
                          <div className="timeline-marker">
                            <span className="step-num">{step.step}</span>
                          </div>
                          <div className="timeline-content">
                            <p className="timeline-text">"{step.added_text}"</p>
                            <span className="timeline-est">
                              {step.point_estimate_days}d ({step.range_min_days} - {step.range_max_days}d)
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Similar tasks list */}
              <div className="similar-section">
                <h3>Similar Completed Tasks Leaned On</h3>
                <ul className="similar-list">
                  {displaySimilar?.map((task) => (
                    <li key={task.id} className="similar-item">
                      <div className="similar-header">
                        <span className="similar-title">{task.title}</span>
                        <span className="similar-days">{task.actual_days} days</span>
                      </div>
                      <div className="similar-meta">
                        <span className="tag">{task.category}</span>
                        <span className="similarity">
                          {(task.similarity * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="disclaimer">
                Range is calculated from local neighborhood distribution. Use the upper bound to buffer timelines.
              </div>
            </div>
          ) : (
            <div className="empty-results-card">
              <h3>No Prediction Yet</h3>
              <p>Fill out the form and submit to see the estimated duration, range, and similar tasks.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
