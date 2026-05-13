import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/client'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(api.token())
  const user = ref<{ username: string; displayName: string } | null>(null)
  const isBusy = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  async function login(username: string, password: string) {
    isBusy.value = true
    try {
      const res = await api.post<{ token: string; user: { username: string; displayName: string } }>('/admin/auth/login', { username, password })
      api.setToken(res.token)
      token.value = res.token
      user.value = res.user
      return true
    } finally {
      isBusy.value = false
    }
  }

  function logout() {
    api.clearToken()
    token.value = ''
    user.value = null
  }

  return { token, user, isBusy, isLoggedIn, login, logout }
})
