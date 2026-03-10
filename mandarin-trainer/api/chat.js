import Anthropic from '@anthropic-ai/sdk';

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
      },
      user_pinyin: { type: "string", description: "Pinyin transcription of the user's input" },
      user_english: { type: "string", description: "Natural English translation of what the user said" },
      user_words: {
        type: "array",
        description: "Word-by-word breakdown of the user's input",
        items: {
          type: "object",
          properties: {
            chinese: { type: "string" },
            pinyin: { type: "string" },
            english: { type: "string" }
          },
          required: ["chinese", "pinyin", "english"]
        }
      },
      words: {
        type: "array",
        description: "Word-by-word breakdown of the response in order",
        items: {
          type: "object",
          properties: {
            chinese: { type: "string" },
            pinyin: { type: "string" },
            english: { type: "string" }
          },
          required: ["chinese", "pinyin", "english"]
        }
      }
    },
    required: ["response", "pinyin", "english", "corrections", "new_vocabulary", "words", "user_pinyin", "user_english", "user_words"]
  }
}];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, systemPrompt, maxTokens, tools: clientTools } = req.body;

    const requestParams = {
      model: 'claude-sonnet-4-6',
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
      res.json({ content: toolBlock.input });
    } else {
      const textBlock = response.content.find(b => b.type === 'text');
      res.json({ content: textBlock?.text || '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
