import React, { useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import AdminDashboard from './components/AdminDashboard';
import Room from './components/Room';
import { useTranslation } from './hooks/useTranslation';

function App() {
  const { lang } = useTranslation();
  const [currentView, setCurrentView] = useState('lobby');
  const [activeRoomId, setActiveRoomId] = useState('');

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
    setActiveRoomId(roomId);
    setCurrentView('room');
    window.history.pushState({}, '', `/watch-party/r/${roomId}`);
  };

  const navigateToLobby = () => {
    setActiveRoomId('');
    setCurrentView('lobby');
    window.history.pushState({}, '', '/watch-party/');
  };

  const navigateToAdmin = () => {
    setCurrentView('admin');
    window.history.pushState({}, '', '/watch-party/admin');
  };

  return (
    <div className="app-container">
      {currentView === 'lobby' && (
        <Lobby
          onCreateRoom={navigateToRoom}
          onJoinRoom={navigateToRoom}
          onOpenAdmin={navigateToAdmin}
        />
      )}

      {currentView === 'admin' && (
        <AdminDashboard onBack={navigateToLobby} />
      )}

      {currentView === 'room' && (
        <Room roomId={activeRoomId} onLeave={navigateToLobby} />
      )}

      <footer className="app-footer">Made By Saad H.</footer>
    </div>
  );
}

export default App;
