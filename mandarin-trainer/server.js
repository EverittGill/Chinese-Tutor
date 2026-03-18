import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { segmentAndAnnotate, generatePinyin } from './api/segmentWords.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemPrompt, maxTokens, tools: clientTools } = req.body;

    const requestParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 1024,
      system: systemPrompt,
      messages,
    };

    // Use client-provided tools or default conversation tools
    const tools = clientTools || conversationTools;
    requestParams.tools = tools;
    requestParams.tool_choice = { type: "tool", name: tools[0].name };

    const response = await client.messages.create(requestParams);

    // Extract the tool_use block
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (toolBlock) {
      const result = toolBlock.input;

      // Post-process: generate word breakdowns and pinyin server-side
      result.words = segmentAndAnnotate(result.response);
      result.pinyin = generatePinyin(result.response);

      const userChinese = extractUserChinese(messages);
      if (userChinese) {
        result.user_words = segmentAndAnnotate(userChinese);
        result.user_pinyin = generatePinyin(userChinese);
      } else {
        result.user_words = [];
        result.user_pinyin = '';
      }

      res.json({ content: result });
    } else {
      // Fallback: return text content
      const textBlock = response.content.find(b => b.type === 'text');
      res.json({ content: textBlock?.text || '' });
    }
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Azure Speech token endpoint — keeps the subscription key server-side
app.get('/api/speech-token', async (req, res) => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return res.json({ token: null, region: null });
  }

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Length': '0'
        }
      }
    );
    if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status}`);
    const token = await tokenRes.text();
    res.json({ token, region });
  } catch (err) {
    console.error('Speech token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => console.log('Proxy server running on :3001'));
