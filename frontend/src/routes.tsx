import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { AdminSettingsPage } from './pages/admin-settings-page/AdminSettingsPage';
import { ConnectorsPage } from './pages/connectors-page/ConnectorsPage';
import { DataPage } from './pages/DataPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { SummaryPage } from './pages/summary-page/SummaryPage';
import { SettingsPage } from './pages/settings-page/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/data" replace />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="admin/settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/data" replace />} />
    </Routes>
  );
}
