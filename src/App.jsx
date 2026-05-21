import React, { useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import AdminDashboard from './components/AdminDashboard';
import Room from './components/Room';

function App() {
  const [legacyLoaded, setLegacyLoaded] = useState(false);

  useEffect(() => {
    // To ensure ZERO regressions while porting complex WebRTC/HLS/Socket logic to hooks,
    // we use a "Strangler Fig" pattern. We render the new React component tree (which maps 
    // exactly to the old HTML), and then seamlessly mount the legacy logic to bind to it.
    
    // Dynamically inject scripts needed for the legacy app
    const scripts = [
      '/watch-party/translations.js',
      '/watch-party/socket.io/socket.io.js',
      'https://www.youtube.com/iframe_api',
      'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
      'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js',
      '/watch-party/main.js'
    ];

    const loadScripts = async () => {
      for (const src of scripts) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = false;
          if (src.includes('main.js')) script.type = 'module';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }
      setLegacyLoaded(true);
    };

    loadScripts().catch(console.error);
  }, []);

  return (
    <>
      {/* 
        This acts as the new React View Layer for the application.
        All DOM elements are maintained to allow the legacy WebRTC/Socket systems
        to continue binding correctly during the transition phase.
      */}
      <Lobby 
        onCreateRoom={(e) => e.preventDefault()} 
        onJoinRoom={(e) => e.preventDefault()}
        onOpenAdmin={() => {}}
      />
      <AdminDashboard onBack={() => {}} />
      <Room onLeave={() => {}} />

      {/* Modals required by legacy systems */}
      <div id="admin-logs-modal" className="modal-overlay" hidden>
        <div className="modal-card" style={{maxWidth: '600px'}}>
          <h3>Room Logs: <span id="admin-logs-room-id"></span></h3>
          <div id="admin-logs-content" style={{maxHeight: '400px', overflowY: 'auto', margin: '16px 0', textAlign: 'left', fontSize: '13px', fontFamily: 'monospace', background: 'var(--bg-body)', padding: '8px', borderRadius: '8px'}}>
            <p className="hint">Loading logs...</p>
          </div>
          <div className="modal-actions">
            <button id="admin-logs-email-btn" type="button" className="btn" style={{marginRight: '8px'}}>Email Report</button>
            <button id="admin-logs-download-btn" type="button" className="btn" style={{marginRight: 'auto'}}>Download Report</button>
            <button id="admin-logs-close-btn" type="button" className="btn btn-primary">Close</button>
          </div>
        </div>
      </div>

      <div id="password-modal" className="modal-overlay" hidden>
        <div className="modal-card">
          <h3>Room Password Required</h3>
          <p className="hint">This room is password-protected.</p>
          <input id="password-input" type="password" placeholder="Enter room password" />
          <p id="password-error" className="lobby-error" hidden></p>
          <div className="modal-actions">
            <button id="password-cancel" type="button" className="btn">Cancel</button>
            <button id="password-submit" type="button" className="btn btn-primary">Join</button>
          </div>
        </div>
      </div>

      <div id="guest-name-modal" className="modal-overlay" hidden>
        <div className="modal-card guest-modal-card">
          <h3>Join Watch Party</h3>
          <p className="hint">Enter a display name to join this room as a guest.</p>
          <input id="guest-name-input" type="text" placeholder="Your name" maxLength="40" autoComplete="nickname" />
          <div className="modal-actions">
            <button id="guest-cancel-btn" type="button" className="btn">Cancel</button>
            <button id="guest-join-btn" type="button" className="btn btn-primary">Join Room</button>
          </div>
        </div>
      </div>

      <div id="name-gate-modal" className="modal-overlay" hidden>
        <div className="modal-card name-gate-card">
          <div className="name-gate-icon">&#127916;</div>
          <h3>Welcome to Watch Party</h3>
          <p className="hint">Choose a display name before entering the room.</p>
          <input id="name-gate-input" type="text" placeholder="Enter your name" maxLength="40" autoComplete="nickname" />
          <button id="name-gate-submit" type="button" className="btn btn-primary name-gate-btn">Enter Room</button>
        </div>
      </div>

      <section id="pending-screen" className="lobby" hidden>
        <div className="lobby-card pending-card">
          <h1 className="brand">Waiting for approval</h1>
          <p className="tagline">The host needs to let you in. Please hold tight&hellip;</p>
          <div className="pending-spinner" aria-hidden="true"></div>
          <p id="pending-room-id" className="hint"></p>
          <button id="pending-cancel-btn" type="button" className="btn btn-ghost">Cancel and leave</button>
        </div>
      </section>

      <div id="toast-container" className="toast-container"></div>
      <footer className="app-footer">Made By Saad H.</footer>
    </>
  );
}

export default App;
