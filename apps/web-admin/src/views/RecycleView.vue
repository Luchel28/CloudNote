<template>
  <section class="panel admin-panel admin-section" data-section-panel="recycle">
    <div class="section-head">
      <div>
        <p class="eyebrow">RECYCLE BIN</p>
        <h1>回收站</h1>
        <p class="intro">已删除的任务、提交记录、文件和模板统一存放在这里，支持恢复或彻底删除。</p>
      </div>
      <button id="emptyRecycleButton" class="danger-outline-button" @click="emptyAll">清空回收站</button>
    </div>
    <div class="notice-bar">回收站中的内容将在 7 天后自动清理。恢复后将重新出现在对应页面。</div>
    <div id="recycleSummary" class="stats-grid recycle-stats">
      <div class="stat-card"><span>已删除任务</span><strong>{{ summary.deletedTasks || 0 }}</strong><small>可恢复到任务列表</small></div>
      <div class="stat-card"><span>已删除提交</span><strong>{{ summary.deletedSubmissions || 0 }}</strong><small>可恢复提交记录及文件</small></div>
      <div class="stat-card"><span>已删除文件</span><strong>{{ summary.deletedFiles || 0 }}</strong><small>可按单文件处理</small></div>
      <div class="stat-card"><span>已删除模板</span><strong>{{ summary.deletedTemplates || 0 }}</strong><small>可恢复到模板中心</small></div>
      <div class="stat-card"><span>待自动清理</span><strong>{{ summary.pendingCleanup || 0 }}</strong><small>{{ summary.retentionDays || 7 }} 天保留期</small></div>
      <div class="stat-card"><span>可释放空间</span><strong>{{ formatSize(summary.releasableBytes || 0) }}</strong><small>彻底删除后释放</small></div>
    </div>
    <div class="filter-card recycle-filter">
      <div class="segmented-control" role="tablist">
        <button :class="{ 'is-active': typeFilter === 'all' }" @click="switchType('all')">全部</button>
        <button :class="{ 'is-active': typeFilter === 'task' }" @click="switchType('task')">任务</button>
        <button :class="{ 'is-active': typeFilter === 'submission' }" @click="switchType('submission')">提交记录</button>
        <button :class="{ 'is-active': typeFilter === 'file' }" @click="switchType('file')">文件</button>
        <button :class="{ 'is-active': typeFilter === 'template' }" @click="switchType('template')">模板</button>
      </div>
      <label class="search-field"><span>搜索</span><input v-model="search" type="search" placeholder="搜索名称、原位置、文件名" @input="onSearch" /></label>
      <label><span>排序</span><select v-model="sort" @change="load"><option value="recent">最近删除</option><option value="oldest">最早删除</option><option value="name">名称 A-Z</option></select></label>
    </div>
    <div class="table-wrap recycle-table-wrap">
      <table>
        <thead><tr><th><input type="checkbox" :checked="allSelected" aria-label="全选" @change="toggleAll(($event.target as HTMLInputElement).checked)" /></th><th>类型</th><th>名称</th><th>原位置</th><th>删除时间</th><th>剩余保留</th><th>大小</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="empty-cell">正在加载...</td></tr>
          <tr v-else-if="loadError"><td colspan="8" class="empty-cell">加载回收站失败</td></tr>
          <tr v-else-if="!items.length"><td colspan="8" class="empty-cell">回收站是空的</td></tr>
          <tr v-for="item in items" :key="item.type + ':' + item.id">
            <td><input type="checkbox" :checked="selectedKeys.includes(recycleKey(item))" @change="toggleOne(item, ($event.target as HTMLInputElement).checked)" /></td>
            <td><span :class="['type-pill', 'type-' + item.type]">{{ typeLabel(item.type) }}</span></td>
            <td>
              <strong>{{ item.name }}</strong>
              <small v-if="item.submitter">{{ item.submitter }}</small>
              <small v-if="item.type === 'submission'">共 {{ Number(item.fileCount || 0) }} 个文件</small>
              <small v-if="item.restoreDisabledReason" class="recycle-warning">{{ item.restoreDisabledReason }}</small>
            </td>
            <td>{{ item.origin || '-' }}</td>
            <td>{{ formatDateTime(item.deletedAt) }}</td>
            <td>{{ item.remainingDays }} 天</td>
            <td>{{ item.size ? formatSize(item.size) : '-' }}</td>
            <td>
              <div class="table-actions">
                <button class="secondary-button compact-button" type="button" :disabled="item.recoverable === false" :title="item.restoreDisabledReason || ''" @click="restoreOne(item)">恢复</button>
                <button class="danger-outline-button compact-button" type="button" @click="purgeOne(item)">彻底删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="bulk-action-bar">
      <span id="recycleSelectedCount">已选择 {{ selectedKeys.length }} 项</span>
      <button class="secondary-button compact-button" :disabled="!selectedKeys.length" @click="batchRestore">批量恢复</button>
      <button class="danger-outline-button compact-button" :disabled="!selectedKeys.length" @click="batchPurge">批量彻底删除</button>
    </div>
    <p v-if="message" class="message" :class="{ 'is-success': messageKind === 'success', 'is-error': messageKind === 'error' }" role="status">{{ message }}</p>
    <div class="pagination" v-if="totalPages > 1">
      <button class="pagination-arrow" :disabled="page <= 1" @click="page--; load()">上一页</button>
      <button v-for="p in visiblePages" :key="p" :class="['pagination-page', { 'is-active': p === page }]" @click="page = p; load()">{{ p }}</button>
      <button class="pagination-arrow" :disabled="page >= totalPages" @click="page++; load()">下一页</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'
import { confirmAction, showToast } from '../utils/feedback'

interface RecycleItem {
  id: number | string
  type: string
  name: string
  title?: string
  origin?: string
  source?: string
  deletedAt: string
  remainingDays: number
  size?: number
  recoverable?: boolean
  restoreDisabledReason?: string
  submitter?: string
  fileCount?: number
}

const items = ref<RecycleItem[]>([])
const loading = ref(true)
const loadError = ref('')
const page = ref(1)
const perPage = ref(20)
const total = ref(0)
const totalPages = ref(1)
const search = ref('')
const sort = ref('recent')
const typeFilter = ref('all')
const selectedKeys = ref<string[]>([])
const summary = ref<Record<string, number>>({})
const message = ref('')
const messageKind = ref<'success' | 'error' | ''>('')
let timer: ReturnType<typeof setTimeout> | null = null

const visiblePages = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, page.value - 2)
  const end = Math.min(totalPages.value, start + 4)
  for (let current = start; current <= end; current += 1) pages.push(current)
  return pages
})
const allSelected = computed(() => items.value.length > 0 && items.value.every((item) => selectedKeys.value.includes(recycleKey(item))))

function setMessage(text = '', kind: 'success' | 'error' | '' = ''): void {
  message.value = text
  messageKind.value = kind
}

function recycleKey(item: RecycleItem): string {
  return `${item.type}:${item.id}`
}

function typeLabel(type: string): string {
  return { task: '任务', submission: '提交', file: '文件', template: '模板' }[type] || type
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), perPage: String(perPage.value), sort: sort.value, type: typeFilter.value })
    if (search.value) params.set('search', search.value)
    const result = await api.get<{ items: RecycleItem[]; total: number; totalPages: number; summary: Record<string, number> }>('/admin/recycle?' + params)
    items.value = result.items || []
    total.value = result.total || 0
    totalPages.value = result.totalPages || 1
    summary.value = result.summary || {}
    selectedKeys.value = []
    if (messageKind.value !== 'success') setMessage('', '')
  } catch (error) {
    items.value = []
    total.value = 0
    totalPages.value = 1
    loadError.value = (error as Error).message || '加载回收站失败'
    setMessage(loadError.value, 'error')
  } finally {
    loading.value = false
  }
}

function switchType(type: string): void {
  typeFilter.value = type
  page.value = 1
  selectedKeys.value = []
  void load()
}

function onSearch(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    selectedKeys.value = []
    void load()
  }, 300)
}

function toggleAll(checked: boolean): void {
  selectedKeys.value = checked ? items.value.map((item) => recycleKey(item)) : []
}

function toggleOne(item: RecycleItem, checked: boolean): void {
  const key = recycleKey(item)
  selectedKeys.value = checked ? [...new Set([...selectedKeys.value, key])] : selectedKeys.value.filter((value) => value !== key)
}

function selectedItems(): RecycleItem[] {
  const keySet = new Set(selectedKeys.value)
  return items.value.filter((item) => keySet.has(recycleKey(item)))
}

function toPayload(item: RecycleItem): { type: string; id: number | string } {
  return { type: item.type, id: item.type === 'template' ? String(item.id) : Number(item.id) }
}

async function restoreOne(item: RecycleItem): Promise<void> {
  if (item.recoverable === false) {
    setMessage(item.restoreDisabledReason || '该内容暂不能恢复', 'error')
    return
  }
  const confirmed = await confirmAction({
    title: '恢复内容',
    message: '确定恢复所选内容吗？恢复后会回到对应页面。',
    confirmText: '恢复',
    variant: 'success',
  })
  if (!confirmed) return
  try {
    const result = await api.post<{ restored: number }>('/admin/recycle/restore', { items: [toPayload(item)] })
    const text = result.restored ? '已恢复' : '恢复完成'
    setMessage(text, 'success')
    showToast(text, 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '恢复失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function purgeOne(item: RecycleItem): Promise<void> {
  const confirmed = await confirmAction({
    title: '彻底删除',
    message: '彻底删除后无法恢复，确定继续？',
    confirmText: '彻底删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    const result = await api.post<{ purged: number }>('/admin/recycle/purge', { items: [toPayload(item)] })
    const text = result.purged ? '已彻底删除' : '彻底删除完成'
    setMessage(text, 'success')
    showToast(text, 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '彻底删除失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function batchRestore(): Promise<void> {
  const rows = selectedItems()
  if (!rows.length) {
    setMessage('请先选择内容', 'error')
    return
  }
  const blocked = rows.find((item) => item.recoverable === false)
  if (blocked) {
    setMessage(blocked.restoreDisabledReason || '所选内容中包含不可恢复项', 'error')
    return
  }
  const confirmed = await confirmAction({
    title: '批量恢复',
    message: `确定恢复所选 ${rows.length} 项内容吗？`,
    confirmText: '恢复',
    variant: 'success',
  })
  if (!confirmed) return
  try {
    const result = await api.post<{ restored: number }>('/admin/recycle/restore', { items: rows.map(toPayload) })
    const text = result.restored ? `已恢复 ${result.restored} 项` : '已恢复'
    setMessage(text, 'success')
    showToast(text, 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '批量恢复失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function batchPurge(): Promise<void> {
  const rows = selectedItems()
  if (!rows.length) {
    setMessage('请先选择内容', 'error')
    return
  }
  const confirmed = await confirmAction({
    title: '批量彻底删除',
    message: '彻底删除所选内容后无法恢复，确定继续？',
    confirmText: '彻底删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    const result = await api.post<{ purged: number }>('/admin/recycle/purge', { items: rows.map(toPayload) })
    const text = result.purged ? `已彻底删除 ${result.purged} 项` : '已彻底删除'
    setMessage(text, 'success')
    showToast(text, 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '批量彻底删除失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function emptyAll(): Promise<void> {
  const confirmed = await confirmAction({
    title: '清空回收站',
    message: '确定清空回收站？这一步无法撤销。',
    confirmText: '清空',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    await api.del('/admin/recycle')
    setMessage('回收站已清空', 'success')
    showToast('回收站已清空', 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '清空回收站失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

onMounted(() => {
  void load()
})
</script>
