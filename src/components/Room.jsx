import React from 'react';

export default function Room({ onLeave }) {
  return (
    <section id="room" className="room" hidden>
      <header className="room-header">
        <div className="room-id-block">
          <span className="room-label">Room</span>
          <span id="room-id-display" className="room-id"></span>
          <span id="my-role-badge" className="role-badge"></span>
          <span id="conn-status" className="conn-status" role="status" aria-live="polite">
            <span id="conn-dot" className="conn-dot" aria-label="Connected"></span>
          </span>
        </div>
        <div className="room-actions">
          <button id="back-lobby-btn" className="btn btn-ghost" title="Leave room" onClick={onLeave}>Leave</button>
          <button id="lang-toggle-btn" className="btn btn-ghost" title="Toggle Language">🌐 EN</button>
          <button id="speaker-btn" className="btn btn-ghost" title="Toggle speaker">&#128266; Speaker</button>
          <button id="mic-btn" className="btn btn-ghost" title="Toggle microphone">&#127908; Mic</button>
          <button id="copy-link-btn" className="btn btn-ghost" title="Copy room URL">Copy link</button>
          <button id="room-pw-btn" className="btn btn-ghost" title="Room password" hidden>&#128274; Password</button>
          <button id="toggle-chat-btn" className="btn btn-ghost chat-toggle" aria-label="Toggle panel">
            <span>Panel</span> <span id="chat-badge" className="chat-badge" hidden>0</span>
          </button>
        </div>
      </header>

      <main className="room-body">
        <div className="stage">
          <div className="player-shell">
            <div id="player-mount" className="player-mount">
              <div id="player-empty" className="player-empty">
                <p>Paste a YouTube or MP4 URL below to start watching.</p>
              </div>
              <video id="mp4-player" className="player media-player" playsInline hidden></video>
              <div id="yt-player" className="player yt-player" hidden></div>
              <video id="rtc-player" className="player media-player" playsInline autoPlay hidden></video>
              <div id="player-overlay" className="player-overlay" hidden></div>
              <div id="host-self-overlay" className="host-self-overlay" hidden>You are sharing this stream.</div>
              <div id="quality-selector" className="quality-selector" hidden>
                <button id="quality-btn" className="btn quality-btn" type="button" title="Video Quality">⚙ Auto</button>
                <div id="quality-menu" className="quality-menu" hidden></div>
              </div>
              <div id="reaction-canvas" className="reaction-canvas"></div>
            </div>
          </div>

          <div id="source-bar" className="source-bar">
            <form id="source-form" className="source-form">
              <input id="source-url" type="url" placeholder="YouTube, MP4, HLS .m3u8, DASH .mpd, or any video page URL" />
              <button id="yt-quality-btn" type="button" className="btn" style={{color: '#ff4d4d', borderColor: 'rgba(255, 77, 77, 0.4)', background: 'rgba(255, 77, 77, 0.1)'}} title="Choose YouTube video quality">▶ YT Quality</button>
              <button id="extract-btn" type="button" className="btn" title="Extract a playable stream from a video page">Extract</button>
              <button id="paste-source-btn" type="button" className="btn" title="Paste HTML source">Paste source</button>
              <button type="submit" className="btn btn-primary">Load</button>
              <div className="history-dropdown-wrapper">
                <button id="history-dropdown-btn" type="button" className="btn btn-ghost" title="Recently Played">🕒</button>
                <div id="history-dropdown" className="history-dropdown" hidden>
                  <div className="history-dropdown-header">Recently Played</div>
                  <div id="history-list" className="history-list"></div>
                </div>
              </div>
            </form>
            <div className="share-row">
              <label className="file-btn btn">
                <span>Stream local file</span>
                <input id="local-file-input" type="file" accept="video/*" hidden />
              </label>
              <button id="share-tab-btn" className="btn" title="Share a single browser tab">Share browser tab</button>
              <button id="share-screen-btn" className="btn" title="Share your full screen">Share screen</button>
              <button id="stop-share-btn" className="btn btn-danger" hidden>Stop sharing</button>
              <button id="room-settings-btn" className="btn btn-ghost" title="Room settings" hidden>&#9881; Settings</button>
            </div>
            <p className="share-hint hint">
              <strong>Premium streaming:</strong> log in to Netflix / Disney+ in your browser tab, then click <strong>Share browser tab</strong>.
            </p>
            <p id="extract-status" className="extract-status" hidden></p>
          </div>

          <div id="viewer-bar" className="source-bar" hidden>
            <p className="viewer-hint">Only the Host or Admins can control playback. Suggest videos in the Votes tab.</p>
          </div>
        </div>

        <aside id="chat-panel" className="chat-panel" aria-label="Sidebar">
          <div className="chat-header">
            <div className="panel-tabs">
              <button className="panel-tab active" data-tab="chat" type="button">Chat</button>
              <button className="panel-tab" data-tab="users" type="button"><span>Users</span> <span id="user-count" className="count-badge">0</span></button>
              <button className="panel-tab" data-tab="queue" type="button">Queue</button>
              <button className="panel-tab" data-tab="votes" type="button" hidden><span>Votes</span> <span id="vote-count" className="count-badge">0</span></button>
              <button className="panel-tab" data-tab="pending" type="button" hidden><span>Pending</span> <span id="pending-count" className="count-badge">0</span></button>
            </div>
            <button id="close-chat-btn" className="btn btn-ghost icon-btn" aria-label="Close panel">&#215;</button>
          </div>

          <div id="tab-chat" className="tab-content active-tab">
            <div id="chat-messages" className="chat-messages" aria-live="polite"></div>
            <div id="emoji-picker" className="picker-panel" hidden>
              <div className="picker-tabs" id="emoji-tabs"></div>
              <div className="picker-grid" id="emoji-grid"></div>
            </div>
            <div id="sticker-picker" className="picker-panel" hidden>
              <div className="picker-tabs" id="sticker-tabs"></div>
              <div className="picker-grid" id="sticker-grid"></div>
            </div>
            <div className="chat-reactions-bar">
              <button type="button" className="reaction-btn" data-emoji="❤️">❤️</button>
              <button type="button" className="reaction-btn" data-emoji="😂">😂</button>
              <button type="button" className="reaction-btn" data-emoji="😮">😮</button>
              <button type="button" className="reaction-btn" data-emoji="👏">👏</button>
              <button type="button" className="reaction-btn" data-emoji="🔥">🔥</button>
              <button type="button" className="reaction-btn" data-emoji="💀">💀</button>
            </div>
            <form id="chat-form" className="chat-form">
              <button type="button" id="emoji-btn" className="btn btn-ghost icon-btn" title="Emoji">&#128522;</button>
              <button type="button" id="sticker-btn" className="btn btn-ghost icon-btn" title="Stickers">&#127912;</button>
              <input id="chat-input" type="text" placeholder="Send a message" maxLength="1000" autoComplete="off" />
              <button type="submit" className="btn btn-primary">Send</button>
            </form>
            <div id="muted-notice" className="muted-notice" hidden>You are muted and cannot send messages.</div>
          </div>

          <div id="tab-users" className="tab-content" hidden>
            <div id="user-list" className="user-list"></div>
          </div>

          <div id="tab-queue" className="tab-content" hidden>
            <div className="queue-section">
              <div className="queue-header">Up Next</div>
              <div id="queue-list" className="queue-list"></div>
            </div>
            <div className="queue-section" id="suggestions-section">
              <div className="queue-header">Suggestions (Admin Approval)</div>
              <div id="suggestions-list" className="queue-list"></div>
            </div>
            <form id="suggest-form" className="suggest-form">
              <input id="suggest-url" type="url" placeholder="Suggest a video URL" />
              <button type="submit" className="btn btn-primary">Suggest</button>
            </form>
            <div id="suggest-muted" className="muted-notice" hidden>Muted users cannot suggest videos.</div>
          </div>

          <div id="tab-votes" className="tab-content" hidden>
            <button id="play-top-btn" className="btn btn-primary play-top-btn" hidden>&#128293; Play top suggestion</button>
            <div id="vote-list" className="vote-list"></div>
          </div>

          <div id="tab-pending" className="tab-content" hidden>
            <div id="pending-list" className="pending-list"></div>
          </div>
        </aside>
      </main>
    </section>
  );
}
