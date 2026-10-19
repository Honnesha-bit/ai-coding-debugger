import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home, Code2 } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="not-found-container">
      <div className="not-found-card text-center p-8 max-w-md mx-auto">
        <div className="not-found-icon-wrap mb-4">
          <FileQuestion size={48} className="text-blue-500 mx-auto" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">404</h1>
        <h2 className="text-lg font-bold text-slate-700 mb-2">Page Not Found</h2>
        <p className="text-sm text-slate-500 mb-6">
          The debugging workspace, session record, or page you were looking for doesn't exist or has
          been moved.
        </p>

        <div className="flex justify-center gap-3">
          <Link to="/debug" className="btn btn-primary btn-md">
            <Code2 size={16} />
            <span>Open Workspace</span>
          </Link>
          <Link to="/" className="btn btn-outline btn-md">
            <Home size={16} />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
