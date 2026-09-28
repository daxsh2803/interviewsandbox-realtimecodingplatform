import { test, expect, request } from '@playwright/test';

test.describe('Collaboration and Editor Lock', () => {
  let apiUrl;

  test.beforeAll(() => {
    apiUrl = process.env.BASE_URL ? `${process.env.BASE_URL}/api` : 'http://127.0.0.1:5000/api';
  });

  async function typeInEditor(editorLocator, page, text) {
    await editorLocator.click({ force: true });
    await page.keyboard.type(text);
  }

  async function setupInterview(browser, title) {
    const timestamp = Date.now();
    const interviewer = { name: `Interviewer ${timestamp}`, email: `interviewer${timestamp}@example.com`, password: 'password123' };
    const candidate = { name: `Candidate ${timestamp}`, email: `candidate${timestamp}@example.com`, password: 'password123' };

    // API Setup
    const setupRequest = await request.newContext();

    // Register & Login Interviewer
    await setupRequest.post(`${apiUrl}/auth/register`, { data: interviewer });
    const interviewerApi = await request.newContext();
    await interviewerApi.post(`${apiUrl}/auth/login`, { data: interviewer });

    // Register & Login Candidate
    await setupRequest.post(`${apiUrl}/auth/register`, { data: candidate });
    const candidateApi = await request.newContext();
    const loginRes = await candidateApi.post(`${apiUrl}/auth/login`, { data: candidate });
    const { user: candidateUser } = await loginRes.json();

    // Create Interview
    const interviewRes = await interviewerApi.post(`${apiUrl}/interviews`, {
      data: { title }
    });
    const { interview } = await interviewRes.json();

    // Add Candidate
    await interviewerApi.post(`${apiUrl}/interviews/${interview.id}/participants`, {
      data: { user_id: candidateUser.id, role: 'CANDIDATE' }
    });

    // Create & Assign Problem
    const problemRes = await interviewerApi.post(`${apiUrl}/problems`, {
      data: { title: 'Collab Problem', description: 'Solve this', difficulty: 'EASY' }
    });
    const { problem } = await problemRes.json();
    await interviewerApi.post(`${apiUrl}/interviews/${interview.id}/problems`, {
      data: { problem_id: problem.id }
    });

    // INTERVIEWER Browser Session
    const interviewerContext = await browser.newContext();
    const interviewerPage = await interviewerContext.newPage();

    await interviewerPage.goto('/login');
    await interviewerPage.getByLabel('Email').fill(interviewer.email);
    await interviewerPage.getByLabel('Password').fill(interviewer.password);
    await interviewerPage.getByRole('button', { name: 'Sign In' }).click();
    await expect(interviewerPage).toHaveURL(/\/dashboard/);

    // CANDIDATE Browser Session
    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();

    await candidatePage.goto('/login');
    await candidatePage.getByLabel('Email').fill(candidate.email);
    await candidatePage.getByLabel('Password').fill(candidate.password);
    await candidatePage.getByRole('button', { name: 'Sign In' }).click();
    await expect(candidatePage).toHaveURL(/\/dashboard/);

    // Enter workspace and start interview
    await interviewerPage.getByRole('button', { name: 'Enter Workspace' }).click();
    await expect(interviewerPage.getByText('Connected')).toBeVisible();
    await interviewerPage.getByRole('button', { name: 'Start Interview' }).click();

    await candidatePage.getByRole('button', { name: 'Enter Workspace' }).click();
    await expect(candidatePage.getByText('Connected')).toBeVisible();

    // Confirm editors rendered
    const interviewerEditor = interviewerPage.locator('.monaco-editor').first();
    const candidateEditor = candidatePage.locator('.monaco-editor').first();
    const interviewerLines = interviewerPage.locator('.view-lines').first();
    const candidateLines = candidatePage.locator('.view-lines').first();
    await expect(interviewerEditor).toBeVisible({ timeout: 30000 });
    await expect(candidateEditor).toBeVisible({ timeout: 30000 });

    return {
      interviewerPage, candidatePage,
      interviewerEditor, candidateEditor,
      interviewerLines, candidateLines,
      interviewerContext, candidateContext
    };
  }

  test('real-time collaborative editing', async ({ browser }) => {
    test.setTimeout(120000);
    const {
      interviewerPage, candidatePage,
      candidateEditor, interviewerEditor,
      candidateLines, interviewerLines,
      interviewerContext, candidateContext
    } = await setupInterview(browser, 'Collab Edit Test');

    // 1. Candidate edits
    await typeInEditor(candidateEditor, candidatePage, '// candidate-edit');

    // 2. Interviewer verifies (Real-time sync)
    await expect(interviewerLines).toContainText('candidate-edit');

    // 3. Interviewer edits
    await typeInEditor(interviewerEditor, interviewerPage, '// interviewer-edit');

    // 4. Candidate verifies (Real-time sync)
    await expect(candidateLines).toContainText('interviewer-edit');

    await interviewerContext.close();
    await candidateContext.close();
  });

  test('interviewer controls lifecycle', async ({ browser }) => {
    test.setTimeout(120000);
    const {
      interviewerPage, candidatePage,
      interviewerContext, candidateContext
    } = await setupInterview(browser, 'Collab Lifecycle Test');

    // 1. Editor Lock Test
    await interviewerPage.getByRole('button', { name: 'Lock Editor' }).click();
    await expect(interviewerPage.getByRole('button', { name: 'Unlock Editor' })).toBeVisible();

    // 2. Unlock Editor
    await interviewerPage.getByRole('button', { name: 'Unlock Editor' }).click();
    await expect(interviewerPage.getByRole('button', { name: 'Lock Editor' })).toBeVisible();

    // 3. Termination Test
    await interviewerPage.getByRole('button', { name: 'End Interview' }).click();
    await expect(candidatePage.getByText('This interview has ended.')).toBeVisible();

    await interviewerContext.close();
    await candidateContext.close();
  });
});
