import { useState, useRef, useCallback, useEffect } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { getAzureConfig } from '../utils/config';

export default function useAzureSpeech() {
  const [recognizedText, setRecognizedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognizerRef = useRef(null);

  const getRecognizer = useCallback(() => {
    if (recognizerRef.current) return recognizerRef.current;

    const { key, region } = getAzureConfig();
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'zh-CN';
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    recognizerRef.current = recognizer;
    return recognizer;
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    setIsListening(true);

    const recognizer = getRecognizer();

    recognizer.recognizeOnceAsync(
      (result) => {
        setIsListening(false);
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          setRecognizedText(result.text);
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

  return { recognizedText, isListening, startListening, error };
}
