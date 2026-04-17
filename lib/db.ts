import sqlite3 from 'sqlite3'
import { join } from 'path'
import { promisify } from 'util'
import { config, getDefaultFocusAreaId, getFocusAreaIds, getFocusAreaPriority, isValidFocusArea } from './config'

const DB_PATH = join(process.cwd(), 'data', 'command-center.db')

export const ITEM_CATEGORIES = ['ideas', 'conversations', 'research', 'bookmarks', 'decisions'] as const
export const ITEM_STATUSES = ['raw', 'clustered', 'candidate', 'promoted', 'reference', 'archived'] as const
export const ITEM_DISPOSITIONS = ['keep_incubating', 'connect_cluster', 'promote', 'reference', 'archive', 'merge_duplicate'] as const

export type ItemCategory = typeof ITEM_CATEGORIES[number]
export type ItemStatus = typeof ITEM_STATUSES[number]
export type ItemDisposition = typeof ITEM_DISPOSITIONS[number]

/**
 * Promotion target id — free-form string interpreted by the promotion plugin
 * configured in command-space.config.ts. Validation happens at the plugin
 * layer, not in the schema.
 */
export type PromotionTarget = string

/**
 * Focus area id — must match one of the ids declared in
 * command-space.config.ts under `focusAreas`. Validated at write time via
 * `isValidFocusArea()`.
 */
export type FocusArea = string

/** Runtime-computed list of focus area ids from the current config. */
export const FOCUS_AREAS = getFocusAreaIds()

const NEW_COLUMNS = [
  'reviewed_at',
  'agent_confidence',
  'disposition',
  'duplicate_of',
  'cluster_key',
  'promotion_target',
  'needs_review',
  'attention_reason',
  'focus_area',
  'focus_score',
]

let db: sqlite3.Database | null = null

export interface Item {
  id: number
  title: string
  content: string
  category: ItemCategory
  tags: string[]
  status: ItemStatus
  summary?: string
  reviewed_at?: string | null
  agent_confidence?: number | null
  disposition?: ItemDisposition | null
  duplicate_of?: number | null
  cluster_key?: string | null
  promotion_target?: PromotionTarget | null
  needs_review: boolean
  attention_reason?: string | null
  focus_area: FocusArea
  focus_score: number
  created_at: string
  updated_at: string
  connections?: number[]
}

export interface CreateItemInput extends Omit<Item, 'id' | 'created_at' | 'updated_at' | 'focus_area' | 'focus_score'> {
  focus_area?: FocusArea
  focus_score?: number
}

export interface Connection {
  id: number
  source_id: number
  target_id: number
  relationship_type: string
  created_at: string
}

export async function getDb(): Promise<sqlite3.Database> {
  if (!db) {
    db = new sqlite3.Database(DB_PATH)
    await initDb()
  }
  return db
}

async function initDb() {
  const database = await getDb()
  const run = promisify(database.run.bind(database))
  const all = promisify(database.all.bind(database))
  const get = promisify(database.get.bind(database))

  const itemsExists = await get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='items'"
  )
  const connectionsExists = await get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='connections'"
  )

  if (itemsExists) {
    const columns = await all(`PRAGMA table_info(items)`) as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    const needsMigration = NEW_COLUMNS.some((column) => !names.has(column))
    if (needsMigration) {
      await migrateLegacySchema(database)
    }
  }

  await run(buildCreateItemsSql())
  await run(buildCreateConnectionsSql())
  await ensureIndexes()

  if (!itemsExists && !connectionsExists) {
    return
  }
}

function runOn(database: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (err: Error | null) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function migrateLegacySchema(database: sqlite3.Database) {
  const all = promisify(database.all.bind(database))

  const legacyItems = await all(`SELECT * FROM items`) as any[]
  const legacyConnections = await all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='connections'"
  ) as any[]

  let connections: any[] = []
  if (legacyConnections.length > 0) {
    connections = await all(`SELECT * FROM connections`) as any[]
  }

  await runOn(database, 'PRAGMA foreign_keys = OFF')
  await runOn(database, 'DROP TABLE IF EXISTS connections')
  await runOn(database, 'DROP TABLE IF EXISTS items')
  await runOn(database, buildCreateItemsSql())
  await runOn(database, buildCreateConnectionsSql())

  for (const item of legacyItems) {
    await insertMigratedItem(database, item)
  }

  for (const connection of connections) {
    await runOn(
      database,
      `INSERT INTO connections (id, source_id, target_id, relationship_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        connection.id,
        connection.source_id,
        connection.target_id,
        connection.relationship_type || 'related',
        connection.created_at,
      ]
    )
  }

  await runOn(database, 'PRAGMA foreign_keys = ON')
}

function buildCreateItemsSql() {
  // Note: focus_area and promotion_target are NOT enforced via CHECK constraints.
  // Their allowed values are config-driven (command-space.config.ts) and validated
  // in application code so that changing config doesn't require a schema migration.
  const defaultFocus = getDefaultFocusAreaId()
  return `
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('ideas', 'conversations', 'research', 'bookmarks', 'decisions')),
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'raw' CHECK(status IN ('raw', 'clustered', 'candidate', 'promoted', 'reference', 'archived')),
      summary TEXT,
      reviewed_at DATETIME,
      agent_confidence REAL,
      disposition TEXT CHECK(disposition IN ('keep_incubating', 'connect_cluster', 'promote', 'reference', 'archive', 'merge_duplicate')),
      duplicate_of INTEGER,
      cluster_key TEXT,
      promotion_target TEXT,
      needs_review INTEGER NOT NULL DEFAULT 0,
      attention_reason TEXT,
      focus_area TEXT NOT NULL DEFAULT '${defaultFocus.replace(/'/g, "''")}',
      focus_score INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (duplicate_of) REFERENCES items(id) ON DELETE SET NULL
    )
  `
}

function buildCreateConnectionsSql() {
  return `
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      relationship_type TEXT DEFAULT 'related',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    )
  `
}

async function ensureIndexes() {
  const database = await getDb()
  const run = promisify(database.run.bind(database))
  await run(`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_reviewed ON items(reviewed_at)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_needs_review ON items(needs_review)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_cluster_key ON items(cluster_key)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_focus_area ON items(focus_area)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_items_focus_score ON items(focus_score)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target_id)`)
}

async function insertMigratedItem(database: sqlite3.Database, row: any) {
  const mapped = mapLegacyRow(row)
  await runOn(
    database,
    `INSERT INTO items (
      id, title, content, category, tags, status, summary, reviewed_at,
      agent_confidence, disposition, duplicate_of, cluster_key, promotion_target,
      needs_review, attention_reason, focus_area, focus_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mapped.id,
      mapped.title,
      mapped.content,
      mapped.category,
      JSON.stringify(mapped.tags),
      mapped.status,
      mapped.summary || null,
      mapped.reviewed_at || null,
      mapped.agent_confidence ?? null,
      mapped.disposition || null,
      mapped.duplicate_of ?? null,
      mapped.cluster_key || null,
      mapped.promotion_target || null,
      mapped.needs_review ? 1 : 0,
      mapped.attention_reason || null,
      mapped.focus_area,
      mapped.focus_score,
      mapped.created_at,
      mapped.updated_at,
    ]
  )
}

function mapLegacyRow(row: any): Item {
  const tags = JSON.parse(row.tags || '[]')
  const focusArea = row.focus_area || inferFocusArea(row.title, row.content, tags)
  let status: ItemStatus = 'raw'
  let disposition: ItemDisposition | null = row.disposition || null
  let reviewedAt: string | null = row.reviewed_at || null
  let needsReview = row.needs_review != null ? Boolean(row.needs_review) : false

  switch (row.status) {
    case 'candidate':
      status = 'candidate'
      disposition = row.disposition || 'keep_incubating'
      reviewedAt = row.reviewed_at || row.updated_at || row.created_at || null
      needsReview = row.needs_review != null ? Boolean(row.needs_review) : true
      break
    case 'clustered':
      status = 'clustered'
      disposition = row.disposition || 'connect_cluster'
      reviewedAt = row.reviewed_at || row.updated_at || row.created_at || null
      break
    case 'reference':
      status = 'reference'
      disposition = row.disposition || 'reference'
      reviewedAt = row.reviewed_at || row.updated_at || row.created_at || null
      break
    case 'promoted':
      status = 'promoted'
      disposition = row.disposition || 'promote'
      reviewedAt = row.reviewed_at || row.updated_at || row.created_at || null
      break
    case 'processing':
      status = 'clustered'
      disposition = 'connect_cluster'
      reviewedAt = row.updated_at || row.created_at || null
      break
    case 'connected':
      status = 'clustered'
      disposition = 'connect_cluster'
      reviewedAt = row.updated_at || row.created_at || null
      break
    case 'archived':
      status = 'archived'
      disposition = 'archive'
      reviewedAt = row.updated_at || row.created_at || null
      break
    case 'inbox':
    default:
      status = 'raw'
      needsReview = true
      break
  }

  const ageDays = ageInDays(row.created_at)
  if (status === 'raw' && ageDays >= 7) {
    needsReview = true
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags,
    status,
    summary: row.summary || null,
    reviewed_at: reviewedAt,
    agent_confidence: row.agent_confidence ?? null,
    disposition,
    duplicate_of: row.duplicate_of ?? null,
    cluster_key: row.cluster_key || null,
    promotion_target: row.promotion_target || null,
    needs_review: needsReview,
    attention_reason: row.attention_reason || (needsReview ? 'Legacy inbox item needs agent classification' : null),
    focus_area: focusArea,
    focus_score: row.focus_score ?? inferFocusScore(focusArea),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Assign a focus area to an item based on its title, content, and tags.
 *
 * Default strategy: if any of the item's tags matches a configured focus area
 * id (case-insensitive), use that lane. Otherwise fall back to the first
 * declared lane. Users who want smarter classification should let their agent
 * set `focus_area` explicitly via the API rather than rely on this inference.
 */
export function inferFocusArea(_title: string, _content: string, tags: string[] = []): FocusArea {
  const lowerTags = tags.map((tag) => tag.toLowerCase())
  for (const area of config.focusAreas) {
    if (lowerTags.includes(area.id.toLowerCase())) {
      return area.id
    }
  }
  return getDefaultFocusAreaId()
}

export function inferFocusScore(focusArea: FocusArea): number {
  return getFocusAreaPriority(focusArea)
}

export { isValidFocusArea }

function ageInDays(value?: string | null) {
  if (!value) return 0
  const created = new Date(value)
  return Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
}

async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const database = await getDb()
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err: Error | null, rows: any[]) => {
      if (err) return reject(err)
      resolve((rows || []) as T[])
    })
  })
}

async function queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
  const database = await getDb()
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err: Error | null, row: any) => {
      if (err) return reject(err)
      resolve((row as T) || null)
    })
  })
}

async function run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
  const database = await getDb()
  return new Promise((resolve, reject) => {
    database.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) return reject(err)
      resolve(this)
    })
  })
}

export async function createItem(item: CreateItemInput): Promise<Item> {
  const focusArea = item.focus_area || inferFocusArea(item.title, item.content, item.tags)
  const focusScore = item.focus_score ?? inferFocusScore(focusArea)
  const result = await run(
    `INSERT INTO items (
      title, content, category, tags, status, summary, reviewed_at, agent_confidence,
      disposition, duplicate_of, cluster_key, promotion_target, needs_review, attention_reason, focus_area, focus_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.title,
      item.content,
      item.category,
      JSON.stringify(item.tags),
      item.status,
      item.summary || null,
      item.reviewed_at || null,
      item.agent_confidence ?? null,
      item.disposition || null,
      item.duplicate_of ?? null,
      item.cluster_key || null,
      item.promotion_target || null,
      item.needs_review ? 1 : 0,
      item.attention_reason || null,
      focusArea,
      focusScore,
    ]
  )

  return (await getItemById(result.lastID!))!
}

export async function getItemById(id: number): Promise<Item | null> {
  const row = await queryOne<any>('SELECT * FROM items WHERE id = ?', [id])
  if (!row) return null
  return parseItem(row)
}

export async function getAllItems(): Promise<Item[]> {
  const rows = await query<any>(
    `SELECT * FROM items
     ORDER BY
       CASE status
         WHEN 'candidate' THEN 1
         WHEN 'raw' THEN 2
         WHEN 'clustered' THEN 3
         WHEN 'promoted' THEN 4
         WHEN 'reference' THEN 5
         ELSE 6
       END,
       focus_score DESC,
       datetime(updated_at) DESC`
  )
  return rows.map(parseItem)
}

export async function getItemsByStatus(status: ItemStatus): Promise<Item[]> {
  const rows = await query<any>(
    'SELECT * FROM items WHERE status = ? ORDER BY datetime(updated_at) DESC',
    [status]
  )
  return rows.map(parseItem)
}

export async function getItemsByCategory(category: ItemCategory): Promise<Item[]> {
  const rows = await query<any>(
    'SELECT * FROM items WHERE category = ? ORDER BY datetime(updated_at) DESC',
    [category]
  )
  return rows.map(parseItem)
}

export async function searchItems(searchQuery: string): Promise<Item[]> {
  const searchPattern = `%${searchQuery}%`
  const rows = await query<any>(
    `SELECT * FROM items
     WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? OR cluster_key LIKE ? OR attention_reason LIKE ?
     ORDER BY focus_score DESC, datetime(updated_at) DESC`,
    [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
  )
  return rows.map(parseItem)
}

export async function updateItem(id: number, updates: Partial<Item>): Promise<Item | null> {
  const fields: string[] = []
  const values: any[] = []
  let computedFocusArea = updates.focus_area
  let computedFocusScore = updates.focus_score

  if (computedFocusArea === undefined && (updates.title !== undefined || updates.content !== undefined || updates.tags !== undefined)) {
    const existing = await getItemById(id)
    if (existing) {
      computedFocusArea = inferFocusArea(
        updates.title ?? existing.title,
        updates.content ?? existing.content,
        updates.tags ?? existing.tags
      )
      if (computedFocusScore === undefined) {
        computedFocusScore = inferFocusScore(computedFocusArea)
      }
    }
  }

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title)
  }
  if (updates.content !== undefined) {
    fields.push('content = ?')
    values.push(updates.content)
  }
  if (updates.category !== undefined) {
    fields.push('category = ?')
    values.push(updates.category)
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?')
    values.push(JSON.stringify(updates.tags))
  }
  if (updates.status !== undefined) {
    fields.push('status = ?')
    values.push(updates.status)
  }
  if (updates.summary !== undefined) {
    fields.push('summary = ?')
    values.push(updates.summary)
  }
  if (updates.reviewed_at !== undefined) {
    fields.push('reviewed_at = ?')
    values.push(updates.reviewed_at)
  }
  if (updates.agent_confidence !== undefined) {
    fields.push('agent_confidence = ?')
    values.push(updates.agent_confidence)
  }
  if (updates.disposition !== undefined) {
    fields.push('disposition = ?')
    values.push(updates.disposition)
  }
  if (updates.duplicate_of !== undefined) {
    fields.push('duplicate_of = ?')
    values.push(updates.duplicate_of)
  }
  if (updates.cluster_key !== undefined) {
    fields.push('cluster_key = ?')
    values.push(updates.cluster_key)
  }
  if (updates.promotion_target !== undefined) {
    fields.push('promotion_target = ?')
    values.push(updates.promotion_target)
  }
  if (updates.needs_review !== undefined) {
    fields.push('needs_review = ?')
    values.push(updates.needs_review ? 1 : 0)
  }
  if (updates.attention_reason !== undefined) {
    fields.push('attention_reason = ?')
    values.push(updates.attention_reason)
  }
  if (computedFocusArea !== undefined) {
    fields.push('focus_area = ?')
    values.push(computedFocusArea)
  }
  if (computedFocusScore !== undefined) {
    fields.push('focus_score = ?')
    values.push(computedFocusScore)
  }

  if (fields.length === 0) {
    return getItemById(id)
  }

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  await run(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values)
  return getItemById(id)
}

export async function deleteItem(id: number): Promise<boolean> {
  const result = await run('DELETE FROM items WHERE id = ?', [id])
  return result.changes > 0
}

export async function createConnection(connection: Omit<Connection, 'id' | 'created_at'>): Promise<Connection> {
  const result = await run(
    `INSERT INTO connections (source_id, target_id, relationship_type)
     VALUES (?, ?, ?)`,
    [connection.source_id, connection.target_id, connection.relationship_type]
  )

  return (await getConnectionById(result.lastID!))!
}

export async function getConnectionById(id: number): Promise<Connection | null> {
  const row = await queryOne<any>('SELECT * FROM connections WHERE id = ?', [id])
  if (!row) return null
  return parseConnection(row)
}

export async function getAllConnections(): Promise<Connection[]> {
  const rows = await query<any>('SELECT * FROM connections ORDER BY created_at DESC')
  return rows.map(parseConnection)
}

export async function getConnectionsForItem(itemId: number): Promise<Connection[]> {
  const rows = await query<any>(
    `SELECT * FROM connections
     WHERE source_id = ? OR target_id = ?
     ORDER BY created_at DESC`,
    [itemId, itemId]
  )
  return rows.map(parseConnection)
}

export async function deleteConnection(id: number): Promise<boolean> {
  const result = await run('DELETE FROM connections WHERE id = ?', [id])
  return result.changes > 0
}

export async function deleteConnectionBetween(sourceId: number, targetId: number): Promise<boolean> {
  const result = await run(
    `DELETE FROM connections
     WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)`,
    [sourceId, targetId, targetId, sourceId]
  )
  return result.changes > 0
}

function parseItem(row: any): Item {
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    needs_review: Boolean(row.needs_review),
    focus_area: row.focus_area || inferFocusArea(row.title, row.content, JSON.parse(row.tags || '[]')),
    focus_score: typeof row.focus_score === 'number' ? row.focus_score : inferFocusScore(row.focus_area || inferFocusArea(row.title, row.content, JSON.parse(row.tags || '[]'))),
  }
}

function parseConnection(row: any): Connection {
  return { ...row }
}

export async function getStaleItems(): Promise<Item[]> {
  const rows = await query<any>(
    `SELECT * FROM items
     WHERE status != 'archived'
       AND status != 'promoted'
       AND datetime(updated_at) < datetime('now', '-7 days')
     ORDER BY datetime(updated_at) ASC`
  )
  return rows.map(parseItem)
}

export async function getRecentItems(): Promise<Item[]> {
  const rows = await query<any>(
    `SELECT * FROM items
     WHERE datetime(created_at) > datetime('now', '-1 day')
     ORDER BY datetime(created_at) DESC`
  )
  return rows.map(parseItem)
}

export async function getItemsNeedingAttention(): Promise<Item[]> {
  const rows = await query<any>(
    `SELECT * FROM items
     WHERE needs_review = 1
        OR status = 'candidate'
        OR (status = 'raw' AND datetime(created_at) < datetime('now', '-2 days'))
        OR (status = 'clustered' AND datetime(updated_at) < datetime('now', '-7 days'))
     ORDER BY
       focus_score DESC,
       CASE
         WHEN needs_review = 1 THEN 1
         WHEN status = 'candidate' THEN 2
         WHEN status = 'raw' THEN 3
         ELSE 4
       END,
       datetime(updated_at) ASC`
  )
  return rows.map(parseItem)
}

export async function getConnectionCount(itemId: number): Promise<number> {
  const row = await queryOne<any>(
    `SELECT COUNT(*) as count FROM connections
     WHERE source_id = ? OR target_id = ?`,
    [itemId, itemId]
  )
  return row?.count || 0
}

export interface WorkspaceStats {
  total: number
  raw: number
  clustered: number
  candidate: number
  promoted: number
  reference: number
  archived: number
  needs_review: number
  /** Count of items per configured focus area id. */
  focus: Record<string, number>
}

export async function getWorkspaceStats(): Promise<WorkspaceStats> {
  const rows = await query<any>(`SELECT status, COUNT(*) as count FROM items GROUP BY status`)
  const needsReview = await queryOne<any>(`SELECT COUNT(*) as count FROM items WHERE needs_review = 1`)
  const focusRows = await query<any>(`SELECT focus_area, COUNT(*) as count FROM items GROUP BY focus_area`)
  const focus: Record<string, number> = {}
  for (const area of config.focusAreas) {
    focus[area.id] = 0
  }
  for (const row of focusRows) {
    if (row.focus_area) {
      focus[row.focus_area] = (focus[row.focus_area] || 0) + row.count
    }
  }
  const counts: WorkspaceStats = {
    total: 0,
    raw: 0,
    clustered: 0,
    candidate: 0,
    promoted: 0,
    reference: 0,
    archived: 0,
    needs_review: needsReview?.count || 0,
    focus,
  }
  for (const row of rows) {
    counts.total += row.count
    if (row.status in counts) {
      ;(counts as any)[row.status] = row.count
    }
  }
  return counts
}

export async function getDuplicateTitleGroups(limit = 15): Promise<Array<{ title_key: string; copies: number; item_ids: number[] }>> {
  const rows = await query<any>(
    `
      SELECT lower(title) as title_key,
             COUNT(*) as copies,
             json_group_array(id) as item_ids_json
      FROM items
      WHERE status IN ('raw', 'candidate', 'clustered')
      GROUP BY lower(title)
      HAVING copies > 1
      ORDER BY copies DESC, title_key ASC
      LIMIT ?
    `,
    [limit]
  )
  return rows.map((row) => ({
    title_key: row.title_key,
    copies: row.copies,
    item_ids: JSON.parse(row.item_ids_json || '[]'),
  }))
}

export async function getOldestOpenItems(limit = 15): Promise<Item[]> {
  const rows = await query<any>(
    `
      SELECT *
      FROM items
      WHERE status != 'archived'
      ORDER BY datetime(created_at) ASC
      LIMIT ?
    `,
    [limit]
  )
  return rows.map(parseItem)
}

export async function getLowConnectionBacklog(limit = 12): Promise<Array<Item & { connection_count: number }>> {
  const rows = await query<any>(
    `
      SELECT i.*, COUNT(c.id) as connection_count
      FROM items i
      LEFT JOIN connections c
        ON c.source_id = i.id OR c.target_id = i.id
      WHERE i.status IN ('raw', 'candidate', 'clustered')
      GROUP BY i.id
      HAVING datetime(i.created_at) < datetime('now', '-7 days')
         AND connection_count = 0
      ORDER BY datetime(i.created_at) ASC
      LIMIT ?
    `,
    [limit]
  )
  return rows.map((row) => ({ ...parseItem(row), connection_count: row.connection_count }))
}
