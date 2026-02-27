import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { ApprovalCard } from '../components/ApprovalCard';
import './Approvals.css';

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

type FilterType = 'all' | 'content_flag' | 'skill_unlock' | 'time_extension';

export function Approvals() {
    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');

    const fetchApprovals = async () => {
        try {
            const data = await apiFetch<{ approvals: Approval[] }>('/approvals');
            setApprovals(data.approvals);
        } catch (err) {
            console.error('Failed to fetch approvals:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchApprovals();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await apiFetch(`/approvals/${id}/approve`, { method: 'POST' });
            setApprovals(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to approve:', err);
        }
    };

    const handleReject = async (id: string) => {
        try {
            await apiFetch(`/approvals/${id}/reject`, { method: 'POST' });
            setApprovals(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to reject:', err);
        }
    };

    const filteredApprovals = approvals.filter(a =>
        filter === 'all' || a.type === filter
    );

    const pendingCount = approvals.filter(a => a.status === 'pending').length;

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="approvals-page">
            <header className="page-header">
                <div>
                    <h1>Approvals</h1>
                    <p className="text-muted">
                        {pendingCount} pending {pendingCount === 1 ? 'request' : 'requests'}
                    </p>
                </div>
            </header>

            <div className="filter-bar">
                <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All
                </button>
                <button
                    className={`filter-btn ${filter === 'content_flag' ? 'active' : ''}`}
                    onClick={() => setFilter('content_flag')}
                >
                    Content Flags
                </button>
                <button
                    className={`filter-btn ${filter === 'skill_unlock' ? 'active' : ''}`}
                    onClick={() => setFilter('skill_unlock')}
                >
                    Skill Unlocks
                </button>
                <button
                    className={`filter-btn ${filter === 'time_extension' ? 'active' : ''}`}
                    onClick={() => setFilter('time_extension')}
                >
                    Time Extensions
                </button>
            </div>

            {filteredApprovals.length === 0 ? (
                <div className="empty-state card">
                    <p>
                        {filter === 'all'
                            ? 'No pending approvals. Great job staying on top of things!'
                            : `No ${filter.replace('_', ' ')} requests pending.`}
                    </p>
                </div>
            ) : (
                <div className="approvals-list">
                    {filteredApprovals.map(approval => (
                        <ApprovalCard
                            key={approval.id}
                            approval={approval}
                            onApprove={() => handleApprove(approval.id)}
                            onReject={() => handleReject(approval.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
