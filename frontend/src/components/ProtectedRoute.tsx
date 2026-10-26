import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getCurrentUser } from '../api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const location = useLocation();
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== 'administrator') {
    return (
      <Navigate
        to="/"
        state={{
          deniedMessage: 'Access denied: Administrator privileges required to access the System Administration Console.',
        }}
        replace
      />
    );
  }

  return <>{children}</>;
};
