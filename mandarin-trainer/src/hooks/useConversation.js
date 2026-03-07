import { useState, useRef, useCallback } from 'react';
import { getSystemPrompt } from '../utils/claudePrompt';

export default function useConversation(topic = null, vocabularyContext = null) {
  const [aiResponse, setAiResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef([]);

  const sendMessage = useCallback(async (text) => {
    setError(null);
    setIsLoading(true);

    messagesRef.current.push({ role: 'user', content: text });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesRef.current,
          systemPrompt: getSystemPrompt(topic, vocabularyContext),
          maxTokens: 1024
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      // With tool_use, content is already a parsed object
      const parsed = data.content;

      setAiResponse(parsed);

      // Add AI response to conversation history as plain text for context
      messagesRef.current.push({
        role: 'assistant',
        content: typeof parsed === 'object' ? parsed.response : parsed
      });

      return parsed;
    } catch (err) {
      setError(err.message);
      // Remove the failed user message
      messagesRef.current.pop();
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [topic, vocabularyContext]);

  const reset = useCallback(() => {
    messagesRef.current = [];
    setAiResponse(null);
    setError(null);
  }, []);

  return { sendMessage, aiResponse, isLoading, error, reset, messages: messagesRef };
}
