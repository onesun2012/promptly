import Database from 'better-sqlite3'
import { join } from 'node:path'

// DB contract (SPEC appendix B subset used by M3). The interface keeps the
// chat service testable without the native module.
export interface ConversationRow {
  id: string
  title: string
  provider_id: string
  model: string
  created_at: number
  updated_at: number
}

export interface MessageRow {
  id: number
  conversation_id: string
  role: string
  content: string
  created_at: number
}

export interface Db {
  listConversations(): ConversationRow[]
  createConversation(c: ConversationRow): void
  touchConversation(id: string, at: number): void
  deleteConversation(id: string): void
  getMessages(conversationId: string): MessageRow[]
  insertMessage(m: Omit<MessageRow, 'id'>): number
}

export function initSqliteDb(userDataPath: string): Db {
  const db = new Database(join(userDataPath, 'promptly.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  `)

  return {
    listConversations(): ConversationRow[] {
      return db
        .prepare(
          'SELECT id, title, provider_id, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 200'
        )
        .all() as ConversationRow[]
    },
    createConversation(c: ConversationRow): void {
      db.prepare(
        'INSERT INTO conversations (id, title, provider_id, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(c.id, c.title, c.provider_id, c.model, c.created_at, c.updated_at)
    },
    touchConversation(id: string, at: number): void {
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(at, id)
    },
    deleteConversation(id: string): void {
      db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },
    getMessages(conversationId: string): MessageRow[] {
      return db
        .prepare(
          'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id'
        )
        .all(conversationId) as MessageRow[]
    },
    insertMessage(m: Omit<MessageRow, 'id'>): number {
      const r = db
        .prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
        .run(m.conversation_id, m.role, m.content, m.created_at)
      return Number(r.lastInsertRowid)
    }
  }
}
