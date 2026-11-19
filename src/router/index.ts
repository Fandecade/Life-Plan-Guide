import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    section: string
    subtitle?: string
    phase?: number
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: {
      title: '今日概览',
      section: '工作台',
      subtitle: '把长期方向落到今天可以开始的行动',
      phase: 1,
    },
  },
  {
    path: '/future-self',
    name: 'future-self',
    component: () => import('@/views/FutureSelfView.vue'),
    meta: {
      title: '未来自我',
      section: '方向与路线',
      subtitle: '愿景、身份、发展方向与内在动机',
      phase: 2,
    },
  },
  {
    path: '/roadmap',
    name: 'roadmap',
    component: () => import('@/views/RoadmapView.vue'),
    meta: {
      title: '发展路线图',
      section: '方向与路线',
      subtitle: '方向能力树、能力里程碑与 S 型路线时间线',
      phase: 3,
    },
  },
  {
    path: '/goals',
    name: 'goals',
    component: () => import('@/views/GoalsTasksView.vue'),
    meta: {
      title: '目标与任务',
      section: '执行与学习',
      subtitle: '从里程碑拆解到今日行动',
      phase: 4,
    },
  },
  {
    path: '/learning',
    name: 'learning',
    component: () => import('@/views/LearningView.vue'),
    meta: {
      title: '学习系统',
      section: '执行与学习',
      subtitle: 'OFRL 流程、输出记录与复习调度',
      phase: 5,
    },
  },
  {
    path: '/habits',
    name: 'habits',
    component: () => import('@/views/HabitsView.vue'),
    meta: {
      title: '行为与习惯',
      section: '执行与学习',
      subtitle: 'B=MAP 配方、微习惯与行为诊断',
      phase: 6,
    },
  },
  {
    path: '/review',
    name: 'review',
    component: () => import('@/views/ReviewView.vue'),
    meta: {
      title: '复盘与洞察',
      section: '成长闭环',
      subtitle: 'PDCA、5Why、M/A/P 与计划调整',
      phase: 7,
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: {
      title: '设置与数据',
      section: '成长闭环',
      subtitle: '本地数据库、备份恢复与数据完整性',
      phase: 1,
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在', section: '系统' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  },
})

export default router