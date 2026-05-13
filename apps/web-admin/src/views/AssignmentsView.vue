<template>
  <section class="panel admin-panel admin-section task-list-page" data-section-panel="tasks">
    <div class="section-head assignment-page-head">
      <div>
        <p class="eyebrow">ASSIGNMENTS</p>
        <h1>任务列表</h1>
        <p class="intro">管理和跟踪所有任务，查看提交状态与任务状态。</p>
      </div>
      <button class="primary-button create-assignment-button" type="button" @click="$router.push('/create')"><span class="iconfont icon-chuangjianrenwu"></span> 创建新任务</button>
    </div>
    <div class="filter-card assignment-filter-card assignment-toolbar">
      <label class="search-field assignment-search-field"><span class="sr-only">搜索任务</span><input v-model="search" type="search" placeholder="搜索任务名称或链接" @input="onSearch" /></label>
      <div class="inline-controls">
        <label><span>排序</span><select v-model="sort" @change="load"><option value="created-desc">最近创建</option><option value="deadline-asc">截止时间最近</option><option value="submissions-desc">提交数最多</option><option value="title-asc">任务名 A-Z</option></select></label>
      </div>
    </div>
    <div class="assignment-stats-grid">
      <button v-for="card in statCards" :key="card.key" class="assignment-stat-card" :class="['stat-' + card.tone, { 'is-active': filterStatus === card.key }]" type="button" @click="toggleFilter(card.key)">
        <span class="stat-icon"><i :class="'iconfont ' + card.icon"></i></span>
        <span class="stat-copy"><span>{{ card.title }}</span><strong>{{ card.value }}</strong><small>{{ card.desc }}</small></span>
      </button>
    </div>
    <div class="assignment-list">
      <div v-if="loading" class="empty-card loading-card">正在加载任务...</div>
      <div v-else-if="loadError" class="empty-card assignment-empty-state"><strong>加载任务失败</strong><p>{{ loadError }}</p><button class="secondary-button compact-button" type="button" @click="load">重试</button></div>
      <div v-else-if="!items.length && hasFilter" class="empty-card assignment-empty-state"><strong>未找到匹配的任务</strong><p>换个关键词或清空筛选后再试。</p><button class="secondary-button compact-button" type="button" @click="clearFilters">清空筛选</button></div>
      <div v-else-if="!items.length" class="empty-card assignment-empty-state"><strong>暂无任务，点击创建新任务开始收集作业</strong><button class="primary-button compact-button" type="button" @click="$router.push('/create')">创建新任务</button></div>
      <article v-for="item in items" v-else :key="item.id" class="assignment-card" :class="['assignment-card-' + taskStatus(item), 'status-border-' + normalizedStatus(item)]">
        <div class="assignment-card-main">
          <div class="assignment-title-row">
            <span :class="'assignment-status-dot status-dot-' + taskStatus(item)"></span>
            <h3>{{ item.title || '未命名任务' }}</h3>
            <span :class="'status-badge status-' + taskStatus(item)">{{ taskStatusLabel(item) }}</span>
          </div>
          <p class="assignment-description" :class="{ 'is-empty': !item.description }">{{ item.description || '暂无说明' }}</p>
          <div class="assignment-info">
            <span>提交：{{ item.submissionCount || 0 }}</span>
            <span>人数：{{ item.submitterCount || 0 }}</span>
            <span>文件：{{ fileRuleText(item) }}</span>
            <span :title="fileExtensions(item).join(',')">格式：{{ fileExtensions(item).join(',') || '不限' }}</span>
            <span>截止：{{ item.deadline ? formatDateTime(item.deadline) : '无设置' }}</span>
          </div>
          <div class="submit-link assignment-link-box">
            <span>{{ shareUrl(item) }}</span>
            <button class="link-copy-icon" type="button" :disabled="isDeleted(item)" @click="copyLink(item)" aria-label="复制任务链接"><i class="iconfont icon-fuzhi"></i></button>
          </div>
        </div>
        <div class="assignment-actions">
          <span class="assignment-created-time">{{ item.createdAt ? `创建于 ${formatDateTime(item.createdAt)}` : '创建时间未知' }}</span>
          <div class="assignment-action-row">
            <button class="secondary-button compact-button" type="button" :disabled="isDeleted(item)" @click="copyLink(item)"><i class="iconfont icon-fuzhilianjie"></i>复制链接</button>
            <button class="secondary-button compact-button" type="button" :disabled="isDeleted(item)" @click="$router.push('/submissions?assignmentId=' + item.id)"><i class="iconfont icon-fuzhi"></i>查看提交记录</button>
            <button class="secondary-button compact-button" type="button" :disabled="isDeleted(item)" @click="$router.push('/create/' + item.id)"><i class="iconfont icon-bianji"></i>编辑</button>
          </div>
          <div class="assignment-action-row">
            <button class="compact-button download-task-button" type="button" :disabled="isDeleted(item)" @click="handleDownload(item)"><i class="iconfont icon-xiazai"></i>下载任务</button>
            <button class="danger-button compact-button" type="button" :disabled="isDeleted(item)" @click="handleDelete(item)"><i class="iconfont icon-shanchu"></i>删除</button>
          </div>
        </div>
      </article>
    </div>
    <div class="assignment-pagination-wrap" v-if="!loading && !loadError && totalPages > 1">
      <div class="pagination">
        <button class="pagination-arrow" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span class="pagination-pages"><button v-for="p in visiblePages" :key="p" class="pagination-page" :class="{ 'is-active': p === page }" @click="page = p; load()">{{ p }}</button></span>
        <button class="pagination-arrow" :disabled="page >= totalPages" @click="page++; load()">下一页</button>
      </div>
      <div class="assignment-page-size"><span class="record-count">共 {{ total }} 条任务</span><label>每页 <select v-model="perPage" @change="load"><option>10</option><option>20</option></select></label></div>
    </div>
    <p v-if="message" class="message" :class="{ 'is-success': messageKind === 'success', 'is-error': messageKind === 'error' }" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'
import { confirmAction, showToast } from '../utils/feedback'

interface A {
  id: number
  title: string
  description: string
  status: string
  effectiveStatus: string
  deadline: string | null
  shareCode: string
  submissionCount: number
  submitterCount: number
  createdAt: string
  allowedExtensions?: string[]
  fileType?: string
  enableLimit?: boolean
  maxFiles?: number
  maxFileSizeMb?: number
}

const FILE_TYPE_EXTENSION_MAP: Record<string, string[]> = {
  any: [],
  word: ['doc', 'docx'],
  pdf: ['pdf'],
  text: ['txt'],
  excel: ['xls', 'xlsx'],
  ppt: ['ppt', 'pptx'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  video: ['mp4', 'mov', 'avi', 'mkv'],
  document: ['doc', 'docx', 'pdf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'],
  archive: ['zip', 'rar', '7z'],
  installer: ['apk', 'exe', 'msi', 'dmg'],
}

const items = ref<A[]>([])
const loading = ref(true)
const loadError = ref('')
const message = ref('')
const messageKind = ref<'success' | 'error' | ''>('')
const page = ref(1)
const perPage = ref(10)
const total = ref(0)
const totalPages = ref(1)
const search = ref('')
const sort = ref('created-desc')
const filterStatus = ref('')
const counts = ref({ ongoing: 0, completed: 0, deleted: 0, all: 0 })
let timer: ReturnType<typeof setTimeout> | null = null

const hasFilter = computed(() => Boolean(filterStatus.value || search.value.trim()))
const visiblePages = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, page.value - 2)
  const end = Math.min(totalPages.value, start + 4)
  for (let value = start; value <= end; value += 1) pages.push(value)
  return pages
})
const statCards = computed(() => [
  { key: '', title: '全部任务', value: counts.value.all, desc: '所有状态的任务', icon: 'icon-zuanshi', tone: 'green' as const },
  { key: 'ongoing', title: '进行中', value: counts.value.ongoing, desc: '正在收集提交中', icon: 'icon-jinhangzhong', tone: 'blue' as const },
  { key: 'completed', title: '已完成', value: counts.value.completed, desc: '已截止的任务', icon: 'icon-yiwancheng', tone: 'purple' as const },
  { key: 'deleted', title: '已删除', value: counts.value.deleted, desc: '已删除的任务', icon: 'icon-yishanchu', tone: 'red' as const },
])

function setMessage(text = '', kind: 'success' | 'error' | '' = ''): void {
  message.value = text
  messageKind.value = kind
}

function normalizedStatus(item: A): string {
  const status = item.effectiveStatus || item.status || 'ongoing'
  if (status === 'completed' || status === 'archived') return 'ended'
  return status
}

function taskStatus(item: A): 'ongoing' | 'completed' | 'deleted' {
  const status = normalizedStatus(item)
  if (status === 'ended' || status === 'expired') return 'completed'
  if (status === 'deleted') return 'deleted'
  return 'ongoing'
}

function taskStatusLabel(item: A): string {
  return { ongoing: '进行中', completed: '已完成', deleted: '已删除' }[taskStatus(item)]
}

function isDeleted(item: A): boolean {
  return taskStatus(item) === 'deleted'
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function shareUrl(item: A): string {
  return `${location.origin}/student?id=${item.id}&code=${encodeURIComponent(item.shareCode)}`
}

function fileExtensions(item: A): string[] {
  if (Array.isArray(item.allowedExtensions) && item.allowedExtensions.length) return item.allowedExtensions
  return FILE_TYPE_EXTENSION_MAP[item.fileType || 'document'] || []
}

function fileRuleText(item: A): string {
  if (item.enableLimit) return `${Math.min(Number(item.maxFiles || 1), 20)} 个 / ${Math.min(Number(item.maxFileSizeMb || 500), 500)}MB`
  return '系统最大 20 个文件 / 单文件 500MB'
}

async function copyLink(item: A): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl(item))
    setMessage('链接已复制', 'success')
    showToast('链接已复制', 'success')
  } catch {
    setMessage('复制失败，请手动复制链接', 'error')
    showToast('复制失败，请手动复制链接', 'error')
  }
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), perPage: String(perPage.value), sort: sort.value })
    if (filterStatus.value) params.set('status', filterStatus.value)
    if (search.value) params.set('search', search.value)
    const response = await api.get<{ items: A[]; total: number; totalPages: number }>('/admin/assignments?' + params)
    items.value = response.items || []
    total.value = response.total || 0
    totalPages.value = response.totalPages || 1
    if (messageKind.value !== 'success') setMessage('', '')
    await loadStats()
  } catch (error) {
    items.value = []
    total.value = 0
    totalPages.value = 1
    loadError.value = (error as Error).message || '接口异常，请稍后重试'
    setMessage(loadError.value, 'error')
  } finally {
    loading.value = false
  }
}

async function loadStats(): Promise<void> {
  try {
    const [all, ongoing, completed, deleted] = await Promise.all([
      api.get<{ total: number }>('/admin/assignments?page=1&perPage=1'),
      api.get<{ total: number }>('/admin/assignments?page=1&perPage=1&status=ongoing'),
      api.get<{ total: number }>('/admin/assignments?page=1&perPage=1&status=completed'),
      api.get<{ total: number }>('/admin/assignments?page=1&perPage=1&status=deleted'),
    ])
    counts.value = {
      all: all.total || 0,
      ongoing: ongoing.total || 0,
      completed: completed.total || 0,
      deleted: deleted.total || 0,
    }
  } catch {}
}

function toggleFilter(key: string): void {
  filterStatus.value = filterStatus.value === key ? '' : key
  page.value = 1
  void load()
}

function clearFilters(): void {
  search.value = ''
  filterStatus.value = ''
  page.value = 1
  void load()
}

function onSearch(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
}

async function handleDelete(item: A): Promise<void> {
  const submissionCount = Number(item.submissionCount || 0)
  const confirmed = await confirmAction({
    title: '删除任务',
    message: submissionCount ? `该任务有 ${submissionCount} 条提交，删除后会移入回收站并同步处理相关文件。继续？` : '确定删除这个任务吗？删除后可在回收站恢复。',
    confirmText: '删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    await api.del('/admin/assignments/' + item.id)
    setMessage('任务已移入回收站', 'success')
    showToast('任务已移入回收站', 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '删除任务失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function handleDownload(item: A): Promise<void> {
  try {
    await api.download('/admin/files/download-all?assignmentId=' + item.id, `cloudnote-${item.title || 'assignment'}.zip`)
  } catch (error) {
    const text = (error as Error).message || '下载任务失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

onMounted(() => {
  void load()
})
</script>
