import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

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
      pinyin: { type: "string", description: "Pinyin for the response" },
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
      }
    },
    required: ["response", "pinyin", "english", "corrections", "new_vocabulary"]
  }
}];

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemPrompt, maxTokens, tools: clientTools } = req.body;

    const requestParams = {
      model: 'claude-sonnet-4-20250514',
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
      res.json({ content: toolBlock.input });
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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => console.log('Proxy server running on :3001'));
