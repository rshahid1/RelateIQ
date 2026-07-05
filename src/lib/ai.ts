/**
 * Central AI model selection. All Claude calls read getAiModel() so the user
 * can pick quality vs. cost from Settings. Defaults to Sonnet — a strong balance
 * of reasoning quality and price for briefings, summaries, and synthesis.
 */
export const AI_MODELS: { id: string; label: string; blurb: string }[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', blurb: 'Fastest and cheapest. Good for quick summaries.' },
  { id: 'claude-sonnet-5', label: 'Sonnet', blurb: 'Balanced — sharper reasoning, still inexpensive. Recommended.' },
  { id: 'claude-opus-4-8', label: 'Opus', blurb: 'Most capable, deepest reasoning. Best quality, higher cost.' },
]

const DEFAULT_MODEL = 'claude-sonnet-5'

export function getAiModel(): string {
  const m = localStorage.getItem('ai_model')
  return m && AI_MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL
}

export function setAiModel(id: string) {
  localStorage.setItem('ai_model', id)
}
