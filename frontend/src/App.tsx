import React, { useEffect, useState, useCallback, useRef } from 'react'
import './App.css'

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

interface DropdownOption {
  label: string
  value: string
  description?: string
}

const DEFAULT_CATEGORIES = [
  'Bug Fix',
  'Design',
  'DevOps',
  'Documentation',
  'Feature',
  'Refactoring',
  'Research',
  'Testing',
]

const RENDER_BACKEND_URL = 'https://task-16-04vc.onrender.com'

const BACKEND_PRESETS: DropdownOption[] = [
  {
    label: 'Render Cloud Backend (Active)',
    value: 'https://task-16-04vc.onrender.com',
    description: 'Render Hosted Service: task-16-04vc.onrender.com',
  },
  {
    label: 'Local Dev Backend',
    value: 'http://localhost:8000',
    description: 'Runs on http://localhost:8000',
  },
  {
    label: 'Vercel / Same Domain',
    value: '',
    description: 'Relative /api endpoints',
  },
]

// Custom Scrollable Dropdown Component
function ScrollableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
}: {
  options: DropdownOption[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="custom-dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className={`custom-dropdown-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="dropdown-selected-text">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="custom-dropdown-menu">
          <div className="dropdown-scroll-list">
            {options.length === 0 ? (
              <div className="dropdown-empty-item">No options available</div>
            ) : (
              options.map((opt) => (
                <div
                  key={opt.value}
                  className={`dropdown-item ${opt.value === value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                >
                  <div className="dropdown-item-label">{opt.label}</div>
                  {opt.description && <div className="dropdown-item-desc">{opt.description}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Bug Fix')
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [evolution, setEvolution] = useState<EvolutionStep[] | null>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVerdict, setShowVerdict] = useState(false)

  // API Config State - Defaults to Render Cloud Backend URL
  const [apiUrl, setApiUrl] = useState<string>(() => {
    return localStorage.getItem('custom_api_url') || import.meta.env.VITE_API_URL || RENDER_BACKEND_URL
  })
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('custom_api_key') || ''
  })
  const [showApiSettings, setShowApiSettings] = useState(false)

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) {
      headers['X-API-Key'] = apiKey
    }
    return headers
  }, [apiKey])

  const fetchInitialData = useCallback(() => {
    const baseUrl = apiUrl.replace(/\/$/, '')
    setError(null)

    fetch(`${baseUrl}/api/categories`, { headers: getHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories)
          if (!category) {
            setCategory(data.categories[0])
          }
        }
      })
      .catch(() => setError('Could not connect to the estimator API. Check your API settings below.'))

    fetch(`${baseUrl}/api/evaluation`, { headers: getHeaders() })
      .then((r) => r.json())
      .then(setEvaluation)
      .catch(() => {})
  }, [apiUrl, category, getHeaders])

  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('custom_api_url', apiUrl)
    localStorage.setItem('custom_api_key', apiKey)
    fetchInitialData()
    setShowApiSettings(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    setEvolution(null)
    setActiveStep(null)

    const baseUrl = apiUrl.replace(/\/$/, '')

    try {
      const res = await fetch(`${baseUrl}/api/estimate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, description, category }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.detail || 'Estimation failed')
      }

      const mainResult = await res.json()
      setResult(mainResult)

      // Fetch evolution
      const evoRes = await fetch(`${baseUrl}/api/estimate/evolution`, {
        method: 'POST',
        headers: getHeaders(),
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

  const currentStepData =
    evolution && activeStep !== null
      ? evolution.find((s) => s.step === activeStep)
      : null

  const displayPoint = currentStepData ? currentStepData.point_estimate_days : result?.point_estimate_days
  const displayMin = currentStepData ? currentStepData.range_min_days : result?.range_min_days
  const displayMax = currentStepData ? currentStepData.range_max_days : result?.range_max_days
  const displaySimilar = currentStepData ? currentStepData.similar_tasks : result?.similar_tasks

  const categoryOptions: DropdownOption[] = categories.map((c) => ({
    label: c,
    value: c,
  }))

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="header-badge">SFCollab Task Suite</div>
          <button
            className="api-config-btn"
            onClick={() => setShowApiSettings(!showApiSettings)}
            title="Configure API Connection & Key"
          >
            API Settings {showApiSettings ? '▲' : '⚙'}
          </button>
        </div>

        <h1>Smart Deadline Estimator</h1>
        <p className="subtitle">
          Leverage historical task patterns to predict development duration and map team uncertainty.
        </p>

        {showApiSettings && (
          <form className="api-settings-panel" onSubmit={handleSaveSettings}>
            <h3>API Connection & Authentication Settings</h3>

            <label className="input-label">
              <span>Quick Backend Preset</span>
              <ScrollableSelect
                options={BACKEND_PRESETS}
                value={apiUrl}
                onChange={(newUrl) => setApiUrl(newUrl)}
                placeholder="Choose a backend preset..."
              />
            </label>

            <label className="input-label">
              <span>Backend API Base URL</span>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="e.g. https://task-16-04vc.onrender.com or http://localhost:8000"
              />
            </label>

            <label className="input-label">
              <span>API Key (Optional)</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API Key if required by backend"
              />
            </label>

            <div className="settings-actions">
              <button type="submit" className="save-settings-btn">Save & Connect</button>
              <button type="button" className="cancel-settings-btn" onClick={() => setShowApiSettings(false)}>Cancel</button>
            </div>
          </form>
        )}

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
              <ScrollableSelect
                options={categoryOptions}
                value={category}
                onChange={(val) => setCategory(val)}
                placeholder="Select a category..."
              />
            </label>

            <button type="submit" className="submit-btn" disabled={loading || !category}>
              {loading ? (
                <span className="spinner-container">
                  <span className="spinner" /> Estimating...
                </span>
              ) : (
                'Get Smart Estimate'
              )}
            </button>

            {error && (
              <div className="error-message">
                <p>{error}</p>
                {!showApiSettings && (
                  <button
                    type="button"
                    className="error-api-btn"
                    onClick={() => setShowApiSettings(true)}
                  >
                    Configure API Connection URL & Key ⚙
                  </button>
                )}
              </div>
            )}
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

              {evolution && evolution.length > 1 && (
                <div className="evolution-section">
                  <h3>Estimate Evolution Timeline</h3>
                  <p className="evolution-subtitle">
                    Click a step below to inspect how detail accumulation shifted the predicted timeline:
                  </p>

                  <div className="evolution-steps">
                    {evolution.map((step) => (
                      <button
                        key={step.step}
                        type="button"
                        className={`step-btn ${activeStep === step.step ? 'active' : ''}`}
                        onClick={() => setActiveStep(step.step)}
                      >
                        <span className="step-num">Step {step.step}</span>
                        <span className="step-point">{step.point_estimate_days}d</span>
                      </button>
                    ))}
                  </div>

                  {currentStepData && (
                    <div className="step-detail-card">
                      <div className="step-added-text">
                        <strong>Added in this step:</strong> &quot;{currentStepData.added_text}&quot;
                      </div>
                      <div className="step-accumulated-text">
                        <strong>Accumulated Context:</strong> {currentStepData.accumulated_text}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {displaySimilar && displaySimilar.length > 0 && (
                <div className="similar-tasks-section">
                  <h3>K-Nearest Historical Tasks</h3>
                  <div className="tasks-grid">
                    {displaySimilar.map((t) => (
                      <div key={t.id} className="task-item">
                        <div className="task-header">
                          <span className="task-title">{t.title}</span>
                          <span className="task-sim">{(t.similarity * 100).toFixed(0)}% match</span>
                        </div>
                        <div className="task-meta">
                          <span className="task-category">{t.category}</span>
                          <span className="task-duration">{t.actual_days} days actual</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-results">
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
