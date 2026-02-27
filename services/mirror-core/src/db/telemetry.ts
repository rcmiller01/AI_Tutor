/**
 * Telemetry Event Emission Utility
 *
 * Single point of entry for all telemetry event emission.
 * Events are stored in the telemetry_events table (append-only).
 */

import { randomUUID } from 'node:crypto';
import { query } from './pool.js';
import type { TelemetryEvent, TelemetryPayload } from '@mirror/schemas';

/**
 * Context required for every telemetry event.
 * session_id and child_id may be null for auth/parent-only events.
 */
export interface TelemetryContext {
    session_id: string | null;
    child_id: string | null;
    household_id: string;
}

/**
 * Emit a single telemetry event.
 *
 * @param event_name - Event name in domain.action format (e.g., 'policy.request_denied')
 * @param payload - Event-specific payload (type-checked against event_name)
 * @param context - Session, child, and household context
 * @returns The generated event_id
 *
 * @example
 * await emitEvent('bundle.created', {
 *     bundle_id: 'abc-123',
 *     skill_id: 'cvc-blending',
 *     world_id: 'phonics',
 * }, { session_id: 'sess-1', child_id: 'child-1', household_id: 'hh-1' });
 */
export async function emitEvent<T extends TelemetryEvent['event_name']>(
    event_name: T,
    payload: TelemetryPayload<T>,
    context: TelemetryContext,
): Promise<string> {
    const event_id = randomUUID();
    const occurred_at = new Date().toISOString();

    await query(
        `INSERT INTO telemetry_events (event_id, event_name, session_id, child_id, household_id, occurred_at, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            event_id,
            event_name,
            context.session_id,
            context.child_id,
            context.household_id,
            occurred_at,
            JSON.stringify(payload),
        ],
    );

    return event_id;
}

/**
 * Emit multiple telemetry events atomically in a single transaction.
 * Use this for batch operations (e.g., session end summary).
 *
 * @param events - Array of events to emit
 * @returns Array of generated event_ids
 */
export async function emitEvents(
    events: Array<{
        event_name: TelemetryEvent['event_name'];
        payload: Record<string, unknown>;
        context: TelemetryContext;
    }>,
): Promise<string[]> {
    if (events.length === 0) return [];

    const event_ids = events.map(() => randomUUID());
    const occurred_at = new Date().toISOString();

    // Build parameterized VALUES clause
    const valuesClauses: string[] = [];
    const params: unknown[] = [];

    events.forEach((event, i) => {
        const offset = i * 7;
        valuesClauses.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
        );
        params.push(
            event_ids[i],
            event.event_name,
            event.context.session_id,
            event.context.child_id,
            event.context.household_id,
            occurred_at,
            JSON.stringify(event.payload),
        );
    });

    // Execute in transaction for atomicity
    await query('BEGIN');
    try {
        await query(
            `INSERT INTO telemetry_events (event_id, event_name, session_id, child_id, household_id, occurred_at, payload)
             VALUES ${valuesClauses.join(', ')}`,
            params,
        );
        await query('COMMIT');
    } catch (err) {
        await query('ROLLBACK');
        throw err;
    }

    return event_ids;
}

/**
 * Query telemetry events for a session.
 * Useful for debugging and session replay.
 */
export async function getEventsForSession(
    session_id: string,
    limit = 100,
): Promise<
    Array<{
        event_id: string;
        event_name: string;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>
> {
    const result = await query<{
        event_id: string;
        event_name: string;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>(
        `SELECT event_id, event_name, occurred_at, payload
         FROM telemetry_events
         WHERE session_id = $1
         ORDER BY occurred_at ASC
         LIMIT $2`,
        [session_id, limit],
    );
    return result.rows;
}

/**
 * Query flag events for a household (parent dashboard).
 */
export async function getFlagEventsForHousehold(
    household_id: string,
    limit = 50,
): Promise<
    Array<{
        event_id: string;
        event_name: string;
        child_id: string | null;
        session_id: string | null;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>
> {
    const result = await query<{
        event_id: string;
        event_name: string;
        child_id: string | null;
        session_id: string | null;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>(
        `SELECT event_id, event_name, child_id, session_id, occurred_at, payload
         FROM telemetry_events
         WHERE household_id = $1 AND event_name LIKE 'flag.%'
         ORDER BY occurred_at DESC
         LIMIT $2`,
        [household_id, limit],
    );
    return result.rows;
}

/**
 * Query events by name for analytics.
 */
export async function getEventsByName(
    event_name: TelemetryEvent['event_name'],
    household_id: string,
    limit = 100,
): Promise<
    Array<{
        event_id: string;
        session_id: string | null;
        child_id: string | null;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>
> {
    const result = await query<{
        event_id: string;
        session_id: string | null;
        child_id: string | null;
        occurred_at: string;
        payload: Record<string, unknown>;
    }>(
        `SELECT event_id, session_id, child_id, occurred_at, payload
         FROM telemetry_events
         WHERE event_name = $1 AND household_id = $2
         ORDER BY occurred_at DESC
         LIMIT $3`,
        [event_name, household_id, limit],
    );
    return result.rows;
}
