<template>
  <main class="page admin-page" :class="{ 'is-login-state': !auth.isLoggedIn }">
    <section v-if="!auth.isLoggedIn" class="panel login-panel">
      <router-view />
    </section>
    <section v-else class="admin-workbench">
      <header class="admin-topbar">
        <div class="topbar-brand">
          <img class="topbar-logo" :src="logoUrl" alt="CloudNote logo" />
          <span class="topbar-title-group"><strong>CLOUDNOTE</strong><span>云笺</span></span>
        </div>
        <div class="topbar-actions">
          <a class="admin-link" href="/student">返回上传页</a>
          <button class="danger-button compact-button topbar-logout" type="button" @click="auth.logout(); $router.push('/login')">退出登录</button>
        </div>
      </header>
      <aside class="admin-sidebar">
        <nav class="admin-nav" aria-label="后台导航">
          <button v-for="item in navItems" :key="item.route" class="nav-item" :class="{ 'is-active': currentRoute === item.route }" type="button" @click="$router.push(item.path)">
            <span class="nav-item-glyph" aria-hidden="true">{{ item.glyph }}</span>
            <span :class="'iconfont ' + item.icon"></span><span>{{ item.label }}</span>
          </button>
        </nav>
        <article class="storage-card" aria-live="polite">
          <div class="storage-card-head"><span class="iconfont icon-xiazai"></span><strong>存储空间</strong></div>
          <div class="storage-progress"><span :style="{ width: storagePercent + '%' }"></span></div>
          <p>{{ storageText }}</p>
        </article>
      </aside>
      <section class="admin-content"><router-view /></section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/client'
const auth = useAuthStore(); const route = useRoute()
const logoUrl = `${import.meta.env.BASE_URL}assets/cloudnote-logo.jpg`
const currentRoute = computed(() => route.path.split('/').pop() || 'create')
const navItems = [
  { route: 'create', path: '/create', label: '创建任务', icon: 'icon-chuangjianrenwu', glyph: '+' },
  { route: 'assignments', path: '/assignments', label: '任务列表', icon: 'icon-jinhangzhong', glyph: '=' },
  { route: 'statistics', path: '/statistics', label: '统计报告', icon: 'icon-zuanshi', glyph: '#' },
  { route: 'submissions', path: '/submissions', label: '提交记录', icon: 'icon-fuzhi', glyph: 'F' },
  { route: 'recycle', path: '/recycle', label: '回收站', icon: 'icon-shanchu', glyph: 'D' },
]
const storagePercent = ref(0); const storageText = ref('存储统计暂未配置')
onMounted(async () => {
  try {
    const data = await api.get<{ totalBytes: number; cleanableBytes: number; totalFiles: number }>('/admin/storage/summary')
    const t = Number(data.totalBytes || 1), c = Number(data.cleanableBytes || 0)
    storagePercent.value = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0
    storageText.value = `已用 ${(t / 1024 / 1024 / 1024).toFixed(1)} GB · ${data.totalFiles || 0} 个文件`
  } catch { storageText.value = '存储统计暂不可用' }
})
</script>
