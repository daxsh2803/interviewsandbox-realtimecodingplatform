import { apiClient } from './client';

export const interviewApi = {
  getInterviews: async () => {
    return apiClient('/interviews');
  },
  
  getInterviewById: async (id) => {
    return apiClient(`/interviews/${id}`);
  }
};
