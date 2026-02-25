import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";

const require = createRequire(import.meta.url);

// node-sqlite3-wasm은 CJS 모듈로만 로드 가능
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Database } = require("node-sqlite3-wasm") as {
    Database: new (path: string) => SqliteDb;
};

// node-sqlite3-wasm의 최소 타입 정의
interface SqliteStatement {
    get(params?: unknown[]): Record<string, unknown> | undefined;
    all(params?: unknown[]): Record<string, unknown>[];
    run(params?: unknown[]): void;
    finalize(): void;
}

export interface SqliteDb {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): void;
    all(sql: string, params?: unknown[]): Record<string, unknown>[];
    get(sql: string, params?: unknown[]): Record<string, unknown> | undefined;
    prepare(sql: string): SqliteStatement;
    close(): void;
}

export function getPersonaRoot(): string {
    const envPath = process.env.PERSONA_PATH;
    if (envPath) return envPath;
    return path.join(os.homedir(), ".vy", "persona");
}

let _db: SqliteDb | null = null;

export function getDb(): SqliteDb {
    if (_db) return _db;

    const root = getPersonaRoot();
    const profilesDir = path.join(root, "profiles");
    fs.mkdirSync(profilesDir, { recursive: true });

    const dbPath = path.join(root, "memory.db");
    _db = new Database(dbPath);

    initializeDb(_db);
    return _db;
}

function initializeDb(db: SqliteDb): void {
    db.exec("PRAGMA journal_mode=WAL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            persona_name TEXT NOT NULL,
            content      TEXT NOT NULL,
            embedding    TEXT,
            source_agent TEXT,
            created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS relationships (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            source_name   TEXT NOT NULL,
            target_name   TEXT NOT NULL,
            relation_type TEXT NOT NULL,
            description   TEXT,
            updated_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            UNIQUE(source_name, target_name)
        );
    `);
}

export function closeDb(): void {
    if (_db) {
        _db.close();
        _db = null;
    }
}
