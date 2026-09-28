import { test, expect, request } from '@playwright/test';

test.describe('Interview Lifecycle', () => {
  let apiUrl;

  test.beforeAll(() => {
    apiUrl = process.env.BASE_URL ? `${process.env.BASE_URL}/api` : 'http://127.0.0.1:5000/api';
  });

  test('interviewer can create, start, and complete interview with candidate', async ({ browser }) => {
    const timestamp = Date.now();
    const interviewer = { name: `Interviewer ${timestamp}`, email: `interviewer${timestamp}@example.com`, password: 'password123' };
    const candidate = { name: `Candidate ${timestamp}`, email: `candidate${timestamp}@example.com`, password: 'password123' };

    // 1. API Setup
    const setupRequest = await request.newContext();
    
    // Register Interviewer
    await setupRequest.post(`${apiUrl}/auth/register`, { data: interviewer });
    const interviewerApi = await request.newContext();
    await interviewerApi.post(`${apiUrl}/auth/login`, { data: interviewer });
    
    // Register Candidate
    await setupRequest.post(`${apiUrl}/auth/register`, { data: candidate });
    const candidateApi = await request.newContext();
    const loginRes = await candidateApi.post(`${apiUrl}/auth/login`, { data: candidate });
    const { user: candidateUser } = await loginRes.json();
    
    // Create Interview
    const interviewRes = await interviewerApi.post(`${apiUrl}/interviews`, { 
      data: { title: `Test Interview ${timestamp}` } 
    });
    const { interview } = await interviewRes.json();
    
    // Add Candidate
    await interviewerApi.post(`${apiUrl}/interviews/${interview.id}/participants`, {
      data: { user_id: candidateUser.id, role: 'CANDIDATE' }
    });

    // Create Problem
    const problemRes = await interviewerApi.post(`${apiUrl}/problems`, {
      data: { title: 'Test Problem', description: 'Solve this', difficulty: 'EASY' }
    });
    const { problem } = await problemRes.json();

    // Assign Problem
    await interviewerApi.post(`${apiUrl}/interviews/${interview.id}/problems`, {
      data: { problem_id: problem.id }
    });

    // 2. INTERVIEWER Browser Session
    const interviewerContext = await browser.newContext();
    const interviewerPage = await interviewerContext.newPage();
    
    await interviewerPage.goto('/login');
    await interviewerPage.getByLabel('Email').fill(interviewer.email);
    await interviewerPage.getByLabel('Password').fill(interviewer.password);
    await interviewerPage.getByRole('button', { name: 'Sign In' }).click();
    await expect(interviewerPage).toHaveURL(/\/dashboard/);
    
    // 3. CANDIDATE Browser Session
    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();
    
    await candidatePage.goto('/login');
    await candidatePage.getByLabel('Email').fill(candidate.email);
    await candidatePage.getByLabel('Password').fill(candidate.password);
    await candidatePage.getByRole('button', { name: 'Sign In' }).click();
    await expect(candidatePage).toHaveURL(/\/dashboard/);

    // INTERVIEWER enters workspace
    await interviewerPage.getByRole('button', { name: 'Enter Workspace' }).click();
    await expect(interviewerPage.getByText('Connected')).toBeVisible();
    await expect(interviewerPage.getByText('Interviewer Controls:')).toBeVisible();
    await expect(interviewerPage.getByRole('button', { name: 'Start Interview' })).toBeVisible();
    
    // INTERVIEWER starts interview
    await interviewerPage.getByRole('button', { name: 'Start Interview' }).click();
    await expect(interviewerPage.getByRole('button', { name: 'End Interview' })).toBeVisible();

    // CANDIDATE enters workspace
    await candidatePage.getByRole('button', { name: 'Enter Workspace' }).click();
    // Verify candidate can see the problem and editor (implicitly verifying they joined)
    await expect(candidatePage.getByRole('heading', { name: 'Test Problem' })).toBeVisible();
    await expect(candidatePage.getByText('Connected')).toBeVisible();
    
    // INTERVIEWER ends interview
    await interviewerPage.getByRole('button', { name: 'End Interview' }).click();
    
    // Verify INTERVIEWER sees ended state
    await expect(interviewerPage.getByText('This interview has ended.')).toBeVisible();

    // CANDIDATE checks termination (Socket.io should push this)
    await expect(candidatePage.getByText('This interview has ended.')).toBeVisible();

    await interviewerContext.close();
    await candidateContext.close();
  });
});
