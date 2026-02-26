import { useState, useCallback, useEffect } from 'react';
import { api } from './api/client';
import { TapChoice } from './components/TapChoice';
import { ScoreDisplay } from './components/ScoreDisplay';
import './App.css';

type GameState = 'idle' | 'loading' | 'playing' | 'feedback' | 'mastered' | 'error';

interface PromptData {
  prompt_id: string;
  content_id: string;
  content: {
    prompt_text: string;
    choices: { choice_id: string; label: string }[];
  };
  progress: {
    current_item: number;
    total_items: number;
    current_difficulty: number;
    stars_session_total: number;
    streak_current: number;
  };
}

interface FeedbackData {
  choiceId: string;
  isCorrect: boolean;
  hintText?: string;
  starsEarned: number;
  streak: number;
  streakMultiplier: number;
  soundEffect?: string;
  masteryState: string;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [totalStars, setTotalStars] = useState(0);
  const [streak, setStreak] = useState(0);
  const [streakMultiplier, setStreakMultiplier] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [promptStartTime, setPromptStartTime] = useState(0);
  const [celebration, setCelebration] = useState<string | null>(null);

  // Start game
  const startGame = useCallback(async () => {
    setGameState('loading');
    setError(null);
    try {
      const session = await api.createSession('cvc-blending') as { session_id: string };
      setSessionId(session.session_id);
      const item = await api.getNextItem(session.session_id);
      setPrompt(item);
      setPromptStartTime(Date.now());
      setGameState('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
      setGameState('error');
    }
  }, []);

  // Submit answer
  const handleSubmit = useCallback(
    async (choiceId: string) => {
      if (!sessionId || gameState !== 'playing') return;
      setGameState('feedback');
      const responseTime = Date.now() - promptStartTime;

      try {
        const result = await api.submitInteraction(sessionId, choiceId, responseTime);
        const fb: FeedbackData = {
          choiceId,
          isCorrect: result.is_correct,
          hintText: result.hint?.hint_text,
          starsEarned: result.stars_earned,
          streak: result.streak.current,
          streakMultiplier: result.streak.multiplier,
          soundEffect: result.sound_effect,
          masteryState: result.mastery_status.state,
        };
        setFeedback(fb);
        setTotalStars((s) => s + result.stars_earned);
        setStreak(result.streak.current);
        setStreakMultiplier(result.streak.multiplier);

        // Show celebration for special events
        if (result.sound_effect === 'level_up') setCelebration('🎉 Level Up!');
        else if (result.sound_effect === 'mastery') setCelebration('🏆 Mastery!');
        else if (result.sound_effect === 'streak_10') setCelebration('🔥🔥🔥 10 Streak!');
        else if (result.sound_effect === 'streak_5') setCelebration('🔥🔥 5 Streak!');
        else setCelebration(null);

        if (result.mastery_status.state === 'mastered') {
          setTimeout(() => setGameState('mastered'), 2000);
          return;
        }

        // Load next item after delay
        setTimeout(async () => {
          try {
            const next = await api.getNextItem(sessionId);
            setPrompt(next);
            setFeedback(null);
            setCelebration(null);
            setPromptStartTime(Date.now());
            setGameState('playing');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load next item');
            setGameState('error');
          }
        }, result.is_correct ? 1200 : 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit');
        setGameState('error');
      }
    },
    [sessionId, gameState, promptStartTime],
  );

  // Keyboard shortcut: number keys to select choices
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameState !== 'playing' || !prompt) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= prompt.content.choices.length) {
        handleSubmit(prompt.content.choices[num - 1].choice_id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameState, prompt, handleSubmit]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>✨ Magic Mirror ✨</h1>
      </header>

      {gameState === 'idle' && (
        <div className="start-screen">
          <div className="start-content">
            <h2>Ready to learn?</h2>
            <p>Blend the sounds to make words!</p>
            <button className="start-button" onClick={startGame}>
              🎮 Start CVC Blending
            </button>
          </div>
        </div>
      )}

      {gameState === 'loading' && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading your game...</p>
        </div>
      )}

      {gameState === 'error' && (
        <div className="error-screen">
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className="start-button" onClick={startGame}>
            Try Again
          </button>
        </div>
      )}

      {(gameState === 'playing' || gameState === 'feedback') && prompt && (
        <div className="game-area">
          <ScoreDisplay
            stars={totalStars}
            streak={streak}
            streakMultiplier={streakMultiplier}
            currentItem={prompt.progress.current_item}
            totalItems={prompt.progress.total_items}
            difficulty={prompt.progress.current_difficulty}
          />

          {celebration && <div className="celebration">{celebration}</div>}

          <TapChoice
            promptText={prompt.content.prompt_text}
            choices={prompt.content.choices}
            onSubmit={handleSubmit}
            disabled={gameState === 'feedback'}
            feedback={
              feedback
                ? {
                  choiceId: feedback.choiceId,
                  isCorrect: feedback.isCorrect,
                  hintText: feedback.hintText,
                }
                : null
            }
          />

          {feedback && feedback.isCorrect && (
            <div className="star-award">+{feedback.starsEarned} ⭐</div>
          )}
        </div>
      )}

      {gameState === 'mastered' && (
        <div className="mastery-screen">
          <h2>🏆 You Mastered It! 🏆</h2>
          <p>Amazing job! You earned {totalStars} Stars!</p>
          <button className="start-button" onClick={() => { setGameState('idle'); setTotalStars(0); setStreak(0); }}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
