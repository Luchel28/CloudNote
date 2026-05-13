import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import AppShell from '../components/AppShell.vue'
import AssignmentsView from '../views/AssignmentsView.vue'
import SubmissionsView from '../views/SubmissionsView.vue'
import StatisticsView from '../views/StatisticsView.vue'
import RecycleView from '../views/RecycleView.vue'
import CreateView from '../views/CreateView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/assignments' },
        { path: 'assignments', name: 'assignments', component: AssignmentsView },
        { path: 'create', name: 'create', component: CreateView },
        { path: 'create/:id', name: 'edit', component: CreateView },
        { path: 'submissions', name: 'submissions', component: SubmissionsView },
        { path: 'statistics', name: 'statistics', component: StatisticsView },
        { path: 'recycle', name: 'recycle', component: RecycleView },
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    next('/login')
  } else if (to.path === '/login' && auth.isLoggedIn) {
    next('/')
  } else {
    next()
  }
})

export default router
