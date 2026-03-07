import { useState, useRef, useCallback, useEffect } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { getAzureConfig } from '../utils/config';

export default function useAzureSpeech() {
  const [recognizedText, setRecognizedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [pronunciationData, setPronunciationData] = useState(null);
  const recognizerRef = useRef(null);

  const getRecognizer = useCallback(() => {
    if (recognizerRef.current) return recognizerRef.current;

    const { key, region } = getAzureConfig();
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'zh-CN';
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // Add pronunciation assessment (unscripted mode)
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      "",
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true
    );
    pronunciationConfig.applyTo(recognizer);

    recognizerRef.current = recognizer;
    return recognizer;
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    setIsListening(true);
    setPronunciationData(null);

    const recognizer = getRecognizer();

    recognizer.recognizeOnceAsync(
      (result) => {
        setIsListening(false);
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          setRecognizedText(result.text);

          // Extract pronunciation scores
          try {
            const pronResult = sdk.PronunciationAssessmentResult.fromResult(result);
            const scores = {
              accuracyScore: Math.round(pronResult.accuracyScore),
              fluencyScore: Math.round(pronResult.fluencyScore),
              completenessScore: Math.round(pronResult.completenessScore),
              pronunciationScore: Math.round(pronResult.pronunciationScore),
              words: []
            };

            // Extract per-word scores
            const detailJson = result.properties.getProperty(
              sdk.PropertyId.SpeechServiceResponse_JsonResult
            );
            if (detailJson) {
              const detail = JSON.parse(detailJson);
              const words = detail?.NBest?.[0]?.Words || [];
              scores.words = words.map(w => ({
                word: w.Word,
                accuracyScore: Math.round(w.PronunciationAssessment?.AccuracyScore || 0),
                errorType: w.PronunciationAssessment?.ErrorType || 'None'
              }));
            }

            setPronunciationData(scores);
          } catch (e) {
            // Pronunciation data extraction failed — not critical
            console.warn('Could not extract pronunciation data:', e);
          }
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          setError('No speech detected. Try again.');
        } else if (result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.CancellationDetails.fromResult(result);
          setError(`Speech recognition canceled: ${cancellation.reason}`);
        }
      },
      (err) => {
        setIsListening(false);
        setError(`Recognition error: ${err}`);
      }
    );
  }, [getRecognizer]);

  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.close();
        recognizerRef.current = null;
      }
    };
  }, []);

  return { recognizedText, isListening, startListening, error, pronunciationData };
}
