import { useState } from 'react';
import './PolicyEditor.css';

interface ChildPolicy {
    daily_limit_minutes: number;
    session_max_minutes: number;
    allowed_days: number[];
    allowed_start_time: string;
    allowed_end_time: string;
}

interface PolicyEditorProps {
    childId: string;
    policy: ChildPolicy;
    onSave: (policy: ChildPolicy) => Promise<void>;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PolicyEditor({ policy, onSave }: PolicyEditorProps) {
    const [editedPolicy, setEditedPolicy] = useState<ChildPolicy>(policy);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const updatePolicy = (updates: Partial<ChildPolicy>) => {
        setEditedPolicy(prev => ({ ...prev, ...updates }));
        setHasChanges(true);
    };

    const toggleDay = (day: number) => {
        const newDays = editedPolicy.allowed_days.includes(day)
            ? editedPolicy.allowed_days.filter(d => d !== day)
            : [...editedPolicy.allowed_days, day].sort();
        updatePolicy({ allowed_days: newDays });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(editedPolicy);
            setHasChanges(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setEditedPolicy(policy);
        setHasChanges(false);
    };

    return (
        <div className="policy-editor card">
            {/* Daily Limit */}
            <div className="policy-field">
                <div className="field-header">
                    <label>Daily Time Limit</label>
                    <span className="field-value">{editedPolicy.daily_limit_minutes} minutes</span>
                </div>
                <input
                    type="range"
                    min={15}
                    max={180}
                    step={15}
                    value={editedPolicy.daily_limit_minutes}
                    onChange={(e) => updatePolicy({ daily_limit_minutes: parseInt(e.target.value, 10) })}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>15 min</span>
                    <span>3 hours</span>
                </div>
            </div>

            {/* Session Max */}
            <div className="policy-field">
                <div className="field-header">
                    <label>Max Session Length</label>
                    <span className="field-value">{editedPolicy.session_max_minutes} minutes</span>
                </div>
                <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={editedPolicy.session_max_minutes}
                    onChange={(e) => updatePolicy({ session_max_minutes: parseInt(e.target.value, 10) })}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>5 min</span>
                    <span>60 min</span>
                </div>
            </div>

            {/* Allowed Days */}
            <div className="policy-field">
                <label>Allowed Days</label>
                <div className="day-toggles">
                    {DAY_NAMES.map((name, index) => (
                        <button
                            key={index}
                            type="button"
                            className={`day-toggle ${editedPolicy.allowed_days.includes(index) ? 'active' : ''}`}
                            onClick={() => toggleDay(index)}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Time Windows */}
            <div className="policy-field">
                <label>Allowed Time Window</label>
                <div className="time-inputs">
                    <div className="time-input">
                        <span className="text-muted">From</span>
                        <input
                            type="time"
                            value={editedPolicy.allowed_start_time}
                            onChange={(e) => updatePolicy({ allowed_start_time: e.target.value })}
                        />
                    </div>
                    <div className="time-input">
                        <span className="text-muted">To</span>
                        <input
                            type="time"
                            value={editedPolicy.allowed_end_time}
                            onChange={(e) => updatePolicy({ allowed_end_time: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Actions */}
            {hasChanges && (
                <div className="policy-actions">
                    <button
                        className="btn-ghost"
                        onClick={handleReset}
                        disabled={isSaving}
                    >
                        Reset
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
    );
}
