<template>
  <section class="admin-login-shell">
    <div class="admin-login-head">
      <div class="admin-login-brand">
        <img class="brand-logo" :src="logoUrl" alt="CloudNote logo" />
        <div class="admin-login-copy">
          <p class="eyebrow">CLOUDNOTE</p>
          <h1>云笺</h1>
          <p class="intro">输入管理员密码后管理作业任务和提交记录。</p>
        </div>
      </div>
      <a class="admin-link admin-login-link" href="/student">返回上传页</a>
    </div>
    <form class="admin-login-form" @submit.prevent="handleLogin">
      <label class="admin-login-field">
        <span>管理员密码</span>
        <input v-model="password" type="password" placeholder="请输入密码" required />
      </label>
      <button class="admin-login-button" type="submit" :disabled="auth.isBusy">{{ auth.isBusy ? '登录中...' : '登录后台' }}</button>
    </form>
    <p v-if="error" class="message is-error admin-login-error" role="status">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const router = useRouter()
const logoUrl = `${import.meta.env.BASE_URL}assets/cloudnote-logo.jpg`
const password = ref('')
const error = ref('')
async function handleLogin() {
  error.value = ''
  try { await auth.login('admin', password.value); router.push('/assignments') }
  catch (e: unknown) { error.value = (e as Error).message || '登录失败' }
}
</script>
