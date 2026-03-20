import { useState, useRef, useCallback, useContext } from 'react';
import { getSystemPrompt, getReviewSystemPrompt, getTeacherSystemPrompt } from '../utils/claudePrompt';
import { apiFetch, CreditError } from '../utils/apiFetch';
import AuthContext from '../contexts/authContextValue';

export default function useConversation(topic = null, vocabularyContext = null, mode = 'normal', levelContext = null, sessionFocus = '', learnerBriefing = null, userProfile = null) {
  const [aiResponse, setAiResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef([]);
  const auth = useContext(AuthContext);

  const sendMessage = useCallback(async (text) => {
    setError(null);
    setIsLoading(true);

    messagesRef.current.push({ role: 'user', content: text });

    // Truncate to last 10 exchanges (20 messages) for the API call to prevent runaway costs.
    // Full history stays in memory for the UI.
    const MAX_HISTORY = 20;
    const truncatedMessages = messagesRef.current.length > MAX_HISTORY
      ? messagesRef.current.slice(-MAX_HISTORY)
      : messagesRef.current;

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: truncatedMessages,
          systemPrompt: (() => {
            let prompt = mode === 'teacher'
              ? getTeacherSystemPrompt(vocabularyContext, levelContext)
              : mode === 'review'
              ? getReviewSystemPrompt(vocabularyContext)
              : getSystemPrompt(topic, vocabularyContext);
            if (sessionFocus?.trim()) {
              prompt += `\n\nSESSION FOCUS (special instructions from the learner for this session — follow these closely):\n${sessionFocus.trim()}`;
            }
            if (userProfile) {
              prompt += `\n\n${userProfile}`;
            }
            if (learnerBriefing) {
              prompt += `\n\n${learnerBriefing}`;
            }
            return prompt;
          })(),
          maxTokens: 1024
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      if (data.credits?.cache) {
        console.log('[cache]', data.credits.cache);
      }
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
      if (err instanceof CreditError) {
        auth?.setCreditError(true);
      } else {
        setError(err.message);
      }
      // Remove the failed user message
      messagesRef.current.pop();
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [topic, vocabularyContext, mode, levelContext, sessionFocus, learnerBriefing, userProfile, auth]);

  const reset = useCallback(() => {
    messagesRef.current = [];
    setAiResponse(null);
    setError(null);
  }, []);

  return { sendMessage, aiResponse, isLoading, error, reset, messages: messagesRef };
}
