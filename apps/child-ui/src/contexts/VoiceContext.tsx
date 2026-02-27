/**
 * apps/child-ui/src/contexts/VoiceContext.tsx
 *
 * Voice state management for the child UI.
 * Manages WebSocket connection to voice relay and audio state.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    type ReactNode,
} from 'react';

// Voice message types from server
interface VoiceMessage {
    type: string;
    [key: string]: unknown;
}

interface VoiceContextValue {
    // Connection state
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;

    // Voice state
    isListening: boolean;
    isSpeaking: boolean;
    isProcessing: boolean;

    // Transcripts
    userTranscript: string;
    assistantTranscript: string;

    // Actions
    connect: (token: string, sessionId?: string) => Promise<void>;
    disconnect: () => void;
    startListening: () => void;
    stopListening: () => void;
    sendAudio: (audioData: ArrayBuffer) => void;
    bindSession: (sessionId: string, skillId?: string, mode?: string) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
    const ctx = useContext(VoiceContext);
    if (!ctx) {
        throw new Error('useVoice must be used within a VoiceProvider');
    }
    return ctx;
}

interface VoiceProviderProps {
    children: ReactNode;
}

export function VoiceProvider({ children }: VoiceProviderProps) {
    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    // Voice state
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Transcripts
    const [userTranscript, setUserTranscript] = useState('');
    const [assistantTranscript, setAssistantTranscript] = useState('');

    // WebSocket ref
    const wsRef = useRef<WebSocket | null>(null);

    // Audio context for playback
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioQueueRef = useRef<AudioBuffer[]>([]);

    const handleMessage = useCallback((event: MessageEvent) => {
        try {
            const msg: VoiceMessage = JSON.parse(event.data);

            switch (msg.type) {
                case 'voice.connected':
                case 'voice.ready':
                    setIsConnected(true);
                    setIsConnecting(false);
                    setConnectionError(null);
                    break;

                case 'voice.listening':
                    setIsListening(true);
                    setIsProcessing(false);
                    break;

                case 'voice.processing':
                    setIsListening(false);
                    setIsProcessing(true);
                    break;

                case 'voice.transcript.final':
                    setUserTranscript(msg.transcript as string);
                    break;

                case 'voice.transcript.partial':
                    setAssistantTranscript((prev) => prev + (msg.delta as string));
                    break;

                case 'voice.transcript.done':
                    setAssistantTranscript(msg.transcript as string);
                    break;

                case 'voice.audio.delta':
                    // Queue audio for playback
                    playAudioChunk(msg.delta as string);
                    setIsSpeaking(true);
                    break;

                case 'voice.audio.done':
                    setIsSpeaking(false);
                    setIsProcessing(false);
                    break;

                case 'voice.response.done':
                    setIsProcessing(false);
                    break;

                case 'voice.error':
                    console.error('Voice error:', msg.message);
                    setConnectionError(msg.message as string);
                    break;

                case 'voice.disconnected':
                    setIsConnected(false);
                    break;
            }
        } catch (err) {
            console.error('Failed to parse voice message:', err);
        }
    }, []);

    const playAudioChunk = useCallback(async (base64Audio: string) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            }

            const ctx = audioContextRef.current;

            // Decode base64 to PCM16
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert PCM16 to float32
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
            }

            // Create audio buffer and play
            const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
            audioBuffer.copyToChannel(float32, 0);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.start();
        } catch (err) {
            console.error('Failed to play audio:', err);
        }
    }, []);

    const connect = useCallback(async (token: string, sessionId?: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        setIsConnecting(true);
        setConnectionError(null);

        const wsUrl = new URL('/api/ws/voice', window.location.origin);
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl.searchParams.set('token', token);
        if (sessionId) {
            wsUrl.searchParams.set('session_id', sessionId);
        }

        const ws = new WebSocket(wsUrl.toString());

        ws.onopen = () => {
            // Request OpenAI connection
            ws.send(JSON.stringify({ type: 'voice.connect' }));
        };

        ws.onmessage = handleMessage;

        ws.onerror = () => {
            setConnectionError('Connection failed');
            setIsConnecting(false);
        };

        ws.onclose = () => {
            setIsConnected(false);
            setIsConnecting(false);
            wsRef.current = null;
        };

        wsRef.current = ws;
    }, [handleMessage]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'voice.disconnect' }));
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        setIsProcessing(false);
    }, []);

    const startListening = useCallback(() => {
        setIsListening(true);
        setUserTranscript('');
        setAssistantTranscript('');
    }, []);

    const stopListening = useCallback(() => {
        setIsListening(false);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'voice.audio.commit' }));
        }
    }, []);

    const sendAudio = useCallback((audioData: ArrayBuffer) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        // Convert to base64
        const bytes = new Uint8Array(audioData);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        wsRef.current.send(JSON.stringify({
            type: 'voice.audio.append',
            audio: base64,
        }));
    }, []);

    const bindSession = useCallback((sessionId: string, skillId?: string, mode?: string) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        wsRef.current.send(JSON.stringify({
            type: 'voice.session.bind',
            session_id: sessionId,
            skill_id: skillId,
            mode,
        }));
    }, []);

    const value: VoiceContextValue = {
        isConnected,
        isConnecting,
        connectionError,
        isListening,
        isSpeaking,
        isProcessing,
        userTranscript,
        assistantTranscript,
        connect,
        disconnect,
        startListening,
        stopListening,
        sendAudio,
        bindSession,
    };

    return (
        <VoiceContext.Provider value={value}>
            {children}
        </VoiceContext.Provider>
    );
}
