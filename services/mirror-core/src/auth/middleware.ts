/**
 * services/mirror-core/src/auth/middleware.ts
 *
 * Fastify preHandler hooks for parent and child auth.
 *
 * Usage:
 *   Route-level:   app.get('/api/admin/children', { preHandler: requireParentAuth }, handler)
 *   Plugin-level:  app.addHook('preHandler', requireParentAuth)  (inside an admin plugin scope)
 *
 * Design invariants:
 *   - Parent JWT → only from Authorization: Bearer header.
 *   - Child JWT  → only from X-Child-Token header.
 *   - Parent token on a child route → 403 (role mismatch).
 *   - Child token on an admin route → 403 (role mismatch).
 *   - Expired or tampered token → 401.
 *   - Missing token → 401.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAdminAccessToken, verifyChildSessionToken } from './tokens.js';
import type { AdminAccessClaims, ChildSessionClaims } from './tokens.js';

// ─── Request augmentation ────────────────────────────────────────────────────

declare module 'fastify' {
    interface FastifyRequest {
        /** Set by requireParentAuth preHandler. */
        parentClaims?: AdminAccessClaims;
        /** Set by requireChildAuth preHandler. */
        childClaims?: ChildSessionClaims;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractBearer(request: FastifyRequest): string | null {
    const raw = request.headers['authorization'] ?? '';
    if (!raw.startsWith('Bearer ')) return null;
    return raw.slice(7).trim();
}

function extractChildToken(request: FastifyRequest): string | null {
    const raw = request.headers['x-child-token'];
    if (!raw || typeof raw !== 'string') return null;
    return raw.trim();
}

// ─── Parent auth hook ─────────────────────────────────────────────────────────

export async function requireParentAuth(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const token = extractBearer(request);

    if (!token) {
        reply.code(401).send({
            error: { code: 'AUTH_REQUIRED', message: 'Authorization: Bearer token required' },
        });
        return;
    }

    try {
        request.parentClaims = await verifyAdminAccessToken(token);
    } catch {
        reply.code(401).send({
            error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired admin token' },
        });
    }
}

// ─── Child auth hook ──────────────────────────────────────────────────────────

export async function requireChildAuth(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const token = extractChildToken(request);

    if (!token) {
        reply.code(401).send({
            error: { code: 'AUTH_REQUIRED', message: 'X-Child-Token header required' },
        });
        return;
    }

    try {
        request.childClaims = await verifyChildSessionToken(token);
    } catch {
        reply.code(401).send({
            error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired child token' },
        });
    }
}

// ─── Cross-role block ─────────────────────────────────────────────────────────
// Prevents a child token being used on admin routes and vice versa.

export async function blockParentOnChildRoute(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const bearer = extractBearer(request);
    if (bearer) {
        try {
            await verifyAdminAccessToken(bearer);
            // If this succeeds a parent is hitting a child route
            reply.code(403).send({
                error: { code: 'AUTH_FORBIDDEN', message: 'Parent token not accepted on child routes' },
            });
        } catch {
            // Not a parent token — continue
        }
    }
}
