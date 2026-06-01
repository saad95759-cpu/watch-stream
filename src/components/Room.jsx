import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useTranslation } from '../hooks/useTranslation';
import VideoPlayer from './VideoPlayer';
import ChatBox from './ChatBox';

// Synthesized sound alerts
const SoundEffects = {
  ctx: null,
  enabled: true,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  play(type) {
    if (!this.enabled) return;
    try {
      this.init();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'msg') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.1); // A5
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'join') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'leave') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(783.99, now); // G5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(523.25, now + 0.16); // C5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'alert') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220.00, now);
        osc.frequency.linearRampToValueAtTime(110.00, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Sound synthesis failed', e);
    }
  }
};

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

function getRoleIcon(role) {
  if (role === 'superadmin') return '👑';
  if (role === 'host') return '⭐';
  if (role === 'admin') return '🛡️';
  if (role === 'muted') return '🔇';
  return '👤';
}

function getRoleName(role) {
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'host') return 'Host';
  if (role === 'admin') return 'Admin';
  if (role === 'muted') return 'Muted';
  return 'Member';
}

export default function Room({ roomId, onLeave }) {
  const { socket, connected } = useSocket();
  const { t, lang, setLang } = useTranslation();

  // Peer storage using refs
  const peersRef = useRef(new Map());
  const voipPeersRef = useRef(new Map());
  const voipAudiosRef = useRef(new Map());

  // Connection & settings states
  const [myId, setMyId] = useState('');
  const [myRole, setMyRole] = useState('member');
  const [roomHostId, setRoomHostId] = useState('');
  const [hostSocketId, setHostSocketId] = useState('');
  const [hostStreamKind, setHostStreamKind] = useState(null);
  
  // Lists
  const [participants, setParticipants] = useState([]);
  const [queue, setQueue] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [votes, setVotes] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [localHistory, setLocalHistory] = useState([]);

  // Player state
  const [source, setSource] = useState(null);
  const [sourceType, setSourceType] = useState('mp4');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState(null);
  const [sourcePage, setSourcePage] = useState(null);

  // Sharing states
  const [localStream, setLocalStream] = useState(null);
  const [rtcStream, setRtcStream] = useState(null);
  const [isSharingSelf, setIsSharingSelf] = useState(false);
  const [voipActive, setVoipActive] = useState(false);
  const [speakerActive, setSpeakerActive] = useState(true);
  const [voipStream, setVoipStream] = useState(null);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());

  // Modals / Dropdowns UI
  const [chatOpen, setChatOpen] = useState(window.innerWidth > 720);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [promptNameModalOpen, setPromptNameModalOpen] = useState(false);
  const [promptNameInput, setPromptNameInput] = useState('');

  const [requireApprovalSetting, setRequireApprovalSetting] = useState(false);
  const [publicToggleSetting, setPublicToggleSetting] = useState(false);
  const [slowModeSetting, setSlowModeSetting] = useState(0);

  const [restrictInvites, setRestrictInvites] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [playbackVoting, setPlaybackVoting] = useState(true);
  const [micsDefaultOn, setMicsDefaultOn] = useState(true);
  const [hideJoinLeftAlerts, setHideJoinLeftAlerts] = useState(false);
  const [participantsOnLeft, setParticipantsOnLeft] = useState(false);

  const [languageOption, setLanguageOption] = useState('en');
  const [windowBgStyle, setWindowBgStyle] = useState('acrylic');
  const [autoTranslateChat, setAutoTranslateChat] = useState(false);
  const [notifyInvites, setNotifyInvites] = useState(true);
  const [notifyMissedChat, setNotifyMissedChat] = useState(true);
  const [notifyClipboard, setNotifyClipboard] = useState(false);
  const [notifyDMs, setNotifyDMs] = useState(true);
  const [updateChannel, setUpdateChannel] = useState('stable');
  const [preciseSync, setPreciseSync] = useState(true);
  const [customWebviewStyle, setCustomWebviewStyle] = useState(false);

  const [noiseGate, setNoiseGate] = useState(30);
  const [noiseSuppression, setNoiseSuppression] = useState(false);
  const [incomingVoiceVolume, setIncomingVoiceVolume] = useState(80);
  const [mediaVolume, setMediaVolume] = useState(100);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('default');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('default');
  const [activeSettingsTab, setActiveSettingsTab] = useState('room');

  const [sourceInput, setSourceInput] = useState('');
  const [extractStatus, setExtractStatus] = useState('');
  const [extractKind, setExtractKind] = useState('');

  // Scanner modal flow
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [activeScannerTab, setActiveScannerTab] = useState('url');
  const [scannerUrl, setScannerUrl] = useState('');
  const [pasteHtmlText, setPasteHtmlText] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const [scannerStatus, setScannerStatus] = useState('');
  const [scannerStatusKind, setScannerStatusKind] = useState('');
  const [scanning, setScanning] = useState(false);
  const [proxyToken, setProxyToken] = useState('');
  const [extractToken, setExtractToken] = useState('');

  // Room options dropdown
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false);
  const [mediaDropdownOpen, setMediaDropdownOpen] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState('');

  // Theme — persisted across lobby <-> room
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('wp-theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Rave App - Fetch Audio Devices
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
          setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
        })
        .catch(() => {});
    }
  }, []);

  // Rave App - Update Peer audio volumes dynamically
  useEffect(() => {
    voipAudiosRef.current.forEach((audio) => {
      audio.volume = speakerActive ? (incomingVoiceVolume / 100) : 0;
    });
  }, [incomingVoiceVolume, speakerActive]);

  // Rave App - Synchronize language settings option
  useEffect(() => {
    if (languageOption && setLang) {
      setLang(languageOption);
    }
  }, [languageOption, setLang]);

  const canControl = myRole === 'host' || myRole === 'admin' || myRole === 'superadmin';

  // Sound triggers on joining/leaving/chat events
  useEffect(() => {
    if (!socket) return;

    const onChat = (msg) => {
      if (msg.from !== myId) SoundEffects.play('msg');
    };

    const onUserJoined = () => {
      SoundEffects.play('join');
    };

    const onUserLeft = () => {
      SoundEffects.play('leave');
    };

    const onRoomEnded = () => {
      alert('The Host has ended this room.');
      onLeave();
    };

    socket.on('chat', onChat);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('room-ended', onRoomEnded);

    return () => {
      socket.off('chat', onChat);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('room-ended', onRoomEnded);
    };
  }, [socket, myId]);

  // Geolocation API helper
  const fetchGps = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ status: 'unsupported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, status: 'granted' }),
        () => resolve({ status: 'denied' }),
        { timeout: 5000 }
      );
    });
  };

  // Join Room Socket handshakes
  useEffect(() => {
    if (!socket) return;

    const getClientId = () => {
      let cid = localStorage.getItem('wp-client-id');
      if (!cid) {
        cid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('wp-client-id', cid);
      }
      return cid;
    };

    const handleJoin = async () => {
      const myName = localStorage.getItem('wp-name');
      if (!myName || myName === 'Guest') {
        setPromptNameModalOpen(true);
        return;
      }

      const roomToken = sessionStorage.getItem(`wp-room-token-${roomId}`);
      const storedHostKey = sessionStorage.getItem(`wp-host-key-${roomId}`);
      const gps = await fetchGps();
      const myAvatar = localStorage.getItem('wp-avatar') || '👤';

      socket.emit('join', {
        roomId,
        name: myName,
        token: roomToken || undefined,
        password: passwordInput || undefined,
        hostKey: storedHostKey || undefined,
        clientId: getClientId(),
        gps,
        avatar: myAvatar,
      });
    };

    const submitPromptName = async (e) => {
      e.preventDefault();
      const val = promptNameInput.trim();
      if (val.length < 3) return alert('Name must be at least 3 characters.');
      localStorage.setItem('wp-name', val);
      setPromptNameModalOpen(false);
      
      const roomToken = sessionStorage.getItem(`wp-room-token-${roomId}`);
      const storedHostKey = sessionStorage.getItem(`wp-host-key-${roomId}`);
      const gps = await fetchGps();
      const myAvatar = localStorage.getItem('wp-avatar') || '👤';

      socket.emit('join', {
        roomId,
        name: val,
        token: roomToken || undefined,
        password: passwordInput || undefined,
        hostKey: storedHostKey || undefined,
        clientId: getClientId(),
        gps,
        avatar: myAvatar,
      });
    };

    if (socket.connected) {
      handleJoin();
    }
    socket.on('connect', handleJoin);

    const onState = (state) => {
      setPasswordModalOpen(false);
      setPendingApproval(false);
      setMyId(state.youId);
      setHostSocketId(state.hostSocketId);
      setHostStreamKind(state.hostStreamKind);
      setRoomHostId(state.roomHostId);
      setParticipants(state.participants || []);
      setQueue(state.queue || []);
      setSuggestions(state.suggestions || []);
      setVotes(state.votes || []);
      setPendingList(state.pending || []);
      setRequireApprovalSetting(!!state.requireApproval);
      setPublicToggleSetting(!!state.isPublic);
      setSlowModeSetting(state.slowModeDelay || 0);
      setPinnedMessage(state.pinnedMessage || '');

      if (state.hostKey) {
        sessionStorage.setItem(`wp-host-key-${roomId}`, state.hostKey);
      }

      let role = state.myRole || 'member';
      if (state.isSuperAdmin) role = 'superadmin';
      setMyRole(role);

      setLocalHistory(state.history || []);

      if (state.source) {
        setSource(state.source);
        setSourceType(state.sourceType);
        setProxyToken(state.proxyToken || '');
        setCurrentTime(state.currentTime || 0);
        setIsPlaying(state.isPlaying || false);
        setVideoTitle(state.title || '');
        setVideoThumbnail(state.thumbnail || null);
        setSourcePage(state.sourcePage || null);
      }

      if (state.voipPeers && state.voipPeers.length > 0) {
        setActiveSpeakers(new Set(state.voipPeers));
      }
    };

    const onRoomUpdate = (state) => {
      setRoomHostId(state.roomHostId);
      setParticipants(state.participants || []);
      setQueue(state.queue || []);
      setSuggestions(state.suggestions || []);
      setVotes(state.votes || []);
      setLocalHistory(state.history || []);
      setSlowModeSetting(state.slowModeDelay || 0);
      setPinnedMessage(state.pinnedMessage || '');

      const me = state.participants.find((p) => p.id === state.youId || p.id === myId);
      if (me) {
        setMyRole(me.role);
      }
    };

    const onJoinError = ({ reason }) => {
      if (reason === 'password-required') {
        setPasswordModalOpen(true);
        setPasswordError('Password required to join this room.');
      } else if (reason === 'banned') {
        alert('You are banned from this room.');
        onLeave();
      } else if (reason === 'invalid-name') {
        alert('Your Display Name was rejected by the server.');
        localStorage.removeItem('wp-name');
        onLeave();
      } else if (reason === 'not-found') {
        alert('Room Not Found!');
        onLeave();
      }
    };

    const onApprovalPending = () => {
      setPendingApproval(true);
    };

    const onApprovalDenied = () => {
      alert('Your request to join was denied by the host.');
      onLeave();
    };

    const onPendingUpdated = ({ pending }) => {
      setPendingList(pending || []);
    };

    const onApprovalModeUpdated = ({ requireApproval }) => {
      setRequireApprovalSetting(!!requireApproval);
    };

    const onPublicModeUpdated = ({ isPublic }) => {
      setPublicToggleSetting(!!isPublic);
    };

    const onSourceChanged = ({ source, sourceType, title, thumbnail, sourcePage, proxyToken }) => {
      setSource(source);
      setSourceType(sourceType);
      setProxyToken(proxyToken || '');
      setCurrentTime(0);
      setIsPlaying(false);
      setVideoTitle(title || '');
      setVideoThumbnail(thumbnail || null);
      setSourcePage(sourcePage || null);
    };

    const onPlay = ({ time }) => {
      if (hostSocketId) return;
      setCurrentTime(time);
      setIsPlaying(true);
    };

    const onPause = ({ time }) => {
      if (hostSocketId) return;
      setCurrentTime(time);
      setIsPlaying(false);
    };

    const onSeek = ({ time }) => {
      if (hostSocketId) return;
      setCurrentTime(time);
    };

    const onPlaybackSync = ({ currentTime: time, isPlaying: playing }) => {
      if (hostSocketId) return;
      setCurrentTime(time);
      setIsPlaying(playing);
    };

    socket.on('state', onState);
    socket.on('room-update', onRoomUpdate);
    socket.on('join-error', onJoinError);
    socket.on('approval-pending', onApprovalPending);
    socket.on('approval-denied', onApprovalDenied);
    socket.on('pending-updated', onPendingUpdated);
    socket.on('approval-mode-updated', onApprovalModeUpdated);
    socket.on('public-mode-updated', onPublicModeUpdated);
    socket.on('source-changed', onSourceChanged);
    socket.on('play', onPlay);
    socket.on('pause', onPause);
    socket.on('seek', onSeek);
    socket.on('playback-sync', onPlaybackSync);

    return () => {
      socket.off('connect', handleJoin);
      socket.off('state', onState);
      socket.off('room-update', onRoomUpdate);
      socket.off('join-error', onJoinError);
      socket.off('approval-pending', onApprovalPending);
      socket.off('approval-denied', onApprovalDenied);
      socket.off('pending-updated', onPendingUpdated);
      socket.off('approval-mode-updated', onApprovalModeUpdated);
      socket.off('public-mode-updated', onPublicModeUpdated);
      socket.off('source-changed', onSourceChanged);
      socket.off('play', onPlay);
      socket.off('pause', onPause);
      socket.off('seek', onSeek);
      socket.off('playback-sync', onPlaybackSync);
    };
  }, [socket, roomId]);

  // WebRTC Screen/Tab share logic
  useEffect(() => {
    if (!socket) return;

    const onWebrtcHostAvailable = ({ hostId, kind }) => {
      setHostSocketId(hostId);
      setHostStreamKind(kind);
      setSourceType('rtc');
      setSource('rtc');
      
      // Setup connection to host
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(hostId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-ice', { to: hostId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        setRtcStream(e.streams[0]);
      };

      pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc-offer', { to: hostId, sdp: pc.localDescription });
        });
    };

    const onWebrtcHostStopped = () => {
      setHostSocketId('');
      setHostStreamKind(null);
      setRtcStream(null);
      setSource(null);
      setSourceType('mp4');
      
      peersRef.current.forEach((pc) => {
        try { pc.close(); } catch {}
      });
      peersRef.current.clear();
    };

    const onWebrtcOffer = async ({ from, sdp }) => {
      if (!isSharingSelf || !localStream) return;
      try {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peersRef.current.set(from, pc);

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('webrtc-ice', { to: from, candidate: e.candidate });
          }
        };

        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { to: from, sdp: pc.localDescription });
      } catch (err) {
        console.warn('webrtc-offer handling failed', err);
      }
    };

    const onWebrtcAnswer = async ({ from, sdp }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(sdp);
      }
    };

    const onWebrtcIce = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) {
        await pc.addIceCandidate(candidate).catch(() => {});
      }
    };

    socket.on('webrtc-host-available', onWebrtcHostAvailable);
    socket.on('webrtc-host-stopped', onWebrtcHostStopped);
    socket.on('webrtc-offer', onWebrtcOffer);
    socket.on('webrtc-answer', onWebrtcAnswer);
    socket.on('webrtc-ice', onWebrtcIce);

    return () => {
      socket.off('webrtc-host-available', onWebrtcHostAvailable);
      socket.off('webrtc-host-stopped', onWebrtcHostStopped);
      socket.off('webrtc-offer', onWebrtcOffer);
      socket.off('webrtc-answer', onWebrtcAnswer);
      socket.off('webrtc-ice', onWebrtcIce);
    };
  }, [socket, isSharingSelf, localStream]);

  // VoIP WebRTC signaling handlers
  useEffect(() => {
    if (!socket) return;

    const onVoipPeers = ({ peers }) => {
      peers.forEach((pid) => {
        if (pid !== myId) {
          activeSpeakers.add(pid);
          createVoipOffer(pid);
        }
      });
    };

    const onVoipPeerJoined = ({ id }) => {
      if (id && id !== myId) {
        activeSpeakers.add(id);
        createVoipOffer(id);
      }
    };

    const onVoipPeerLeft = ({ id }) => {
      if (id && id !== myId) {
        activeSpeakers.delete(id);
        const pc = voipPeersRef.current.get(id);
        if (pc) { try { pc.close(); } catch {} }
        voipPeersRef.current.delete(id);
        const a = voipAudiosRef.current.get(id);
        if (a) { try { a.pause(); a.srcObject = null; } catch {} }
        voipAudiosRef.current.delete(id);
      }
    };

    const onVoipOffer = async ({ from, sdp }) => {
      try {
        const pc = getOrCreateVoipPeer(from);
        if (pc.signalingState === 'have-local-offer') {
          if (myId < from) {
            await pc.setLocalDescription({ type: 'rollback' });
          } else {
            return;
          }
        }
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voip-answer', { to: from, sdp: pc.localDescription });
      } catch (err) {
        console.warn('voip-offer failed', err);
      }
    };

    const onVoipAnswer = async ({ from, sdp }) => {
      const pc = voipPeersRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(sdp);
      }
    };

    const onVoipIce = async ({ from, candidate }) => {
      const pc = voipPeersRef.current.get(from);
      if (pc && candidate) {
        await pc.addIceCandidate(candidate).catch(() => {});
      }
    };

    socket.on('voip-peers', onVoipPeers);
    socket.on('voip-peer-joined', onVoipPeerJoined);
    socket.on('voip-peer-left', onVoipPeerLeft);
    socket.on('voip-offer', onVoipOffer);
    socket.on('voip-answer', onVoipAnswer);
    socket.on('voip-ice', onVoipIce);

    return () => {
      socket.off('voip-peers', onVoipPeers);
      socket.off('voip-peer-joined', onVoipPeerJoined);
      socket.off('voip-peer-left', onVoipPeerLeft);
      socket.off('voip-offer', onVoipOffer);
      socket.off('voip-answer', onVoipAnswer);
      socket.off('voip-ice', onVoipIce);
    };
  }, [socket, myId, voipActive, voipStream]);

  const getOrCreateVoipPeer = (peerId) => {
    let pc = voipPeersRef.current.get(peerId);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      voipPeersRef.current.set(peerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket?.emit('voip-ice', { to: peerId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        let audio = voipAudiosRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          voipAudiosRef.current.set(peerId, audio);
        }
        audio.srcObject = e.streams[0];
        audio.muted = !speakerActive;
        audio.volume = speakerActive ? 1 : 0;
        audio.play().catch(() => {});
      };
    }

    if (voipStream) {
      const senders = pc.getSenders();
      const hasAudio = senders.some((s) => s.track && s.track.kind === 'audio');
      if (!hasAudio) {
        voipStream.getTracks().forEach((t) => pc.addTrack(t, voipStream));
      }
    }

    return pc;
  };

  const createVoipOffer = async (peerId) => {
    const pc = voipPeersRef.current.get(peerId);
    if (!pc && myId <= peerId) return;
    if (pc && pc.signalingState !== 'stable' && myId <= peerId) return;

    try {
      const activePc = getOrCreateVoipPeer(peerId);
      const offer = await activePc.createOffer({ offerToReceiveAudio: true });
      await activePc.setLocalDescription(offer);
      socket?.emit('voip-offer', { to: peerId, sdp: activePc.localDescription });
    } catch (err) {
      console.warn('createVoipOffer failed', err);
    }
  };

  useEffect(() => {
    if (voipStream && voipActive) {
      activeSpeakers.forEach((peerId) => {
        const pc = voipPeersRef.current.get(peerId);
        if (pc) {
          const senders = pc.getSenders();
          const hasAudio = senders.some((s) => s.track && s.track.kind === 'audio');
          if (!hasAudio) {
            voipStream.getTracks().forEach((t) => pc.addTrack(t, voipStream));
            createVoipOffer(peerId);
          }
        }
      });
    }
  }, [voipStream, voipActive, activeSpeakers]);

  const toggleMic = async () => {
    if (voipActive) {
      if (voipStream) {
        voipStream.getTracks().forEach((t) => t.stop());
      }
      setVoipStream(null);
      setVoipActive(false);
      socket?.emit('voip-leave');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setVoipStream(stream);
        setVoipActive(true);
        socket?.emit('voip-join');
      } catch (err) {
        alert('Could not access microphone: ' + (err.message || err));
      }
    }
  };

  const toggleSpeaker = () => {
    const next = !speakerActive;
    setSpeakerActive(next);
    voipAudiosRef.current.forEach((audio) => {
      audio.muted = !next;
      audio.volume = next ? 1 : 0;
    });
  };

  const startSharing = async (kind) => {
    if (hostSocketId) {
      alert('Stop the active screen/file share before loading a stream.');
      return;
    }

    try {
      const constraints = {
        video: kind === 'tab' ? { displaySurface: 'browser' } : true,
        audio: true,
      };
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      setLocalStream(stream);
      setIsSharingSelf(true);
      setSource('rtc');
      setSourceType('rtc');

      socket?.emit('webrtc-host-available', { kind });

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      console.warn('Display media capture failed', err);
    }
  };

  const stopSharing = () => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setIsSharingSelf(false);
    setSource(null);
    setSourceType('mp4');
    socket?.emit('webrtc-host-stopped');
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      alert('Room link copied.');
    } catch {
      alert(`Copy failed. Share this URL: ${url}`);
    }
  };

  const handleLoadSource = (e) => {
    e.preventDefault();
    if (!sourceInput.trim()) return;

    let url = sourceInput.trim();
    if (!/^https?:\/\//i.test(url) && /\.\w{2,}/.test(url)) {
      url = 'https://' + url;
    }

    const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const ytId = m ? m[1] : null;

    if (ytId) {
      socket?.emit('set-source', {
        source: ytId,
        sourceType: 'youtube',
        sourcePage: url,
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      });
      return;
    }

    // Bilibili IFrame Bypass
    if (url.includes('bilibili.com') || url.includes('bilibili.tv')) {
      let bvid = url.match(/(?:bvid=|video\/)(BV[a-zA-Z0-9]+)/)?.[1];
      if (bvid) {
        const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1`;
        socket?.emit('set-source', {
          source: embedUrl,
          sourceType: 'iframe',
          sourcePage: url,
          title: 'Bilibili Video',
          thumbnail: null,
        });
        return;
      }
    }

    // Auto-detect extension
    const cleanUrl = url.toLowerCase().split('?')[0].split('#')[0];
    const isDirectMedia = cleanUrl.endsWith('.m3u8') || cleanUrl.endsWith('.m3u') || cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mkv') || cleanUrl.endsWith('.mpd') || /\/manifest\.(m3u8|mpd)/i.test(url) || /format=(m3u8|mpd)/i.test(url);
    
    if (!isDirectMedia) {
      handleExtractUrl(url);
      return;
    }

    let type = 'mp4';
    if (cleanUrl.endsWith('.m3u8') || cleanUrl.endsWith('.m3u') || /\/manifest\.m3u8/i.test(url) || /format=m3u8/i.test(url)) {
      type = 'hls';
    } else if (cleanUrl.endsWith('.mpd') || /\/manifest\.mpd/i.test(url) || /format=mpd/i.test(url)) {
      type = 'dash';
    }

    socket?.emit('set-source', {
      source: url,
      sourceType: type,
      sourcePage: url,
      title: url.split('/').pop() || 'Video Source',
      thumbnail: null,
    });
  };

  const handleStreamLocalFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    setSource(fileUrl);
    setSourceType('mp4');
    setVideoTitle(file.name);
    
    socket?.emit('set-source', {
      source: fileUrl,
      sourceType: 'mp4',
      sourcePage: null,
      title: file.name,
      thumbnail: null,
    });
  };

  // extraction workflows
  const handleExtractUrl = async (overrideUrl) => {
    const targetUrl = typeof overrideUrl === 'string' ? overrideUrl : sourceInput;
    if (!targetUrl.trim()) return;

    // Bilibili IFrame Bypass
    if (targetUrl.includes('bilibili.com') || targetUrl.includes('bilibili.tv')) {
      let bvid = targetUrl.match(/(?:bvid=|video\/)(BV[a-zA-Z0-9]+)/)?.[1];
      if (bvid) {
        const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1`;
        socket?.emit('set-source', {
          source: embedUrl,
          sourceType: 'iframe',
          sourcePage: targetUrl,
          title: 'Bilibili Video',
          thumbnail: null,
        });
        setExtractStatus('Bilibili iframe loaded!');
        setExtractKind('ok');
        return;
      }
    }

    setExtractStatus('Extracting streams...');
    setExtractKind('info');

    try {
      const deepRes = await fetch('/watch-party/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const deepData = await deepRes.json();

      if (deepData.youtube && deepData.videoId) {
        socket?.emit('set-source', {
          source: deepData.videoId,
          sourceType: 'youtube',
          sourcePage: targetUrl,
          title: deepData.title || 'YouTube Video',
          thumbnail: deepData.thumbnail,
        });
        setExtractStatus('YouTube video loaded!');
        setExtractKind('ok');
        return;
      }

      if (deepData.allStreams && deepData.allStreams.length > 0) {
        setScanResults(deepData.allStreams);
        setExtractToken(deepData.proxyToken || '');
        setPasteModalOpen(true);
        setExtractStatus('');
        return;
      }

      if (deepData.streamUrl) {
        let proxiedUrl = deepData.streamUrl;
        try {
          const b64Url = btoa(unescape(encodeURIComponent(deepData.streamUrl)));
          const b64Ref = btoa(unescape(encodeURIComponent(targetUrl)));
          proxiedUrl = `/watch-party/api/hls-proxy?b64=${encodeURIComponent(b64Url)}&r64=${encodeURIComponent(b64Ref)}&ptk=${encodeURIComponent(deepData.proxyToken || '')}`;
        } catch {
          proxiedUrl = `/watch-party/api/hls-proxy?url=${encodeURIComponent(deepData.streamUrl)}&ref=${encodeURIComponent(targetUrl)}&ptk=${encodeURIComponent(deepData.proxyToken || '')}`;
        }
        socket?.emit('set-source', {
          source: proxiedUrl,
          sourceType: deepData.type || 'mp4',
          sourcePage: targetUrl,
          title: deepData.title,
          thumbnail: deepData.thumbnail,
          proxyToken: deepData.proxyToken,
        });
        setExtractStatus('Stream loaded!');
        setExtractKind('ok');
      } else {
        setExtractStatus(deepData.error || 'Extraction failed.');
        setExtractKind('error');
      }
    } catch (err) {
      setExtractStatus(`Network error: ${err.message}`);
      setExtractKind('error');
    }
  };

  const handleScanPasteUrl = async () => {
    setScanning(true);
    setScannerStatus('Scanning for streams...');
    setScannerStatusKind('info');

    // Bilibili IFrame Bypass
    if (scannerUrl.includes('bilibili.com') || scannerUrl.includes('bilibili.tv')) {
      let bvid = scannerUrl.match(/(?:bvid=|video\/)(BV[a-zA-Z0-9]+)/)?.[1];
      if (bvid) {
        const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1`;
        socket?.emit('set-source', {
          source: embedUrl,
          sourceType: 'iframe',
          sourcePage: scannerUrl,
          title: 'Bilibili Video',
          thumbnail: null,
        });
        setPasteModalOpen(false);
        setScannerStatus('');
        setScanning(false);
        return;
      }
    }

    try {
      const res = await fetch('/watch-party/api/fetch-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scannerUrl }),
      });
      const data = await res.json();

      if (data.youtube && data.videoId) {
        socket?.emit('set-source', {
          source: data.videoId,
          sourceType: 'youtube',
          sourcePage: scannerUrl,
          title: data.title || 'YouTube Video',
        });
        setScannerStatus('YouTube video loaded!');
        setScannerStatusKind('ok');
        setPasteModalOpen(false);
      } else if (data.streams && data.streams.length > 0) {
        setScanResults(data.streams);
        setExtractToken(data.proxyToken || '');
        setScannerStatus(`Found ${data.streams.length} stream(s).`);
        setScannerStatusKind('ok');
      } else {
        setScannerStatus('No streams found. Try the Paste HTML tab.');
        setScannerStatusKind('error');
      }
    } catch {
      setScannerStatus('Scan failed.');
      setScannerStatusKind('error');
    } finally {
      setScanning(false);
    }
  };

  const handleScanPasteHtml = async () => {
    setScanning(true);
    setScannerStatus('Finding streams inside HTML...');
    setScannerStatusKind('info');

    try {
      const res = await fetch('/watch-party/api/extract-from-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: pasteHtmlText }),
      });
      const data = await res.json();

      if (data.redirectUrl) {
        setScannerStatus('Embedded server found. Deep extracting...');
        const extRes = await fetch('/watch-party/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: data.redirectUrl }),
        });
        const extData = await extRes.json();
        if (extData.streamUrl) {
          let proxiedUrl = extData.streamUrl;
          try {
            const b64Url = btoa(unescape(encodeURIComponent(extData.streamUrl)));
            const b64Ref = btoa(unescape(encodeURIComponent(data.redirectUrl)));
            proxiedUrl = `/watch-party/api/hls-proxy?b64=${encodeURIComponent(b64Url)}&r64=${encodeURIComponent(b64Ref)}&ptk=${encodeURIComponent(extData.proxyToken || '')}`;
          } catch {
            proxiedUrl = `/watch-party/api/hls-proxy?url=${encodeURIComponent(extData.streamUrl)}&ref=${encodeURIComponent(data.redirectUrl)}&ptk=${encodeURIComponent(extData.proxyToken || '')}`;
          }
          socket?.emit('set-source', {
            source: proxiedUrl,
            sourceType: extData.type || 'mp4',
            sourcePage: extData.sourcePage || data.redirectUrl,
            title: extData.title,
            proxyToken: extData.proxyToken,
          });
          setPasteModalOpen(false);
        } else {
          setScannerStatus('Could not extract stream from embedded server.');
          setScannerStatusKind('error');
        }
      } else if (data.streams && data.streams.length > 0) {
        setScanResults(data.streams);
        setExtractToken('');
        setScannerStatus(`Found ${data.streams.length} streams.`);
        setScannerStatusKind('ok');
      } else {
        setScannerStatus('No streams found.');
        setScannerStatusKind('error');
      }
    } catch {
      setScannerStatus('HTML scan failed.');
      setScannerStatusKind('error');
    } finally {
      setScanning(false);
    }
  };

  const handlePasswordSubmit = () => {
    socket?.emit('join', {
      roomId,
      name: localStorage.getItem('wp-name') || 'Guest',
      password: passwordInput,
      clientId: localStorage.getItem('wp-client-id'),
      avatar: localStorage.getItem('wp-avatar') || '👤',
    });
  };

  const handleRoomOptionsSave = () => {
    socket?.emit('set-room-approval', { enabled: requireApprovalSetting });
    socket?.emit('set-room-public', { enabled: publicToggleSetting });
    socket?.emit('set-slow-mode', { delay: slowModeSetting });
    setSettingsOpen(false);
  };

  return (
    <section id="room" className={`room theme-${theme} bg-style-${windowBgStyle} ${participantsOnLeft ? 'participants-left' : ''}`}>
      {/* Pinned Broadcast Banner */}
      {pinnedMessage && (
        <div id="global-announcement-banner" className="announcement-banner">
          <span className="announcement-icon">📢</span>
          <span id="global-announcement-text" className="announcement-text">{pinnedMessage}</span>
          <button id="global-announcement-close" className="btn btn-ghost" onClick={() => setPinnedMessage('')}>&times;</button>
        </div>
      )}

      <header className="room-header">
        <div className="room-id-block">
          <span className="room-label">{t('room-label')}</span>
          <span id="room-id-display" className="room-id">{roomId}</span>
          <span id="my-role-badge" className={`role-badge role-${myRole}`}>
            {getRoleIcon(myRole)} {getRoleName(myRole)}
          </span>
          <span id="conn-status" className="conn-status">
            <span id="conn-dot" className={`conn-dot ${connected ? '' : 'disconnected'}`} />
          </span>
        </div>

        <div className="room-actions">
          <button id="back-lobby-btn" className="btn btn-ghost leave-action-btn" title="Leave room" onClick={() => {
            if (myRole === 'host') {
              if (confirm('You are the Host. End this room for everyone?')) {
                socket?.emit('end-room');
              }
            }
            onLeave();
          }}>
            {t('room-leave-btn')}
          </button>
          
          <button className="btn btn-ghost" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            🌐 {lang.toUpperCase()}
          </button>

          <button id="speaker-btn" className={`btn btn-ghost ${speakerActive ? 'active' : ''}`} onClick={toggleSpeaker}>
            {speakerActive ? '🔊 Speaker' : '🔇 Muted'}
          </button>
          
          <button id="mic-btn" className={`btn btn-ghost ${voipActive ? 'active' : ''}`} onClick={toggleMic}>
            {voipActive ? '🎙️ On' : '🎙️ Mic'}
          </button>

          <button id="copy-link-btn" className="btn btn-ghost" onClick={handleCopyLink}>
            {t('room-copy-btn')}
          </button>

          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setOptionsMenuOpen(!optionsMenuOpen)}>
              {t('room-options-btn')} ▼
            </button>
            {optionsMenuOpen && (
              <div className="room-options-dropdown" style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
                {canControl && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSettingsOpen(true); setOptionsMenuOpen(false); }}>
                    ⚙️ Settings
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => { socket?.emit('clear-room-logs'); setOptionsMenuOpen(false); }}>
                  🗑️ Clear Logs
                </button>
              </div>
            )}
          </div>

          <button id="toggle-chat-btn" className="btn btn-ghost chat-toggle" onClick={() => setChatOpen(!chatOpen)}>
            <span>{t('room-panel-btn')}</span>
          </button>
        </div>
      </header>

      {/* Options side panel — slides in from right under the header */}
      {optionsMenuOpen && (
        <div
          className="room-options-panel"
          onClick={(e) => { if (e.target === e.currentTarget) setOptionsMenuOpen(false); }}
        >
          <div className="room-options-panel-inner">
            <div className="room-options-panel-header">
              <span>⚙️ Options</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setOptionsMenuOpen(false)}>✕</button>
            </div>

            <button className="room-option-item" onClick={toggleTheme}>
              <span className="room-option-icon">{theme === 'light' ? '☀️' : '🌙'}</span>
              <span>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
              <span className="room-option-badge">{theme === 'light' ? 'ON' : 'OFF'}</span>
            </button>

            <button className="room-option-item" onClick={() => {
              SoundEffects.enabled = !SoundEffects.enabled;
              setSpeakerActive(SoundEffects.enabled);
            }}>
              <span className="room-option-icon">{speakerActive ? '🔊' : '🔇'}</span>
              <span>Sound Effects</span>
              <span className={`room-option-badge ${speakerActive ? 'on' : 'off'}`}>{speakerActive ? 'ON' : 'OFF'}</span>
            </button>

            <button className="room-option-item" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
              <span className="room-option-icon">🌐</span>
              <span>Language</span>
              <span className="room-option-badge">{lang.toUpperCase()}</span>
            </button>

            {canControl && (
              <button className="room-option-item" onClick={() => {
                setSettingsOpen(true);
                setOptionsMenuOpen(false);
              }}>
                <span className="room-option-icon">🚪</span>
                <span>Room Settings</span>
              </button>
            )}

            {(myRole === 'host' || myRole === 'superadmin') && (
              <button className="room-option-item" onClick={() => {
                socket?.emit('set-room-pw', { password: '' });
                setOptionsMenuOpen(false);
              }}>
                <span className="room-option-icon">🔑</span>
                <span>Password</span>
              </button>
            )}

            {(myRole === 'host' || myRole === 'superadmin') && (
              <button className="room-option-item danger" onClick={() => {
                if (confirm('Clear all room logs?')) {
                  socket?.emit('clear-room-logs');
                }
                setOptionsMenuOpen(false);
              }}>
                <span className="room-option-icon">🗑️</span>
                <span>Clear Logs</span>
              </button>
            )}
          </div>
        </div>
      )}

      <main className="room-body">
        <div className="stage">
          <div className="player-shell">
            <VideoPlayer
              source={source}
              sourceType={sourceType}
              sourcePage={sourcePage}
              proxyToken={proxyToken}
              currentTime={currentTime}
              isPlaying={isPlaying}
              canControl={canControl}
              title={videoTitle}
              thumbnail={videoThumbnail}
              hostSocketId={hostSocketId}
              myId={myId}
              onProgress={setCurrentTime}
              onPlayStateChange={setIsPlaying}
              onAutoAdvance={() => socket?.emit('queue-next')}
              rtcStream={rtcStream}
              localStream={localStream}
              isSharingSelf={isSharingSelf}
              mediaVolume={mediaVolume}
            />
          </div>

          {canControl ? (
            <div id="source-bar" className="source-bar">
              <form id="source-form" className="source-form" onSubmit={handleLoadSource}>
                <input
                  id="source-url"
                  type="url"
                  placeholder="YouTube, MP4, HLS .m3u8, DASH .mpd, or video URL"
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                />
                <button id="extract-btn" type="button" className="btn" onClick={handleExtractUrl}>
                  {t('source-extract')}
                </button>
                <button id="paste-source-btn" type="button" className="btn" onClick={() => setPasteModalOpen(true)}>
                  {t('source-paste')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('source-load')}
                </button>

                <div className="history-dropdown-wrapper">
                  <button
                    id="history-dropdown-btn"
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setHistoryDropdownOpen(!historyDropdownOpen)}
                  >
                    🕒
                  </button>
                  {historyDropdownOpen && (
                    <div id="history-dropdown" className="history-dropdown">
                      <div className="history-dropdown-header">Recently Played</div>
                      <div id="history-list" className="history-list">
                        {localHistory.length === 0 ? (
                          <div className="hint" style={{ padding: '8px' }}>No history yet.</div>
                        ) : (
                          localHistory.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="history-item"
                              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                              onClick={() => {
                                setSourceInput(item.url);
                                setHistoryDropdownOpen(false);
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.title || item.url}</div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </form>

              <div className="share-row" style={{ position: 'relative' }}>
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => setMediaDropdownOpen(!mediaDropdownOpen)}
                >
                  📡 Media Controls ▼
                </button>
                {mediaDropdownOpen && (
                  <div className="room-options-dropdown" style={{ bottom: '100%', top: 'auto', left: 0, right: 'auto', minWidth: '180px', zIndex: 100, marginBottom: '8px' }}>
                    <label className="room-option-item">
                      <span className="room-option-icon">📁</span>
                      <span>{t('share-file')}</span>
                      <input id="local-file-input" type="file" accept="video/*" hidden onChange={(e) => { handleStreamLocalFile(e); setMediaDropdownOpen(false); }} />
                    </label>
                    <button id="share-tab-btn" className="room-option-item" onClick={() => { startSharing('tab'); setMediaDropdownOpen(false); }}>
                      <span className="room-option-icon">🌐</span>
                      <span>{t('share-tab')}</span>
                    </button>
                    <button id="share-screen-btn" className="room-option-item" onClick={() => { startSharing('screen'); setMediaDropdownOpen(false); }}>
                      <span className="room-option-icon">🖥️</span>
                      <span>{t('share-screen')}</span>
                    </button>
                    {isSharingSelf && (
                      <button id="stop-share-btn" className="room-option-item danger" onClick={() => { stopSharing(); setMediaDropdownOpen(false); }}>
                        <span className="room-option-icon">🛑</span>
                        <span>{t('share-stop')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {extractStatus && (
                <p id="extract-status" className={`extract-status ${extractKind}`}>
                  {extractStatus}
                </p>
              )}
            </div>
          ) : (
            <div id="viewer-bar" className="source-bar">
              <p className="viewer-hint">Only Host/Admin controls playback. Suggest videos in the Queue tab.</p>
            </div>
          )}
        </div>

        {chatOpen && (
          <ChatBox
            myId={myId}
            myRole={myRole}
            participants={participants}
            queue={queue}
            suggestions={suggestions}
            votes={votes}
            pendingList={pendingList}
            isSuperAdmin={myRole === 'superadmin'}
            hostSocketId={hostSocketId}
            onClose={() => setChatOpen(false)}
            slowModeDelay={slowModeSetting}
            hideJoinLeftAlerts={hideJoinLeftAlerts}
          />
        )}
      </main>

      {/* Password Modal */}
      {passwordModalOpen && (
        <div id="password-modal" className="modal-overlay">
          <div className="modal-card">
            <h3>Password Required</h3>
            <input
              id="password-input"
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            {passwordError && <p id="password-error" className="lobby-error">{passwordError}</p>}
            <div className="modal-actions">
              <button id="password-cancel" className="btn" onClick={onLeave}>Cancel</button>
              <button id="password-submit" className="btn btn-primary" onClick={handlePasswordSubmit}>Join</button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Username Prompt */}
      {promptNameModalOpen && (
        <div id="prompt-name-modal" className="modal-overlay">
          <div className="modal-card">
            <h3>Enter Display Name</h3>
            <p>Please choose a name to join this room.</p>
            <form onSubmit={submitPromptName} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="text"
                placeholder="Display Name..."
                value={promptNameInput}
                onChange={(e) => setPromptNameInput(e.target.value)}
                maxLength={40}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn" onClick={onLeave}>Cancel</button>
                <button type="submit" className="btn btn-primary">Join Room</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Approval Gate */}
      {pendingApproval && (
        <div className="lobby" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="lobby-card">
            <h3>Waiting for Host Approval</h3>
            <p>The host of this room must approve your request to join.</p>
            <button className="btn btn-danger" onClick={onLeave}>Cancel</button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div id="room-settings-modal" className="modal-overlay">
          <div className="modal-card rave-settings-card">
            <div className="rave-settings-header">
              <h3>Preferences</h3>
              <button className="rave-close-btn" onClick={() => setSettingsOpen(false)}>&times;</button>
            </div>
            
            <div className="rave-settings-tabs">
              <button 
                type="button" 
                className={`rave-tab-btn ${activeSettingsTab === 'room' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('room')}
              >
                📹 Room
              </button>
              <button 
                type="button" 
                className={`rave-tab-btn ${activeSettingsTab === 'preferences' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('preferences')}
              >
                ⚙️ Prefs
              </button>
              <button 
                type="button" 
                className={`rave-tab-btn ${activeSettingsTab === 'audio' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('audio')}
              >
                🎙️ Audio
              </button>
            </div>

            <div className="rave-settings-content">
              {activeSettingsTab === 'room' && (
                <div className="rave-settings-panel">
                  <div className="rave-setting-group">
                    <h4>Privacy & Invites</h4>
                    <label className="rave-toggle-row">
                      <span>Public (list room publicly)</span>
                      <input
                        type="checkbox"
                        checked={publicToggleSetting}
                        onChange={(e) => setPublicToggleSetting(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Require Admin Approval to Join</span>
                      <input
                        type="checkbox"
                        checked={requireApprovalSetting}
                        onChange={(e) => setRequireApprovalSetting(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Restrict invites</span>
                      <input
                        type="checkbox"
                        checked={restrictInvites}
                        onChange={(e) => setRestrictInvites(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Hide location</span>
                      <input
                        type="checkbox"
                        checked={hideLocation}
                        onChange={(e) => setHideLocation(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="rave-setting-group">
                    <h4>Playback Controls</h4>
                    <label className="rave-toggle-row">
                      <span>Voting occurs during video</span>
                      <input
                        type="checkbox"
                        checked={playbackVoting}
                        onChange={(e) => setPlaybackVoting(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Mics default to on</span>
                      <input
                        type="checkbox"
                        checked={micsDefaultOn}
                        onChange={(e) => setMicsDefaultOn(e.target.checked)}
                      />
                    </label>
                    <label className="rave-setting-item">
                      <span>Chat Slow Mode</span>
                      <select
                        value={slowModeSetting}
                        onChange={(e) => setSlowModeSetting(parseInt(e.target.value))}
                      >
                        <option value={0}>Off</option>
                        <option value={5}>5s</option>
                        <option value={10}>10s</option>
                        <option value={30}>30s</option>
                      </select>
                    </label>
                  </div>

                  <div className="rave-setting-group">
                    <h4>Visibility & Layout</h4>
                    <label className="rave-toggle-row">
                      <span>Hide join/left messages</span>
                      <input
                        type="checkbox"
                        checked={hideJoinLeftAlerts}
                        onChange={(e) => setHideJoinLeftAlerts(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Participants panel on the left</span>
                      <input
                        type="checkbox"
                        checked={participantsOnLeft}
                        onChange={(e) => setParticipantsOnLeft(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'preferences' && (
                <div className="rave-settings-panel">
                  <div className="rave-setting-group">
                    <h4>General</h4>
                    <label className="rave-setting-item">
                      <span>Language</span>
                      <select value={languageOption} onChange={(e) => setLanguageOption(e.target.value)}>
                        <option value="en">Device Language (English)</option>
                        <option value="ar">العربية (Arabic)</option>
                      </select>
                    </label>
                    <label className="rave-setting-item">
                      <span>Window Background</span>
                      <select value={windowBgStyle} onChange={(e) => setWindowBgStyle(e.target.value)}>
                        <option value="acrylic">Background - Acrylic</option>
                        <option value="solid">Solid Slate</option>
                        <option value="dark">Pure Dark</option>
                      </select>
                    </label>
                    <label className="rave-toggle-row">
                      <span>Auto-Translate Chat</span>
                      <input
                        type="checkbox"
                        checked={autoTranslateChat}
                        onChange={(e) => setAutoTranslateChat(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="rave-setting-group">
                    <h4>Notifications</h4>
                    <label className="rave-toggle-row">
                      <span>Missed Chat Alerts</span>
                      <input
                        type="checkbox"
                        checked={notifyMissedChat}
                        onChange={(e) => setNotifyMissedChat(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Invites Notifications</span>
                      <input
                        type="checkbox"
                        checked={notifyInvites}
                        onChange={(e) => setNotifyInvites(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Clipboard Sharing</span>
                      <input
                        type="checkbox"
                        checked={notifyClipboard}
                        onChange={(e) => setNotifyClipboard(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Direct Messages</span>
                      <input
                        type="checkbox"
                        checked={notifyDMs}
                        onChange={(e) => setNotifyDMs(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="rave-setting-group">
                    <h4>System Info</h4>
                    <label className="rave-setting-item">
                      <span>Update Channel</span>
                      <select value={updateChannel} onChange={(e) => setUpdateChannel(e.target.value)}>
                        <option value="stable">Stable Release</option>
                        <option value="beta">Beta Testing</option>
                      </select>
                    </label>
                    <label className="rave-toggle-row">
                      <span>Precise playback sync</span>
                      <input
                        type="checkbox"
                        checked={preciseSync}
                        onChange={(e) => setPreciseSync(e.target.checked)}
                      />
                    </label>
                    <label className="rave-toggle-row">
                      <span>Custom webview style</span>
                      <input
                        type="checkbox"
                        checked={customWebviewStyle}
                        onChange={(e) => setCustomWebviewStyle(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'audio' && (
                <div className="rave-settings-panel">
                  <div className="rave-setting-group">
                    <h4>Device Configuration</h4>
                    <label className="rave-setting-item">
                      <span>Microphone</span>
                      <select value={selectedInputDevice} onChange={(e) => setSelectedInputDevice(e.target.value)}>
                        <option value="default">Default Input Device</option>
                        {audioInputDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                        ))}
                      </select>
                    </label>
                    <label className="rave-setting-item">
                      <span>Speaker</span>
                      <select value={selectedOutputDevice} onChange={(e) => setSelectedOutputDevice(e.target.value)}>
                        <option value="default">Default Output Device</option>
                        {audioOutputDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker/Headphones'}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rave-setting-group">
                    <h4>Audio Levels</h4>
                    <div className="rave-slider-group">
                      <div className="rave-slider-label">
                        <span>Incoming Voice Volume</span>
                        <span>{incomingVoiceVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={incomingVoiceVolume}
                        onChange={(e) => setIncomingVoiceVolume(parseInt(e.target.value))}
                      />
                    </div>

                    <div className="rave-slider-group">
                      <div className="rave-slider-label">
                        <span>Media Playback Volume</span>
                        <span>{mediaVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={mediaVolume}
                        onChange={(e) => setMediaVolume(parseInt(e.target.value))}
                      />
                    </div>

                    <div className="rave-slider-group">
                      <div className="rave-slider-label">
                        <span>Noise Gate sensitivity</span>
                        <span>{noiseGate}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={noiseGate}
                        onChange={(e) => setNoiseGate(parseInt(e.target.value))}
                      />
                    </div>

                    <label className="rave-toggle-row">
                      <span>AI Noise Suppression</span>
                      <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(e) => setNoiseSuppression(e.target.checked)}
                      />
                    </label>

                    <button 
                      type="button" 
                      className="btn btn-ghost rave-test-btn"
                      onClick={() => {
                        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        gain.gain.setValueAtTime(0.1 * (mediaVolume / 100), audioCtx.currentTime);
                        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
                        osc.start();
                        osc.stop(audioCtx.currentTime + 0.5);
                      }}
                    >
                      🔊 Test Speaker Sound
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setSettingsOpen(false)}>Close</button>
              <button className="btn btn-primary" onClick={handleRoomOptionsSave}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Extraction Paste Modal */}
      {pasteModalOpen && (
        <div id="paste-source-modal" className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="scanner-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`scanner-tab ${activeScannerTab === 'url' ? 'active' : ''}`}
                onClick={() => { setActiveScannerTab('url'); setScanResults(null); setScannerStatus(''); }}
              >
                Scan URL
              </button>
              <button
                type="button"
                className={`scanner-tab ${activeScannerTab === 'html' ? 'active' : ''}`}
                onClick={() => { setActiveScannerTab('html'); setScanResults(null); setScannerStatus(''); }}
              >
                Paste HTML
              </button>
            </div>

            {activeScannerTab === 'url' ? (
              <div id="scanner-tab-url" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="url"
                  placeholder="Paste video page URL..."
                  value={scannerUrl}
                  onChange={(e) => setScannerUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleScanPasteUrl} disabled={scanning}>
                  Scan
                </button>
              </div>
            ) : (
              <div id="scanner-tab-html" style={{ marginBottom: '12px' }}>
                <textarea
                  placeholder="Paste page HTML source here..."
                  value={pasteHtmlText}
                  onChange={(e) => setPasteHtmlText(e.target.value)}
                  style={{ width: '100%', height: '150px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}
                />
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={handleScanPasteHtml} disabled={scanning}>
                  Find Streams
                </button>
              </div>
            )}

            {scannerStatus && (
              <p className={`extract-status ${scannerStatusKind}`} style={{ margin: '8px 0' }}>
                {scannerStatus}
              </p>
            )}

            {scanResults && (
              <div id="scanner-results" style={{ textAlign: 'left', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg)', padding: '8px', borderRadius: '8px' }}>
                {scanResults.map((s, idx) => {
                  const targetPage = scannerUrl || pasteHtmlText ? 'Scan Result' : 'Extracted Stream';
                  let proxiedUrl = s.url;
                  try {
                    const b64Url = btoa(unescape(encodeURIComponent(s.url)));
                    const b64Ref = btoa(unescape(encodeURIComponent(targetPage)));
                    proxiedUrl = `/watch-party/api/hls-proxy?b64=${encodeURIComponent(b64Url)}&r64=${encodeURIComponent(b64Ref)}&ptk=${encodeURIComponent(extractToken)}`;
                  } catch {
                    proxiedUrl = `/watch-party/api/hls-proxy?url=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(targetPage)}&ptk=${encodeURIComponent(extractToken)}`;
                  }
                  
                  return (
                    <button
                      key={idx}
                      className="btn scanner-stream-btn"
                      style={{ width: '100%', textAlign: 'left', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px' }}
                      onClick={() => {
                        socket?.emit('set-source', {
                          source: proxiedUrl,
                          sourceType: s.type || 'mp4',
                          title: s.label || 'Stream',
                          proxyToken: extractToken,
                        });
                        setPasteModalOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`stream-badge stream-badge-${s.type}`}>{s.type.toUpperCase()}</span>
                        <span>{s.label || 'Stream'}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--subtext)', display: 'flex', gap: '12px' }}>
                        {s.sizeMb && <span>📦 {s.sizeMb} MB</span>}
                        {s.durationSec && <span>⏱️ {Math.floor(s.durationSec / 60)}:{(s.durationSec % 60).toString().padStart(2, '0')}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn" onClick={() => setPasteModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
