import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL ??
        'postgresql://mirror:mirror_dev_password@localhost:9999/mirror_tutor',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
    console.error('Unexpected DB pool error:', err);
});

pool.on('connect', () => {
    console.log('[DB] Connected to database pool');
});

export { pool };

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<pg.QueryResult<T>> {
    return pool.query<T>(text, params);
}

export async function getOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<T | null> {
    const result = await query<T>(text, params);
    return result.rows[0] ?? null;
}

export async function getMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<T[]> {
    const result = await query<T>(text, params);
    return result.rows;
}
