/**
 * Session Auto-Timeout Job
 *
 * Periodically checks for and times out stale sessions.
 * Runs every minute, times out sessions idle for > configured minutes.
 */

import type { FastifyInstance } from 'fastify';
import { timeoutStaleSessions } from '../db/queries.js';
import { expireOldApprovals } from '../db/approval-queries.js';

// Default: 30 minutes idle timeout
const IDLE_TIMEOUT_MINUTES = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? '30', 10);

// Check interval: every 60 seconds
const TIMEOUT_CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Set up the auto-timeout cron job.
 * Should be called once at server startup.
 */
export function setupAutoTimeout(app: FastifyInstance): void {
    if (intervalId) {
        app.log.warn('Auto-timeout job already running');
        return;
    }

    app.log.info(
        { idleTimeoutMinutes: IDLE_TIMEOUT_MINUTES, checkIntervalMs: TIMEOUT_CHECK_INTERVAL_MS },
        'Starting session auto-timeout job',
    );

    intervalId = setInterval(async () => {
        try {
            // Timeout stale sessions
            const timedOutCount = await timeoutStaleSessions(IDLE_TIMEOUT_MINUTES);
            if (timedOutCount > 0) {
                app.log.info({ count: timedOutCount }, 'Timed out stale sessions');
            }

            // Also expire old approval requests
            const expiredCount = await expireOldApprovals();
            if (expiredCount > 0) {
                app.log.info({ count: expiredCount }, 'Expired old approval requests');
            }
        } catch (err) {
            app.log.error({ err }, 'Session timeout job failed');
        }
    }, TIMEOUT_CHECK_INTERVAL_MS);

    // Clean up on server shutdown
    app.addHook('onClose', () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            app.log.info('Stopped session auto-timeout job');
        }
    });
}

/**
 * Stop the auto-timeout job manually (for testing).
 */
export function stopAutoTimeout(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

/**
 * Run the timeout job once (for manual testing).
 */
export async function runTimeoutJobOnce(): Promise<{
    sessions_timed_out: number;
    approvals_expired: number;
}> {
    const sessionsTimedOut = await timeoutStaleSessions(IDLE_TIMEOUT_MINUTES);
    const approvalsExpired = await expireOldApprovals();
    return {
        sessions_timed_out: sessionsTimedOut,
        approvals_expired: approvalsExpired,
    };
}
