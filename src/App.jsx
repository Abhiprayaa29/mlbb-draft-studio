import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Control from './pages/Control.jsx';
import OverlayDraft from './pages/OverlayDraft.jsx';
import OverlayScore from './pages/OverlayScore.jsx';

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
      <div className="panel max-w-md p-7 text-center">
        <div className="font-display text-[30px] tracking-[0.16em] text-gold">404</div>
        <p className="mt-1 text-[13px] text-ink-300">Halaman tidak ditemukan.</p>
        <div className="mt-4 flex justify-center gap-2">
          <a className="btn btn-primary" href="/control">
            Control Panel
          </a>
          <a className="btn" href="/overlay/draft">
            Draft Overlay
          </a>
          <a className="btn" href="/overlay/score">
            Scoreboard
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/control" replace />} />
        <Route path="/control" element={<Control />} />
        <Route path="/overlay/draft" element={<OverlayDraft />} />
        <Route path="/overlay/score" element={<OverlayScore />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
