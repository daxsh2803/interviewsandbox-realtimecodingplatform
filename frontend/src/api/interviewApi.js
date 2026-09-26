import { apiClient } from './client';

export const interviewApi = {
  getInterviews: async () => {
    return apiClient('/interviews');
  },
  
  getInterviewById: async (id) => {
    return apiClient(`/interviews/${id}`);
  },

  updateStatus: async (id, status) => {
    return apiClient(`/interviews/${id}/status`, {
      method: 'PATCH',
      body: { status }
    });
  },

  setLock: async (id, locked) => {
    return apiClient(`/interviews/${id}/lock`, {
      method: 'POST',
      body: { locked }
    });
  },

  getLock: async (id) => {
    return apiClient(`/interviews/${id}/lock`);
  },

  setActiveProblem: async (id, problemId) => {
    return apiClient(`/interviews/${id}/active-problem`, {
      method: 'POST',
      body: { problemId }
    });
  },

  getActiveProblem: async (id) => {
    return apiClient(`/interviews/${id}/active-problem`);
  }
};
