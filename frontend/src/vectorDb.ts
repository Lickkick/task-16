import projectsData from './projectsData.json'

export interface ProjectRecord {
  id: number
  name: string
  description: string
  actual_days: number
  complexity: string
  team_size: number
  technologies: string[]
  key_outcomes: string[]
}

function tokenize(text: string): string[] {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  return clean.split(/\s+/).filter((w) => w.length > 2)
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

class ClientProjectVectorDB {
  private projects: ProjectRecord[]
  private idf: Map<string, number> = new Map()
  private projectVectors: Map<number, Vector> = new Map()

  constructor() {
    this.projects = projectsData as ProjectRecord[]
    this.buildDatabase()
  }

  private buildDatabase() {
    const docCount = this.projects.length
    const dfMap: Map<string, number> = new Map()
    const docTokensMap: Map<number, string[]> = new Map()

    for (const project of this.projects) {
      const text = `${project.name} ${project.description} ${project.technologies.join(' ')}`
      const tokens = tokenize(text)
      docTokensMap.set(project.id, tokens)

      const uniqueTokens = new Set(tokens)
      uniqueTokens.forEach((t) => {
        dfMap.set(t, (dfMap.get(t) || 0) + 1)
      })
    }

    dfMap.forEach((count, token) => {
      this.idf.set(token, Math.log((docCount + 1) / (count + 1)) + 1)
    })

    for (const project of this.projects) {
      const tokens = docTokensMap.get(project.id) || []
      const vec: Vector = new Map()
      const tfMap: Map<string, number> = new Map()
      tokens.forEach((t) => tfMap.set(t, (tfMap.get(t) || 0) + 1))

      tfMap.forEach((tf, token) => {
        const idfVal = this.idf.get(token) || 1
        vec.set(token, tf * idfVal)
      })

      this.projectVectors.set(project.id, vec)
    }
  }

  public search(queryTitle: string, queryDescription: string): { project: ProjectRecord; similarity: number } {
    const text = `${queryTitle} ${queryDescription}`
    const tokens = tokenize(text)
    const queryVec: Vector = new Map()
    const tfMap: Map<string, number> = new Map()
    tokens.forEach((t) => tfMap.set(t, (tfMap.get(t) || 0) + 1))

    tfMap.forEach((tf, token) => {
      const idfVal = this.idf.get(token) || 1
      queryVec.set(token, tf * idfVal)
    })

    let bestProject = this.projects[0]
    let bestSimilarity = 0

    for (const project of this.projects) {
      const projVec = this.projectVectors.get(project.id) || new Map()
      const sim = cosineSimilarity(queryVec, projVec)
      if (sim > bestSimilarity) {
        bestSimilarity = sim
        bestProject = project
      }
    }

    return {
      project: bestProject,
      similarity: Math.round(bestSimilarity * 1000) / 1000,
    }
  }
}

export const projectVectorDB = new ClientProjectVectorDB()
