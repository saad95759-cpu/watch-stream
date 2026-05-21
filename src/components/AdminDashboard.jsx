import React from 'react';

export default function AdminDashboard({ onBack }) {
  return (
    <>
      <section id="admin-login" className="lobby" hidden>
        <div className="lobby-card admin-login-card">
          <h1 className="brand">Admin Access</h1>
          <p className="tagline">Restricted area &mdash; authorized personnel only.</p>
          <label className="field">
            <span>Admin username</span>
            <input id="admin-username" type="text" placeholder="Enter username" autoComplete="off" />
          </label>
          <label className="field">
            <span>Admin password</span>
            <input id="admin-password" type="password" placeholder="Enter password" autoComplete="off" />
          </label>
          <button id="admin-login-btn" type="button" className="btn btn-primary">Admin Login</button>
          <p id="admin-error" className="lobby-error" hidden></p>
          <button id="admin-back-btn" type="button" className="btn btn-ghost" onClick={onBack}>&larr; Back to lobby</button>
        </div>
      </section>

      <section id="admin-dashboard" className="admin-dashboard" hidden>
        <header className="admin-header">
          <h1 className="brand">Admin Dashboard</h1>
          <div className="admin-header-actions">
            <button id="admin-refresh-btn" type="button" className="btn btn-ghost">Refresh</button>
            <button id="admin-logout-btn" type="button" className="btn">Logout</button>
          </div>
        </header>
        <div className="admin-body">
          <div className="admin-section-title">Active Rooms</div>
          <div id="admin-room-list" className="admin-room-list">
            <p className="hint">Loading rooms...</p>
          </div>
          <div className="admin-section-title">Closed Rooms</div>
          <div id="admin-closed-room-list" className="admin-room-list">
            <p className="hint">Loading closed rooms...</p>
          </div>
        </div>
      </section>
    </>
  );
}
