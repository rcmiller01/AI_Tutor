/**
 * apps/child-ui/src/components/system/ParentApprovalBanner.tsx
 *
 * Banner shown when an action requires parent approval.
 * Child-friendly messaging with supportive tone.
 */

import './ParentApprovalBanner.css';

export interface ParentApprovalBannerProps {
    /** The type of approval being requested */
    requestType: 'scope_change' | 'skill_change' | 'time_extension' | 'game_mode';
    /** Optional skill or world name being requested */
    requestedItem?: string;
    /** Called when child wants to dismiss the banner */
    onDismiss?: () => void;
    /** Called when child wants to try a safe alternative */
    onTryAlternative?: () => void;
}

const MESSAGES: Record<string, { title: string; body: string }> = {
    scope_change: {
        title: "Let's Ask First!",
        body: "A grown-up needs to say it's okay before we explore this.",
    },
    skill_change: {
        title: "New Skill Request",
        body: "We're asking your parent if this skill is right for you.",
    },
    time_extension: {
        title: "Time Check!",
        body: "You've been learning lots! Let's ask for more time.",
    },
    game_mode: {
        title: "Game Time Request",
        body: "We're checking if game time is available right now.",
    },
};

export function ParentApprovalBanner({
    requestType,
    requestedItem,
    onDismiss,
    onTryAlternative,
}: ParentApprovalBannerProps) {
    const message = MESSAGES[requestType] ?? MESSAGES.scope_change;

    return (
        <div className="parent-approval-banner" role="alert">
            <div className="approval-icon">
                <span className="icon-waiting" aria-hidden="true">⏳</span>
            </div>
            <div className="approval-content">
                <h3 className="approval-title">{message.title}</h3>
                <p className="approval-body">
                    {message.body}
                    {requestedItem && (
                        <span className="requested-item"> ({requestedItem})</span>
                    )}
                </p>
            </div>
            <div className="approval-actions">
                {onTryAlternative && (
                    <button
                        className="approval-btn btn-alternative"
                        onClick={onTryAlternative}
                    >
                        Try Something Else
                    </button>
                )}
                {onDismiss && (
                    <button
                        className="approval-btn btn-dismiss"
                        onClick={onDismiss}
                    >
                        OK
                    </button>
                )}
            </div>
        </div>
    );
}
