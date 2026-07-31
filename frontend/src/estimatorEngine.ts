// Standalone Client-side Deadline Estimator Engine (No External Backend Required)
import tasksData from './tasksData.json'

export interface TaskRecord {
  id: number
  title: string
  description: string
  category: string
  actual_days: number
  holdout: boolean
}

export interface SimilarTask {
  id: number
  title: string
  category: string
  actual_days: number
  similarity: number
}

export interface EstimateResult {
  point_estimate_days: number
  range_min_days: number
  range_max_days: number
  similar_tasks: SimilarTask[]
}

export interface EvolutionStep {
  step: number
  added_text: string
  accumulated_text: string
  point_estimate_days: number
  range_min_days: number
  range_max_days: number
  similar_tasks: SimilarTask[]
}

export interface EvaluationInfo {
  mean_absolute_error_days: number
  holdout_count: number
  training_count: number
}

const K_NEIGHBORS = 5
const CATEGORY_WEIGHT = 0.35

// Helper: Tokenize text into n-grams (unigrams & bigrams)
function tokenize(text: string): string[] {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = clean.split(/\s+/).filter((w: string) => w.length > 2)
  const nGrams: string[] = [...words]

  for (let i = 0; i < words.length - 1; i++) {
    nGrams.push(`${words[i]} ${words[i + 1]}`)
  }
  return nGrams
}

type Vector = Map<string, number>

function cosineSimilarity(vecA: Vector, vecB: Vector): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  vecA.forEach((val, key) => {
    normA += val * val
    if (vecB.has(key)) {
      dotProduct += val * vecB.get(key)!
    }
  })

  vecB.forEach((val) => {
    normB += val * val
  })

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

class ClientEstimator {
  private allTasks: TaskRecord[]
  private trainingTasks: TaskRecord[]
  private holdoutTasks: TaskRecord[]
  private idf: Map<string, number> = new Map()
  private taskVectors: Map<number, Vector> = new Map()

  constructor() {
    this.allTasks = tasksData as TaskRecord[]
    this.trainingTasks = this.allTasks.filter((t) => !t.holdout)
    this.holdoutTasks = this.allTasks.filter((t) => t.holdout)

    this.buildIdfAndVectors()
  }

  public getCategories(): string[] {
    const categories = new Set(this.allTasks.map((t) => t.category))
    return Array.from(categories).sort()
  }

  private buildIdfAndVectors() {
    const docCount = this.trainingTasks.length
    const dfMap: Map<string, number> = new Map()

    const docTokensMap: Map<number, string[]> = new Map()

    for (const task of this.trainingTasks) {
      const text = `${task.title} ${task.description}`
      const tokens = tokenize(text)
      docTokensMap.set(task.id, tokens)

      const uniqueTokens = new Set(tokens)
      uniqueTokens.forEach((t) => {
        dfMap.set(t, (dfMap.get(t) || 0) + 1)
      })
    }

    dfMap.forEach((count, token) => {
      this.idf.set(token, Math.log((docCount + 1) / (count + 1)) + 1)
    })

    for (const task of this.trainingTasks) {
      const tokens = docTokensMap.get(task.id) || []
      const vec: Vector = new Map()

      // Term Frequencies
      const tfMap: Map<string, number> = new Map()
      tokens.forEach((t) => tfMap.set(t, (tfMap.get(t) || 0) + 1))

      tfMap.forEach((tf, token) => {
        const idfVal = this.idf.get(token) || 1
        vec.set(token, tf * idfVal)
      })

      // Add Category feature pseudo-token
      vec.set(`__CAT_${task.category}`, CATEGORY_WEIGHT * 5)

      this.taskVectors.set(task.id, vec)
    }
  }

  private createQueryVector(title: string, description: string, category: string): Vector {
    const text = `${title} ${description}`
    const tokens = tokenize(text)
    const vec: Vector = new Map()

    const tfMap: Map<string, number> = new Map()
    tokens.forEach((t) => tfMap.set(t, (tfMap.get(t) || 0) + 1))

    tfMap.forEach((tf, token) => {
      const idfVal = this.idf.get(token) || 1
      vec.set(token, tf * idfVal)
    })

    if (category) {
      vec.set(`__CAT_${category}`, CATEGORY_WEIGHT * 5)
    }
    return vec
  }

  public predictCategory(title: string, description: string = ''): string {
    const text = `${title} ${description}`.toLowerCase()
    if (!text.trim()) return 'Feature'

    // Rule-based keyword matching for fast auto-detection
    if (/\b(fix|bug|broken|issue|error|leak|wrong|crash|loop|timeout|patch|fail)\b/i.test(text)) {
      return 'Bug Fix'
    }
    if (/\b(refactor|extract|split|rewrite|clean|migrate|consolidate|decouple)\b/i.test(text)) {
      return 'Refactoring'
    }
    if (/\b(doc|docs|document|guide|readme|runbook|wiki|documentation)\b/i.test(text)) {
      return 'Documentation'
    }
    if (/\b(docker|ci|cd|pipeline|actions|prometheus|grafana|kubernetes|k8s|aws|devops|auto-scaling|vault)\b/i.test(text)) {
      return 'DevOps'
    }
    if (/\b(design|wireframe|illustration|ui|layout|icon|palette|mockup|sketch)\b/i.test(text)) {
      return 'Design'
    }
    if (/\b(test|tests|testing|unit test|integration test|e2e|coverage|pact|snapshot)\b/i.test(text)) {
      return 'Testing'
    }
    if (/\b(research|evaluate|spike|compare|audit|benchmark|crdt|crdts|study)\b/i.test(text)) {
      return 'Research'
    }
    if (/\b(add|build|implement|create|panel|toggle|support|dashboard|feature|export|kanban|auth|notification)\b/i.test(text)) {
      return 'Feature'
    }

    // Fallback similarity match against historical tasks
    const queryVec = this.createQueryVector(title, description, '')
    let bestCat = 'Feature'
    let bestSim = -1

    for (const task of this.trainingTasks) {
      const taskVec = this.taskVectors.get(task.id) || new Map()
      const sim = cosineSimilarity(queryVec, taskVec)
      if (sim > bestSim) {
        bestSim = sim
        bestCat = task.category
      }
    }

    return bestCat
  }

  public estimate(title: string, description: string, category: string): EstimateResult {
    const queryVec = this.createQueryVector(title, description, category)

    const scoredTasks = this.trainingTasks.map((task) => {
      const taskVec = this.taskVectors.get(task.id) || new Map()
      const sim = cosineSimilarity(queryVec, taskVec)
      return { task, sim }
    })

    scoredTasks.sort((a, b) => b.sim - a.sim)
    const topK = scoredTasks.slice(0, K_NEIGHBORS)

    let totalWeight = 0
    let weightedSum = 0
    let minDays = Infinity
    let maxDays = -Infinity

    const similarTasks: SimilarTask[] = topK.map(({ task, sim }) => {
      const weight = Math.max(sim, 0.01)
      totalWeight += weight
      weightedSum += task.actual_days * weight

      if (task.actual_days < minDays) minDays = task.actual_days
      if (task.actual_days > maxDays) maxDays = task.actual_days

      return {
        id: task.id,
        title: task.title,
        category: task.category,
        actual_days: task.actual_days,
        similarity: Math.round(sim * 1000) / 1000,
      }
    })

    const pointEstimate = totalWeight > 0 ? weightedSum / totalWeight : 3.0

    return {
      point_estimate_days: Math.round(pointEstimate * 10) / 10,
      range_min_days: minDays === Infinity ? 1.0 : Math.round(minDays * 10) / 10,
      range_max_days: maxDays === -Infinity ? 5.0 : Math.round(maxDays * 10) / 10,
      similar_tasks: similarTasks,
    }
  }

  public estimateEvolution(title: string, description: string, category: string): EvolutionStep[] {
    const sentences = description
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const sentenceList = sentences.length > 0 ? sentences : [description]

    const steps: EvolutionStep[] = []
    let accumulated = ''

    sentenceList.forEach((sentence, idx) => {
      accumulated = accumulated ? `${accumulated} ${sentence}` : sentence
      const est = this.estimate(title, accumulated, category)

      steps.push({
        step: idx + 1,
        added_text: sentence,
        accumulated_text: accumulated,
        point_estimate_days: est.point_estimate_days,
        range_min_days: est.range_min_days,
        range_max_days: est.range_max_days,
        similar_tasks: est.similar_tasks,
      })
    })

    return steps
  }

  public evaluateHoldout(): EvaluationInfo {
    let totalError = 0

    for (const task of this.holdoutTasks) {
      const est = this.estimate(task.title, task.description, task.category)
      const error = Math.abs(task.actual_days - est.point_estimate_days)
      totalError += error
    }

    const mae = totalError / (this.holdoutTasks.length || 1)

    return {
      mean_absolute_error_days: Math.round(mae * 100) / 100,
      holdout_count: this.holdoutTasks.length,
      training_count: this.trainingTasks.length,
    }
  }
}

export const estimatorEngine = new ClientEstimator()
