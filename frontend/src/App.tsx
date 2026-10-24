import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { OverviewPage } from './pages/OverviewPage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { InstitutionDetailPage } from './pages/InstitutionDetailPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { autoLogin } from './api/client';

function App() {
  useEffect(() => {
    // 1. Auto-login on app start: POST /api/v1/auth/mock-login with {"role": "coordinator"}
    autoLogin('coordinator').catch((err) => {
      console.warn('Auto-login initialization notice:', err.message);
    });
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/institutions" element={<InstitutionsPage />} />
          <Route path="/institutions/:permanent_id" element={<InstitutionDetailPage />} />
          <Route path="/cases/:case_no" element={<CaseDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
