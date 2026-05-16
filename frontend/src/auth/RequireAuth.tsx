import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from './useAuth';

type RequireAuthProps = {
  children: ReactElement;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoading, needsSetup, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-muted">
        <span className="inline-flex items-center gap-2 text-sm">
          <Spinner />
          Loading session...
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={needsSetup ? '/setup' : '/login'}
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}
