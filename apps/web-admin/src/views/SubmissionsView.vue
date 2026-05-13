<template>
  <section class="panel admin-panel admin-section" data-section-panel="submissions">
    <div class="section-head">
      <div>
        <p class="eyebrow">SUBMISSIONS</p>
        <h1>提交记录管理</h1>
        <p class="intro">查看、筛选和管理学生提交记录，文件下载按单文件直接下载。</p>
      </div>
      <span class="record-count">{{ total }} 条记录</span>
    </div>
    <p class="filter-pill">当前查看：{{ currentFilterLabel }}</p>
    <div class="submission-filter filter-card">
      <label><span>所属任务</span><select v-model="assignmentId" @change="handleFilterChange"><option value="">全部提交</option><option v-for="a in assignments" :key="a.id" :value="String(a.id)">{{ a.title }}</option></select></label>
      <label><span>提交状态</span><select v-model="lateFilter" @change="handleFilterChange"><option value="">全部状态</option><option value="ontime">未过期</option><option value="late">已过期</option></select></label>
      <label><span>开始日期</span><input type="date" v-model="dateFrom" @change="handleFilterChange" /></label>
      <label><span>结束日期</span><input type="date" v-model="dateTo" @change="handleFilterChange" /></label>
      <label><span>排序</span><select v-model="sort" @change="handleFilterChange"><option value="upload-desc">最近上传</option><option value="upload-asc">最早上传</option><option value="name-asc">提交人 A-Z</option><option value="late-desc">过期优先</option></select></label>
      <label><span>搜索</span><input v-model="search" type="search" placeholder="姓名、学号、文件名" @input="onSearch" /></label>
    </div>
    <div class="toolbar">
      <div class="toolbar-actions">
        <button @click="downloadAll">下载当前范围</button>
        <button class="secondary-button" @click="exportCsv">导出提交 CSV</button>
        <button class="secondary-button" @click="refreshPage">刷新</button>
        <button class="secondary-button" @click="clearAssignmentFilter">查看全部</button>
        <button class="danger-button" :disabled="!selectedIds.length" @click="bulkDelete">批量删除</button>
      </div>
    </div>
    <div class="table-wrap submission-table-wrap">
      <table class="submission-data-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>所属任务</th>
            <th>提交人</th>
            <th>上传时间</th>
            <th>原文件名</th>
            <th>文件名</th>
            <th>是否逾期</th>
            <th>操作</th>
            <th>删除</th>
            <th><input type="checkbox" :checked="allSelected" aria-label="全选" @change="toggleAll(($event.target as HTMLInputElement).checked)" /></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="10" class="empty-cell">正在加载...</td></tr>
          <tr v-else-if="loadError"><td colspan="10" class="empty-cell">加载失败</td></tr>
          <tr v-else-if="!items.length"><td colspan="10" class="empty-cell">暂无提交记录</td></tr>
          <tr v-for="(item, index) in items" :key="item.id">
            <td>{{ (page - 1) * perPage + index + 1 }}</td>
            <td class="submission-assignment-cell" :title="item.assignmentTitle || ''">{{ item.assignmentTitle || '未分配任务' }}</td>
            <td>{{ item.studentName || item.submitterData?.studentName || '' }}</td>
            <td>{{ formatDateTime(item.uploadTime) }}</td>
            <td>{{ item.originalFilename || '' }}</td>
            <td>{{ (item.files || []).map((file) => file.originalFilename).join('; ') || item.originalFilename || '' }}</td>
            <td><span :class="item.isLate ? 'status-badge status-expired' : 'status-badge status-ongoing'">{{ item.isLate ? '逾期' : '按时' }}</span></td>
            <td class="submission-actions-cell">
              <div class="submission-file-actions">
                <span v-for="file in displayFiles(item)" :key="file.id || file.originalFilename" class="file-action-chip">
                  <span>{{ file.originalFilename }}</span>
                  <button v-if="file.id" class="icon-mini-button" type="button" @click="downloadFile(file.id, file.originalFilename)">下载</button>
                  <button v-if="file.id" class="icon-mini-button danger-mini" type="button" @click="deleteFile(file.id)">删</button>
                </span>
                <button v-if="(item.files || []).length > 1" class="icon-mini-button" type="button" @click="downloadSubmission(item.id)">整提交下载</button>
              </div>
            </td>
            <td class="submission-delete-cell"><button class="danger-button compact-button" type="button" @click="deleteItem(item.id)">删除记录</button></td>
            <td class="submission-select-cell"><input type="checkbox" :checked="selectedIds.includes(item.id)" :aria-label="`选择提交记录 ${item.id}`" @change="toggleOne(item.id, ($event.target as HTMLInputElement).checked)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="message" :class="{ 'is-success': messageKind === 'success', 'is-error': messageKind === 'error' }" role="status">{{ message }}</p>
    <div class="pagination" v-if="totalPages > 1">
      <button class="pagination-arrow" :disabled="page <= 1" @click="page--; load()">上一页</button>
      <span class="pagination-pages"><button v-for="p in visiblePages" :key="p" :class="['pagination-page', { 'is-active': p === page }]" @click="page = p; load()">{{ p }}</button></span>
      <button class="pagination-arrow" :disabled="page >= totalPages" @click="page++; load()">下一页</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { confirmAction, showToast } from '../utils/feedback'

interface SubmissionFile {
  id: number | null
  originalFilename: string
  storedFilename?: string
  size?: number
}

interface SubmissionItem {
  id: number
  assignmentId: number
  assignmentTitle: string
  studentName: string
  studentId: string
  submitterData?: Record<string, string>
  originalFilename: string
  uploadTime: string
  isLate: boolean
  files: SubmissionFile[]
}

const route = useRoute()
const items = ref<SubmissionItem[]>([])
const assignments = ref<{ id: number; title: string }[]>([])
const loading = ref(true)
const loadError = ref('')
const page = ref(1)
const perPage = ref(20)
const total = ref(0)
const totalPages = ref(1)
const search = ref('')
const sort = ref('upload-desc')
const assignmentId = ref('')
const lateFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const selectedIds = ref<number[]>([])
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
const currentFilterLabel = computed(() => {
  if (!assignmentId.value) return '全部提交'
  const current = assignments.value.find((item) => String(item.id) === String(assignmentId.value))
  return current ? current.title : `任务 #${assignmentId.value}`
})
const allSelected = computed(() => items.value.length > 0 && items.value.every((item) => selectedIds.value.includes(item.id)))

function setMessage(text = '', kind: 'success' | 'error' | '' = ''): void {
  message.value = text
  messageKind.value = kind
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function displayFiles(item: SubmissionItem): SubmissionFile[] {
  return item.files?.length ? item.files : [{ id: null, originalFilename: item.originalFilename || '', storedFilename: '' }]
}

function getExportPayload(): Record<string, string | null> {
  return {
    assignmentId: assignmentId.value || null,
    search: search.value || '',
    status: lateFilter.value || '',
    dateFrom: dateFrom.value || '',
    dateTo: dateTo.value ? `${dateTo.value}T23:59:59` : '',
    sort: sort.value || 'upload-desc',
  }
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), perPage: String(perPage.value), sort: sort.value })
    if (assignmentId.value) params.set('assignmentId', assignmentId.value)
    if (lateFilter.value) params.set('status', lateFilter.value)
    if (dateFrom.value) params.set('dateFrom', dateFrom.value)
    if (dateTo.value) params.set('dateTo', `${dateTo.value}T23:59:59`)
    if (search.value) params.set('search', search.value)
    const result = await api.get<{ items: SubmissionItem[]; total: number; totalPages: number }>('/admin/submissions?' + params)
    items.value = result.items || []
    total.value = result.total || 0
    totalPages.value = result.totalPages || 1
    selectedIds.value = []
    if (messageKind.value !== 'success') setMessage('', '')
  } catch (error) {
    items.value = []
    total.value = 0
    totalPages.value = 1
    loadError.value = (error as Error).message || '加载提交记录失败'
    setMessage(loadError.value, 'error')
  } finally {
    loading.value = false
  }
}

async function loadAssignments(): Promise<void> {
  try {
    const result = await api.get<{ items: { id: number; title: string }[] }>('/admin/assignments?perPage=200')
    assignments.value = (result.items || []).filter((item) => item)
  } catch {}
}

function handleFilterChange(): void {
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

function toggleAll(checked: boolean): void {
  selectedIds.value = checked ? items.value.map((item) => item.id) : []
}

function toggleOne(id: number, checked: boolean): void {
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter((item) => item !== id)
}

function clearAssignmentFilter(): void {
  assignmentId.value = ''
  lateFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  search.value = ''
  page.value = 1
  void load()
}

async function refreshPage(): Promise<void> {
  await loadAssignments()
  await load()
}

async function deleteFile(id: number): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除文件',
    message: '确定删除这个文件？删除后可在回收站恢复。',
    confirmText: '删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    await api.del('/admin/files/' + id)
    setMessage('文件已移入回收站', 'success')
    showToast('文件已移入回收站', 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '删除文件失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function deleteItem(id: number): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除提交记录',
    message: '确定删除这条提交记录和对应文件？删除后可在回收站恢复。',
    confirmText: '删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    await api.del('/admin/submissions/' + id)
    setMessage('提交记录已移入回收站', 'success')
    showToast('提交记录已移入回收站', 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '删除提交记录失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function bulkDelete(): Promise<void> {
  if (!selectedIds.value.length) return
  const confirmed = await confirmAction({
    title: '批量删除',
    message: `确定删除选中的 ${selectedIds.value.length} 条提交记录？文件将被移入回收站。`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    const result = await api.post<{ deleted: number }>('/admin/submissions/bulk-delete', { ids: selectedIds.value })
    setMessage(`已删除 ${result.deleted || selectedIds.value.length} 条记录`, 'success')
    showToast('批量删除成功', 'success')
    await load()
  } catch (error) {
    const text = (error as Error).message || '批量删除失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function downloadFile(id: number, name: string): Promise<void> {
  try {
    await api.download('/admin/files/' + id + '/download', name || 'cloudnote-file')
  } catch (error) {
    const text = (error as Error).message || '下载文件失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function downloadSubmission(id: number): Promise<void> {
  try {
    await api.download('/admin/submissions/' + id + '/download', `submission-${id}.zip`)
  } catch (error) {
    const text = (error as Error).message || '下载提交压缩包失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function downloadAll(): Promise<void> {
  try {
    const query = assignmentId.value ? `?assignmentId=${assignmentId.value}` : ''
    await api.download('/admin/files/download-all' + query, 'cloudnote-submissions.zip')
  } catch (error) {
    const text = (error as Error).message || '下载当前范围失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

async function exportCsv(): Promise<void> {
  try {
    await api.download('/admin/submissions/export', 'cloudnote-submissions.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getExportPayload()),
    })
  } catch (error) {
    const text = (error as Error).message || '导出提交 CSV 失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

onMounted(async () => {
  const initialAssignmentId = String(route.query.assignmentId || '')
  if (initialAssignmentId) assignmentId.value = initialAssignmentId
  await loadAssignments()
  await load()
})
</script>
