import React, { useEffect, useState, useRef } from 'react'
import './App.css'
import { estimatorEngine } from './estimatorEngine'
import type {
  EstimateResult,
  EvaluationInfo,
  EvolutionStep,
} from './estimatorEngine'

interface DropdownOption {
  label: string
  value: string
  description?: string
}

interface TestPreset {
  label: string
  title: string
  description: string
  category: string
}

const QUICK_TEST_PRESETS: TestPreset[] = [
  {
    label: '🐛 Bug Fix',
    title: 'Fix login button not responding on mobile Safari',
    description: 'Users report the login button does nothing when tapped on iOS Safari. Likely a touch event handler issue.',
    category: 'Bug Fix',
  },
  {
    label: '✨ Feature',
    title: 'Add dark mode toggle to settings page',
    description: 'Implement a theme switcher that persists user preference in localStorage and applies CSS variables across the app.',
    category: 'Feature',
  },
  {
    label: '⚙️ DevOps',
    title: 'Set up CI pipeline with GitHub Actions',
    description: 'Configure automated test runs, linting, and deployment on push to main branch.',
    category: 'DevOps',
  },
  {
    label: '🛠️ Refactoring',
    title: 'Extract shared form validation into library',
    description: 'Move duplicated email, phone, and password validation from 6 components into forms package.',
    category: 'Refactoring',
  },
  {
    label: '🎨 Design',
    title: 'Design mobile-responsive dashboard layout',
    description: 'Adapt desktop dashboard widgets into collapsible cards for screens under 768px width.',
    category: 'Design',
  },
  {
    label: '🧪 Testing',
    title: 'Add unit tests for payment validation module',
    description: 'Cover edge cases: expired cards, invalid CVV, currency mismatches, and refund logic.',
    category: 'Testing',
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
  const [categories, setCategories] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [isAutoDetected, setIsAutoDetected] = useState(false)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [evolution, setEvolution] = useState<EvolutionStep[] | null>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [showVerdict, setShowVerdict] = useState(false)

  useEffect(() => {
    const availableCategories = estimatorEngine.getCategories()
    setCategories(availableCategories)
    if (availableCategories.length > 0) {
      setCategory(availableCategories[0])
    }

    const evalData = estimatorEngine.evaluateHoldout()
    setEvaluation(evalData)
  }, [])

  // Auto-detect category as user types Title or Description
  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (val.trim()) {
      const detected = estimatorEngine.predictCategory(val, description)
      setCategory(detected)
      setIsAutoDetected(true)
    }
  }

  const handleDescriptionChange = (val: string) => {
    setDescription(val)
    if (title.trim() || val.trim()) {
      const detected = estimatorEngine.predictCategory(title, val)
      setCategory(detected)
      setIsAutoDetected(true)
    }
  }

  const handleCategorySelect = (val: string) => {
    setCategory(val)
    setIsAutoDetected(false) // User manually selected category
  }

  const handleApplyPreset = (preset: TestPreset) => {
    setTitle(preset.title)
    setDescription(preset.description)
    setCategory(preset.category)
    setIsAutoDetected(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setEvolution(null)
    setActiveStep(null)

    setTimeout(() => {
      const mainResult = estimatorEngine.estimate(title, description, category)
      const evoSteps = estimatorEngine.estimateEvolution(title, description, category)

      setResult(mainResult)
      setEvolution(evoSteps)
      if (evoSteps.length > 0) {
        setActiveStep(evoSteps.length)
      }
      setLoading(false)
    }, 150)
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
        </div>

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
          {/* Quick Test Box */}
          <div className="quick-test-box">
            <div className="quick-test-header">
              <span>⚡ Quick Test Samples</span>
              <span className="quick-test-sub">Click any sample to test title & auto-category detection:</span>
            </div>
            <div className="quick-test-chips">
              {QUICK_TEST_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="quick-chip"
                  onClick={() => handleApplyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form className="estimate-form" onSubmit={handleSubmit}>
            <h2>Estimate New Task</h2>
            <p className="form-helper">Type task title directly below — category will auto-detect!</p>

            <label className="input-label">
              <span>Task Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Fix oauth login redirect bug on mobile Safari"
                required
                minLength={3}
              />
            </label>

            <label className="input-label">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Describe what needs to be built. Add multiple sentences to see the estimate evolution over time!"
                required
                minLength={10}
                rows={5}
              />
            </label>

            <label className="input-label">
              <div className="category-label-row">
                <span>Category</span>
                {isAutoDetected && category && (
                  <span className="auto-detect-badge" title="Auto-detected based on task title & description keywords">
                    ✨ Auto-detected: <strong>{category}</strong>
                  </span>
                )}
              </div>
              <ScrollableSelect
                options={categoryOptions}
                value={category}
                onChange={handleCategorySelect}
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
