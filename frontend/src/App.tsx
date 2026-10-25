import { useEffect } from 'react';
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
import { autoLogin, getCurrentUser } from './api/client';

function App() {
  useEffect(() => {
    // If no existing saved user session, initialize default coordinator session
    if (!getCurrentUser()) {
      autoLogin().catch((err) => {
        console.warn('Auto-login initialization notice:', err.message);
      });
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans antialiased selection:bg-blue-900 selection:text-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/cases/:case_no" element={<CaseDetailPage />} />
          <Route path="/institutions" element={<InstitutionsPage />} />
          <Route path="/institutions/:permanent_id" element={<InstitutionDetailPage />} />
          <Route path="/overlaps" element={<OverlapQueuePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
