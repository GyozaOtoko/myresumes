import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'

type GlobalForPrisma = typeof globalThis & {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as GlobalForPrisma
const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const DEFAULT_DATABASE_PATH = join(process.cwd(), 'prisma', 'dev.db')
const DEFAULT_DATABASE_URL = pathToFileURL(DEFAULT_DATABASE_PATH).href

const normalizeDatabaseUrl = (value?: string) => {
  if (!value) {
    return DEFAULT_DATABASE_URL
  }

  if (!value.startsWith('file:')) {
    return value
  }

  if (value.startsWith('file:///') || value.startsWith('file://localhost/')) {
    return value
  }

  const filePath = value.slice('file:'.length)
  if (!filePath || filePath.startsWith('//')) {
    return value
  }

  const normalizedPath = filePath.replace(/^\.\//, '')
  const resolvedPath = normalizedPath.startsWith('prisma/')
    ? join(process.cwd(), normalizedPath)
    : join(process.cwd(), 'prisma', normalizedPath)

  return pathToFileURL(resolvedPath).href
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL)

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

let schemaReadyPromise: Promise<void> | null = null

export const ensurePrismaSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const prismaPackageJson = require.resolve('prisma/package.json')
      const prismaCli = join(dirname(prismaPackageJson), 'build', 'index.js')

      await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
        },
        windowsHide: true
      })
    })()
  }

  return schemaReadyPromise
}

export default prisma
