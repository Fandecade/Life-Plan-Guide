import { MIGRATION_BACKUP_DATABASE_NAME } from './constants'

export interface MigrationSnapshot {
  id: string
  createdAt: string
  databaseName: string
  sourceVersion: number
  targetVersion: number
  stores: string[]
  counts: Record<string, number>
  data: Record<string, unknown[]>
}

export interface MigrationBackupResult {
  snapshot: MigrationSnapshot
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB 事务失败'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB 事务已中止'))
  })
}

async function readDatabaseVersion(databaseName: string): Promise<number> {
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases()
    return databases.find((entry) => entry.name === databaseName)?.version ?? 0
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    let created = false
    request.onupgradeneeded = () => {
      created = true
    }
    request.onerror = () => reject(request.error ?? new Error('无法检查本地数据库'))
    request.onsuccess = () => {
      const database = request.result
      const version = database.version
      database.close()
      if (created) {
        const deletion = indexedDB.deleteDatabase(databaseName)
        deletion.onerror = () => reject(deletion.error ?? new Error('无法清理数据库探测'))
        deletion.onsuccess = () => resolve(0)
        return
      }
      resolve(version)
    }
  })
}

interface SourceSnapshot {
  sourceVersion: number
  stores: string[]
  counts: Record<string, number>
  data: Record<string, unknown[]>
}

function logicalDatabaseVersion(physicalVersion: number): number {
  // Dexie stores logical version N as IndexedDB version N * 10.
  return physicalVersion >= 10 && physicalVersion % 10 === 0
    ? physicalVersion / 10
    : physicalVersion
}

async function readSourceDatabase(databaseName: string): Promise<SourceSnapshot | null> {
  const physicalVersion = await readDatabaseVersion(databaseName)
  if (physicalVersion === 0) return null
  const version = logicalDatabaseVersion(physicalVersion)

  const database = await requestToPromise(indexedDB.open(databaseName))
  try {
    const stores = [...database.objectStoreNames]
    if (stores.length === 0) {
      return { sourceVersion: version, stores, counts: {}, data: {} }
    }
    const transaction = database.transaction(stores, 'readonly')
    const requests = stores.map((store) => ({
      store,
      request: transaction.objectStore(store).getAll() as IDBRequest<unknown[]>,
    }))
    const rows = await Promise.all(
      requests.map(async ({ store, request }) => ({
        store,
        rows: await requestToPromise(request),
      })),
    )
    await transactionToPromise(transaction)
    const data: Record<string, unknown[]> = {}
    const counts: Record<string, number> = {}
    for (const row of rows) {
      data[row.store] = row.rows
      counts[row.store] = row.rows.length
    }
    return { sourceVersion: version, stores, counts, data }
  } finally {
    database.close()
  }
}

async function writeSnapshot(snapshot: MigrationSnapshot): Promise<void> {
  const request = indexedDB.open(MIGRATION_BACKUP_DATABASE_NAME, 1)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains('snapshots')) {
      const store = database.createObjectStore('snapshots', { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
      store.createIndex('sourceVersion', 'sourceVersion')
    }
  }
  const database = await requestToPromise(request)
  try {
    const transaction = database.transaction('snapshots', 'readwrite')
    transaction.objectStore('snapshots').put(snapshot)
    await transactionToPromise(transaction)
  } finally {
    database.close()
  }
}

export async function backupBeforeMigration(
  databaseName: string,
  targetVersion: number,
): Promise<MigrationBackupResult | null> {
  const source = await readSourceDatabase(databaseName)
  if (!source) return null
  if (source.sourceVersion > targetVersion) {
    throw new Error(
      `本地数据库版本 v${source.sourceVersion} 高于应用支持的 v${targetVersion}，已中止打开以避免数据损坏`,
    )
  }
  if (source.sourceVersion >= targetVersion) return null

  const createdAt = new Date().toISOString()
  const snapshot: MigrationSnapshot = {
    id: `pre-v${targetVersion}-${createdAt}-${crypto.randomUUID()}`,
    createdAt,
    databaseName,
    sourceVersion: source.sourceVersion,
    targetVersion,
    stores: source.stores,
    counts: source.counts,
    data: source.data,
  }
  await writeSnapshot(snapshot)
  return { snapshot }
}

export async function readLatestMigrationSnapshot(): Promise<MigrationSnapshot | null> {
  const version = await readDatabaseVersion(MIGRATION_BACKUP_DATABASE_NAME)
  if (version === 0) return null
  const database = await requestToPromise(indexedDB.open(MIGRATION_BACKUP_DATABASE_NAME))
  try {
    if (!database.objectStoreNames.contains('snapshots')) return null
    const transaction = database.transaction('snapshots', 'readonly')
    const rows = await requestToPromise(
      transaction.objectStore('snapshots').getAll() as IDBRequest<MigrationSnapshot[]>,
    )
    await transactionToPromise(transaction)
    return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  } finally {
    database.close()
  }
}
