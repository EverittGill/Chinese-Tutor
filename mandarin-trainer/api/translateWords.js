/**
 * translateWords.js — Orchestrates Chinese word translation.
 *
 * Design: Splits the translation task into what each tool does best:
 *   1. Intl.Segmenter + CEDICT (segmentWords.js) → word boundaries + pinyin (deterministic, correct)
 *   2. Haiku API call → contextual English translations only (simple task, high quality)
 *   3. On Haiku failure → CEDICT dictionary definitions are already present as fallback
 *
 * Why not let Haiku do segmentation too?
 *   Haiku inconsistently over-segments multi-character words (e.g. 高兴 → 高 + 兴).
 *   Since each word is rendered with margin-right spacing, bad segmentation creates
 *   visible gaps in the UI. Intl.Segmenter handles this correctly and deterministically.
 *
 * See plans/06-word-translation-overhaul.md for full rationale.
 */
import { segmentAndAnnotate, generatePinyin } from './segmentWords.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const contextualTranslationTool = {
  name: "contextual_translations",
  description: "Provide brief contextual English translations for a list of Chinese words",
  input_schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chinese: { type: "string" },
            english: { type: "string", description: "Brief contextual meaning (1-4 words)" },
          },
          required: ["chinese", "english"]
        }
      }
    },
    required: ["translations"]
  }
};

const systemPrompt = `You are a Chinese-English translator. Given a list of Chinese words from a sentence, provide brief contextual English translations. Use 1-4 words. Give the meaning used in THIS context, not a dictionary dump.`;

/**
 * Translate Chinese text into segmented words with pinyin and English.
 * Uses Intl.Segmenter + CEDICT for word boundaries and pinyin (proven correct),
 * and Haiku only for contextual English translations.
 *
 * @param {import('@anthropic-ai/sdk').default} client - Anthropic client
 * @param {string} chineseText - Chinese text to segment
 * @param {string} [englishContext] - Optional English translation for disambiguation
 * @returns {Promise<{ words: Array<{chinese: string, pinyin: string, english: string}>, pinyin: string }>}
 */
export async function translateWords(client, chineseText, englishContext) {
  if (!chineseText) return { words: [], pinyin: '' };

  // Step 1: Segment and annotate with CEDICT (word boundaries + pinyin + dictionary english)
  const words = segmentAndAnnotate(chineseText);
  const pinyinStr = generatePinyin(chineseText);

  // Step 2: Ask Haiku only for contextual English translations
  try {
    // Build numbered word list for Haiku
    const chineseWords = words
      .filter(w => !w.chinese.match(/^[\s，。！？、：；…～⋯!?.,;:()"'«»《》『』【】（）]+$/))
      .map(w => w.chinese.replace(/[，。！？、：；…～⋯!?.,;:()"'«»《》『』【】（）]+$/, ''));

    if (chineseWords.length === 0) return { words, pinyin: pinyinStr };

    const wordList = chineseWords.map((w, i) => `${i + 1}. ${w}`).join('\n');

    let userContent = `Sentence: ${chineseText}`;
    if (englishContext) userContent += `\nMeaning: ${englishContext}`;
    userContent += `\n\nWords to translate:\n${wordList}`;

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [contextualTranslationTool],
      tool_choice: { type: "tool", name: "contextual_translations" },
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock?.input?.translations) {
      // Build lookup map from Haiku translations
      const translationMap = new Map();
      for (const t of toolBlock.input.translations) {
        translationMap.set(t.chinese, t.english);
      }

      // Merge Haiku's English into words, keeping CEDICT as fallback
      for (const word of words) {
        const bareWord = word.chinese.replace(/[，。！？、：；…～⋯!?.,;:()"'«»《》『』【】（）]+$/, '');
        const haikuEnglish = translationMap.get(bareWord);
        if (haikuEnglish) {
          word.english = haikuEnglish;
        }
        // Otherwise keep CEDICT english as-is
      }
    }
  } catch (err) {
    console.error('translateWords: Haiku translation failed, using CEDICT english:', err.message);
    // words already have CEDICT english, just return them
  }

  return { words, pinyin: pinyinStr };
}
