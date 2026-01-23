export type PlayPreference = 'less' | 'neutral' | 'more'
export type AgePreference = 'older' | 'neutral' | 'newer'

export interface RandomPickConfig {
  count: number
  playPreference: PlayPreference
  agePreference: AgePreference
  avoidUpcoming: boolean
}

export interface SongPickCandidate {
  id: string
  title: string
  created_at: string | null
  totalUses?: number | null
}

export interface PickSongsInput {
  songs: SongPickCandidate[]
  selectedSongIds: string[]
  upcomingSetSongIds: string[]
  config: RandomPickConfig
  rng?: () => number
}

const DEFAULT_SCORE = 0.5
const EPSILON = 0.001

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return DEFAULT_SCORE
  }
  return (value - min) / (max - min)
}

function toTimestamp(dateString: string | null): number {
  if (!dateString) return Number.NaN
  const timestamp = new Date(dateString).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function buildWeights(candidates: SongPickCandidate[], config: RandomPickConfig): number[] {
  const useValues = candidates.map((song) => song.totalUses ?? 0)
  const minUses = Math.min(...useValues)
  const maxUses = Math.max(...useValues)

  const createdTimestamps = candidates.map((song) => toTimestamp(song.created_at))
  const validTimestamps = createdTimestamps.filter((value) => Number.isFinite(value))
  const minCreated = validTimestamps.length ? Math.min(...validTimestamps) : Number.NaN
  const maxCreated = validTimestamps.length ? Math.max(...validTimestamps) : Number.NaN
  const ageRange = Number.isFinite(minCreated) && Number.isFinite(maxCreated) ? maxCreated - minCreated : Number.NaN

  return candidates.map((song) => {
    const useNorm = normalize(song.totalUses ?? 0, minUses, maxUses)
    const createdAt = toTimestamp(song.created_at)
    const ageValue = Number.isFinite(createdAt) && Number.isFinite(maxCreated) ? maxCreated - createdAt : Number.NaN
    const ageNorm = Number.isFinite(ageValue) ? normalize(ageValue, 0, ageRange) : DEFAULT_SCORE

    const playFactor =
      config.playPreference === 'less'
        ? 1 - useNorm
        : config.playPreference === 'more'
          ? useNorm
          : 1

    const ageFactor =
      config.agePreference === 'older'
        ? ageNorm
        : config.agePreference === 'newer'
          ? 1 - ageNorm
          : 1

    return EPSILON + playFactor * ageFactor
  })
}

function pickIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) {
    return Math.floor(rng() * weights.length)
  }
  let threshold = rng() * total
  for (let i = 0; i < weights.length; i += 1) {
    threshold -= weights[i]
    if (threshold <= 0) return i
  }
  return weights.length - 1
}

export function pickWeightedSongs({
  songs,
  selectedSongIds,
  upcomingSetSongIds,
  config,
  rng = Math.random,
}: PickSongsInput): SongPickCandidate[] {
  const selectedSet = new Set(selectedSongIds)
  const upcomingSet = new Set(upcomingSetSongIds)
  const candidates = songs.filter((song) => {
    if (selectedSet.has(song.id)) return false
    if (config.avoidUpcoming && upcomingSet.has(song.id)) return false
    return true
  })

  if (candidates.length === 0) {
    return []
  }

  const picks: SongPickCandidate[] = []
  const remaining = [...candidates]
  const weights = buildWeights(remaining, config)

  const targetCount = Math.max(0, Math.min(config.count, remaining.length))
  for (let i = 0; i < targetCount; i += 1) {
    const index = pickIndex(weights, rng)
    const [chosen] = remaining.splice(index, 1)
    weights.splice(index, 1)
    picks.push(chosen)
  }

  return picks
}
