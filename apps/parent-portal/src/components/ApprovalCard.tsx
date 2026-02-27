import { useState } from 'react';
import './ApprovalCard.css';

interface Approval {
    id: string;
    type: 'content_flag' | 'skill_unlock' | 'time_extension';
    child_id: string;
    child_name: string;
    created_at: string;
    status: 'pending' | 'approved' | 'rejected';
    details: {
        reason?: string;
        skill_id?: string;
        skill_name?: string;
        content_id?: string;
        content_preview?: string;
        requested_minutes?: number;
    };
}

interface ApprovalCardProps {
    approval: Approval;
    onApprove: () => void;
    onReject: () => void;
}

export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleApprove = async () => {
        setIsProcessing(true);
        try {
            await onApprove();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        setIsProcessing(true);
        try {
            await onReject();
        } finally {
            setIsProcessing(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const getTypeLabel = (type: Approval['type']) => {
        switch (type) {
            case 'content_flag':
                return 'Content Flag';
            case 'skill_unlock':
                return 'Skill Unlock';
            case 'time_extension':
                return 'Time Extension';
            default:
                return type;
        }
    };

    const getTypeIcon = (type: Approval['type']) => {
        switch (type) {
            case 'content_flag':
                return '!';
            case 'skill_unlock':
                return '+';
            case 'time_extension':
                return '...';
            default:
                return '?';
        }
    };

    return (
        <div className={`approval-card card type-${approval.type}`}>
            <div className="approval-header">
                <div className="approval-type">
                    <span className="type-icon">{getTypeIcon(approval.type)}</span>
                    <span className="type-label">{getTypeLabel(approval.type)}</span>
                </div>
                <span className="approval-date text-muted">
                    {formatDate(approval.created_at)}
                </span>
            </div>

            <div className="approval-content">
                <div className="approval-child">
                    <strong>{approval.child_name}</strong>
                </div>

                {approval.type === 'content_flag' && (
                    <div className="approval-details">
                        <p className="flag-reason">{approval.details.reason}</p>
                        {approval.details.content_preview && (
                            <div className="content-preview">
                                "{approval.details.content_preview}"
                            </div>
                        )}
                    </div>
                )}

                {approval.type === 'skill_unlock' && (
                    <div className="approval-details">
                        <p>
                            Requesting access to: <strong>{approval.details.skill_name}</strong>
                        </p>
                    </div>
                )}

                {approval.type === 'time_extension' && (
                    <div className="approval-details">
                        <p>
                            Requesting additional <strong>{approval.details.requested_minutes} minutes</strong> of learning time
                        </p>
                    </div>
                )}
            </div>

            <div className="approval-actions">
                <button
                    className="btn-danger"
                    onClick={handleReject}
                    disabled={isProcessing}
                >
                    Reject
                </button>
                <button
                    className="btn-success"
                    onClick={handleApprove}
                    disabled={isProcessing}
                >
                    Approve
                </button>
            </div>
        </div>
    );
}
