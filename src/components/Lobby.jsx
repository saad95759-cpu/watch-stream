import React from 'react';

export default function Lobby({ onCreateRoom, onJoinRoom, onOpenAdmin }) {
  return (
    <section id="lobby" className="lobby">
      <div className="lobby-card">
        <h1 className="brand">Watch Party</h1>
        <p className="tagline">Watch videos together, in sync.</p>
        
        <label className="field">
          <span>Your name</span>
          <input id="lobby-name" type="text" placeholder="Guest" maxLength="40" autoComplete="nickname" />
        </label>
        
        <label className="field">
          <span>Room password (optional)</span>
          <input id="create-room-password" type="password" placeholder="Leave empty for open room" />
        </label>
        
        <div className="lobby-checkbox-row">
          <input id="create-room-public" type="checkbox" />
          <span className="checkbox-label">Make this room public</span>
        </div>
        
        <button id="create-room-btn" className="btn btn-primary" onClick={onCreateRoom}>
          Create new room
        </button>
        
        <div className="divider"><span>or join</span></div>
        
        <form id="join-form" className="join-row" onSubmit={onJoinRoom}>
          <input id="join-room-id" type="text" placeholder="Room ID or full URL" required />
          <button type="submit" className="btn">Join</button>
        </form>
        
        <p id="lobby-error" className="lobby-error" hidden></p>
        <p className="hint">Share the room URL to invite friends.</p>
        
        <button id="open-admin-btn" type="button" className="btn btn-ghost lobby-admin-link" onClick={onOpenAdmin}>
          Admin Access &rarr;
        </button>
      </div>

      <div id="public-rooms-container" className="public-rooms-container">
        <h2 className="public-rooms-title">Active Public Watch Parties</h2>
        <div id="public-rooms-list" className="public-rooms-list">
          <p className="hint">Loading public rooms...</p>
        </div>
      </div>
    </section>
  );
}
