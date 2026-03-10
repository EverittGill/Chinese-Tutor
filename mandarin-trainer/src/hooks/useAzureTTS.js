import { useState, useRef, useCallback } from 'react';
import { getAzureSpeechToken } from '../utils/config';

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text, voice = 'zh-CN-XiaoxiaoNeural', rate = 1.0) {
  const ratePercent = Math.round((rate - 1) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${rateStr}">${escapeXml(text)}</prosody></voice></speak>`;
}

export default function useAzureTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);

  const speak = useCallback(async (text, rate = 1.0) => {
    if (!text) return;

    setError(null);
    setIsSpeaking(true);

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (utteranceRef.current) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }

    // Try Azure TTS first
    const tokenData = await getAzureSpeechToken();
    if (tokenData) {
      const ssml = buildSsml(text, 'zh-CN-XiaoxiaoNeural', rate);

      try {
        const response = await fetch(
          `https://${tokenData.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.token}`,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
            },
            body: ssml
          }
        );

        if (!response.ok) {
          throw new Error(`TTS request failed: ${response.status}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setError('Audio playback failed');
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        await audio.play();
        return;
      } catch (err) {
        console.warn('Azure TTS failed, falling back to browser:', err.message);
      }
    }

    // Fallback: Web Speech API
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      setError('Speech synthesis not supported in this browser.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9 * rate;
    utteranceRef.current = utterance;

    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };

    utterance.onerror = (e) => {
      setIsSpeaking(false);
      if (e.error !== 'canceled') {
        setError('Speech playback failed');
      }
      utteranceRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  return { speak, isSpeaking, error };
}
