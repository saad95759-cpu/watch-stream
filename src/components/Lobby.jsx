import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';

// Local storage safety helpers
const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
};

export default function Lobby({ onCreateRoom, onJoinRoom, onOpenAdmin }) {
  const { t, lang, setLang } = useTranslation();
  const [name, setName] = useState(() => safeGet('wp-name') || '');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [avatar, setAvatar] = useState(() => safeGet('wp-avatar') || '👤');
  const [publicRooms, setPublicRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinRoomVal, setJoinRoomVal] = useState('');

  // Guest name modal state
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [pendingJoinRoomId, setPendingJoinRoomId] = useState('');

  // Preset emojis
  const presets = ['👤', '🐱', '🐶', '🦊', '🦁', '🚀', '👾'];

  // Theme helper
  const [theme, setTheme] = useState(() => safeGet('wp-theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    safeSet('wp-theme', nextTheme);
  };

  // Fetch active public rooms
  useEffect(() => {
    let active = true;
    const fetchRooms = async () => {
      try {
        const res = await fetch('/watch-party/api/public-rooms');
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setPublicRooms(data.rooms || []);
          setLoadingRooms(false);
        }
      } catch (err) {
        console.error('Failed to fetch public rooms', err);
      }
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const isValidName = (n) => {
    if (!n) return false;
    const trimmed = n.trim();
    if (trimmed.length < 3 || trimmed.length > 40) return false;
    if (!/\p{L}/u.test(trimmed)) return false;
    return true;
  };

  const handleAvatarSelect = (emoji) => {
    setAvatar(emoji);
    safeSet('wp-avatar', emoji);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSz = 96;
        let w = img.width, h = img.height;
        if (w > maxSz || h > maxSz) {
          if (w > h) { h = Math.round(h * maxSz / w); w = maxSz; }
          else { w = Math.round(w * maxSz / h); h = maxSz; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        setAvatar(dataUrl);
        safeSet('wp-avatar', dataUrl);
      };
      img.src = ev.target?.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    setError('');
    if (!isValidName(name)) {
      setError('Name must be 3-40 characters and contain letters.');
      return;
    }
    safeSet('wp-name', name.trim());
    setCreating(true);
    try {
      const body = {};
      if (password.trim()) body.password = password.trim();
      if (isPublic) body.isPublic = true;

      const res = await fetch('/watch-party/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError('Could not create room. Please try again.');
        return;
      }
      const data = await res.json();
      onCreateRoom(data.id, data.token);
    } catch (err) {
      console.error(err);
      setError('Network error — could not create room.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!isValidName(name)) {
      setError('Name must be 3-40 characters and contain letters.');
      return;
    }
    safeSet('wp-name', name.trim());
    
    // Extract room ID
    const raw = joinRoomVal.trim();
    if (!raw) return;
    const m = raw.match(/\/r\/([A-Za-z0-9_-]+)/);
    const roomId = m ? m[1] : (/^[A-Za-z0-9_-]+$/.test(raw) ? raw : null);
    if (!roomId) {
      setError("That doesn't look like a valid room ID or URL.");
      return;
    }
    onJoinRoom(roomId);
  };

  const handlePublicRoomClick = (room) => {
    setError('');
    const savedName = safeGet('wp-name');
    if (name && isValidName(name)) {
      safeSet('wp-name', name.trim());
      onJoinRoom(room.id);
    } else if (savedName && isValidName(savedName)) {
      onJoinRoom(room.id);
    } else {
      setPendingJoinRoomId(room.id);
      setGuestModalOpen(true);
    }
  };

  const handleGuestJoin = () => {
    if (!isValidName(guestNameInput)) {
      alert('Name must be 3-40 characters and contain letters.');
      return;
    }
    safeSet('wp-name', guestNameInput.trim());
    setGuestModalOpen(false);
    onJoinRoom(pendingJoinRoomId);
  };

  const renderAvatarPreview = () => {
    if (avatar.startsWith('data:image/')) {
      return (
        <div
          className="avatar-preview-circle"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '1px solid var(--border)',
            backgroundImage: `url(${avatar})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      );
    }
    return (
      <div
        className="avatar-preview-circle"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          background: 'var(--bg-elev-2)',
        }}
      >
        {avatar}
      </div>
    );
  };

  return (
    <section id="lobby" className="lobby">
      <div className="lobby-toolbar" style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 10 }}>
        <button id="lobby-theme-toggle" className="btn btn-ghost" onClick={toggleTheme}>
          {theme === 'light' ? '☀️ Theme' : '🌙 Theme'}
        </button>
        <button className="btn btn-ghost" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
          🌐 {lang.toUpperCase()}
        </button>
      </div>

      <div className="lobby-card">
        <h1 className="brand">Watch Party</h1>
        <p className="tagline">{t('lobby-title')}</p>

        <div className="avatar-selection-wrapper" style={{ marginBottom: '8px' }}>
          <span className="field-label" style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Choose Avatar
          </span>
          <div className="avatar-preset-picker lobby-preset-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {presets.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`avatar-preset ${avatar === emoji ? 'active' : ''}`}
                onClick={() => handleAvatarSelect(emoji)}
                style={{
                  background: 'var(--bg-elev-2)',
                  border: avatar === emoji ? '1px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '16px',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="avatar-custom-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="btn btn-ghost btn-sm" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', justifyContent: 'center' }}>
              <span>Upload Custom Image</span>
              <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </label>
            {renderAvatarPreview()}
          </div>
        </div>

        <label className="field">
          <span>{t('lobby-name-label')}</span>
          <input
            id="lobby-name"
            type="text"
            placeholder="Guest"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />
        </label>

        <label className="field">
          <span>{t('lobby-pw-label')}</span>
          <input
            id="create-room-password"
            type="password"
            placeholder="Leave empty for open room"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <div className="lobby-checkbox-row" onClick={() => setIsPublic(!isPublic)}>
          <input id="create-room-public" type="checkbox" checked={isPublic} onChange={() => {}} />
          <span className="checkbox-label">{t('lobby-public-label')}</span>
        </div>

        <button id="create-room-btn" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : t('lobby-create-btn')}
        </button>

        <div className="divider">
          <span>{t('lobby-or-join')}</span>
        </div>

        <form id="join-form" className="join-row" onSubmit={handleJoinSubmit}>
          <input
            id="join-room-id"
            type="text"
            placeholder="Room ID or full URL"
            value={joinRoomVal}
            onChange={(e) => setJoinRoomVal(e.target.value)}
            required
          />
          <button type="submit" className="btn">
            {t('lobby-join-btn')}
          </button>
        </form>

        {error && <p id="lobby-error" className="lobby-error">{error}</p>}
        <p className="hint">{t('lobby-hint')}</p>
        <button id="open-admin-btn" type="button" className="btn btn-ghost lobby-admin-link" onClick={onOpenAdmin}>
          {t('lobby-admin-btn')}
        </button>
      </div>

      <div id="public-rooms-container" className="public-rooms-container">
        <h2 className="public-rooms-title">{t('lobby-public-rooms-title')}</h2>
        <div id="public-rooms-list" className="public-rooms-list">
          {loadingRooms ? (
            <p className="hint">Loading public rooms...</p>
          ) : publicRooms.length === 0 ? (
            <p className="hint">{t('lobby-no-public-rooms')}</p>
          ) : (
            publicRooms.map((room) => (
              <div
                key={room.id}
                className="public-room-card"
                role="button"
                tabIndex={0}
                onClick={() => handlePublicRoomClick(room)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePublicRoomClick(room);
                  }
                }}
              >
                {room.thumbnail ? (
                  <img className="public-room-thumb" src={room.thumbnail} alt={room.title || 'Room thumbnail'} loading="lazy" />
                ) : (
                  <div className="public-room-thumb-placeholder">🎬</div>
                )}
                <div className="public-room-info">
                  <div className="public-room-name">{room.title || 'Watch Party'}</div>
                  <div className="public-room-meta">
                    <span className="public-users-count">👤 {room.participantCount}</span>
                    {room.sourceType && (
                      <span
                        className="public-room-badge"
                        style={{
                          background: room.sourceType === 'youtube' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 240, 255, 0.15)',
                          color: room.sourceType === 'youtube' ? '#ff4444' : 'var(--primary)',
                        }}
                      >
                        {room.sourceType === 'youtube' ? 'YT' : room.sourceType.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <span className="public-room-join-arrow">→</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Guest Name Modal */}
      {guestModalOpen && (
        <div id="guest-name-modal" className="modal-overlay">
          <div className="modal-card guest-modal-card">
            <h3>Join Watch Party</h3>
            <p className="hint">Enter a display name to join this room as a guest.</p>
            <input
              id="guest-name-input"
              type="text"
              placeholder="Your name"
              maxLength={40}
              value={guestNameInput}
              onChange={(e) => setGuestNameInput(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button id="guest-cancel-btn" type="button" className="btn" onClick={() => setGuestModalOpen(false)}>
                Cancel
              </button>
              <button id="guest-join-btn" type="button" className="btn btn-primary" onClick={handleGuestJoin}>
                Join Room
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
