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
  },

  // History & Report APIs
  getReport: async (id) => {
    return apiClient(`/interviews/${id}/report`);
  },

  getSubmissions: async (id) => {
    return apiClient(`/interviews/${id}/submissions`);
  },

  getSnapshots: async (id) => {
    return apiClient(`/interviews/${id}/snapshots`);
  },

  getNotes: async (id) => {
    return apiClient(`/interviews/${id}/notes`);
  },

  updateNotes: async (id, notes) => {
    return apiClient(`/interviews/${id}/notes`, {
      method: 'PUT',
      body: { notes }
    });
  }
};
