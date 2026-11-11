import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import MyHotelsPage from './pages/MyHotelsPage';
import HotelFormPage from './pages/HotelFormPage';
import HotelDetailsPage from './pages/HotelDetailsPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { fetchCurrentUser, sessionExpired, selectIsInitialized } from './store/authSlice';
import { onUnauthorized } from './services/api';
import './styles/App.css';

function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const initialized = useSelector(selectIsInitialized);

  // Restore session from HttpOnly cookie on application startup
  useEffect(() => {
    if (!initialized) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, initialized]);

  // Handle session expiration from protected API responses (HTTP 401)
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      dispatch(sessionExpired('Your session has expired. Please log in again.'));
      // Only navigate if not already on the login page to avoid redirect loops
      if (location.pathname !== '/login') {
        navigate('/login', {
          state: { from: location },
          replace: true,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch, navigate, location]);

  return (
    <Routes>
      {/* Public Login Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Hotel Owner Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/hotels" element={<MyHotelsPage />} />
          <Route path="/hotels/new" element={<HotelFormPage />} />
          <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
          <Route path="/hotels/:id" element={<HotelDetailsPage />} />
        </Route>
      </Route>

      {/* Catch-All Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
