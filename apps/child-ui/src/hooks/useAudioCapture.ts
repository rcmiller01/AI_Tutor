/**
 * apps/child-ui/src/hooks/useAudioCapture.ts
 *
 * Hook for capturing audio from the microphone.
 * Uses MediaRecorder API for cross-browser compatibility.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioCaptureOptions {
    onAudioData?: (data: ArrayBuffer) => void;
    sampleRate?: number;
}

interface UseAudioCaptureReturn {
    isCapturing: boolean;
    hasPermission: boolean | null;
    error: string | null;
    startCapture: () => Promise<void>;
    stopCapture: () => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}): UseAudioCaptureReturn {
    const { onAudioData, sampleRate = 24000 } = options;

    const [isCapturing, setIsCapturing] = useState(false);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const startCapture = useCallback(async () => {
        if (isCapturing) return;

        setError(null);

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            setHasPermission(true);
            mediaStreamRef.current = stream;

            // Create audio context for processing
            const audioContext = new AudioContext({ sampleRate });
            audioContextRef.current = audioContext;

            // Create source from stream
            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            // Create processor to capture audio data
            // Using ScriptProcessorNode (deprecated but widely supported)
            // TODO: Migrate to AudioWorklet when broader support available
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (event) => {
                if (!onAudioData) return;

                const inputData = event.inputBuffer.getChannelData(0);

                // Convert float32 to PCM16
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }

                onAudioData(pcm16.buffer);
            };

            // Connect the nodes
            source.connect(processor);
            processor.connect(audioContext.destination);

            setIsCapturing(true);
        } catch (err) {
            console.error('Failed to start audio capture:', err);

            if (err instanceof DOMException) {
                if (err.name === 'NotAllowedError') {
                    setHasPermission(false);
                    setError('Microphone access denied. Please allow microphone access to use voice.');
                } else if (err.name === 'NotFoundError') {
                    setError('No microphone found. Please connect a microphone.');
                } else {
                    setError(`Microphone error: ${err.message}`);
                }
            } else {
                setError('Failed to start audio capture');
            }
        }
    }, [isCapturing, onAudioData, sampleRate]);

    const stopCapture = useCallback(() => {
        // Stop the media stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }

        // Disconnect and close audio nodes
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setIsCapturing(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCapture();
        };
    }, [stopCapture]);

    return {
        isCapturing,
        hasPermission,
        error,
        startCapture,
        stopCapture,
    };
}
