export function getSummaryPrompt() {
  return `You are a Mandarin Chinese language learning analyst. The user just finished a practice session. Generate a helpful summary based on the session data.

Be encouraging but honest. Generate 3-5 practice sentences targeting the user's weak areas. These are for the user to practice before their next class with their tutor.`;
}

export const summaryTool = {
  name: "session_summary",
  description: "Generate a session summary for the user's Mandarin practice session",
  input_schema: {
    type: "object",
    properties: {
      overall_assessment: {
        type: "string",
        description: "1-2 sentence assessment in English"
      },
      did_well: {
        type: "array",
        items: { type: "string" },
        description: "2-3 things done well"
      },
      needs_work: {
        type: "array",
        items: { type: "string" },
        description: "2-3 specific areas to improve"
      },
      mistake_patterns: {
        type: "array",
        items: { type: "string" },
        description: "Recurring patterns noticed"
      },
      practice_sentences: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chinese: { type: "string" },
            pinyin: { type: "string" },
            english: { type: "string" },
            focus: { type: "string", description: "What this sentence practices" }
          },
          required: ["chinese", "pinyin", "english", "focus"]
        },
        description: "3-5 practice sentences targeting weak areas"
      },
      suggested_topics: {
        type: "array",
        items: { type: "string" },
        description: "1-2 helpful topics for next session"
      },
      estimated_hsk_level: {
        type: "string",
        description: "Estimated HSK level, e.g. 'HSK 2' or 'HSK 2-3'"
      }
    },
    required: ["overall_assessment", "did_well", "needs_work", "mistake_patterns", "practice_sentences", "suggested_topics", "estimated_hsk_level"]
  }
};
