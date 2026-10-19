import React from 'react';
import { Sparkles, ArrowRight, X } from 'lucide-react';

interface WorkPreservedBannerProps {
  onContinue: () => void;
  onDismiss: () => void;
}

export const WorkPreservedBanner: React.FC<WorkPreservedBannerProps> = ({
  onContinue,
  onDismiss,
}) => {
  return (
    <div className="work-preserved-alert" role="alert">
      <div className="alert-content">
        <div className="alert-icon-wrap">
          <Sparkles size={18} className="text-emerald-500" />
        </div>
        <div className="alert-text-group">
          <span className="alert-heading">Your work was preserved!</span>
          <span className="alert-subheading">
            Your source code, language, and error description were saved during login.
          </span>
        </div>
      </div>

      <div className="alert-buttons-group">
        <button onClick={onContinue} className="btn btn-primary btn-sm">
          <span>Continue Debugging</span>
          <ArrowRight size={14} />
        </button>
        <button onClick={onDismiss} className="btn btn-ghost btn-xs" aria-label="Dismiss banner">
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
