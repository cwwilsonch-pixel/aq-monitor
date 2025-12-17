const API_BASE_PATH = import.meta.env.VITE_API_BASE_PATH || '/aq-monitor';

export const config = {
  apiBasePath: API_BASE_PATH,
  endpoints: {
    auth: {
      login: `${API_BASE_PATH}/api/auth/login`,
    },
    system: {
      info: `${API_BASE_PATH}/api/system/info`,
      systemUsers: `${API_BASE_PATH}/api/system/system-users`,
      databases: `${API_BASE_PATH}/api/system/databases`,
    },
    queues: {
      list: `${API_BASE_PATH}/api/queues`,
    },
    analytics: {
      queueMetrics: `${API_BASE_PATH}/api/analytics/queue-metrics`,
      historic: `${API_BASE_PATH}/api/analytics/historic`,
    },
    admin: {
      emailStatus: `${API_BASE_PATH}/api/admin/email-status`,
      emailToggle: `${API_BASE_PATH}/api/admin/email-toggle`,
    },
  },
};
