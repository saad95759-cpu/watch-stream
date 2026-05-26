import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

// Local storage safety helpers
const sessGet = (key) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};
const sessSet = (key, value) => {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
};
const sessDel = (key) => {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
};

export default function AdminDashboard({ onBack }) {
  const { socket, connected } = useSocket();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Dashboard view state
  const [activeTab, setActiveTab] = useState('broadcast');
  const [announcement, setAnnouncement] = useState('');
  
  // Data lists
  const [rooms, setRooms] = useState([]);
  const [closedRooms, setClosedRooms] = useState([]);
  const [globalHistory, setGlobalHistory] = useState([]);

  // Modals state
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsRoomId, setLogsRoomId] = useState('');
  const [roomLogs, setRoomLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [masterLogs, setMasterLogs] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchRoomId, setSearchRoomId] = useState('');

  // Setup admin login token check
  useEffect(() => {
    if (!socket) return;

    const onAdminLoginResult = ({ success, token }) => {
      if (success) {
        setIsAdmin(true);
        if (token) sessSet('wp-admin-token', token);
      } else {
        setLoginError('Invalid credentials.');
      }
    };

    const onAdminSessionRevoked = ({ reason }) => {
      setIsAdmin(false);
      sessDel('wp-admin-token');
      alert(reason || 'Super Admin session ended — logged in from another session');
    };

    const onAdminRooms = ({ rooms: rList, closedRooms: cList }) => {
      setRooms(rList || []);
      setClosedRooms(cList || []);
    };

    const onAdminGlobalHistoryResult = ({ history }) => {
      setGlobalHistory(history || []);
    };

    const onRoomLogsResult = ({ roomId, logs }) => {
      if (roomId === logsRoomId) {
        setRoomLogs(logs || []);
        setLoadingLogs(false);
      }
    };

    const onMasterLogsResult = (logs) => {
      setMasterLogs(logs || []);
      setMasterLoading(false);
    };

    socket.on('admin-login-result', onAdminLoginResult);
    socket.on('admin-session-revoked', onAdminSessionRevoked);
    socket.on('admin-rooms', onAdminRooms);
    socket.on('admin-global-history-result', onAdminGlobalHistoryResult);
    socket.on('admin-room-logs-result', onRoomLogsResult);
    socket.on('admin-master-logs-result', onMasterLogsResult);

    // Auto-login if we have a token
    const token = sessGet('wp-admin-token');
    if (token) {
      socket.emit('admin-token-login', { token });
      setIsAdmin(true);
    }

    return () => {
      socket.off('admin-login-result', onAdminLoginResult);
      socket.off('admin-session-revoked', onAdminSessionRevoked);
      socket.off('admin-rooms', onAdminRooms);
      socket.off('admin-global-history-result', onAdminGlobalHistoryResult);
      socket.off('admin-room-logs-result', onRoomLogsResult);
      socket.off('admin-master-logs-result', onMasterLogsResult);
    };
  }, [socket, logsRoomId]);

  // Periodic polling for rooms and history
  useEffect(() => {
    if (!socket || !isAdmin) return;

    const poll = () => {
      socket.emit('admin-list-rooms');
      socket.emit('admin-global-history');
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [socket, isAdmin]);

  const handleLogin = () => {
    setLoginError('');
    if (!username.trim() || !password) {
      setLoginError('Enter both username and password.');
      return;
    }
    if (socket) {
      socket.emit('admin-login', { username: username.trim(), password });
    }
  };

  const handleLogout = () => {
    sessDel('wp-admin-token');
    setIsAdmin(false);
  };

  const handleRefresh = () => {
    if (socket) {
      socket.emit('admin-list-rooms');
      socket.emit('admin-global-history');
    }
  };

  const handleSendAnnouncement = () => {
    const msg = announcement.trim();
    if (!msg) return;
    if (socket) {
      socket.emit('admin-broadcast', { message: msg });
      setAnnouncement('');
      alert('Announcement broadcasted!');
    }
  };

  const handleDeleteRoom = (roomId) => {
    if (socket) {
      socket.emit('admin-delete-room', { roomId });
      setTimeout(() => socket.emit('admin-list-rooms'), 300);
    }
  };

  const handleFetchLogs = (roomId) => {
    setLogsRoomId(roomId);
    setRoomLogs([]);
    setLoadingLogs(true);
    setLogsModalOpen(true);
    if (socket) {
      socket.emit('admin-fetch-room-logs', { roomId });
    }
  };

  const handleEmailReport = async () => {
    const token = sessGet('wp-admin-token');
    if (!token) return alert('Admin token not found!');
    setEmailSending(true);
    try {
      const res = await fetch(`/watch-party/api/admin/email-report-instant?roomId=${logsRoomId}&token=${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      alert('Success: ' + data.message);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setEmailSending(false);
    }
  };

  const handleDownloadReport = () => {
    const token = sessGet('wp-admin-token');
    if (!token) return alert('Admin token not found!');
    const url = `/watch-party/api/admin/export-logs?roomId=${logsRoomId}&token=${token}`;
    window.open(url, '_blank');
  };

  const handleFetchMasterLogs = () => {
    setMasterLoading(true);
    setMasterLogs([]);
    if (socket) {
      socket.emit('admin-fetch-master-logs', { startDate, endDate, searchRoomId });
    }
  };

  if (!isAdmin) {
    return (
      <section id="admin-login" className="lobby">
        <div className="lobby-card admin-login-card">
          <h1 className="brand">Admin Access</h1>
          <p className="tagline">Restricted area &mdash; authorized personnel only.</p>
          <label className="field">
            <span>Admin username</span>
            <input
              id="admin-username"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Admin password</span>
            <input
              id="admin-password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin();
              }}
              autoComplete="off"
            />
          </label>
          <button id="admin-login-btn" type="button" className="btn btn-primary" onClick={handleLogin}>
            Admin Login
          </button>
          {loginError && <p id="admin-error" className="lobby-error">{loginError}</p>}
          <button id="admin-back-btn" type="button" className="btn btn-ghost" onClick={onBack}>
            &larr; Back to lobby
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="admin-dashboard" className="admin-dashboard">
      <header className="admin-header">
        <h1 className="brand">Admin Dashboard</h1>
        <div className="admin-header-actions">
          <button id="admin-master-logs-btn" type="button" className="btn btn-primary" onClick={() => setMasterModalOpen(true)}>
            Master Logs
          </button>
          <button id="admin-refresh-btn" type="button" className="btn btn-ghost" onClick={handleRefresh}>
            Refresh
          </button>
          <button id="admin-logout-btn" type="button" className="btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <div className="admin-tabs">
          <button className={`admin-tab ${activeTab === 'broadcast' ? 'active' : ''}`} onClick={() => setActiveTab('broadcast')}>
            📢 Broadcast
          </button>
          <button className={`admin-tab ${activeTab === 'rooms' ? 'active' : ''}`} onClick={() => setActiveTab('rooms')}>
            🚪 Rooms
          </button>
          <button className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            📜 History
          </button>
        </div>

        {activeTab === 'broadcast' && (
          <div id="admin-tab-broadcast" className="admin-tab-panel">
            <div className="admin-broadcast-section" style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                📢 Send System Announcement
              </h3>
              <p className="hint">This message will display as a prominent top banner to all users on the home page and in all active rooms.</p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <input
                  type="text"
                  id="admin-broadcast-input"
                  className="btn"
                  placeholder="Type announcement message here..."
                  style={{ flex: 1, textAlign: 'left', background: 'var(--bg-body)', border: '1px solid var(--border)', cursor: 'text', color: 'var(--text)' }}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendAnnouncement();
                    }
                  }}
                />
                <button id="admin-broadcast-send-btn" className="btn btn-primary" onClick={handleSendAnnouncement}>
                  Send Announcement
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div id="admin-tab-rooms" className="admin-tab-panel">
            <div className="admin-section-title">Active Rooms</div>
            <div id="admin-room-list" className="admin-room-list" style={{ marginBottom: '24px' }}>
              {rooms.length === 0 ? (
                <p className="hint">No active rooms.</p>
              ) : (
                rooms.map((room) => (
                  <div key={room.id} className="admin-room-card">
                    <div className="admin-room-info">
                      <div className="admin-room-id">{room.id}</div>
                      <div className="admin-room-meta">
                        {room.participantCount} user{room.participantCount !== 1 ? 's' : ''}
                        {room.hasPassword && ' • 🔒'}
                        {room.hostName && ` • Host: ${room.hostName}`}
                      </div>
                    </div>
                    <div className="admin-room-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleFetchLogs(room.id)}>
                        Logs
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => window.open(`/watch-party/r/${room.id}`, '_blank')}>
                        Join
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRoom(room.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="admin-section-title">Closed Rooms</div>
            <div id="admin-closed-room-list" className="admin-room-list">
              {closedRooms.length === 0 ? (
                <p className="hint">No closed rooms.</p>
              ) : (
                closedRooms.map((id) => (
                  <div key={id} className="admin-room-card">
                    <div className="admin-room-info">
                      <div className="admin-room-id">{id}</div>
                    </div>
                    <div className="admin-room-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleFetchLogs(id)}>
                        Logs
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div id="admin-tab-history" className="admin-tab-panel">
            <div className="admin-section-title">Global History</div>
            <div id="admin-global-history" className="admin-global-history">
              {globalHistory.length === 0 ? (
                <p className="hint">No history yet.</p>
              ) : (
                globalHistory.map((item, idx) => (
                  <div key={idx} className="history-item" style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(item.timestamp).toLocaleString()} - Room: {item.roomId}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.url}
                    </div>
                    <div style={{ fontSize: '12px' }}>Played by: {item.playedByName || 'Unknown'}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Room Logs Modal */}
      {logsModalOpen && (
        <div id="admin-logs-modal" className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px' }}>
            <h3>Room Logs: <span id="admin-logs-room-id">{logsRoomId}</span></h3>
            <div id="admin-logs-content" style={{ maxHeight: '400px', overflowY: 'auto', margin: '16px 0', textAlign: 'left', fontSize: '13px', fontFamily: 'monospace', background: 'var(--bg-body)', padding: '8px', borderRadius: '8px' }}>
              {loadingLogs ? (
                <p className="hint">Loading logs...</p>
              ) : roomLogs.length === 0 ? (
                <p className="hint">No logs found.</p>
              ) : (
                roomLogs.map((l, idx) => {
                  const ts = new Date(l.ts || l.timestamp).toLocaleString();
                  let text = '';
                  if (l.type === 'chat' || l.type === 'text') text = `[Chat] <span style="color:var(--primary);">${l.name}</span>: ${l.text}`;
                  else if (l.type === 'system') text = `[Sys] <span style="color:#ffaa00;">${l.text}</span>`;
                  else if (l.type === 'video') text = `[Video] <span style="color:var(--primary);">${l.playedByName || 'Unknown'}</span> set source: ${l.url}`;
                  else text = JSON.stringify(l);
                  
                  return (
                    <div key={idx} style={{ padding: '6px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{ts}</span>
                      <br />
                      <span dangerouslySetInnerHTML={{ __html: text }} />
                    </div>
                  );
                })
              )}
            </div>
            <div className="modal-actions">
              <button id="admin-logs-email-btn" type="button" className="btn" style={{ marginRight: '8px' }} onClick={handleEmailReport} disabled={emailSending}>
                {emailSending ? 'Sending...' : 'Email Report'}
              </button>
              <button id="admin-logs-download-btn" type="button" className="btn" style={{ marginRight: 'auto' }} onClick={handleDownloadReport}>
                Download Report
              </button>
              <button id="admin-logs-close-btn" type="button" className="btn btn-primary" onClick={() => setLogsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Logs Modal */}
      {masterModalOpen && (
        <div id="admin-master-logs-modal" className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '90vw', width: '800px' }}>
            <h3>Master Aggregated Reports</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input type="date" id="master-start-date" className="btn" style={{ background: 'var(--bg-elev)', cursor: 'text', border: '1px solid var(--border)' }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input type="date" id="master-end-date" className="btn" style={{ background: 'var(--bg-elev)', cursor: 'text', border: '1px solid var(--border)' }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <input type="text" id="master-search-room" className="btn" placeholder="Search Room ID..." style={{ background: 'var(--bg-elev)', cursor: 'text', flex: 1, border: '1px solid var(--border)' }} value={searchRoomId} onChange={(e) => setSearchRoomId(e.target.value)} />
              <button id="master-fetch-btn" className="btn btn-primary" onClick={handleFetchMasterLogs}>Fetch</button>
            </div>
            <div id="master-logs-content" style={{ maxHeight: '60vh', overflowY: 'auto', textAlign: 'left', fontSize: '13px', fontFamily: 'monospace', background: 'var(--bg-body)', padding: '8px', borderRadius: '8px' }}>
              {masterLoading ? (
                <p className="hint">Fetching...</p>
              ) : masterLogs.length === 0 ? (
                <p className="hint">Click Fetch to load logs...</p>
              ) : (
                masterLogs.map((l, idx) => {
                  const ts = new Date(l.ts || l.createdAt).toLocaleString();
                  let text = l.text || '';
                  if (l.type === 'chat' || l.type === 'text') text = `[Chat] <span style="color:var(--primary);">${l.name}</span>: ${l.text}`;
                  if (l.type === 'video') text = `[Video] <a href="${l.url}" target="_blank" style="color:var(--primary);">${l.url}</a>`;
                  if (l.type === 'video-duration') text = `[Duration] User <span style="color:var(--primary);">${l.name}</span> watched ${l.durationMinutes} min`;
                  
                  return (
                    <div key={idx} style={{ padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#888' }}>[{ts}]</span>{' '}
                      <strong>[{(l.type || 'unknown').toUpperCase()}]</strong>{' '}
                      <span style={{ color: '#63b3ed' }}>Room: {l.roomId}</span> |{' '}
                      <span style={{ color: '#cbd5e0' }}>Sess: {l.sessionId || 'N/A'}</span> |{' '}
                      <span style={{ color: '#e53e3e' }}>IP: {l.clientIp || 'N/A'}</span> |{' '}
                      Role: {l.role || 'unknown'}{' '}
                      <br />
                      <span dangerouslySetInnerHTML={{ __html: text }} />
                    </div>
                  );
                })
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button id="master-logs-close-btn" type="button" className="btn btn-primary" onClick={() => setMasterModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
