import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useTranslation } from '../hooks/useTranslation';

const SEEK_THRESHOLD = 1.5;

export default function VideoPlayer({
  source,
  sourceType,
  sourcePage,
  proxyToken,
  currentTime,
  isPlaying,
  canControl,
  title,
  thumbnail,
  hostSocketId,
  myId,
  onProgress,
  onPlayStateChange,
  onAutoAdvance,
  rtcStream,
  localStream,
  isSharingSelf,
}) {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const videoRef = useRef(null);
  const ytContainerRef = useRef(null);
  const rtcVideoRef = useRef(null);
  const reactionCanvasRef = useRef(null);

  const [hlsInstance, setHlsInstance] = useState(null);
  const [dashPlayer, setDashPlayer] = useState(null);
  const [ytPlayer, setYtPlayer] = useState(null);

  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState('Auto');
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Helper: wrap any external URL in the backend proxy to bypass CORS
  const proxyUrl = (rawUrl) => {
    if (!rawUrl) return rawUrl;
    if (rawUrl.startsWith('/watch-party/api/') || rawUrl.startsWith('/api/')) return rawUrl;
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('/')) return rawUrl;
    const referer = sourcePage || rawUrl;
    const ptk = proxyToken || (typeof source === 'object' && source?.proxyToken) || '';
    try {
      const b64Url = btoa(unescape(encodeURIComponent(rawUrl)));
      const b64Ref = btoa(unescape(encodeURIComponent(referer)));
      return `/watch-party/api/hls-proxy?b64=${encodeURIComponent(b64Url)}&r64=${encodeURIComponent(b64Ref)}&ptk=${encodeURIComponent(ptk)}`;
    } catch {
      return `/watch-party/api/hls-proxy?url=${encodeURIComponent(rawUrl)}&ref=${encodeURIComponent(referer)}&ptk=${encodeURIComponent(ptk)}`;
    }
  };

  // Floating Reactions listener
  useEffect(() => {
    if (!socket) return;
    const handleReaction = ({ emoji }) => {
      const canvas = reactionCanvasRef.current;
      if (!canvas) return;
      const el = document.createElement('div');
      el.className = 'floating-reaction';
      el.innerHTML = emoji;
      el.style.left = `${Math.random() * 80 + 10}%`;
      canvas.appendChild(el);
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 5000);
    };
    socket.on('reaction', handleReaction);
    return () => {
      socket.off('reaction', handleReaction);
    };
  }, [socket]);

  // Handle standard HTML5 video, HLS, or DASH lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video || sourceType === 'youtube' || sourceType === 'rtc' || sourceType === 'iframe' || !source) {
      if (hlsInstance) { hlsInstance.destroy(); setHlsInstance(null); }
      if (dashPlayer) { dashPlayer.destroy(); setDashPlayer(null); }
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
      return;
    }

    let localHls = null;
    let localDash = null;

    setLevels([]);
    setCurrentLevel('Auto');
    setErrorMsg(null);
    setIsLoading(true);

    const handleVideoError = (e) => {
      const code = e?.target?.error?.code;
      const msg = e?.target?.error?.message || '';
      setIsLoading(false);
      setErrorMsg(`Playback error (code ${code}): ${msg || 'Stream could not be loaded.'}`);
    };
    video.addEventListener('error', handleVideoError);

    const handleCanPlay = () => setIsLoading(false);
    video.addEventListener('canplay', handleCanPlay);

    if (sourceType === 'hls') {
      const finalUrl = proxyUrl(source);
      console.log('Attempting to load stream:', finalUrl);

      if (window.Hls && window.Hls.isSupported()) {
        localHls = new window.Hls({
          maxMaxBufferLength: 10,
          enableWorker: true,
          lowLatencyMode: true,
        });
        localHls.loadSource(finalUrl);
        localHls.attachMedia(video);
        localHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          const lvs = localHls.levels.map((lvl, index) => ({
            id: index,
            name: lvl.height ? `${lvl.height}p` : `Level ${index}`,
          }));
          setLevels(lvs);
        });
        localHls.on(window.Hls.Events.LEVEL_SWITCHED, (_, data) => {
          if (localHls.autoLevelEnabled) {
            setCurrentLevel('Auto');
          } else {
            const currentLvl = localHls.levels[data.level];
            setCurrentLevel(currentLvl?.height ? `${currentLvl.height}p` : `Level ${data.level}`);
          }
        });
        localHls.on(window.Hls.Events.ERROR, (_, data) => {
          console.error('[VideoPlayer] HLS error:', data.type, data.details, data);
          if (data.fatal) {
            setIsLoading(false);
            setErrorMsg(data.type + " - " + data.details);
            try { localHls.destroy(); } catch {}
            setHlsInstance(null);
          }
        });
        setHlsInstance(localHls);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalUrl;
      }
    } else if (sourceType === 'dash') {
      const finalUrl = proxyUrl(source);
      console.log('[VideoPlayer] Attempting DASH load:', finalUrl);
      if (window.dashjs) {
        localDash = window.dashjs.MediaPlayer().create();
        localDash.initialize(video, finalUrl, false);
        localDash.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          setIsLoading(false);
          const bitrates = localDash.getBitrateInfoListFor('video') || [];
          const lvs = bitrates.map((b, index) => ({
            id: index,
            name: b.height ? `${b.height}p` : `Level ${index}`,
          }));
          setLevels(lvs);
        });
        localDash.on(window.dashjs.MediaPlayer.events.ERROR, (e) => {
          console.error('[VideoPlayer] DASH error:', e);
          setIsLoading(false);
          setErrorMsg(`DASH error: ${e?.error?.message || 'Stream could not be loaded.'}`);
        });
        setDashPlayer(localDash);
      }
    } else {
      const finalUrl = proxyUrl(source);
      console.log('[VideoPlayer] Attempting MP4 load:', finalUrl);
      video.src = finalUrl;
    }

    const handleEnded = () => {
      if (canControl) onAutoAdvance();
    };
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
      
      if (localHls) {
        localHls.destroy();
        setHlsInstance(null);
      }
      if (localDash) {
        localDash.destroy();
        setDashPlayer(null);
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [source, sourceType, sourcePage, proxyToken]);

  // YouTube API Mount
  useEffect(() => {
    if (sourceType !== 'youtube' || !source) {
      if (ytPlayer) {
        try { ytPlayer.destroy(); } catch {}
        setYtPlayer(null);
      }
      return;
    }

    if (!window.YT) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }

    let playerInstance = null;
    const initYt = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initYt, 200);
        return;
      }
      if (ytContainerRef.current) {
        playerInstance = new window.YT.Player(ytContainerRef.current, {
          height: '100%',
          width: '100%',
          videoId: source,
          playerVars: {
            autoplay: 0,
            controls: canControl ? 1 : 0,
            disablekb: canControl ? 0 : 1,
            fs: 1,
            modestbranding: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              setYtPlayer(event.target);
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.ENDED && canControl) {
                onAutoAdvance();
              }
            },
          },
        });
      }
    };

    initYt();

    return () => {
      if (playerInstance) {
        try { playerInstance.destroy(); } catch {}
      }
    };
  }, [source, sourceType]);

  // Synchronize player with state updates
  useEffect(() => {
    if (sourceType === 'youtube' && ytPlayer && ytPlayer.getPlayerState) {
      // YouTube Player Sync
      try {
        const state = ytPlayer.getPlayerState();
        const playerTime = ytPlayer.getCurrentTime() || 0;

        if (Math.abs(playerTime - currentTime) > SEEK_THRESHOLD) {
          ytPlayer.seekTo(currentTime, true);
        }

        if (isPlaying && state !== window.YT.PlayerState.PLAYING) {
          ytPlayer.playVideo();
        } else if (!isPlaying && state === window.YT.PlayerState.PLAYING) {
          ytPlayer.pauseVideo();
        }
      } catch (err) {
        console.warn('YouTube sync failed', err);
      }
    } else if (videoRef.current && sourceType !== 'youtube' && sourceType !== 'rtc') {
      // HTML5 / HLS / DASH video sync
      const video = videoRef.current;
      const diff = Math.abs(video.currentTime - currentTime);
      if (diff > SEEK_THRESHOLD) {
        video.currentTime = currentTime;
      }
      if (isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    }
  }, [currentTime, isPlaying, sourceType, ytPlayer]);

  // Push playback synchronization loop from Host/Controller to server
  useEffect(() => {
    if (!canControl || !socket || sourceType === 'rtc' || !source) return;

    const interval = setInterval(() => {
      let time = 0;
      let playing = false;

      if (sourceType === 'youtube' && ytPlayer && ytPlayer.getCurrentTime) {
        time = ytPlayer.getCurrentTime() || 0;
        playing = ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING;
      } else if (videoRef.current) {
        time = videoRef.current.currentTime || 0;
        playing = !videoRef.current.paused;
      }

      socket.emit('playback-sync', {
        source,
        sourceType,
        currentTime: time,
        isPlaying: playing,
        title,
        thumbnail,
      });

      onProgress(time);
      if (onPlayStateChange) {
        onPlayStateChange(playing);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [canControl, socket, source, sourceType, ytPlayer, title, thumbnail]);

  // RTC Screen / Tab share rendering
  useEffect(() => {
    const rtcVideo = rtcVideoRef.current;
    if (!rtcVideo || sourceType !== 'rtc') return;
    
    if (isSharingSelf && localStream) {
      rtcVideo.srcObject = localStream;
    } else if (!isSharingSelf && rtcStream) {
      rtcVideo.srcObject = rtcStream;
    }
    
    rtcVideo.play().catch(() => {});
  }, [sourceType, rtcStream, isSharingSelf, localStream]);

  const handleQualityChange = (levelId) => {
    if (sourceType === 'hls' && hlsInstance) {
      hlsInstance.currentLevel = levelId;
      setQualityMenuOpen(false);
    } else if (sourceType === 'dash' && dashPlayer) {
      dashPlayer.setQualityFor('video', levelId);
      setQualityMenuOpen(false);
    }
  };

  const handlePlayPauseOverlayClick = () => {
    if (!canControl || sourceType === 'youtube') return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      socket.emit('playback-sync', { source, sourceType, currentTime: video.currentTime, isPlaying: true, title, thumbnail });
    } else {
      video.pause();
      socket.emit('playback-sync', { source, sourceType, currentTime: video.currentTime, isPlaying: false, title, thumbnail });
    }
  };

  return (
    <div id="player-mount" className="player-mount">
      {/* Empty State */}
      {!source && sourceType !== 'rtc' && (
        <div id="player-empty" className="player-empty">
          <p>{t('player-empty-text')}</p>
        </div>
      )}

      {/* HTML5 / HLS / DASH Video Player */}
      {source && sourceType !== 'youtube' && sourceType !== 'rtc' && (
        <video
          ref={videoRef}
          id="mp4-player"
          className="player media-player"
          playsInline
          controls={canControl}
          style={{ pointerEvents: canControl ? 'auto' : 'none' }}
        />
      )}

      {/* YouTube Player Wrapper */}
      {source && sourceType === 'youtube' && (
        <div className="player yt-player" style={{ pointerEvents: canControl ? 'auto' : 'none', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          <div ref={ytContainerRef} id="yt-player" style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {/* IFrame Player Wrapper (e.g., Bilibili) */}
      {source && sourceType === 'iframe' && (
        <iframe
          src={source}
          className="player iframe-player"
          style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      )}

      {/* RTC Screen Sharing Player */}
      {sourceType === 'rtc' && (
        <video
          ref={rtcVideoRef}
          id="rtc-player"
          className="player media-player"
          playsInline
          autoPlay
        />
      )}

      {/* Overlay to block interaction for standard users */}
      {!canControl && sourceType !== 'youtube' && sourceType !== 'iframe' && (
        <div id="player-overlay" className="player-overlay" />
      )}

      {/* Loading Spinner Overlay */}
      {isLoading && source && !errorMsg && sourceType !== 'youtube' && sourceType !== 'rtc' && sourceType !== 'iframe' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 90, flexDirection: 'column', gap: '14px'
        }}>
          <div style={{
            width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Loading stream…</div>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ff4444', zIndex: 100, padding: '20px', textAlign: 'center', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{ fontSize: '32px' }}>⚠️</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', maxWidth: '340px' }}>{errorMsg}</div>
          {canControl && (
            <button
              style={{ marginTop: '8px', padding: '6px 18px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              onClick={() => setErrorMsg(null)}
            >Dismiss</button>
          )}
        </div>
      )}

      {/* Overlay for Host sharing screen/tab */}
      {isSharingSelf && (
        <div id="host-self-overlay" className="host-self-overlay">
          You are sharing this stream.
        </div>
      )}

      {/* Reaction floating layer */}
      <div ref={reactionCanvasRef} id="reaction-canvas" className="reaction-canvas" />

      {/* Quality Picker */}
      {levels.length > 0 && (
        <div id="quality-selector" className="quality-selector">
          <button
            id="quality-btn"
            className="btn quality-btn"
            type="button"
            title="Video Quality"
            onClick={() => setQualityMenuOpen(!qualityMenuOpen)}
          >
            ⚙️ {currentLevel}
          </button>
          {qualityMenuOpen && (
            <div id="quality-menu" className="quality-menu">
              <button onClick={() => handleQualityChange(-1)} className={currentLevel === 'Auto' ? 'active' : ''}>
                Auto
              </button>
              {levels.map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => handleQualityChange(lvl.id)}
                  className={currentLevel === lvl.name ? 'active' : ''}
                >
                  {lvl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
