/**
 * apps/child-ui/src/pages/Home.tsx
 *
 * Main menu with companion dinosaur.
 * Shows greeting, stars balance, and mode selection buttons.
 */

import { useNavigate } from 'react-router-dom';
import { useChildAuth } from '../contexts/ChildAuthContext';
import { CompanionReaction } from '../components/rewards/CompanionReaction';
import './Home.css';

type TriadMode = 'talk' | 'practice' | 'play';

interface ModeOption {
    mode: TriadMode;
    label: string;
    description: string;
    icon: string;
    available: boolean;
}

const MODES: ModeOption[] = [
    {
        mode: 'talk',
        label: 'Talk',
        description: 'Coming soon!',
        icon: 'voice',
        available: false,
    },
    {
        mode: 'practice',
        label: 'Practice',
        description: 'Learn step by step',
        icon: 'learn',
        available: true,
    },
    {
        mode: 'play',
        label: 'Play',
        description: 'Challenge yourself!',
        icon: 'game',
        available: true,
    },
];

export function Home() {
    const navigate = useNavigate();
    const { profile, logout } = useChildAuth();

    const handleModeSelect = (mode: TriadMode) => {
        // Navigate to session page with selected mode
        navigate(`/session?mode=${mode}`);
    };

    const handleSwitchProfile = () => {
        logout();
        navigate('/');
    };

    if (!profile) {
        navigate('/');
        return null;
    }

    return (
        <div className="home-page">
            {/* Header with profile info */}
            <header className="home-header">
                <button className="switch-profile-btn" onClick={handleSwitchProfile}>
                    Switch
                </button>
                <div className="profile-info">
                    <span className="profile-name">{profile.display_name}</span>
                    <span className="stars-balance">
                        {profile.stars_balance ?? 0} Stars
                    </span>
                </div>
            </header>

            {/* Companion section */}
            <section className="companion-section">
                <CompanionReaction state="idle" />
                <div className="greeting">
                    <h1>Hi, {profile.display_name}!</h1>
                    <p>What do you want to do today?</p>
                </div>
            </section>

            {/* Mode selection */}
            <section className="mode-selection">
                <div className="modes-grid">
                    {MODES.map((option) => (
                        <button
                            key={option.mode}
                            className={`mode-card ${option.available ? '' : 'disabled'}`}
                            onClick={() => option.available && handleModeSelect(option.mode)}
                            disabled={!option.available}
                        >
                            <div className={`mode-icon ${option.icon}`} />
                            <span className="mode-label">{option.label}</span>
                            <span className="mode-desc">{option.description}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
