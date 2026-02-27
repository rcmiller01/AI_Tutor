/**
 * services/mirror-core/src/auth/tokens.ts
 *
 * JWT token issuance and verification using `jose` (no secret leaks; ES256 or HS256).
 *
 * Design:
 *   - Admin access token:  HS256, 15-minute TTL. Claims: { sub: parent_id, household_id, role: 'parent' }
 *   - Admin refresh token: HS256, 30-day TTL.   Claims: { sub: parent_id, type: 'refresh' }
 *   - Child session token: HS256, 4-hour TTL.    Claims: { sub: child_id, household_id, role: 'child' }
 *
 * All tokens use the same secret (`JWT_SECRET` env var).
 * A separate `REFRESH_SECRET` env var can be used for the refresh token if needed.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ─── Secrets ────────────────────────────────────────────────────────────────

function getSecret(name: string): Uint8Array {
    const val = process.env[name];
    if (!val || val.length < 32) {
        throw new Error(
            `[auth] ${name} env var is missing or too short (min 32 chars). Set it in .env.`,
        );
    }
    return new TextEncoder().encode(val);
}

// Lazy-load so startup doesn't crash if env not set (health check still works).
const getAccessSecret = () => getSecret('JWT_SECRET');
const getRefreshSecret = () =>
    process.env.REFRESH_SECRET ? getSecret('REFRESH_SECRET') : getSecret('JWT_SECRET');

// ─── Claim shapes ────────────────────────────────────────────────────────────

export interface AdminAccessClaims extends JWTPayload {
    sub: string;         // parent_id (UUID)
    household_id: string;
    role: 'parent';
}

export interface AdminRefreshClaims extends JWTPayload {
    sub: string;         // parent_id (UUID)
    type: 'refresh';
}

export interface ChildSessionClaims extends JWTPayload {
    sub: string;         // child_id (UUID)
    household_id: string;
    role: 'child';
}

// ─── Issue ───────────────────────────────────────────────────────────────────

const ISSUER = 'magic-mirror-tutor';

export async function issueAdminAccessToken(
    parentId: string,
    householdId: string,
): Promise<{ token: string; expiresAt: Date }> {
    const now = Date.now();
    const exp = new Date(now + 15 * 60 * 1000); // 15 min

    const token = await new SignJWT({ household_id: householdId, role: 'parent' } satisfies Omit<AdminAccessClaims, 'sub' | 'iat' | 'exp' | 'iss'>)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(parentId)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(getAccessSecret());

    return { token, expiresAt: exp };
}

export async function issueRefreshToken(parentId: string): Promise<string> {
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    return new SignJWT({ type: 'refresh' } satisfies Omit<AdminRefreshClaims, 'sub' | 'iat' | 'exp' | 'iss'>)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(parentId)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(getRefreshSecret());
}

export async function issueChildSessionToken(
    childId: string,
    householdId: string,
): Promise<{ token: string; expiresAt: Date }> {
    const exp = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hr

    const token = await new SignJWT({ household_id: householdId, role: 'child' } satisfies Omit<ChildSessionClaims, 'sub' | 'iat' | 'exp' | 'iss'>)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(childId)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(getAccessSecret());

    return { token, expiresAt: exp };
}

// ─── Verify ──────────────────────────────────────────────────────────────────

export async function verifyAdminAccessToken(token: string): Promise<AdminAccessClaims> {
    const { payload } = await jwtVerify(token, getAccessSecret(), { issuer: ISSUER });
    if ((payload as AdminAccessClaims).role !== 'parent') {
        throw new Error('Token role is not parent');
    }
    return payload as AdminAccessClaims;
}

export async function verifyRefreshToken(token: string): Promise<AdminRefreshClaims> {
    const { payload } = await jwtVerify(token, getRefreshSecret(), { issuer: ISSUER });
    if ((payload as AdminRefreshClaims).type !== 'refresh') {
        throw new Error('Token type is not refresh');
    }
    return payload as AdminRefreshClaims;
}

export async function verifyChildSessionToken(token: string): Promise<ChildSessionClaims> {
    const { payload } = await jwtVerify(token, getAccessSecret(), { issuer: ISSUER });
    if ((payload as ChildSessionClaims).role !== 'child') {
        throw new Error('Token role is not child');
    }
    return payload as ChildSessionClaims;
}
