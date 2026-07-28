import { useEffect, useState } from 'react'
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
        <span>0</span>
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
  const [evaluation, setEvaluation] = useState<EvaluationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const scaleMax = result
    ? Math.ceil(Math.max(result.range_max_days, result.point_estimate_days) * 1.2)
    : 15

  return (
    <div className="app">
      <header className="header">
        <h1>Smart Deadline Estimator</h1>
        <p className="subtitle">
          Predict how long a task will take based on similar completed work
        </p>
        {evaluation && (
          <p className="mae-badge">
            Model MAE on held-out set: <strong>{evaluation.mean_absolute_error_days} days</strong>
            {' '}({evaluation.training_count} training / {evaluation.holdout_count} holdout tasks)
          </p>
        )}
      </header>

      <main className="main">
        <form className="estimate-form" onSubmit={handleSubmit}>
          <h2>New Task</h2>

          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix login button on mobile Safari"
              required
              minLength={3}
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the task involves..."
              required
              minLength={10}
              rows={4}
            />
          </label>

          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} required>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={loading || categories.length === 0}>
            {loading ? 'Estimating…' : 'Get Estimate'}
          </button>

          {error && <p className="error">{error}</p>}
        </form>

        {result && (
          <section className="result-card">
            <h2>Estimate</h2>

            <div className="estimate-summary">
              <span className="estimate-range">
                {result.range_min_days} to {result.range_max_days} days
              </span>
              <span className="estimate-point">
                most likely <strong>{result.point_estimate_days}</strong> days
              </span>
            </div>

            <RangeBar
              min={result.range_min_days}
              max={result.range_max_days}
              point={result.point_estimate_days}
              scaleMax={scaleMax}
            />

            <div className="legend">
              <span><span className="dot range" /> Range from similar tasks</span>
              <span><span className="dot point" /> Most likely estimate</span>
            </div>

            <h3>Based on similar past tasks</h3>
            <ul className="similar-list">
              {result.similar_tasks.map((task) => (
                <li key={task.id} className="similar-item">
                  <div className="similar-header">
                    <span className="similar-title">{task.title}</span>
                    <span className="similar-days">{task.actual_days} days</span>
                  </div>
                  <div className="similar-meta">
                    <span className="tag">{task.category}</span>
                    <span className="similarity">
                      {(task.similarity * 100).toFixed(0)}% similar
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <p className="disclaimer">
              This is a statistical estimate, not a guarantee. Use the range to plan
              buffers, especially for unfamiliar or large tasks.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
