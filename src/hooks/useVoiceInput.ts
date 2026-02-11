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

    // Ref to prevent concurrent start/stop operations
    const isProcessingRef = useRef(false);

    const startListening = useCallback(async () => {
        if (isProcessingRef.current || isListening) return;
        isProcessingRef.current = true;
        setError(null);
        setTranscript('');

        if (Capacitor.isNativePlatform()) {
            try {
                // Ensure clean state before starting
                try {
                    await SpeechRecognition.removeAllListeners();
                    await SpeechRecognition.stop(); // Try to stop just in case
                } catch (e) {
                    // Ignore errors during cleanup
                }

                // Check/Request Permissions
                console.log("Checking native permissions...");
                const { speechRecognition: permission } = await SpeechRecognition.checkPermissions();
                console.log("Permission status:", permission);

                if (permission !== 'granted') {
                    console.log("Requesting permissions...");
                    const { speechRecognition: newPermission } = await SpeechRecognition.requestPermissions();
                    console.log("New permission status:", newPermission);
                    if (newPermission !== 'granted') {
                        const msg = "Microphone permission denied";
                        setError(msg);
                        toast.error(msg);
                        isProcessingRef.current = false;
                        return;
                    }
                }

                setIsListening(true);
                toast.info("Starting voice input...");

                // Start listening
                console.log("Starting native listener...");
                await SpeechRecognition.start({
                    partialResults: true,
                    popup: false,
                });
                console.log("Native listener started");

                // Add listeners
                await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
                    console.log("Partial results:", data);
                    if (data.matches && data.matches.length > 0) {
                        setInterimTranscript(data.matches[0]);
                    }
                });

                await SpeechRecognition.addListener('listeningState', (data: { status: "started" | "stopped" }) => {
                    console.log("Listening state changed:", data);
                    if (data.status === "stopped") {
                        setIsListening(false);
                        isProcessingRef.current = false; // Release lock when stopped
                    } else {
                        setIsListening(true);
                    }
                });

            } catch (e: any) {
                console.error("Native start failed:", e);
                const msg = e.message || "Failed to start voice input";
                setError(msg);
                toast.error(`Voice Error: ${msg}`);
                setIsListening(false);
                isProcessingRef.current = false;
            }
        } else {
            // Web Logic
            console.log("Starting Web Speech Recognition. Online status:", navigator.onLine);
            if (!navigator.onLine) {
                console.error("Browser reports offline.");
                setError("Network error. Please check your internet connection.");
                isProcessingRef.current = false;
                return;
            }

            const SpeechRecognitionConstructor = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognitionConstructor) {
                setError("Speech recognition not supported in this browser.");
                isProcessingRef.current = false;
                return;
            }

            const recognition = new SpeechRecognitionConstructor();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                console.log("Speech recognition started.");
                setIsListening(true);
            };
            recognition.onend = () => {
                setIsListening(false);
                isProcessingRef.current = false;
            };
            recognition.onerror = (event: any) => {
                console.error("Speech recognition error event:", event);

                if (event.error === 'no-speech') return;

                let errorMessage = event.error;
                switch (event.error) {
                    case 'network':
                        errorMessage = "Network error. Please check your connection.";
                        break;
                    case 'not-allowed':
                    case 'service-not-allowed':
                        errorMessage = "Microphone access denied.";
                        break;
                    case 'aborted':
                        errorMessage = null; // Ignore aborted errors
                        break;
                    default:
                        errorMessage = `Voice Error: ${event.error}`;
                }

                if (errorMessage) {
                    setError(errorMessage);
                    toast.error(errorMessage);
                }
                setIsListening(false);
                isProcessingRef.current = false;
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
                if (final) setTranscript(prev => prev + ' ' + final);
                setInterimTranscript(interim);
            };

            webRecognitionRef.current = recognition;
            try {
                recognition.start();
            } catch (e) {
                console.error("Failed to start web recognition:", e);
                isProcessingRef.current = false;
            }
        }
    }, [isListening]);

    const stopListening = useCallback(async () => {
        // Allow stopping even if not "listening" boolean if processing, but safe to just call stop
        if (!isListening && !isProcessingRef.current) return;

        if (Capacitor.isNativePlatform()) {
            try {
                await SpeechRecognition.stop();
            } catch (e) {
                console.error("Native stop failed", e);
            } finally {
                setIsListening(false);
                isProcessingRef.current = false; // Ensure lock is released
                try {
                    await SpeechRecognition.removeAllListeners();
                } catch (e) { console.error("Remove listeners failed", e) }
            }
        } else {
            if (webRecognitionRef.current) {
                webRecognitionRef.current.stop();
            }
        }
    }, [isListening]);

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
