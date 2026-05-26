import React, { useEffect, useState, useCallback } from 'react';
import Lobby from './components/Lobby';
import AdminDashboard from './components/AdminDashboard';
import Room from './components/Room';
import { useTranslation } from './hooks/useTranslation';

// Global page transition spinner
function PageSpinner() {
  return (
    <div className="page-spinner-overlay" aria-label="Loading…" role="status">
      <div className="page-spinner-ring" />
      <span className="page-spinner-label">Connecting…</span>
    </div>
  );
}

function App() {
  const { lang } = useTranslation();
  const [currentView, setCurrentView] = useState('loading');
  const [activeRoomId, setActiveRoomId] = useState('');
  const [transitioning, setTransitioning] = useState(false);

  const switchView = useCallback((view, roomId = '') => {
    setTransitioning(true);
    setTimeout(() => {
      setActiveRoomId(roomId);
      setCurrentView(view);
      setTransitioning(false);
    }, 220);
  }, []);

  // Initial client routing based on URL pathname
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/watch-party\/r\/([A-Za-z0-9_-]+)\/?$/);
    if (match && match[1]) {
      setActiveRoomId(match[1]);
      setCurrentView('room');
    } else if (path.includes('/admin')) {
      setCurrentView('admin');
    } else {
      setCurrentView('lobby');
    }

    // Handle browser popstate events
    const handlePopState = () => {
      const p = window.location.pathname;
      const m = p.match(/^\/watch-party\/r\/([A-Za-z0-9_-]+)\/?$/);
      if (m && m[1]) {
        setActiveRoomId(m[1]);
        setCurrentView('room');
      } else if (p.includes('/admin')) {
        setCurrentView('admin');
      } else {
        setActiveRoomId('');
        setCurrentView('lobby');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update HTML body attributes for RTL support
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const navigateToRoom = (roomId) => {
    window.history.pushState({}, '', `/watch-party/r/${roomId}`);
    switchView('room', roomId);
  };

  const navigateToLobby = () => {
    window.history.pushState({}, '', '/watch-party/');
    switchView('lobby');
  };

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/watch-party/admin');
    switchView('admin');
  };

  return (
    <div className={`app-container${transitioning ? ' view-transitioning' : ''}`}>
      {transitioning && <PageSpinner />}

      {currentView === 'lobby' && !transitioning && (
        <Lobby
          onCreateRoom={navigateToRoom}
          onJoinRoom={navigateToRoom}
          onOpenAdmin={navigateToAdmin}
        />
      )}

      {currentView === 'admin' && !transitioning && (
        <AdminDashboard onBack={navigateToLobby} />
      )}

      {currentView === 'room' && !transitioning && (
        <Room roomId={activeRoomId} onLeave={navigateToLobby} />
      )}

      {currentView === 'loading' && <PageSpinner />}

      <footer className="app-footer">Made By Saad H.</footer>
    </div>
  );
}

export default App;
