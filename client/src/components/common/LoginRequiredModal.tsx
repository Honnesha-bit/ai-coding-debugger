import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginRequiredModal: React.FC = () => {
  const { isLoginModalOpen, closeLoginModal } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoginModalOpen) {
        closeLoginModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoginModalOpen, closeLoginModal]);

  if (!isLoginModalOpen) return null;

  const handleLogin = () => {
    closeLoginModal();
    navigate('/login');
  };

  const handleRegister = () => {
    closeLoginModal();
    navigate('/register');
  };

  const handleMaybeLater = () => {
    closeLoginModal();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
      onClick={handleMaybeLater}
    >
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-badge-icon">
            <Lock size={22} className="text-amber-500" />
          </div>
          <button
            onClick={handleMaybeLater}
            className="modal-close-button"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          <h3 id="modal-title" className="modal-title">
            Your Free Debugging Uses Are Finished
          </h3>
          <p id="modal-description" className="modal-description">
            You've used your 2 free debugging attempts. Please log in or create a free account to continue debugging your code.
          </p>

          <div className="preserved-work-notice">
            <Sparkles size={16} className="text-emerald-500" />
            <span>Your code, language selection, and error details have been safely saved.</span>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={handleLogin} className="btn btn-primary btn-md">
            Log In
          </button>
          <button onClick={handleRegister} className="btn btn-outline btn-md">
            Create Account
          </button>
          <button onClick={handleMaybeLater} className="btn btn-ghost btn-md">
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};
