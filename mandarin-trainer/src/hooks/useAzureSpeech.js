import { useState, useRef, useCallback, useEffect } from 'react';
import { getAzureSpeechToken } from '../utils/config';

// Web Speech API fallback — push-to-talk
function useWebSpeechRecognition() {
  const [recognizedText, setRecognizedText] = useState('');
  const [turnId, setTurnId] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const holdingRef = useRef(false);
  const accumulatedRef = useRef('');
  const restartCountRef = useRef(0);
  const holdStartRef = useRef(0);

  const MAX_RESTARTS = 10;

  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          accumulatedRef.current += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      // Show accumulated final text + current interim text
      setInterimText(accumulatedRef.current + interim);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Ignore — user may just be pausing while holding the button
        return;
      }
      holdingRef.current = false;
      setIsListening(false);
      setInterimText('');
      setError(`Speech error: ${event.error}`);
    };

    recognition.onend = () => {
      // Browser killed the session (silence timeout). If user is still
      // holding the button, restart recognition to keep listening.
      if (holdingRef.current) {
        restartCountRef.current += 1;
        if (restartCountRef.current > MAX_RESTARTS) {
          // Too many restarts — finalize to avoid infinite loop
          holdingRef.current = false;
        } else {
          try {
            const next = createRecognition();
            if (next) {
              recognitionRef.current = next;
              next.start();
              return; // stay in LISTENING state
            }
          } catch (e) {
            // fall through to finish
          }
        }
      }

      // User released or restart failed — finalize
      setIsListening(false);
      setInterimText('');
      if (accumulatedRef.current) {
        setRecognizedText(accumulatedRef.current);
        setTurnId(prev => prev + 1);
      } else if (Date.now() - holdStartRef.current > 1000) {
        setError('No speech detected. Hold the button and speak.');
      }
    };

    return recognition;
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser. Try Chrome.');
      return;
    }

    accumulatedRef.current = '';
    restartCountRef.current = 0;
    holdStartRef.current = Date.now();
    holdingRef.current = true;
    setIsListening(true);
    setInterimText('');

    const recognition = createRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      recognition.start();
    }
  }, [createRecognition]);

  const stopListening = useCallback(() => {
    holdingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { recognizedText, turnId, interimText, isListening, startListening, stopListening, error, pronunciationData: null };
}

// Azure Speech SDK — push-to-talk with continuous recognition + pronunciation scoring
function useAzureRecognition() {
  const [recognizedText, setRecognizedText] = useState('');
  const [turnId, setTurnId] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [pronunciationData, setPronunciationData] = useState(null);
  const recognizerRef = useRef(null);
  const sdkRef = useRef(null);
  const accumulatedRef = useRef({ text: '', words: [], accuracies: [], fluencies: [], completeness: null });
  const lastInterimRef = useRef('');
  const stoppingRef = useRef(false);
  const stopTimeoutRef = useRef(null);

  const getSdk = useCallback(async () => {
    if (!sdkRef.current) {
      sdkRef.current = await import('microsoft-cognitiveservices-speech-sdk');
    }
    return sdkRef.current;
  }, []);

  const streamRef = useRef(null);

  // Extract pronunciation words from a recognition result's JSON
  const extractPronWords = useCallback((sdk, result, acc) => {
    try {
      const pronResult = sdk.PronunciationAssessmentResult.fromResult(result);
      acc.accuracies.push(pronResult.accuracyScore);
      acc.fluencies.push(pronResult.fluencyScore);

      const detailJson = result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult
      );
      if (detailJson) {
        const detail = JSON.parse(detailJson);
        const nBest = detail?.NBest?.[0];
        const words = nBest?.Words || [];
        words.forEach(w => {
          acc.words.push({
            word: w.Word,
            accuracyScore: Math.round(w.PronunciationAssessment?.AccuracyScore || 0),
            errorType: w.PronunciationAssessment?.ErrorType || 'None',
            syllables: (w.Syllables || []).map(s => ({
              syllable: s.Syllable,
              accuracyScore: Math.round(s.PronunciationAssessment?.AccuracyScore || 0)
            })),
            phonemes: (w.Phonemes || []).map(p => ({
              phoneme: p.Phoneme,
              accuracyScore: Math.round(p.PronunciationAssessment?.AccuracyScore || 0)
            }))
          });
        });
        if (nBest?.PronunciationAssessment?.CompletenessScore != null) {
          acc.completeness = Math.round(nBest.PronunciationAssessment.CompletenessScore);
        }
      }
    } catch (err) {
      console.warn('Could not extract pronunciation data:', err);
    }
  }, []);

  // Harvest accumulated speech data and finalize the turn
  const harvestAccumulated = useCallback((acc) => {
    setRecognizedText(acc.text);
    setTurnId(prev => prev + 1);

    const avgAcc = acc.accuracies.length > 0
      ? Math.round(acc.accuracies.reduce((a, b) => a + b, 0) / acc.accuracies.length) : 0;
    const avgFlu = acc.fluencies.length > 0
      ? Math.round(acc.fluencies.reduce((a, b) => a + b, 0) / acc.fluencies.length) : 0;

    const completeness = acc.completeness != null ? acc.completeness : 0;
    setPronunciationData({
      accuracyScore: avgAcc,
      fluencyScore: avgFlu,
      completenessScore: completeness,
      pronunciationScore: Math.round((avgAcc + avgFlu) / 2),
      words: acc.words
    });
  }, []);

  const startListening = useCallback(async (referenceText = '') => {
    setError(null);
    setIsListening(true);
    setPronunciationData(null);
    setInterimText('');
    accumulatedRef.current = { text: '', words: [], accuracies: [], fluencies: [], completeness: null };
    lastInterimRef.current = '';
    stoppingRef.current = false;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    try {
      // Acquire mic in the user-gesture context (required for iOS Safari)
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;

      const sdk = await getSdk();
      const tokenData = await getAzureSpeechToken();
      if (!tokenData) {
        throw new Error('Could not get speech token');
      }

      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(tokenData.token, tokenData.region);
      speechConfig.speechRecognitionLanguage = 'zh-CN';

      if (referenceText) {
        // Pronunciation assessment mode: long segmentation timeout so Azure doesn't
        // split the utterance on brief pauses between words
        speechConfig.setProperty("Speech_SegmentationSilenceTimeoutMs", "5000");
        speechConfig.setProperty("SpeechServiceConnection_EndSilenceTimeoutMs", "10000");
      } else {
        // Conversation mode: segment on pauses, keep session alive
        speechConfig.setProperty("Speech_SegmentationSilenceTimeoutMs", "3000");
        speechConfig.setProperty("SpeechServiceConnection_EndSilenceTimeoutMs", "120000");
      }

      const audioConfig = sdk.AudioConfig.fromStreamInput(micStream);
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        !!referenceText // enableMiscue only with reference text
      );
      pronunciationConfig.applyTo(recognizer);

      // Clean up previous recognizer
      if (recognizerRef.current) {
        recognizerRef.current.close();
      }
      recognizerRef.current = recognizer;

      // Always use continuous recognition — works for both conversation and pronunciation
      recognizer.recognizing = (s, e) => {
        if (e.result.text) {
          const fullInterim = accumulatedRef.current.text + e.result.text;
          setInterimText(fullInterim);
          lastInterimRef.current = fullInterim;
        }
      };

      recognizer.recognized = (s, e) => {
        console.log('[Azure STT] recognized event:', e.result.reason, JSON.stringify(e.result.text));
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const acc = accumulatedRef.current;
          acc.text += e.result.text;
          extractPronWords(sdk, e.result, acc);
        }
      };

      recognizer.canceled = (s, e) => {
        console.log('[Azure STT] canceled event:', e.reason, e.errorDetails);
        if (e.reason === sdk.CancellationReason.Error) {
          setError(`Speech recognition error: ${e.errorDetails}`);
        }
      };

      recognizer.startContinuousRecognitionAsync(
        () => { /* started successfully */ },
        (err) => {
          setIsListening(false);
          setError(`Recognition error: ${err}`);
        }
      );
    } catch (err) {
      setIsListening(false);
      setError(`Speech setup error: ${err.message}`);
    }
  }, [getSdk, extractPronWords, harvestAccumulated]);

  const stopListening = useCallback(async () => {
    // Prevent double-stop on mobile touch events
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const recognizer = recognizerRef.current;
    if (!recognizer) {
      setIsListening(false);
      stoppingRef.current = false;
      return;
    }

    recognizer.stopContinuousRecognitionAsync(
      () => {
        setIsListening(false);
        setInterimText('');
        const acc = accumulatedRef.current;

        // Path A: recognized event already fired — harvest immediately
        if (acc.text) {
          console.log('[Azure STT] Path A: immediate harvest', JSON.stringify(acc.text));
          harvestAccumulated(acc);
          recognizer.close();
          recognizerRef.current = null;
          stoppingRef.current = false;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
          return;
        }

        // Path B: interim text exists but recognized hasn't fired yet (pronunciation scoring in-flight)
        if (lastInterimRef.current) {
          console.log('[Azure STT] Path B: waiting for recognized event...', JSON.stringify(lastInterimRef.current));
          stopTimeoutRef.current = setTimeout(() => {
            stopTimeoutRef.current = null;
            const accAfterWait = accumulatedRef.current;
            if (accAfterWait.text) {
              // recognized event arrived during the wait
              console.log('[Azure STT] Path B: recognized arrived after wait', JSON.stringify(accAfterWait.text));
              harvestAccumulated(accAfterWait);
            } else {
              // Use interim text as fallback (no pronunciation scores)
              console.log('[Azure STT] Path B: using interim fallback', JSON.stringify(lastInterimRef.current));
              setRecognizedText(lastInterimRef.current);
              setTurnId(prev => prev + 1);
              setPronunciationData(null);
            }
            recognizer.close();
            recognizerRef.current = null;
            stoppingRef.current = false;
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(t => t.stop());
              streamRef.current = null;
            }
          }, 800);
          return;
        }

        // Path C: no speech at all
        console.log('[Azure STT] Path C: no speech detected');
        setError('No speech detected. Hold the button and speak.');
        recognizer.close();
        recognizerRef.current = null;
        stoppingRef.current = false;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      },
      (err) => {
        setIsListening(false);
        setError(`Stop error: ${err}`);
        stoppingRef.current = false;
      }
    );
  }, [harvestAccumulated]);

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      if (recognizerRef.current) {
        recognizerRef.current.close();
        recognizerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { recognizedText, turnId, interimText, isListening, startListening, stopListening, error, pronunciationData };
}

export default function useAzureSpeech() {
  const [useAzure, setUseAzure] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getAzureSpeechToken().then(token => {
      setUseAzure(!!token);
      setChecked(true);
    });
  }, []);

  const azure = useAzureRecognition();
  const web = useWebSpeechRecognition();

  if (!checked) {
    return { recognizedText: '', turnId: 0, interimText: '', isListening: false, startListening: () => {}, stopListening: () => {}, error: null, pronunciationData: null };
  }

  return useAzure ? azure : web;
}
