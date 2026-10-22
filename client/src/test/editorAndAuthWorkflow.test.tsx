import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeEditor } from '../components/editor/CodeEditor';
import { DebuggerPage } from '../pages/DebuggerPage';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ApiHealthProvider } from '../context/ApiHealthContext';
import { ToastProvider } from '../components/common/Toast';
import * as debugApi from '../api/debug';
import * as langApi from '../api/languages';
import { DebugResponse } from '../types/api';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <ApiHealthProvider>
          <ToastProvider>{ui}</ToastProvider>
        </ApiHealthProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

describe('CodeEditor Resilience & Interactive Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders interactive lightweight editor when Monaco times out or is offline', async () => {
    const handleChange = vi.fn();
    const testCode = 'def add(a, b):\n    return a + b';

    const { container } = render(
      <CodeEditor
        value={testCode}
        onChange={handleChange}
        language="python"
        height="300px"
      />
    );

    // Initial state or fallback is present
    expect(container).toBeInTheDocument();

    // Fast-forward or toggle to lightweight editor
    const toggleBtn = screen.getByTitle(/Toggle between Monaco Editor and Lightweight Editor/i);
    expect(toggleBtn).toBeInTheDocument();

    // Toggle to lightweight fallback editor
    fireEvent.click(toggleBtn);

    // Verify textarea is accessible and has code
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe(testCode);

    // Accepts typing
    fireEvent.change(textarea, { target: { value: 'def add(a, b):\n    return a * b' } });
    expect(handleChange).toHaveBeenCalledWith('def add(a, b):\n    return a * b');

    // Clears code
    fireEvent.change(textarea, { target: { value: '' } });
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('handles tab key indentation by inserting 4 spaces', () => {
    const handleChange = vi.fn();
    const testCode = 'def foo():';

    const { container } = render(
      <CodeEditor
        value={testCode}
        onChange={handleChange}
        language="python"
        height="300px"
      />
    );

    // Switch to lightweight editor
    const toggleBtn = screen.getByTitle(/Toggle between Monaco Editor and Lightweight Editor/i);
    fireEvent.click(toggleBtn);

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    textarea.selectionStart = textarea.selectionEnd = testCode.length;

    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(handleChange).toHaveBeenCalledWith('def foo():    ');
  });

  it('displays defect indicator for highlighted line', () => {
    const testCode = 'line 1\nline 2\nline 3\nline 4';

    render(
      <CodeEditor
        value={testCode}
        language="python"
        highlightLine={3}
      />
    );

    // Line defect badge should be rendered
    expect(screen.getByText(/Defect: L3/i)).toBeInTheDocument();
  });
});

describe('Authentication & Guest Quota Enforcement Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.spyOn(debugApi, 'checkHealth').mockResolvedValue({
      status: 'healthy',
      version: '1.0.0',
      sandbox_available: true,
    });
    vi.spyOn(langApi, 'getLanguages').mockResolvedValue(langApi.DEFAULT_LANGUAGES);
  });

  it('enforces 2 guest attempts and opens auth modal on 3rd attempt while preserving code', async () => {
    const mockSuccessResponse: DebugResponse = {
      session_id: 'session_1',
      detected_issue: 'Syntax Error',
      error_category: 'Syntax',
      root_cause: 'Missing colon',
      affected_line: 1,
      explanation: 'Add colon',
      recommended_fix: 'Add colon',
      corrected_code: 'def test(): pass',
      verification_status: 'Suggested',
      guest_status: { remainingUses: 1, maxUses: 2 },
    };

    const debugSpy = vi.spyOn(debugApi, 'debugCode');
    debugSpy.mockResolvedValue(mockSuccessResponse);

    renderWithProviders(<DebuggerPage />);

    // Load example code
    fireEvent.click(screen.getByRole('button', { name: /Load Example/i }));

    const debugBtn = screen.getByRole('button', { name: /Debug My Code/i });
    await waitFor(() => expect(debugBtn).not.toBeDisabled());

    // 1st Attempt: should succeed and decrement remaining trials
    fireEvent.click(debugBtn);
    await waitFor(() => {
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    // 2nd Attempt: should succeed and set remaining trials to 0
    mockSuccessResponse.guest_status = { remainingUses: 0, maxUses: 2 };
    fireEvent.click(debugBtn);
    await waitFor(() => {
      expect(debugSpy).toHaveBeenCalledTimes(2);
    });

    // 3rd Attempt: backend rejects with LOGIN_REQUIRED
    debugSpy.mockRejectedValueOnce(
      new Error("You've used your 2 free debugging attempts. Please log in or create a free account to continue debugging your code.")
    );

    fireEvent.click(debugBtn);

    // Auth modal should be triggered
    await waitFor(() => {
      expect(screen.getAllByText(/Sign In/i).length).toBeGreaterThan(0);
    });

    // Code input is still preserved
    const codeArea = screen.getByTestId('monaco-mock') as HTMLTextAreaElement;
    expect(codeArea.value.length).toBeGreaterThan(0);
  });
});
