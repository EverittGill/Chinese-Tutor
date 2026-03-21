import Anthropic from '@anthropic-ai/sdk';
import { translateWords } from './translateWords.js';
import { authenticateRequest, checkCredits, deductCredits, calculateCost } from './authMiddleware.js';

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

  // Authenticate
  const auth = await authenticateRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // Check credits
  const creditResult = await checkCredits(auth.user.id);
  if (typeof creditResult === 'object' && creditResult.error) {
    return res.status(500).json({ error: creditResult.error });
  }
  const balance = typeof creditResult === 'number' ? creditResult : 0;
  if (balance <= 0) {
    return res.status(402).json({ error: 'Out of credits — enter a promo code to continue' });
  }

  try {
    const { messages, systemPrompt, maxTokens, tools: clientTools, model } = req.body;

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({ error: 'systemPrompt must be a non-empty string' });
    }

    const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
    const selectedModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-6';
    const requestParams = {
      model: selectedModel,
      max_tokens: maxTokens || 1024,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages,
    };

    const tools = clientTools || conversationTools;
    requestParams.tools = tools;
    requestParams.tool_choice = { type: "tool", name: tools[0].name };

    // Cache conversation history — mark the second-to-last user message with cache_control.
    // This follows Anthropic's recommended multi-turn pattern: cache_control is supported on
    // system, user, and tool blocks (NOT assistant messages). Each new turn only pays for the
    // latest assistant reply + new user message.
    const userIndices = messages.reduce((acc, m, i) => m.role === 'user' ? [...acc, i] : acc, []);
    if (userIndices.length >= 2) {
      const idx = userIndices[userIndices.length - 2]; // second-to-last user message
      const text = messages[idx].content;
      messages[idx] = {
        ...messages[idx],
        content: typeof text === 'string'
          ? [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
          : text, // already content blocks, leave as-is
      };
    }

    const response = await client.messages.create(requestParams);

    console.log('[cache]', {
      model: selectedModel,
      input: response.usage.input_tokens,
      cache_create: response.usage.cache_creation_input_tokens || 0,
      cache_read: response.usage.cache_read_input_tokens || 0,
    });

    // Track usage from main call — build per-model usage entries for accurate logging
    let totalCost = 0;
    const usageEntries = [];

    if (response.usage) {
      const mainCost = calculateCost(selectedModel, response.usage.input_tokens, response.usage.output_tokens, response.usage.cache_creation_input_tokens || 0, response.usage.cache_read_input_tokens || 0);
      totalCost += mainCost;
      usageEntries.push({
        model: selectedModel,
        inputTokens: response.usage.input_tokens + (response.usage.cache_creation_input_tokens || 0) + (response.usage.cache_read_input_tokens || 0),
        outputTokens: response.usage.output_tokens,
        cost: mainCost,
      });
    }

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock) {
      const result = toolBlock.input;

      // Post-process: generate word breakdowns and pinyin via Haiku (parallel)
      const userChinese = extractUserChinese(messages);
      const [aiWords, userTranslation] = await Promise.all([
        translateWords(client, result.response, result.english),
        userChinese ? translateWords(client, userChinese) : Promise.resolve({ words: [], pinyin: '', usage: null }),
      ]);

      // Track Haiku translation costs (per-call entries)
      if (aiWords.usage) {
        const aiWordsCost = calculateCost(aiWords.usage.model, aiWords.usage.input_tokens, aiWords.usage.output_tokens, aiWords.usage.cache_creation_input_tokens || 0, aiWords.usage.cache_read_input_tokens || 0);
        totalCost += aiWordsCost;
        usageEntries.push({
          model: aiWords.usage.model,
          inputTokens: aiWords.usage.input_tokens + (aiWords.usage.cache_creation_input_tokens || 0) + (aiWords.usage.cache_read_input_tokens || 0),
          outputTokens: aiWords.usage.output_tokens,
          cost: aiWordsCost,
        });
      }
      if (userTranslation.usage) {
        const userTransCost = calculateCost(userTranslation.usage.model, userTranslation.usage.input_tokens, userTranslation.usage.output_tokens, userTranslation.usage.cache_creation_input_tokens || 0, userTranslation.usage.cache_read_input_tokens || 0);
        totalCost += userTransCost;
        usageEntries.push({
          model: userTranslation.usage.model,
          inputTokens: userTranslation.usage.input_tokens + (userTranslation.usage.cache_creation_input_tokens || 0) + (userTranslation.usage.cache_read_input_tokens || 0),
          outputTokens: userTranslation.usage.output_tokens,
          cost: userTransCost,
        });
      }

      result.words = aiWords.words;
      result.pinyin = aiWords.pinyin;
      result.user_words = userTranslation.words;
      result.user_pinyin = userTranslation.pinyin;

      // Deduct credits
      const deductResult = await deductCredits(auth.user.id, totalCost, usageEntries, 'chat');

      if (deductResult.error) {
        return res.status(deductResult.status || 402).json({ error: deductResult.error });
      }

      res.json({
        content: result,
        credits: {
          cost: totalCost,
          remaining: deductResult.remainingBalance,
          cache: {
            creation: response.usage.cache_creation_input_tokens || 0,
            read: response.usage.cache_read_input_tokens || 0,
          },
        },
      });
    } else {
      const textBlock = response.content.find(b => b.type === 'text');

      // Still deduct cost for the main call
      if (totalCost > 0) {
        const deductResult = await deductCredits(auth.user.id, totalCost, usageEntries, 'chat');

        if (deductResult.error) {
          return res.status(deductResult.status || 402).json({ error: deductResult.error });
        }

        res.json({
          content: textBlock?.text || '',
          credits: {
            cost: totalCost,
            remaining: deductResult.remainingBalance,
            cache: {
              creation: response.usage.cache_creation_input_tokens || 0,
              read: response.usage.cache_read_input_tokens || 0,
            },
          },
        });
      } else {
        res.json({ content: textBlock?.text || '' });
      }
    }
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
