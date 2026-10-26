import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { OverviewPage } from './pages/OverviewPage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { InstitutionDetailPage } from './pages/InstitutionDetailPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { CasesPage } from './pages/CasesPage';
import { OverlapQueuePage } from './pages/OverlapQueuePage';
import { ReportsPage } from './pages/ReportsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans antialiased selection:bg-blue-900 selection:text-white">
        <Navbar />
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <OverviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases"
            element={
              <ProtectedRoute>
                <CasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/:case_no"
            element={
              <ProtectedRoute>
                <CaseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/institutions"
            element={
              <ProtectedRoute>
                <InstitutionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/institutions/:permanent_id"
            element={
              <ProtectedRoute>
                <InstitutionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overlaps"
            element={
              <ProtectedRoute>
                <OverlapQueuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
