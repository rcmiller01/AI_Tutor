/**
 * services/mirror-core/src/routes/admin-auth.ts
 *
 * Parent authentication endpoints:
 *   POST /api/admin/register
 *   POST /api/admin/login
 *   POST /api/admin/logout
 *   POST /api/admin/refresh
 *
 * All endpoints return structured error objects on failure.
 * Refresh token is delivered as an HttpOnly, SameSite=Strict cookie.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import {
    issueAdminAccessToken,
    issueRefreshToken,
    verifyRefreshToken,
} from '../auth/tokens.js';
import {
    insertParent,
    insertHousehold,
    getParentByEmail,
    getParentById,
    getHouseholdByParent,
    revokeRefreshToken,
} from '../db/auth-queries.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'admin_refresh_token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/admin/refresh',
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    });
}

function clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/admin/refresh' });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function adminAuthRoutes(app: FastifyInstance) {

    // POST /api/admin/register
    app.post<{
        Body: { email: string; password: string };
    }>('/admin/register', async (request: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'email and password are required' } });
            return;
        }
        if (password.length < 8) {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'password must be at least 8 characters' } });
            return;
        }

        // Check for duplicate email
        const existing = await getParentByEmail(email);
        if (existing) {
            // Return 409 but don't reveal account existence (use same message shape)
            reply.code(409).send({ error: { code: 'CONFLICT', message: 'An account with this email already exists' } });
            return;
        }

        try {
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const parent = await insertParent(email, passwordHash);
            const household = await insertHousehold(parent.parent_id);

            request.log.info({ parent_id: parent.parent_id }, 'auth.parent_registered');

            reply.code(201).send({
                parent_id: parent.parent_id,
                email: parent.email,
                household_id: household.household_id,
                created_at: parent.created_at,
            });
        } catch (err) {
            request.log.error({ err }, 'Register failed');
            reply.code(500).send({ error: { code: 'INTERNAL', message: 'Registration failed' } });
        }
    });

    // POST /api/admin/login
    app.post<{
        Body: { email: string; password: string };
    }>('/admin/login', async (request: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'email and password are required' } });
            return;
        }

        const parent = await getParentByEmail(email);

        // Constant-time comparison to prevent timing attacks
        const dummyHash = '$2b$12$invalidhashforconstanttimeXXXXXX'; // never matches
        const passwordHash = parent?.password_hash ?? dummyHash;
        const matches = await bcrypt.compare(password, passwordHash);

        if (!parent || !matches) {
            request.log.warn({ email }, 'auth.login_failed');
            reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Invalid email or password' } });
            return;
        }

        const household = await getHouseholdByParent(parent.parent_id);
        if (!household) {
            request.log.error({ parent_id: parent.parent_id }, 'No household found for parent');
            reply.code(500).send({ error: { code: 'INTERNAL', message: 'Account configuration error' } });
            return;
        }

        const { token: accessToken, expiresAt } = await issueAdminAccessToken(
            parent.parent_id,
            household.household_id,
        );
        const refreshToken = await issueRefreshToken(parent.parent_id);

        setRefreshCookie(reply, refreshToken);

        request.log.info({ parent_id: parent.parent_id }, 'auth.login_success');

        reply.send({
            admin_access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 900,
            expires_at: expiresAt.toISOString(),
            household_id: household.household_id,
        });
    });

    // POST /api/admin/logout
    app.post('/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
        const raw = request.cookies?.[REFRESH_COOKIE];
        if (raw) {
            try {
                const claims = await verifyRefreshToken(raw);
                if (claims.jti) revokeRefreshToken(claims.jti);
            } catch {
                // Token already invalid — still clear the cookie
            }
        }
        clearRefreshCookie(reply);
        request.log.info('auth.logout');
        reply.code(204).send();
    });

    // POST /api/admin/refresh
    app.post('/admin/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
        const raw = request.cookies?.[REFRESH_COOKIE];

        if (!raw) {
            reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Refresh token cookie missing' } });
            return;
        }

        try {
            const claims = await verifyRefreshToken(raw);
            const parentId = claims.sub!;

            const parent = await getParentById(parentId);
            if (!parent) {
                reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Parent account not found' } });
                return;
            }

            const household = await getHouseholdByParent(parentId);
            if (!household) {
                reply.code(500).send({ error: { code: 'INTERNAL', message: 'Account configuration error' } });
                return;
            }

            const { token: accessToken, expiresAt } = await issueAdminAccessToken(
                parentId,
                household.household_id,
            );

            // Rotate refresh token
            const newRefreshToken = await issueRefreshToken(parentId);
            if (claims.jti) revokeRefreshToken(claims.jti);
            setRefreshCookie(reply, newRefreshToken);

            request.log.info({ parent_id: parentId }, 'auth.parent_session_started');

            reply.send({
                admin_access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 900,
                expires_at: expiresAt.toISOString(),
                household_id: household.household_id,
            });
        } catch {
            clearRefreshCookie(reply);
            reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired refresh token' } });
        }
    });
}
