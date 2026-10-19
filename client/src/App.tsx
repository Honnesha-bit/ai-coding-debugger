import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';

import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { DebugWorkspacePage } from './pages/DebugWorkspacePage';
import { DebugResultPage } from './pages/DebugResultPage';
import { HistoryPage } from './pages/HistoryPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              {/* 1. Landing Page */}
              <Route index element={<LandingPage />} />

              {/* 2 & 3. Authentication Pages */}
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />

              {/* 4. Authenticated Dashboard */}
              <Route path="dashboard" element={<DashboardPage />} />

              {/* 5 & 6. Debugging Workspace and Session Result */}
              <Route path="debug" element={<DebugWorkspacePage />} />
              <Route path="debug/:id" element={<DebugResultPage />} />

              {/* 7. Searchable History */}
              <Route path="history" element={<HistoryPage />} />

              {/* 8. Evaluation Benchmark Dashboard */}
              <Route path="evaluation" element={<EvaluationPage />} />

              {/* 9 & 10. Profile & Settings */}
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />

              {/* 11. 404 Not Found Page */}
              <Route path="404" element={<NotFoundPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
