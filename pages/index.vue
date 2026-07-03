<script setup lang="ts">
import { diffWords, type Change } from 'diff'

type VariantId = string | number

interface ResumeVariant {
  id: VariantId
  name: string
  content: string
}

const selectedVariantId = ref<VariantId | null>(null)
const editedContent = ref('')
const originalContent = ref('')
const saveError = ref('')
const saveSuccess = ref('')

const { data, pending, error } = await useFetch<ResumeVariant[]>('/api/resumes', {
  default: () => []
})

const variants = ref<ResumeVariant[]>([])

watch(
  data,
  (value) => {
    variants.value = value ?? []

    if (!selectedVariantId.value && variants.value.length > 0) {
      const first = variants.value[0]
      selectedVariantId.value = first.id
      editedContent.value = first.content
      originalContent.value = first.content
    }
  },
  { immediate: true }
)

const textDiffs = computed<Change[]>(() => diffWords(originalContent.value, editedContent.value))

const activeVariant = computed(() => variants.value.find((variant) => variant.id === selectedVariantId.value) ?? null)

const selectVariant = (id: VariantId) => {
  const selected = variants.value.find((variant) => variant.id === id)
  if (!selected) {
    return
  }

  selectedVariantId.value = selected.id
  editedContent.value = selected.content
  originalContent.value = selected.content
  saveError.value = ''
  saveSuccess.value = ''
}

const createVariant = async () => {
  saveError.value = ''
  saveSuccess.value = ''

  try {
    const created = await $fetch<ResumeVariant>('/api/resumes', {
      method: 'POST',
      body: {
        name: `New Variant ${variants.value.length + 1}`,
        content: ''
      }
    })

    variants.value.push(created)
    selectVariant(created.id)
  } catch {
    saveError.value = 'Failed to create a new variant. Please try again.'
  }
}

const saveChanges = async () => {
  saveError.value = ''
  saveSuccess.value = ''

  if (!selectedVariantId.value) {
    saveError.value = 'Please select a resume variant first.'
    return
  }

  try {
    await $fetch('/api/resumes', {
      method: 'POST',
      body: {
        id: selectedVariantId.value,
        content: editedContent.value
      }
    })

    const selected = variants.value.find((variant) => variant.id === selectedVariantId.value)
    if (selected) {
      selected.content = editedContent.value
    }

    originalContent.value = editedContent.value
    saveSuccess.value = 'Changes saved successfully.'
  } catch {
    saveError.value = 'Failed to save changes. Please try again.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="mx-auto flex h-[calc(100vh-3rem)] max-w-7xl gap-6">
      <aside class="w-1/4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          class="mb-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          @click="createVariant"
        >
          Create New Variant
        </button>

        <div class="space-y-2 overflow-y-auto">
          <button
            v-for="variant in variants"
            :key="variant.id"
            type="button"
            class="block w-full rounded-md border px-3 py-2 text-left text-sm transition"
            :class="
              variant.id === selectedVariantId
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            "
            @click="selectVariant(variant.id)"
          >
            {{ variant.name }}
          </button>
        </div>
      </aside>

      <main class="flex w-3/4 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <section class="rounded-lg border border-slate-200 p-4">
          <textarea
            v-model="editedContent"
            class="h-64 w-full rounded-md border border-slate-300 p-3 font-mono text-sm text-slate-800 outline-none ring-slate-300 transition focus:ring-2"
            placeholder="Edit your resume variant here..."
          />

          <div class="mt-3 flex items-center gap-3">
            <button
              type="button"
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              :disabled="pending || !activeVariant"
              @click="saveChanges"
            >
              Save Changes
            </button>

            <span v-if="saveSuccess" class="text-sm text-green-700">{{ saveSuccess }}</span>
            <span v-if="saveError" class="text-sm text-red-700">{{ saveError }}</span>
            <span v-if="error" class="text-sm text-red-700">Failed to load resume variants.</span>
          </div>
        </section>

        <section class="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 p-4">
          <h2 class="mb-3 text-sm font-semibold text-slate-800">Live Tracking Panel</h2>
          <div class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-800">
            <span
              v-for="(part, index) in textDiffs"
              :key="`${index}-${part.value}`"
              :class="{
                'bg-green-100 text-green-800 px-1 rounded': part.added,
                'bg-red-100 text-red-800 line-through px-1 rounded': part.removed
              }"
            >{{ part.value }}</span>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
