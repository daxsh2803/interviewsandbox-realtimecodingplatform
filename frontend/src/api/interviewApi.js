import { apiClient } from './client';

export const interviewApi = {
  createInterview: async (data) => {
    return apiClient('/interviews', {
      method: 'POST',
      body: data
    });
  },

  getInterviews: async () => {
    return apiClient('/interviews');
  },

  getInterviewById: async (id) => {
    return apiClient(`/interviews/${id}`);
  },

  assignProblem: async (interviewId, problemId) => {
    return apiClient(`/interviews/${interviewId}/problems`, {
      method: 'POST',
      body: { problem_id: problemId }
    });
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
