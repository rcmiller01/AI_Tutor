/**
 * apps/child-ui/src/pages/Session.tsx
 *
 * Active game session page.
 * Renders prompts using usePromptRenderer and handles game flow.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useChildAuth } from '../contexts/ChildAuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { api, type TriadMode, type SessionStartResponse, type InteractionResponse } from '../lib/api';
import { usePromptRenderer } from '../hooks/usePromptRenderer';
import { StreakMeter } from '../components/progress/StreakMeter';
import { StarsBurst } from '../components/rewards/StarsBurst';
import { CompanionReaction, type CompanionState } from '../components/rewards/CompanionReaction';
import { HintBanner } from '../components/system/HintBanner';
import { HintButton } from '../components/system/HintButton';
import { VoiceFab } from '../components/voice/VoiceFab';
import { WorldMap } from '../components/navigation/WorldMap';
import type { PromptPayload, HintPayload } from '@mirror/schemas';
import './Session.css';

type SessionStatus = 'loading' | 'skill_select' | 'playing' | 'feedback' | 'mastery_gate' | 'complete' | 'error';

// Available skills for MVP
const AVAILABLE_SKILLS = [
    { skill_id: 'cvc-blending', name: 'CVC Blending', description: 'Blend sounds to make words' },
    { skill_id: 'addition-1', name: 'Addition', description: 'Add numbers together' },
];

export function Session() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { profile, token } = useChildAuth();
    const { bindSession } = useVoice();

    // Session state
    const [status, setStatus] = useState<SessionStatus>('skill_select');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentMode, setCurrentMode] = useState<TriadMode>(
        (searchParams.get('mode') as TriadMode) || 'practice'
    );
    const [prompt, setPrompt] = useState<PromptPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Feedback state
    const [lastScore, setLastScore] = useState<InteractionResponse['score'] | null>(null);
    const [showStarsBurst, setShowStarsBurst] = useState(false);
    const [hint, setHint] = useState<HintPayload | null>(null);
    const [companionState, setCompanionState] = useState<CompanionState>('idle');
    const [companionMessage, setCompanionMessage] = useState<string | undefined>();

    // Progress state
    const [streak, setStreak] = useState(0);
    const [totalStars, setTotalStars] = useState(0);
    const [hintsRemaining, setHintsRemaining] = useState(3);
    const [promptStartTime, setPromptStartTime] = useState(0);

    // Get widget component for current prompt
    const { Widget, widgetProps } = usePromptRenderer(prompt);

    // Bind voice session when session starts
    useEffect(() => {
        if (sessionId) {
            bindSession(sessionId, prompt?.skill_id, currentMode);
        }
    }, [sessionId, bindSession, prompt?.skill_id, currentMode]);

    // Start a session with selected skill
    const startSession = useCallback(async (skillId: string) => {
        setStatus('loading');
        setError(null);

        try {
            const response = await api.startSession(skillId, currentMode);

            if (response.status === 'denied') {
                setError(response.denial_reason || 'Session denied');
                setStatus('error');
                return;
            }

            setSessionId(response.session_id);
            if (response.prompt) {
                setPrompt(response.prompt);
                setPromptStartTime(Date.now());
                setStatus('playing');
            } else {
                setError('No prompt received');
                setStatus('error');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start session');
            setStatus('error');
        }
    }, [currentMode]);

    // Handle widget submission
    const handleSubmit = useCallback(async (response: unknown) => {
        if (!sessionId || status !== 'playing') return;

        setStatus('feedback');
        const responseTime = Date.now() - promptStartTime;

        try {
            const result = await api.interact(sessionId, response, responseTime);

            setLastScore(result.score);
            setStreak(result.score.streak.current);
            setTotalStars(prev => prev + result.score.stars_earned);

            // Show stars animation for correct answers
            if (result.score.is_correct) {
                setShowStarsBurst(true);
                setCompanionState('celebrate');
                setCompanionMessage('Great job!');
                setTimeout(() => setShowStarsBurst(false), 1500);
            } else {
                // Show hint for incorrect
                if (result.score.hint) {
                    setHint(result.score.hint);
                    setHintsRemaining(result.score.hint.hints_remaining);
                }
                setCompanionState('encourage');
                setCompanionMessage("Keep trying!");
            }

            // Check session status
            if (result.session_status === 'mastery_gate') {
                setTimeout(() => {
                    setCompanionState('celebrate');
                    setCompanionMessage('Amazing! You mastered it!');
                    setStatus('mastery_gate');
                }, 1500);
                return;
            }

            if (result.session_status === 'complete') {
                setTimeout(() => setStatus('complete'), 1500);
                return;
            }

            // Load next prompt after delay
            setTimeout(() => {
                if (result.next_prompt) {
                    setPrompt(result.next_prompt);
                    setPromptStartTime(Date.now());
                    setHint(null);
                    setCompanionState('idle');
                    setCompanionMessage(undefined);
                    setStatus('playing');
                }
            }, result.score.is_correct ? 1200 : 2000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit');
            setStatus('error');
        }
    }, [sessionId, status, promptStartTime]);

    // Request hint
    const handleRequestHint = useCallback(async () => {
        if (!sessionId || hintsRemaining <= 0) return;

        try {
            const hintResult = await api.requestHint(sessionId);
            setHint(hintResult);
            setHintsRemaining(hintResult.hints_remaining);
            setCompanionState('thinking');
            setCompanionMessage(hintResult.hint_text);
        } catch (err) {
            console.error('Failed to get hint:', err);
        }
    }, [sessionId, hintsRemaining]);

    // Clear hint after viewing
    const handleDismissHint = useCallback(() => {
        setHint(null);
        setCompanionState('idle');
        setCompanionMessage(undefined);
    }, []);

    // Go back to home
    const handleExit = useCallback(() => {
        navigate('/home');
    }, [navigate]);

    // Render skill selection
    if (status === 'skill_select') {
        return (
            <div className="session-page">
                <header className="session-header">
                    <button className="exit-btn" onClick={handleExit}>Exit</button>
                    <h1>Choose a Skill</h1>
                </header>

                <WorldMap skills={AVAILABLE_SKILLS} onSelectSkill={startSession} />
            </div>
        );
    }

    // Render loading
    if (status === 'loading') {
        return (
            <div className="session-page">
                <div className="loading">
                    <div className="spinner" />
                    <p>Getting ready...</p>
                </div>
            </div>
        );
    }

    // Render error
    if (status === 'error') {
        return (
            <div className="session-page">
                <div className="error-screen">
                    <CompanionReaction state="encourage" message="Oops! Something went wrong." />
                    <p className="error-text">{error}</p>
                    <button className="start-button" onClick={() => setStatus('skill_select')}>
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    // Render mastery gate celebration
    if (status === 'mastery_gate') {
        return (
            <div className="session-page">
                <div className="mastery-screen">
                    <CompanionReaction state="celebrate" />
                    <h2>You Did It!</h2>
                    <p>You earned {totalStars} stars!</p>
                    <div className="mastery-actions">
                        <button className="btn-secondary" onClick={() => setStatus('skill_select')}>
                            Practice More
                        </button>
                        <button className="start-button" onClick={handleExit}>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Render complete
    if (status === 'complete') {
        return (
            <div className="session-page">
                <div className="complete-screen">
                    <CompanionReaction state="celebrate" message="Session complete!" />
                    <h2>Great Practice!</h2>
                    <p>You earned {totalStars} stars!</p>
                    <button className="start-button" onClick={handleExit}>
                        Done
                    </button>
                </div>
            </div>
        );
    }

    // Render game
    return (
        <div className="session-page">
            <header className="session-header">
                <button className="exit-btn" onClick={handleExit}>Exit</button>
                <StreakMeter current={streak} />
                <div className="stars-display">
                    {totalStars} Stars
                </div>
            </header>

            <main className="game-area">
                {showStarsBurst && <StarsBurst count={lastScore?.stars_earned ?? 1} />}

                <div className="companion-mini">
                    <CompanionReaction state={companionState} message={companionMessage} />
                </div>

                {hint && (
                    <HintBanner
                        hint={hint}
                        onDismiss={handleDismissHint}
                    />
                )}

                {Widget && (
                    <Widget
                        {...widgetProps}
                        onSubmit={handleSubmit}
                        disabled={status === 'feedback'}
                    />
                )}

                {status === 'playing' && !hint && (
                    <HintButton
                        remaining={hintsRemaining}
                        onRequest={handleRequestHint}
                    />
                )}
            </main>

            {/* Voice interaction FAB */}
            {token && (
                <VoiceFab
                    sessionToken={token}
                    sessionId={sessionId ?? undefined}
                    onError={(err) => console.error('Voice error:', err)}
                />
            )}
        </div>
    );
}
