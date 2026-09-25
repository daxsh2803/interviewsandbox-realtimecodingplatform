export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Reusable fetch client that automatically includes credentials (HTTP-only cookies)
 * and handles JSON parsing.
 */
export async function apiClient(endpoint, { method = 'GET', body, ...customConfig } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const config = {
    method,
    headers,
    credentials: 'include', // Ensures HTTP-only cookie is sent
    ...customConfig,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  } catch (error) {
    // Network errors (e.g. CORS, server down)
    throw new Error('Network error. Please try again later.');
  }

  // Handle empty responses
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    // Standardize error throwing based on backend format
    const errorMessage = data.error || data.message || 'An unexpected error occurred';
    throw new Error(errorMessage);
  }

  return data;
}
