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
import { ToastProvider } from './components/Toast';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text)] font-sans antialiased">
          {/* Skip link as first focusable element for keyboard accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--brand)] focus:text-white focus:rounded-[var(--radius-control)] focus:shadow-md focus:text-xs focus:font-semibold focus:outline-none"
          >
            Skip to main content
          </a>

          <Navbar />

          {/* Single main landmark for the entire document */}
          <main id="main-content" tabIndex={-1} className="flex-1 w-full focus:outline-none">
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
          </main>

          <Footer />
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
