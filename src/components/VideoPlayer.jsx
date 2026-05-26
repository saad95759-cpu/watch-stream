import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useTranslation } from '../hooks/useTranslation';

const SEEK_THRESHOLD = 1.5;

export default function VideoPlayer({
  source,
  sourceType,
  currentTime,
  isPlaying,
  canControl,
  title,
  thumbnail,
  hostSocketId,
  myId,
  onProgress,
  onAutoAdvance,
  rtcStream,
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
    if (!video || sourceType === 'youtube' || sourceType === 'rtc' || !source) {
      // Clean up previous HLS/DASH instances
      if (hlsInstance) { hlsInstance.destroy(); setHlsInstance(null); }
      if (dashPlayer) { dashPlayer.destroy(); setDashPlayer(null); }
      return;
    }

    // Cleanup first
    if (hlsInstance) { hlsInstance.destroy(); setHlsInstance(null); }
    if (dashPlayer) { dashPlayer.destroy(); setDashPlayer(null); }
    setLevels([]);
    setCurrentLevel('Auto');

    if (sourceType === 'hls') {
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          maxMaxBufferLength: 10,
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          const lvs = hls.levels.map((lvl, index) => ({
            id: index,
            name: lvl.height ? `${lvl.height}p` : `Level ${index}`,
          }));
          setLevels(lvs);
        });
        hls.on(window.Hls.Events.LEVEL_SWITCHED, (_, data) => {
          if (hls.autoLevelEnabled) {
            setCurrentLevel('Auto');
          } else {
            const currentLvl = hls.levels[data.level];
            setCurrentLevel(currentLvl?.height ? `${currentLvl.height}p` : `Level ${data.level}`);
          }
        });
        setHlsInstance(hls);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
      }
    } else if (sourceType === 'dash') {
      if (window.dashjs) {
        const player = window.dashjs.MediaPlayer().create();
        player.initialize(video, source, false);
        player.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          const bitrates = player.getBitrateInfoListFor('video') || [];
          const lvs = bitrates.map((b, index) => ({
            id: index,
            name: b.height ? `${b.height}p` : `Level ${index}`,
          }));
          setLevels(lvs);
        });
        setDashPlayer(player);
      }
    } else {
      video.src = source;
    }

    // Ended handler for auto-advance queue
    const handleEnded = () => {
      if (canControl) {
        onAutoAdvance();
      }
    };
    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
    };
  }, [source, sourceType]);

  // YouTube API Mount
  useEffect(() => {
    if (sourceType !== 'youtube' || !source) {
      if (ytPlayer) {
        try { ytPlayer.destroy(); } catch {}
        setYtPlayer(null);
      }
      return;
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
    }, 1000);

    return () => clearInterval(interval);
  }, [canControl, socket, source, sourceType, ytPlayer, title, thumbnail]);

  // RTC Screen / Tab share rendering
  useEffect(() => {
    const rtcVideo = rtcVideoRef.current;
    if (!rtcVideo || sourceType !== 'rtc' || !rtcStream) return;
    rtcVideo.srcObject = rtcStream;
    rtcVideo.play().catch(() => {});
  }, [sourceType, rtcStream]);

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

      {/* YouTube Player */}
      {source && sourceType === 'youtube' && (
        <div
          ref={ytContainerRef}
          id="yt-player"
          className="player yt-player"
          style={{ pointerEvents: canControl ? 'auto' : 'none' }}
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
      {!canControl && sourceType !== 'youtube' && (
        <div id="player-overlay" className="player-overlay" />
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
