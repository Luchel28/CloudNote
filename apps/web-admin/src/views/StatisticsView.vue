<template>
  <section class="panel admin-panel admin-section" data-section-panel="stats">
    <div class="section-head">
      <div>
        <p class="eyebrow">REPORTS</p>
        <h1>统计报告</h1>
        <p class="intro">查看任务提交情况、逾期情况和任务状态，并导出 CSV 报告。</p>
      </div>
      <button id="exportStatisticsButton" @click="exportCsv">导出统计 CSV</button>
    </div>
    <div class="stats-toolbar filter-card">
      <label><span>选择任务</span><select v-model="assignmentId" @change="load"><option value="">全部任务</option><option v-for="a in assignments" :key="a.id" :value="String(a.id)">{{ a.title }}</option></select></label>
      <label><span>开始日期</span><input type="date" v-model="dateFrom" @change="load" /></label>
      <label><span>结束日期</span><input type="date" v-model="dateTo" @change="load" /></label>
      <label><span>状态筛选</span><select v-model="statusFilter" @change="load"><option value="">全部状态</option><option value="ongoing">进行中</option><option value="completed">已完成</option><option value="deleted">已删除</option></select></label>
    </div>
    <div id="statisticsSummary" class="stats-grid">
      <button
        v-for="card in statCards"
        :key="card.key"
        class="stat-card stat-card-icon stat-filter-card"
        :class="{ 'is-active': activeStatCard === card.key, 'is-clickable': card.filterable }"
        type="button"
        @click="handleStatCardClick(card.key)"
      >
        <span>{{ card.title }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.desc }}</small>
      </button>
    </div>
    <div class="stats-visual-grid">
      <div class="chart-card">
        <div class="chart-title">提交趋势（按天）</div>
        <div id="submissionTrendChart" class="trend-chart" v-html="trendHtml"></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">任务状态分布</div>
        <div id="statusDistributionChart" class="donut-wrap" v-html="donutHtml"></div>
      </div>
    </div>
    <div class="table-wrap stats-table-wrap">
      <table>
        <thead><tr><th>任务标题</th><th>状态</th><th>提交份数</th><th>提交人数</th><th>逾期提交</th><th>截止时间</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="empty-cell">正在加载...</td></tr>
          <tr v-else-if="!tableItems.length"><td colspan="6" class="empty-cell">暂无统计</td></tr>
          <tr v-for="item in tableItems" :key="item.assignmentId"><td>{{ item.assignmentTitle }}</td><td>{{ normalizedStatus(item.effectiveStatus) }}</td><td>{{ item.submittedCount }}</td><td>{{ item.submitterCount }}</td><td>{{ item.lateCount }}</td><td>{{ item.deadline ? formatDateTime(item.deadline) : '-' }}</td></tr>
        </tbody>
      </table>
    </div>
    <p v-if="message" class="message" :class="{ 'is-success': messageKind === 'success', 'is-error': messageKind === 'error' }" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'
import { showToast } from '../utils/feedback'

interface StatisticsItem {
  assignmentId: number
  assignmentTitle: string
  effectiveStatus: string
  submittedCount: number
  submitterCount: number
  lateCount: number
  deadline: string | null
}

const assignments = ref<{ id: number; title: string }[]>([])
const loading = ref(true)
const assignmentId = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const statusFilter = ref('')
const summary = ref<Record<string, number>>({})
const tableItems = ref<StatisticsItem[]>([])
const trendHtml = ref('<div class="chart-empty-state">暂无提交数据</div>')
const donutHtml = ref('<div class="chart-empty-state">暂无任务数据</div>')
const message = ref('')
const messageKind = ref<'success' | 'error' | ''>('')
const activeStatCard = computed(() => {
  if (statusFilter.value === 'ongoing') return 'ongoing'
  if (statusFilter.value === 'completed') return 'completed'
  if (statusFilter.value === 'deleted') return 'deleted'
  return 'all'
})

const completedCount = computed(() => Number(summary.value.endedAssignments || 0) + Number(summary.value.expiredAssignments || 0) + Number(summary.value.archivedAssignments || 0))
const statCards = computed(() => [
  { key: 'all', title: '任务总数', value: Number(summary.value.totalAssignments || summary.value.assignmentCount || 0), desc: '所有任务', filterable: true },
  { key: 'ongoing', title: '进行中', value: Number(summary.value.ongoingAssignments || 0), desc: '正在收集', filterable: true },
  { key: 'completed', title: '已完成', value: completedCount.value, desc: '已截止任务', filterable: true },
  { key: 'submitted', title: '提交份数', value: Number(summary.value.totalSubmittedCount || summary.value.submittedCount || 0), desc: '累计提交', filterable: false },
  { key: 'submitters', title: '提交人数', value: Number(summary.value.totalSubmitterCount || summary.value.submitterCount || 0), desc: '参与人数', filterable: false },
  { key: 'late', title: '逾期提交', value: Number(summary.value.lateCount || 0), desc: '需关注', filterable: false },
])

function setMessage(text = '', kind: 'success' | 'error' | '' = ''): void {
  message.value = text
  messageKind.value = kind
}

function normalizedStatus(status: string): string {
  if (status === 'deleted') return '已删除'
  if (status === 'ongoing') return '进行中'
  return '已完成'
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function getExportPayload(): Record<string, string | null> {
  return {
    assignmentId: assignmentId.value || null,
    status: statusFilter.value || '',
    dateFrom: dateFrom.value || '',
    dateTo: dateTo.value ? `${dateTo.value}T23:59:59` : '',
  }
}

function renderTrend(trend: Array<{ day: string; count: number }>): void {
  if (!trend.length) {
    trendHtml.value = '<div class="chart-empty-state">暂无提交数据</div>'
    return
  }
  const max = Math.max(...trend.map((item) => Number(item.count || 0)), 1)
  trendHtml.value = trend
    .map((item) => {
      const count = Number(item.count || 0)
      const height = Math.max(8, Math.round((count / max) * 100))
      return `<div class="trend-bar-item"><span class="trend-tooltip">${item.day}：${count}份</span><strong class="trend-bar-value">${count}</strong><div class="trend-bar-track"><span style="height:${height}%"></span></div><small>${String(item.day || '').slice(5)}</small></div>`
    })
    .join('')
}

function renderDonut(summaryValue: Record<string, number>): void {
  const ongoing = Number(summaryValue.ongoingAssignments || 0)
  const completed = Number(summaryValue.endedAssignments || 0) + Number(summaryValue.expiredAssignments || 0) + Number(summaryValue.archivedAssignments || 0)
  const total = ongoing + completed
  if (!total) {
    donutHtml.value = '<div class="chart-empty-state">暂无任务数据</div>'
    return
  }
  const ongoingDeg = (ongoing / total) * 360
  donutHtml.value = `<div class="donut" style="background: conic-gradient(#08a05f 0deg ${ongoingDeg}deg, #2d7ff9 ${ongoingDeg}deg 360deg);"><strong>${total}</strong><span>总任务</span></div><div class="donut-legend"><span><i style="background:#08a05f"></i>进行中 ${ongoing}</span><span><i style="background:#2d7ff9"></i>已完成 ${completed}</span></div>`
}

function handleStatCardClick(key: string): void {
  if (key === 'ongoing' || key === 'completed' || key === 'deleted') {
    statusFilter.value = activeStatCard.value === key ? '' : key
    void load()
    return
  }
  if (key === 'all') {
    if (statusFilter.value) {
      statusFilter.value = ''
      void load()
    }
    return
  }
}

async function load(): Promise<void> {
  loading.value = true
  setMessage('', '')
  try {
    const params = new URLSearchParams()
    if (assignmentId.value) params.set('assignmentId', assignmentId.value)
    if (dateFrom.value) params.set('dateFrom', dateFrom.value)
    if (dateTo.value) params.set('dateTo', `${dateTo.value}T23:59:59`)
    if (statusFilter.value) params.set('status', statusFilter.value)
    const result = await api.get<{ summary: Record<string, number>; items: StatisticsItem[]; trend: { day: string; count: number }[] }>('/admin/statistics' + (params.toString() ? `?${params.toString()}` : ''))
    summary.value = result.summary || {}
    tableItems.value = result.items || []
    renderTrend(result.trend || [])
    renderDonut(summary.value)
  } catch (error) {
    setMessage((error as Error).message || '加载统计失败', 'error')
    tableItems.value = []
    trendHtml.value = '<div class="chart-empty-state">暂无提交数据</div>'
    donutHtml.value = '<div class="chart-empty-state">暂无任务数据</div>'
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

async function exportCsv(): Promise<void> {
  try {
    await api.download('/admin/statistics/export', 'cloudnote-statistics.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getExportPayload()),
    })
  } catch (error) {
    const text = (error as Error).message || '导出统计失败'
    setMessage(text, 'error')
    showToast(text, 'error')
  }
}

onMounted(async () => {
  await loadAssignments()
  await load()
})
</script>
