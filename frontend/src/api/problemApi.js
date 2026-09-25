import { apiClient } from './client';

export const problemApi = {
  getProblems: async () => {
    return apiClient('/problems');
  },
  
  getProblemById: async (id) => {
    return apiClient(`/problems/${id}`);
  }
};
