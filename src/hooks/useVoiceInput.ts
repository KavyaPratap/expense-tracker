import { useState, useEffect, useCallback, useRef } from 'react';
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

interface VoiceInputState {
    isListening: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
}

interface VoiceInputActions {
    startListening: () => void;
    stopListening: () => void;
    reset: () => void;
    isSupported: boolean;
}

export const useVoiceInput = (): VoiceInputState & VoiceInputActions => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSupported, setIsSupported] = useState(false);

    // Ref to hold web recognition instance if needed
    const webRecognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        checkSupport();

        // Cleanup function for web recognition
        return () => {
            if (webRecognitionRef.current) {
                webRecognitionRef.current.abort();
            }
        };
    }, []);

    const checkSupport = async () => {
        if (Capacitor.isNativePlatform()) {
            // Check if plugin is available (it should be if installed)
            try {
                const { available } = await SpeechRecognition.available();
                setIsSupported(available);
            } catch (e) {
                console.error("Native Speech Recognition check failed:", e);
                setIsSupported(false);
            }
        } else {
            // Web Fallback
            if (typeof window !== 'undefined' && (window.SpeechRecognition || (window as any).webkitSpeechRecognition)) {
                setIsSupported(true);
            } else {
                setIsSupported(false);
            }
        }
    };

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript(''); // Clear previous transcript on new start? Or keep appending? User might want to append. Let's clear for "command" style.

        if (Capacitor.isNativePlatform()) {
            try {
                // Check/Request Permissions
                const { speechRecognition: permission } = await SpeechRecognition.checkPermissions();
                if (permission !== 'granted') {
                    const { speechRecognition: newPermission } = await SpeechRecognition.requestPermissions();
                    if (newPermission !== 'granted') {
                        setError("Microphone permission denied");
                        return;
                    }
                }

                setIsListening(true);

                // Start listening
                await SpeechRecognition.start({
                    partialResults: true,
                    popup: false, // Android specific, set to true if you want system dialog, false for custom UI
                });

                // Add listeners
                SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
                    if (data.matches && data.matches.length > 0) {
                        setInterimTranscript(data.matches[0]);
                    }
                });

                SpeechRecognition.addListener('listeningState', (data: { status: "started" | "stopped" }) => {
                    if (data.status === "stopped") {
                        setIsListening(false);
                    } else {
                        setIsListening(true);
                    }
                });

            } catch (e: any) {
                console.error("Native start failed:", e);
                setError(e.message || "Failed to start voice input");
                setIsListening(false);
            }
        } else {
            // Web Logic
            const SpeechRecognitionConstructor = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognitionConstructor) return;

            const recognition = new SpeechRecognitionConstructor();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onerror = (event: any) => {
                if (event.error === 'no-speech') return;
                setError(event.error);
                setIsListening(false);
            };
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let interim = '';
                let final = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                if (final) setTranscript(prev => prev + ' ' + final); // Append
                setInterimTranscript(interim);
            };

            webRecognitionRef.current = recognition;
            recognition.start();
        }
    }, []);

    const stopListening = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await SpeechRecognition.stop();
                setIsListening(false);

                // Clean up listeners? The plugin handles it usually, but good practice.
                await SpeechRecognition.removeAllListeners();
            } catch (e) {
                console.error("Native stop failed", e);
            }
        } else {
            if (webRecognitionRef.current) {
                webRecognitionRef.current.stop();
            }
        }
    }, []);

    const reset = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
        setError(null);
    }, []);

    // For Native: Validating the final result when listening stops
    // The plugin might not send a "final" result event like web.
    // We usually get partial results. The last partial result is effectively the final one when it stops.
    useEffect(() => {
        if (Capacitor.isNativePlatform() && !isListening && interimTranscript) {
            setTranscript(interimTranscript);
            setInterimTranscript('');
        }
    }, [isListening, interimTranscript]);


    return {
        isListening,
        transcript,
        interimTranscript,
        error,
        startListening,
        stopListening,
        reset,
        isSupported,
    };
};
