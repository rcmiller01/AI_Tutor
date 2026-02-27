import React from 'react';
import './WorldMap.css';

interface Skill {
    skill_id: string;
    name: string;
    description: string;
}

interface WorldMapProps {
    skills: Skill[];
    onSelectSkill: (skillId: string) => void;
}

export function WorldMap({ skills, onSelectSkill }: WorldMapProps) {
    // For MVp, we hardcode the positions for the two core skills into a playful environment.
    return (
        <div className="world-map-wrapper">
            <div className="world-map-container">

                {/* Floating Clouds - positioned via CSS classes for animation */}
                <div className="decor-cloud cloud-1" aria-hidden="true">☁️</div>
                <div className="decor-cloud cloud-2" aria-hidden="true">☁️</div>
                <div className="decor-cloud cloud-3" aria-hidden="true">☁️</div>

                {/* Island 1: Grassland (Reading/Phonics) */}
                <div className="landmass grass-island" style={{ top: '15%', left: '10%', width: '45%', height: '55%' }}>
                    {/* Decorative foliage & props */}
                    <div className="upright-object decor-tree" style={{ top: '10%', left: '15%' }}>🌳</div>
                    <div className="upright-object decor-tree" style={{ top: '15%', left: '25%' }}>🌳</div>
                    <div className="upright-object decor-tree" style={{ top: '25%', left: '10%' }}>🌳</div>
                    <div className="upright-object decor-pipe" style={{ bottom: '20%', right: '15%' }}>🪈</div> {/* Green cylinder/pipe equivalent */}
                    <div className="upright-object decor-mushroom" style={{ bottom: '30%', left: '15%' }}>🍄</div>

                    {/* Waterfall effect on the bottom right edge */}
                    <div className="waterfall" style={{ bottom: '-10px', right: '40%' }}></div>

                    {/* Skill Node 1 */}
                    {skills[0] && (
                        <button
                            className="level-node"
                            style={{ top: '45%', left: '50%' }}
                            onClick={() => onSelectSkill(skills[0].skill_id)}
                            aria-label={`Start ${skills[0].name}`}
                        >
                            <div className="upright-object level-hover-text">{skills[0].name}</div>
                            <div className="upright-object map-castle" aria-hidden="true">🏰</div>
                        </button>
                    )}
                </div>

                {/* Path connecting islands (Wooden bridge feel) */}
                <div className="map-bridge" style={{ top: '55%', left: '50%', width: '25%', height: '20px' }}></div>

                {/* Island 2: Desert (Math/Addition) */}
                <div className="landmass desert-island" style={{ top: '45%', left: '70%', width: '25%', height: '45%' }}>
                    {/* Decorative rocks & cacti */}
                    <div className="upright-object decor-cactus" style={{ top: '20%', right: '20%' }}>🌵</div>
                    <div className="upright-object decor-rock" style={{ top: '40%', right: '10%' }}>🪨</div>
                    <div className="upright-object decor-rock" style={{ top: '50%', right: '15%' }}>🪨</div>
                    <div className="upright-object decor-cactus" style={{ bottom: '15%', left: '20%' }}>🌵</div>
                    <div className="upright-object decor-rock" style={{ bottom: '25%', left: '30%' }}>🪨</div>

                    {/* Skill Node 2 */}
                    {skills[1] && (
                        <button
                            className="level-node"
                            style={{ top: '65%', left: '50%' }}
                            onClick={() => onSelectSkill(skills[1].skill_id)}
                            aria-label={`Start ${skills[1].name}`}
                        >
                            <div className="upright-object level-hover-text">{skills[1].name}</div>
                            <div className="upright-object map-star" aria-hidden="true">⭐</div>
                        </button>
                    )}
                </div>

                {/* Extra decorative bits floating in ocean */}
                <div className="upright-object decor-boat" style={{ top: '80%', left: '30%' }}>⛵</div>
                <div className="upright-object decor-rock" style={{ top: '75%', left: '25%' }}>🪨</div>
                <div className="upright-object decor-rock" style={{ top: '85%', left: '35%' }}>🪨</div>

            </div>
        </div>
    );
}
