/**
 * apps/child-ui/src/components/voice/VoiceFab.tsx
 *
 * Push-to-talk floating action button for voice interaction.
 * Large touch target (80px) optimized for ages 6-8.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from '../../contexts/VoiceContext';
import { useAudioCapture } from '../../hooks/useAudioCapture';
import './VoiceFab.css';

interface VoiceFabProps {
    sessionToken: string;
    sessionId?: string;
    onError?: (error: string) => void;
}

export function VoiceFab({ sessionToken, sessionId, onError }: VoiceFabProps) {
    const {
        isConnected,
        isConnecting,
        connectionError,
        isListening,
        isSpeaking,
        isProcessing,
        connect,
        disconnect,
        startListening,
        stopListening,
        sendAudio,
    } = useVoice();

    const [isPressing, setIsPressing] = useState(false);
    const connectAttemptedRef = useRef(false);

    // Audio capture hook
    const {
        isCapturing,
        hasPermission,
        error: captureError,
        startCapture,
        stopCapture,
    } = useAudioCapture({
        onAudioData: sendAudio,
        sampleRate: 24000,
    });

    // Connect on mount
    useEffect(() => {
        if (!connectAttemptedRef.current && sessionToken) {
            connectAttemptedRef.current = true;
            connect(sessionToken, sessionId).catch((err) => {
                console.error('Voice connect failed:', err);
            });
        }

        return () => {
            disconnect();
        };
    }, [sessionToken, sessionId, connect, disconnect]);

    // Report errors
    useEffect(() => {
        if (connectionError && onError) {
            onError(connectionError);
        }
        if (captureError && onError) {
            onError(captureError);
        }
    }, [connectionError, captureError, onError]);

    const handlePressStart = useCallback(async () => {
        if (!isConnected) return;

        setIsPressing(true);
        startListening();
        await startCapture();
    }, [isConnected, startListening, startCapture]);

    const handlePressEnd = useCallback(() => {
        setIsPressing(false);
        stopCapture();
        stopListening();
    }, [stopCapture, stopListening]);

    // Handle touch events
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        handlePressStart();
    }, [handlePressStart]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        handlePressEnd();
    }, [handlePressEnd]);

    // Handle mouse events
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        handlePressStart();
    }, [handlePressStart]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        handlePressEnd();
    }, [handlePressEnd]);

    const handleMouseLeave = useCallback(() => {
        if (isPressing) {
            handlePressEnd();
        }
    }, [isPressing, handlePressEnd]);

    // Determine visual state
    const getStateClass = () => {
        if (isConnecting) return 'connecting';
        if (!isConnected) return 'disconnected';
        if (isSpeaking) return 'speaking';
        if (isProcessing) return 'processing';
        if (isListening || isCapturing) return 'listening';
        return 'idle';
    };

    const getIcon = () => {
        if (isConnecting) return '...';
        if (!isConnected) return '!';
        if (isSpeaking) return '\u{1F50A}'; // Speaker
        if (isProcessing) return '\u{1F914}'; // Thinking
        if (isListening || isCapturing) return '\u{1F3A4}'; // Microphone
        return '\u{1F3A4}'; // Microphone
    };

    const getLabel = () => {
        if (isConnecting) return 'Connecting...';
        if (!isConnected) return 'Tap to retry';
        if (isSpeaking) return 'Sparky is talking!';
        if (isProcessing) return 'Thinking...';
        if (isListening || isCapturing) return 'Listening!';
        return 'Hold to talk';
    };

    const handleClick = useCallback(() => {
        if (!isConnected && !isConnecting) {
            // Retry connection
            connect(sessionToken, sessionId);
        }
    }, [isConnected, isConnecting, connect, sessionToken, sessionId]);

    return (
        <div className="voice-fab-container">
            <button
                className={`voice-fab ${getStateClass()}`}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                disabled={isConnecting || hasPermission === false}
                aria-label={getLabel()}
            >
                <span className="voice-fab-icon">{getIcon()}</span>
                {(isListening || isCapturing) && (
                    <span className="voice-fab-pulse" />
                )}
            </button>
            <span className="voice-fab-label">{getLabel()}</span>
        </div>
    );
}
