import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import MyHotelsPage from './pages/MyHotelsPage';
import HotelFormPage from './pages/HotelFormPage';
import HotelDetailsPage from './pages/HotelDetailsPage';
import './styles/App.css';

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/hotels" element={<MyHotelsPage />} />
        <Route path="/hotels/new" element={<HotelFormPage />} />
        <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
        <Route path="/hotels/:id" element={<HotelDetailsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
