import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import MyHotelsPage from './pages/MyHotelsPage';
import './styles/App.css';

function ComingSoonPage({ title }) {
  return (
    <div className="coming-soon-container">
      <div className="coming-soon-icon">⏳</div>
      <h2>{title}</h2>
      <p>This feature will be unlocked in Phase 4B (Add/Edit Hotel Form & Validation).</p>
      <a href="/hotels" className="btn btn-primary" style={{ marginTop: '1rem' }}>
        Back to My Hotels
      </a>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/hotels" element={<MyHotelsPage />} />
        <Route path="/hotels/new" element={<ComingSoonPage title="Register New Hotel Property" />} />
        <Route path="/hotels/:id/edit" element={<ComingSoonPage title="Edit Hotel Property" />} />
        <Route path="/hotels/:id" element={<ComingSoonPage title="Hotel Property Details & Map" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
