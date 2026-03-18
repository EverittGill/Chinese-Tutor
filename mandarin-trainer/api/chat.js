import Anthropic from '@anthropic-ai/sdk';
import { translateWords } from './translateWords.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conversationTools = [{
  name: "conversation_response",
  description: "Respond to the user in Mandarin Chinese conversation practice",
  input_schema: {
    type: "object",
    properties: {
      response: { type: "string", description: "Chinese response text (simplified characters)" },
      english: { type: "string", description: "English translation" },
      corrections: {
        type: "array",
        description: "Corrections for the user's speech (max 3)",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["grammar", "vocabulary", "pronunciation"] },
            original: { type: "string", description: "What the user said" },
            corrected: { type: "string", description: "Correct form" },
            pinyin: { type: "string", description: "Pinyin for corrected form" },
            explanation: { type: "string", description: "Brief English explanation" }
          },
          required: ["type", "original", "corrected", "pinyin", "explanation"]
        }
      },
      new_vocabulary: {
        type: "array",
        description: "New vocabulary introduced (max 1 per exchange)",
        items: {
          type: "object",
          properties: {
            word: { type: "string" },
            pinyin: { type: "string" },
            english: { type: "string" },
            context: { type: "string", description: "When to use this word" }
          },
          required: ["word", "pinyin", "english", "context"]
        }
      },
      user_english: { type: "string", description: "Natural English translation of what the user said" },
      teaching_notes: {
        type: "string",
        description: "English teaching notes: grammar explanations, pattern tips, level observations, encouragement. 1-3 sentences. Teacher mode only."
      }
    },
    required: ["response", "english", "corrections", "new_vocabulary", "user_english"]
  }
}];

// Chinese character detection regex
const chineseCharRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Extract the user's Chinese text from the last message, stripping pronunciation data suffix.
 */
function extractUserChinese(messages) {
  if (!messages || messages.length === 0) return null;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return null;
  const text = typeof lastUserMsg.content === 'string'
    ? lastUserMsg.content
    : lastUserMsg.content?.find?.(b => b.type === 'text')?.text || '';
  // Strip pronunciation data suffix
  const cleaned = text.replace(/\n\n\[PRONUNCIATION DATA:[\s\S]*\]$/, '').trim();
  return chineseCharRegex.test(cleaned) ? cleaned : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, systemPrompt, maxTokens, tools: clientTools, model } = req.body;

    const requestParams = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens || 1024,
      system: systemPrompt,
      messages,
    };

    const tools = clientTools || conversationTools;
    requestParams.tools = tools;
    requestParams.tool_choice = { type: "tool", name: tools[0].name };

    const response = await client.messages.create(requestParams);

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock) {
      const result = toolBlock.input;

      // Post-process: generate word breakdowns and pinyin via Haiku (parallel)
      const userChinese = extractUserChinese(messages);
      const [aiWords, userTranslation] = await Promise.all([
        translateWords(client, result.response, result.english),
        userChinese ? translateWords(client, userChinese) : Promise.resolve({ words: [], pinyin: '' }),
      ]);

      result.words = aiWords.words;
      result.pinyin = aiWords.pinyin;
      result.user_words = userTranslation.words;
      result.user_pinyin = userTranslation.pinyin;

      res.json({ content: result });
    } else {
      const textBlock = response.content.find(b => b.type === 'text');
      res.json({ content: textBlock?.text || '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
