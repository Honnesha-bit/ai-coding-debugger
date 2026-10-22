import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ApiHealthProvider } from './context/ApiHealthContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { Layout } from './components/layout/Layout';
import { LandingPage } from './pages/LandingPage';
import { DebuggerPage } from './pages/DebuggerPage';
import { HistoryPage } from './pages/HistoryPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { SettingsPage } from './pages/SettingsPage';
import { DocsPage } from './pages/DocsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ApiHealthProvider>
        <AuthProvider>
          <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<LandingPage />} />
                <Route path="debugger" element={<DebuggerPage />} />
                <Route path="debug" element={<DebuggerPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="evaluation" element={<EvaluationPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ApiHealthProvider>
  </ThemeProvider>
  );
};

export default App;
