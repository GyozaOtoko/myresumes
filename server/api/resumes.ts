import { createError, getMethod, readBody } from 'h3'
import prisma from '../utils/prisma'

type VariantId = number | string

interface ResumeVariant {
  id: VariantId
  name: string
  content: string
}

interface ResumeBody {
  id?: VariantId
  name?: string
  content?: string
}

interface ResumeVariantDelegate {
  findMany: (args?: Record<string, unknown>) => Promise<any[]>
  create: (args: { data: Record<string, unknown> }) => Promise<any>
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<any>
}

interface UserDelegate {
  upsert: (args: {
    where: Record<string, unknown>
    update: Record<string, unknown>
    create: Record<string, unknown>
  }) => Promise<{ id: VariantId }>
}

const prismaDelegates = prisma as unknown as {
  resumeVariant?: ResumeVariantDelegate
  user?: UserDelegate
}

const DEFAULT_USER_EMAIL = 'default.user@myresumes.local'
const DEFAULT_USER_NAME = 'Default User'
const DEFAULT_VARIANT_NAME = 'Baseline Resume'
const PRISMA_RECORD_NOT_FOUND = 'P2025'
const DEFAULT_VARIANT_CONTENT = `Sample Candidate\nSenior Full-Stack Developer\n\nSummary\nExperienced engineer with a strong focus on Nuxt and TypeScript applications.\n\nExperience\n- Built scalable web platforms with modern frontend tooling.\n- Collaborated with product and design to deliver user-first features.`

const mapVariant = (variant: any): ResumeVariant => ({
  id: variant.id,
  name: String(variant.name ?? DEFAULT_VARIANT_NAME),
  content: String(variant.content ?? '')
})

const ensureDefaultUserId = async (): Promise<VariantId | undefined> => {
  const userDelegate = prismaDelegates.user
  if (!userDelegate?.upsert) {
    return undefined
  }

  try {
    const user = await userDelegate.upsert({
      where: { email: DEFAULT_USER_EMAIL },
      update: {},
      create: {
        email: DEFAULT_USER_EMAIL,
        name: DEFAULT_USER_NAME
      }
    })

    return user?.id
  } catch {
    return undefined
  }
}

const findManyWithFallback = async (
  resumeVariantDelegate: ResumeVariantDelegate,
  attempts: Array<Record<string, unknown> | undefined>
) => {
  let lastError: unknown

  for (const attempt of attempts) {
    try {
      return await resumeVariantDelegate.findMany(attempt)
    } catch (error) {
      lastError = error
      // try the next fallback query
    }
  }

  throw createError({
    statusCode: 500,
    statusMessage: `Failed to fetch resume variants. ${lastError instanceof Error ? lastError.message : ''}`.trim()
  })
}

const findVariants = async (userId?: VariantId) => {
  const resumeVariantDelegate = prismaDelegates.resumeVariant
  if (!resumeVariantDelegate?.findMany) {
    throw createError({ statusCode: 500, statusMessage: 'ResumeVariant model is not available.' })
  }

  if (typeof userId === 'undefined') {
    return findManyWithFallback(resumeVariantDelegate, [{ orderBy: { createdAt: 'asc' } }, undefined])
  }

  return findManyWithFallback(resumeVariantDelegate, [
    { where: { userId }, orderBy: { createdAt: 'asc' } },
    { where: { userId } },
    { orderBy: { createdAt: 'asc' } },
    undefined
  ])
}

const createVariant = async (options: { userId?: VariantId; name: string; content: string }) => {
  const resumeVariantDelegate = prismaDelegates.resumeVariant
  if (!resumeVariantDelegate?.create) {
    throw createError({ statusCode: 500, statusMessage: 'ResumeVariant model is not available.' })
  }

  const createDataWithUser = typeof options.userId === 'undefined'
    ? { name: options.name, content: options.content }
    : { userId: options.userId, name: options.name, content: options.content }

  try {
    return await resumeVariantDelegate.create({ data: createDataWithUser })
  } catch {
    return resumeVariantDelegate.create({
      data: {
        name: options.name,
        content: options.content
      }
    })
  }
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event)

  try {
    if (method === 'GET') {
      const userId = await ensureDefaultUserId()
      const variants = await findVariants(userId)

      if (!Array.isArray(variants) || variants.length === 0) {
        const baseline = await createVariant({
          userId,
          name: DEFAULT_VARIANT_NAME,
          content: DEFAULT_VARIANT_CONTENT
        })

        return [mapVariant(baseline)]
      }

      return variants.map(mapVariant)
    }

    if (method === 'POST') {
      const body = await readBody<ResumeBody>(event)

      if (typeof body.content !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'A string content value is required.' })
      }

      const resumeVariantDelegate = prismaDelegates.resumeVariant
      if (!resumeVariantDelegate) {
        throw createError({ statusCode: 500, statusMessage: 'ResumeVariant model is not available.' })
      }

      if (typeof body.id === 'undefined' || body.id === null || body.id === '') {
        const userId = await ensureDefaultUserId()
        const created = await createVariant({
          userId,
          name: body.name?.trim() || DEFAULT_VARIANT_NAME,
          content: body.content
        })

        return mapVariant(created)
      }

      let updated
      try {
        updated = await resumeVariantDelegate.update({
          where: { id: body.id },
          data: { content: body.content }
        })
      } catch (updateError: any) {
        if (
          updateError?.code === PRISMA_RECORD_NOT_FOUND
          || String(updateError?.message ?? '').toLowerCase().includes('record to update not found')
        ) {
          throw createError({ statusCode: 404, statusMessage: 'Resume variant not found.' })
        }

        throw updateError
      }

      return mapVariant(updated)
    }

    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  } catch (error: any) {
    if (error?.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : 'Failed to process resume request.'
    })
  }
})
