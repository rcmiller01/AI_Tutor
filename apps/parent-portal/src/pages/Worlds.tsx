import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import './Worlds.css';

interface World {
    world_id: string;
    name: string;
    description: string;
    icon: string | null;
    enabled: boolean;
}

interface Skill {
    skill_id: string;
    name: string;
    description: string;
}

interface Child {
    child_id: string;
    display_name: string;
}

export function Worlds() {
    const [worlds, setWorlds] = useState<World[]>([]);
    const [children, setChildren] = useState<Child[]>([]);
    const [selectedChild, setSelectedChild] = useState<string | null>(null);
    const [expandedWorld, setExpandedWorld] = useState<string | null>(null);
    const [worldSkills, setWorldSkills] = useState<{ [worldId: string]: Skill[] }>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [worldsData, childrenData] = await Promise.all([
                    apiFetch<{ worlds: World[] }>('/admin/worlds'),
                    apiFetch<{ children: Child[] }>('/admin/children'),
                ]);

                setWorlds(worldsData.worlds);
                setChildren(childrenData.children);

                if (childrenData.children.length > 0) {
                    setSelectedChild(childrenData.children[0].child_id);
                }
            } catch (err) {
                console.error('Failed to fetch worlds:', err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, []);

    const toggleWorld = async (worldId: string) => {
        if (expandedWorld === worldId) {
            setExpandedWorld(null);
            return;
        }

        setExpandedWorld(worldId);

        // Fetch skills for this world if not already loaded
        if (!worldSkills[worldId]) {
            try {
                const data = await apiFetch<{ skills: Skill[] }>(`/worlds/${worldId}/skills`);
                setWorldSkills(prev => ({
                    ...prev,
                    [worldId]: data.skills,
                }));
            } catch (err) {
                console.error('Failed to fetch skills:', err);
                setWorldSkills(prev => ({
                    ...prev,
                    [worldId]: [],
                }));
            }
        }
    };

    const toggleWorldEnabled = async (worldId: string, enabled: boolean) => {
        try {
            await apiFetch(`/admin/worlds/${worldId}/enabled`, {
                method: 'PUT',
                body: JSON.stringify({ enabled }),
            });

            setWorlds(prev =>
                prev.map(w =>
                    w.world_id === worldId ? { ...w, enabled } : w
                )
            );
        } catch (err) {
            console.error('Failed to toggle world:', err);
        }
    };

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="worlds-page">
            <header className="page-header">
                <div>
                    <h1>Worlds</h1>
                    <p className="text-muted">
                        Enable or disable learning worlds for your household
                    </p>
                </div>
            </header>

            {/* Child Selector */}
            {children.length > 1 && (
                <div className="child-selector">
                    <label>Viewing as:</label>
                    <select
                        value={selectedChild || ''}
                        onChange={(e) => setSelectedChild(e.target.value)}
                    >
                        {children.map(child => (
                            <option key={child.child_id} value={child.child_id}>
                                {child.display_name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {worlds.length === 0 ? (
                <div className="empty-state card">
                    <p>No worlds available yet.</p>
                </div>
            ) : (
                <div className="worlds-grid">
                    {worlds.map(world => (
                        <div key={world.world_id} className="world-card card">
                            <button
                                className="world-header"
                                onClick={() => toggleWorld(world.world_id)}
                            >
                                <div className="world-icon">
                                    <span>{world.name[0]}</span>
                                </div>
                                <div className="world-info">
                                    <h3>{world.name}</h3>
                                    <p className="text-muted">{world.description}</p>
                                </div>
                                <span className="expand-icon">
                                    {expandedWorld === world.world_id ? '-' : '+'}
                                </span>
                            </button>

                            <div className="world-actions">
                                <button
                                    className={`world-toggle ${world.enabled ? 'enabled' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleWorldEnabled(world.world_id, !world.enabled);
                                    }}
                                >
                                    {world.enabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>

                            {expandedWorld === world.world_id && (
                                <div className="skills-list">
                                    {(worldSkills[world.world_id] || []).length === 0 ? (
                                        <p className="text-muted" style={{ padding: 'var(--space-md)' }}>
                                            Loading skills...
                                        </p>
                                    ) : (
                                        worldSkills[world.world_id].map(skill => (
                                            <div key={skill.skill_id} className="skill-row">
                                                <div className="skill-info">
                                                    <span className="skill-name">{skill.name}</span>
                                                    <span className="skill-desc text-muted">
                                                        {skill.description}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
