import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useTranslation } from '../hooks/useTranslation';

const EMOJI_CATS = [
  { name: 'Smileys', icon: '😊', items: ['😀','😃','😄','😁','😆','🤣','😅','😂','😍','🥰','😘','😎','🤩','😇','🤗','🤔','😏','😒','😢','😭','😤','🤬','🤯','😱','🥳','😴','🤮','🤑','😈','💀'] },
  { name: 'Gestures', icon: '👋', items: ['👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤘','👊','✊','💪','🙏','👋','❤️'] },
  { name: 'Hearts', icon: '❤️', items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘'] },
  { name: 'Animals', icon: '🐱', items: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🦄','🐝','🦋','🐙'] },
  { name: 'Food', icon: '🍕', items: ['🍕','🍔','🍟','🌮','🍿','🧁','🍰','🍩','🍫','☕','🍺','🥤','🍷','🥂','🍜','🍣'] },
  { name: 'Fun', icon: '🎮', items: ['⚽','🏀','🎮','🎬','🎵','🎤','🎸','🎯','🎲','🏆','🎪','🎭','🎨','🎻','🎹','🎷'] },
  { name: 'Things', icon: '💡', items: ['💡','🔥','⭐','✨','💫','🌈','☀️','🌙','💎','🎁','🎉','🎊','🚗','✈️','🚀','💯'] },
];

const STICKER_BASE = '/watch-party/stickers/';
const BUILTIN_STICKERS = [
  { id: 'lol', label: 'LOL' },
  { id: 'fire', label: 'Fire' },
  { id: 'love', label: 'Love' },
  { id: 'thumbsup', label: 'Thumbs Up' },
  { id: 'clap', label: 'Clap' },
  { id: 'cry', label: 'Cry' },
  { id: 'mind-blown', label: 'Mind Blown' },
  { id: 'party', label: 'Party' },
  { id: 'cool', label: 'Cool' },
  { id: 'angry', label: 'Angry' },
];

export default function ChatBox({
  myId,
  myRole,
  participants,
  queue,
  suggestions,
  votes,
  pendingList,
  isSuperAdmin,
  hostSocketId,
  onClose,
  slowModeDelay,
}) {
  const { t } = useTranslation();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [suggestUrl, setSuggestUrl] = useState('');

  // Picker Panels
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeEmojiCat, setActiveEmojiCat] = useState(0);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [activeStickerTab, setActiveStickerTab] = useState('builtin');
  const [customStickers, setCustomStickers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wp-custom-stickers')) || [];
    } catch {
      return [];
    }
  });

  // Slow mode & cooldowns
  const [cooldown, setCooldown] = useState(0);
  const [lastSentTime, setLastSentTime] = useState(0);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Load chat history & handle new messages
  useEffect(() => {
    if (!socket) return;

    const onChat = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onChatHistory = (logs) => {
      const formatted = logs.map((log) => {
        if (log.type === 'chat') {
          return {
            from: null,
            name: log.name,
            role: log.role,
            text: log.text,
            stickerUrl: log.stickerUrl,
            type: log.stickerUrl ? 'sticker' : 'chat',
            avatar: log.avatar,
          };
        } else if (log.type === 'system') {
          return {
            type: 'system',
            text: log.text,
          };
        }
        return log;
      });
      setMessages(formatted);
    };

    const onSystemMessage = ({ text }) => {
      setMessages((prev) => [...prev, { type: 'system', text }]);
    };

    const onUserJoined = ({ name }) => {
      setMessages((prev) => [...prev, { type: 'system', text: `${name} joined` }]);
    };

    const onUserLeft = ({ name }) => {
      setMessages((prev) => [...prev, { type: 'system', text: `${name || 'Someone'} left` }]);
    };

    const onChatBlocked = ({ reason }) => {
      alert(reason || 'You are muted and cannot send messages.');
      setCooldown(0);
    };

    const onClearRoomLogs = () => {
      setMessages([]);
    };

    socket.on('chat', onChat);
    socket.on('chat-history', onChatHistory);
    socket.on('system-message', onSystemMessage);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('chat-blocked', onChatBlocked);
    socket.on('clear-room-logs', onClearRoomLogs);

    return () => {
      socket.off('chat', onChat);
      socket.off('chat-history', onChatHistory);
      socket.off('system-message', onSystemMessage);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('chat-blocked', onChatBlocked);
      socket.off('clear-room-logs', onClearRoomLogs);
    };
  }, [socket]);

  // Slow mode countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const canControl = myRole === 'host' || myRole === 'admin' || myRole === 'superadmin';
  const canModerate = canControl;

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    if (slowModeDelay > 0 && !canModerate) {
      const now = Date.now();
      const elapsed = (now - lastSentTime) / 1000;
      if (elapsed < slowModeDelay) {
        alert('Slow mode is active. Please wait.');
        return;
      }
      setLastSentTime(now);
      setCooldown(slowModeDelay);
    }

    if (socket) {
      socket.emit('chat', { text: chatInput });
    }
    setChatInput('');
  };

  const handleSendReaction = (emoji) => {
    if (socket) {
      socket.emit('reaction', { emoji });
    }
  };

  const handleSuggest = (e) => {
    e.preventDefault();
    if (!suggestUrl.trim()) return;
    
    let url = suggestUrl.trim();
    if (!/^https?:\/\//i.test(url) && /\.\w{2,}/.test(url)) {
      url = 'https://' + url;
    }

    // Check if YouTube
    const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const ytId = m ? m[1] : null;

    if (socket) {
      if (ytId) {
        socket.emit('suggest-video', {
          url,
          title: 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        });
      } else {
        const title = url.split('/').pop() || 'Video Link';
        socket.emit('suggest-video', {
          url,
          title,
          thumbnail: null,
        });
      }
    }
    setSuggestUrl('');
  };

  const handleSendSticker = (stickerUrl) => {
    if (socket) {
      socket.emit('chat', { type: 'sticker', stickerUrl });
    }
    setStickerPickerOpen(false);
  };

  const handleEmojiClick = (em) => {
    setChatInput((prev) => prev + em);
    chatInputRef.current?.focus();
  };

  const handleCustomStickerUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSz = 128;
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
        
        const nextStickers = [...customStickers, dataUrl];
        if (nextStickers.length > 50) {
          alert('Maximum 50 custom stickers.');
          return;
        }
        setCustomStickers(nextStickers);
        try {
          localStorage.setItem('wp-custom-stickers', JSON.stringify(nextStickers));
        } catch {}
      };
      img.src = ev.target?.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCustomStickerDelete = (idx, e) => {
    e.stopPropagation();
    const nextStickers = [...customStickers];
    nextStickers.splice(idx, 1);
    setCustomStickers(nextStickers);
    try {
      localStorage.setItem('wp-custom-stickers', JSON.stringify(nextStickers));
    } catch {}
  };

  const getRoleName = (r) => {
    switch (r) {
      case 'superadmin': return 'Super Admin';
      case 'host': return 'Host';
      case 'admin': return 'Admin';
      case 'muted': return 'Muted';
      default: return 'Member';
    }
  };

  const getRoleIcon = (r) => {
    switch (r) {
      case 'superadmin': return '⭐️';
      case 'host': return '👑';
      case 'admin': return '🛡️';
      case 'muted': return '🔇';
      default: return '';
    }
  };

  const renderUserItem = (p) => {
    const isMe = p.id === myId;
    const canModTarget = canModerate && p.role !== 'superadmin' &&
      !(p.role === 'host' && !isSuperAdmin) &&
      !(p.role === 'admin' && !isSuperAdmin && myRole !== 'host');

    return (
      <div key={p.id} className="user-item">
        {p.avatar && p.avatar.startsWith('data:image/') ? (
          <span className="user-item-avatar" style={{ backgroundImage: `url(${p.avatar})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        ) : (
          <span className="user-item-avatar">{p.avatar || '👤'}</span>
        )}

        <span className={`user-name ${isMe ? 'user-you' : ''}`}>
          {p.name} {isMe && '(you)'}
        </span>

        <span className={`role-badge role-${p.role}`}>
          {getRoleIcon(p.role)} {getRoleName(p.role)}
        </span>

        {p.id === hostSocketId && (
          <span className="live-badge" title="Currently streaming to the room">
            <span className="live-dot" />LIVE
          </span>
        )}

        {!isMe && (
          <div className="user-actions">
            {canModTarget && (
              <>
                {p.role === 'muted' ? (
                  <button className="btn btn-sm" onClick={() => socket?.emit('unmute-user', { targetId: p.id })}>
                    Unmute
                  </button>
                ) : (
                  <button className="btn btn-sm" onClick={() => socket?.emit('mute-user', { targetId: p.id })}>
                    Mute
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => socket?.emit('kick-user', { targetId: p.id })}>
                  Kick
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => socket?.emit('ban-user', { targetId: p.id })}>
                  Ban
                </button>
              </>
            )}

            {(myRole === 'host' || isSuperAdmin) && p.role !== 'superadmin' && p.role !== 'host' && (
              <>
                {p.role === 'admin' ? (
                  <button className="btn btn-sm" onClick={() => socket?.emit('remove-admin', { targetId: p.id })}>
                    Remove Admin
                  </button>
                ) : (
                  p.role !== 'muted' && (
                    <button className="btn btn-sm btn-primary" onClick={() => socket?.emit('assign-admin', { targetId: p.id })}>
                      Make Admin
                    </button>
                  )
                )}
              </>
            )}

            {isSuperAdmin && p.role === 'host' && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  if (confirm(`Remove ${p.name} as Host? They will become a normal member.`)) {
                    socket?.emit('remove-host', { targetId: p.id });
                  }
                }}
              >
                Remove Host
              </button>
            )}

            {(myRole === 'host' || isSuperAdmin) && p.role !== 'superadmin' && (
              <button
                className="btn btn-sm btn-transfer"
                onClick={() => {
                  if (confirm(`Transfer Host role to ${p.name}? You will become an Admin.`)) {
                    socket?.emit('transfer-host', { targetId: p.id });
                  }
                }}
              >
                Transfer Host
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside id="chat-panel" className="chat-panel" aria-label="Sidebar">
      <div className="chat-header">
        <div className="panel-tabs">
          <button className={`panel-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            {t('tab-chat')}
          </button>
          <button className={`panel-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <span>{t('tab-users')}</span> <span className="count-badge">{participants.length}</span>
          </button>
          <button className={`panel-tab ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
            {t('tab-queue')}
          </button>
          <button className={`panel-tab ${activeTab === 'votes' ? 'active' : ''}`} onClick={() => setActiveTab('votes')}>
            <span>{t('tab-votes')}</span> <span className="count-badge">{votes.length}</span>
          </button>
          {canControl && (
            <button className={`panel-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
              <span>{t('tab-pending')}</span> <span className={`count-badge ${pendingList.length > 0 ? 'has-alert' : ''}`}>{pendingList.length}</span>
            </button>
          )}
        </div>
        <button id="close-chat-btn" className="btn btn-ghost icon-btn" aria-label="Close panel" onClick={onClose}>
          &times;
        </button>
      </div>

      {/* Tab Contents: Chat */}
      {activeTab === 'chat' && (
        <div id="tab-chat" className="tab-content active-tab">
          <div id="chat-messages" className="chat-messages">
            {messages.map((msg, idx) => {
              if (msg.type === 'system') {
                return (
                  <div key={idx} className="system-msg">
                    {msg.text}
                  </div>
                );
              }

              const isMe = msg.from === myId;
              const isSticker = msg.type === 'sticker';

              return (
                <div key={idx} className={`chat-row ${isMe ? 'chat-row-me' : ''}`}>
                  {!isMe && (
                    msg.avatar && msg.avatar.startsWith('data:image/') ? (
                      <span className="chat-avatar" style={{ backgroundImage: `url(${msg.avatar})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    ) : (
                      <span className="chat-avatar">{msg.avatar || '👤'}</span>
                    )
                  )}
                  <div className="chat-bubble-wrapper">
                    <div className="chat-meta">
                      <span className="chat-name">{msg.name}</span>
                      {msg.role && msg.role !== 'member' && (
                        <span className={`role-badge role-${msg.role}`}>
                          {getRoleIcon(msg.role)} {getRoleName(msg.role)}
                        </span>
                      )}
                    </div>
                    {isSticker ? (
                      <img className="chat-sticker" src={msg.stickerUrl} alt="Sticker" />
                    ) : (
                      <div className="chat-bubble">{msg.text}</div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Emoji Picker Panel */}
          {emojiPickerOpen && (
            <div id="emoji-picker" className="picker-panel">
              <div className="picker-tabs" id="emoji-tabs">
                {EMOJI_CATS.map((cat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`picker-tab ${activeEmojiCat === idx ? 'active' : ''}`}
                    onClick={() => setActiveEmojiCat(idx)}
                    title={cat.name}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>
              <div className="picker-grid" id="emoji-grid">
                {EMOJI_CATS[activeEmojiCat].items.map((em, idx) => (
                  <button key={idx} type="button" className="emoji-cell" onClick={() => handleEmojiClick(em)}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sticker Picker Panel */}
          {stickerPickerOpen && (
            <div id="sticker-picker" className="picker-panel">
              <div className="picker-tabs" id="sticker-tabs">
                <button
                  type="button"
                  className={`picker-tab picker-tab-text ${activeStickerTab === 'builtin' ? 'active' : ''}`}
                  onClick={() => setActiveStickerTab('builtin')}
                >
                  Stickers
                </button>
                <button
                  type="button"
                  className={`picker-tab picker-tab-text ${activeStickerTab === 'custom' ? 'active' : ''}`}
                  onClick={() => setActiveStickerTab('custom')}
                >
                  My Stickers
                </button>
              </div>
              <div className="picker-grid" id="sticker-grid">
                {activeStickerTab === 'builtin' ? (
                  BUILTIN_STICKERS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="sticker-cell"
                      onClick={() => handleSendSticker(STICKER_BASE + s.id + '.svg')}
                      title={s.label}
                    >
                      <img src={STICKER_BASE + s.id + '.svg'} alt={s.label} />
                    </button>
                  ))
                ) : (
                  <>
                    {customStickers.map((dataUrl, idx) => (
                      <div
                        key={idx}
                        className="sticker-cell sticker-cell-custom"
                        onClick={() => handleSendSticker(dataUrl)}
                      >
                        <img src={dataUrl} alt="Custom sticker" />
                        <button
                          type="button"
                          className="sticker-delete"
                          onClick={(e) => handleCustomStickerDelete(idx, e)}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <label className="sticker-upload-cell">
                      +
                      <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={handleCustomStickerUpload} />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Floating Reaction Bar */}
          <div className="chat-reactions-bar">
            {['❤️', '😂', '😮', '👏', '🔥', '💀'].map((emoji) => (
              <button key={emoji} type="button" className="reaction-btn" onClick={() => handleSendReaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>

          {/* Form */}
          {myRole === 'muted' ? (
            <div id="muted-notice" className="muted-notice">
              {t('muted-notice')}
            </div>
          ) : (
            <form id="chat-form" className="chat-form" onSubmit={handleSendChat}>
              <button
                type="button"
                id="emoji-btn"
                className="btn btn-ghost icon-btn"
                title="Emoji"
                onClick={() => {
                  setEmojiPickerOpen(!emojiPickerOpen);
                  setStickerPickerOpen(false);
                }}
              >
                😊
              </button>
              <button
                type="button"
                id="sticker-btn"
                className="btn btn-ghost icon-btn"
                title="Stickers"
                onClick={() => {
                  setStickerPickerOpen(!stickerPickerOpen);
                  setEmojiPickerOpen(false);
                }}
              >
                🎨
              </button>
              <input
                ref={chatInputRef}
                id="chat-input"
                type="text"
                placeholder={cooldown > 0 ? `Slow mode: wait ${cooldown}s` : t('chat-placeholder')}
                maxLength={1000}
                autoComplete="off"
                disabled={cooldown > 0}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={cooldown > 0}>
                {t('chat-send')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab Contents: Users */}
      {activeTab === 'users' && (
        <div id="tab-users" className="tab-content active-tab">
          <div id="user-list" className="user-list">
            {participants.map(renderUserItem)}
          </div>
        </div>
      )}

      {/* Tab Contents: Queue */}
      {activeTab === 'queue' && (
        <div id="tab-queue" className="tab-content active-tab">
          <div className="queue-section">
            <div className="queue-header">{t('queue-up-next')}</div>
            <div id="queue-list" className="queue-list">
              {queue.length === 0 ? (
                <div className="vote-empty">Queue is empty</div>
              ) : (
                queue.map((item) => (
                  <div key={item.id} className="vote-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="vote-url">{item.title || item.url}</div>
                        <div className="vote-meta">Added by {item.addedByName || 'Unknown'}</div>
                      </div>
                      {canControl && (
                        <div className="vote-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => socket?.emit('queue-remove', { id: item.id })}>
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {canControl && (
            <div className="queue-section" id="suggestions-section">
              <div className="queue-header">{t('queue-suggestions')}</div>
              <div id="suggestions-list" className="queue-list">
                {suggestions.length === 0 ? (
                  <div className="vote-empty">No suggestions</div>
                ) : (
                  suggestions.map((item) => (
                    <div key={item.id} className="vote-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="vote-url">{item.url}</div>
                          <div className="vote-meta">Suggested by {item.addedByName || 'Unknown'}</div>
                        </div>
                        <div className="vote-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => socket?.emit('queue-approve', { id: item.id })}>
                            Approve
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => socket?.emit('queue-reject', { id: item.id })}>
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {myRole === 'muted' ? (
            <div id="suggest-muted" className="muted-notice">
              Muted users cannot suggest videos.
            </div>
          ) : (
            <form id="suggest-form" className="suggest-form" onSubmit={handleSuggest}>
              <input
                id="suggest-url"
                type="url"
                placeholder={t('suggest-placeholder')}
                value={suggestUrl}
                onChange={(e) => setSuggestUrl(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">
                {t('suggest-btn')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab Contents: Votes */}
      {activeTab === 'votes' && (
        <div id="tab-votes" className="tab-content active-tab">
          {canControl && votes.length > 0 && (
            <button
              id="play-top-btn"
              className="btn btn-primary play-top-btn"
              onClick={() => socket?.emit('play-top-suggestion')}
              style={{ display: 'block', margin: '0 auto 12px' }}
            >
              {t('play-top-btn')}
            </button>
          )}
          <div id="vote-list" className="vote-list">
            {votes.length === 0 ? (
              <div className="vote-empty">No suggestions yet. Suggest a video below.</div>
            ) : (
              [...votes]
                .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0))
                .map((v, idx) => {
                  const hasVoted = v.voters && v.voters.includes(myId);
                  return (
                    <div key={v.id} className={`vote-card ${idx === 0 && v.voteCount > 0 ? 'vote-top' : ''}`}>
                      {idx === 0 && v.voteCount > 0 && <span className="top-badge">🔥 Top</span>}
                      <div className="vote-url">{v.url}</div>
                      <div className="vote-meta">Suggested by {v.suggestedByName}</div>
                      <div className="vote-actions">
                        <span className="vote-count">{v.voteCount} vote{v.voteCount !== 1 ? 's' : ''}</span>
                        <button
                          className={`btn btn-sm ${hasVoted ? 'btn-primary' : ''}`}
                          onClick={() => socket?.emit('vote-video', { voteId: v.id })}
                        >
                          {hasVoted ? 'Voted' : 'Vote'}
                        </button>
                        {canControl && (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => socket?.emit('approve-video', { voteId: v.id })}>
                              Approve
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => socket?.emit('reject-video', { voteId: v.id })}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* Tab Contents: Pending waiting room approval */}
      {activeTab === 'pending' && canControl && (
        <div id="tab-pending" className="tab-content active-tab">
          <div id="pending-list" className="pending-list">
            {pendingList.length === 0 ? (
              <div className="vote-empty">No one is waiting.</div>
            ) : (
              pendingList.map((p) => (
                <div key={p.id} className="pending-item">
                  <div className="pending-name">{p.name}</div>
                  <div className="pending-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => socket?.emit('approve-join', { targetId: p.id })}>
                      Approve
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => socket?.emit('deny-join', { targetId: p.id })}>
                      Deny
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
