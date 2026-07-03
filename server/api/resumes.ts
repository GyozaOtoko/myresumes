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

const DEFAULT_USER_EMAIL = 'default.user@myresumes.local'
const DEFAULT_USER_NAME = 'Default User'
const DEFAULT_VARIANT_NAME = 'Baseline Resume'
const DEFAULT_VARIANT_CONTENT = `John Doe\nSenior Full-Stack Developer\n\nSummary\nExperienced engineer with a strong focus on Nuxt and TypeScript applications.\n\nExperience\n- Built scalable web platforms with modern frontend tooling.\n- Collaborated with product and design to deliver user-first features.`

const mapVariant = (variant: any): ResumeVariant => ({
  id: variant.id,
  name: String(variant.name ?? DEFAULT_VARIANT_NAME),
  content: String(variant.content ?? '')
})

const ensureDefaultUserId = async (): Promise<VariantId | undefined> => {
  const userDelegate = (prisma as any).user
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

const findVariants = async (userId?: VariantId) => {
  const resumeVariantDelegate = (prisma as any).resumeVariant
  if (!resumeVariantDelegate?.findMany) {
    throw createError({ statusCode: 500, statusMessage: 'ResumeVariant model is not available.' })
  }

  if (typeof userId === 'undefined') {
    return resumeVariantDelegate.findMany({ orderBy: { createdAt: 'asc' } }).catch(() => resumeVariantDelegate.findMany())
  }

  return resumeVariantDelegate
    .findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    .catch(() => resumeVariantDelegate.findMany({ orderBy: { createdAt: 'asc' } }).catch(() => resumeVariantDelegate.findMany()))
}

const createVariant = async (options: { userId?: VariantId; name: string; content: string }) => {
  const resumeVariantDelegate = (prisma as any).resumeVariant
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

      const resumeVariantDelegate = (prisma as any).resumeVariant
      if (!resumeVariantDelegate) {
        throw createError({ statusCode: 500, statusMessage: 'ResumeVariant model is not available.' })
      }

      if (typeof body.id === 'undefined' || body.id === null || body.id === '') {
        const userId = await ensureDefaultUserId()
        const created = await createVariant({
          userId,
          name: body.name?.trim() || `Variant ${Date.now()}`,
          content: body.content
        })

        return mapVariant(created)
      }

      const updated = await resumeVariantDelegate.update({
        where: { id: body.id },
        data: { content: body.content }
      })

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
