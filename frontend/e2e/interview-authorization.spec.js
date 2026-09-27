import { test, expect, request } from '@playwright/test';

test.describe('Interview Authorization', () => {
  let apiUrl;

  test.beforeAll(() => {
    apiUrl = process.env.BASE_URL ? `${process.env.BASE_URL}/api` : 'http://localhost:5000/api';
  });

  test('enforces role-based access to interviews and controls', async ({ browser }) => {
    const timestamp = Date.now();
    const interviewer = { name: `Interviewer ${timestamp}`, email: `interviewer${timestamp}@example.com`, password: 'password123' };
    const candidate = { name: `Candidate ${timestamp}`, email: `candidate${timestamp}@example.com`, password: 'password123' };
    const unrelated = { name: `Unrelated ${timestamp}`, email: `unrelated${timestamp}@example.com`, password: 'password123' };

    // 1. API Setup
    const setupRequest = await request.newContext();
    
    await setupRequest.post(`${apiUrl}/auth/register`, { data: interviewer });
    const interviewerApi = await request.newContext();
    await interviewerApi.post(`${apiUrl}/auth/login`, { data: interviewer });
    
    await setupRequest.post(`${apiUrl}/auth/register`, { data: candidate });
    const candidateApi = await request.newContext();
    const loginRes = await candidateApi.post(`${apiUrl}/auth/login`, { data: candidate });
    const { user: candidateUser } = await loginRes.json();
    
    await setupRequest.post(`${apiUrl}/auth/register`, { data: unrelated });
    
    // Create Interview
    const interviewRes = await interviewerApi.post(`${apiUrl}/interviews`, { 
      data: { title: `Auth Test Interview ${timestamp}` } 
    });
    const { interview } = await interviewRes.json();
    
    // Add Candidate
    await interviewerApi.post(`${apiUrl}/interviews/${interview.id}/participants`, {
      data: { user_id: candidateUser.id, role: 'CANDIDATE' }
    });

    // 2. Candidate Context
    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();
    
    await candidatePage.goto('/login');
    await candidatePage.getByLabel('Email').fill(candidate.email);
    await candidatePage.getByLabel('Password').fill(candidate.password);
    await candidatePage.getByRole('button', { name: 'Sign In' }).click();
    await expect(candidatePage).toHaveURL(/\/dashboard/);
    
    // Candidate verifies they CAN access their interview
    await expect(candidatePage.getByRole('heading', { name: `Auth Test Interview ${timestamp}` })).toBeVisible();
    await candidatePage.getByRole('button', { name: 'Enter Workspace' }).click();
    
    // Candidate cannot access interviewer controls
    await expect(candidatePage.getByText('Interviewer Controls:')).not.toBeVisible();
    await expect(candidatePage.getByRole('button', { name: 'Start Interview' })).not.toBeVisible();
    await expect(candidatePage.getByRole('button', { name: 'End Interview' })).not.toBeVisible();
    await expect(candidatePage.getByRole('button', { name: 'Lock Editor' })).not.toBeVisible();

    // 3. Unrelated User Context
    const unrelatedContext = await browser.newContext();
    const unrelatedPage = await unrelatedContext.newPage();
    
    await unrelatedPage.goto('/login');
    await unrelatedPage.getByLabel('Email').fill(unrelated.email);
    await unrelatedPage.getByLabel('Password').fill(unrelated.password);
    await unrelatedPage.getByRole('button', { name: 'Sign In' }).click();
    await expect(unrelatedPage).toHaveURL(/\/dashboard/);
    
    // Unrelated user cannot see the interview on dashboard
    await expect(unrelatedPage.getByRole('heading', { name: `Auth Test Interview ${timestamp}` })).not.toBeVisible();
    
    // Unrelated user directly navigating to workspace gets access error
    await unrelatedPage.goto(`/interviews/${interview.id}`);
    await expect(unrelatedPage.getByRole('heading', { name: 'Access Error' })).toBeVisible();

    // 4. Interviewer Context
    const interviewerContext = await browser.newContext();
    const interviewerPage = await interviewerContext.newPage();
    
    await interviewerPage.goto('/login');
    await interviewerPage.getByLabel('Email').fill(interviewer.email);
    await interviewerPage.getByLabel('Password').fill(interviewer.password);
    await interviewerPage.getByRole('button', { name: 'Sign In' }).click();
    await expect(interviewerPage).toHaveURL(/\/dashboard/);
    
    // Interviewer retains controls
    await interviewerPage.getByRole('button', { name: 'Enter Workspace' }).click();
    await expect(interviewerPage.getByText('Interviewer Controls:')).toBeVisible();
    await expect(interviewerPage.getByRole('button', { name: 'Start Interview' })).toBeVisible();

    await candidateContext.close();
    await unrelatedContext.close();
    await interviewerContext.close();
  });
});
