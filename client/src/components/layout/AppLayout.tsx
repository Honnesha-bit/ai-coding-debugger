import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { LoginRequiredModal } from '../common/LoginRequiredModal';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Pages that display the sidebar: overview dashboard and profile
  const showSidebar =
    isAuthenticated &&
    ['/dashboard', '/profile'].some((p) =>
      location.pathname.startsWith(p)
    );

  const isLandingPage = location.pathname === '/';

  return (
    <div className={`app-shell ${isLandingPage ? 'landing-mode' : ''}`}>
      <Navbar />

      <div className="app-body-container">
        {showSidebar && <Sidebar />}
        <main className={`app-main-content ${showSidebar ? 'with-sidebar' : 'full-width'}`}>
          <Outlet />
        </main>
      </div>

      <LoginRequiredModal />
    </div>
  );
};
