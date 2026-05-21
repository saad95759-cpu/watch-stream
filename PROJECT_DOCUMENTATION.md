# Watch Stream - Technical Project Documentation

## 1. Tech Stack & Architecture

### **Overview**
Watch Stream is a high-performance, real-time synchronized video playback and communication application. It enables users to securely host watch parties for a wide variety of video sources, offering advanced access controls and a granular Super Admin infrastructure.

### **Frontend Architecture**
- **Core Technology**: Vanilla JavaScript (ES6+), HTML5, and CSS3. 
- **Design System**: A fully responsive, mobile-first design leveraging CSS variables for dynamic theming (Dark Mode) and Flexbox/CSS Grid for layout management.
- **State Management**: Client-side state is primarily managed via DOM interactions, HTML5 LocalStorage, and SessionStorage to track user identity (`wp-name`) and active room keys. 

### **Backend Architecture**
- **Server Environment**: Node.js utilizing Express.js for static asset delivery and REST API routing.
- **Real-time Communication**: WebSocket architecture powered by **Socket.io**. The server handles bi-directional, low-latency events for playback state synchronization, VoIP signaling, and chat bridging.
- **Data Persistence**: 
  - Volatile/In-Memory: Active room states, participant lists, and ephemeral chat messages are held in a highly-optimized JavaScript `Map`.
  - Persistent: Administrative logs and historical data are durably written to flat JSON files (`data/room_logs.json` and `data/history.json`).

---

## 2. Core Room Features

### **Room Instantiation**
- Rooms are instantiated explicitly through an API `POST` to `/api/rooms`. 
- **Identifiers**: Each room generates a cryptographically secure hex ID (e.g., `4-byte crypto.randomBytes`) instead of sequential integers, minimizing room predictability.

### **Media Synchronization**
- **State Vector**: The server maintains a central state vector for each room (Current Video Source, Playback Time, Play/Pause Status, Timestamp of Last Update).
- **Time Projection**: To account for network latency, the server uses a "Projected Time" mechanic (`projectedTime(room)`) estimating the exact playhead position based on the server clock before broadcasting to late-joining clients.
- **Native Iframes & Media Quality**: Bypasses traditional server scraping by utilizing secure Client-Side IFrame Embeds and Cookie Forwarding to natively support HLS streams.

### **Interactivity**
- **Chat System**: Real-time text communications and builtin Sticker sharing over WebSockets.
- **VoIP**: Built-in peer-to-peer WebRTC Audio channels for voice communication inside the party.

---

## 3. Security & Access Control

### **Implicit Room Prevention**
- The application implements strict **404 Reject Logic**. If a user alters the URL parameter (e.g., `/watch-party/r/invalid-id`) and attempts to negotiate a socket connection, the server checks the active `Map` via `rooms.get(roomId)`. If the room does not exist, the socket forcibly emits a `join-error` with a `not-found` reason, instantly redirecting the frontend back to the homepage.

### **Security Headers & Scoping**
- Uses **Content Security Policy (CSP)** and `X-Frame-Options: SAMEORIGIN` to mitigate Cross-Site Scripting (XSS) and Clickjacking attacks.

---

## 4. Authentication & Entry Flows

### **Strict Guest Auth Flow**
- Before accessing any WebSocket room data, users must pass a rigorous Display Name validation.
- Validated via a Unicode-aware Regular Expression: `/^(?=.*[a-zA-Z])[a-zA-Z0-9\s\-_]{3,40}$/`.
- **Backend Validation**: To prevent cURL/API bypassing, the `join` socket event re-evaluates the name string. Invalid inputs result in an immediate socket rejection.

### **Double-Lock Entry Flow**
- Users entering a restricted room must successfully navigate two sequential security gates before joining the broadcast stream:
  1. **Password Authentication**: Provide the correct cryptographic key/password matching the Room's state.
  2. **Waiting Room (Host Approval)**: If `requireApproval` is toggled by the Host, valid passwords only grant users a "Knocking" state (`approval-pending`). They are held in a purgatory UI state and are not provided media, chat, or participant data until the Host explicitly accepts them.

---

## 5. Super Admin Privileges

The platform features an omnipotent Super Admin role, authenticated via strict Environment Variables (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), granting cross-room authority.

### **Ghost Mode**
- The Admin's session includes an `isSuperAdmin` flag.
- **Stealth Observation**: Super Admins do not trigger `user-joined` or `user-left` broadcast events to the room. They are hidden from the public `participants` array, allowing invisible monitoring.
- **Action Masking**: When an Admin force-kicks a user or updates the video state, the server masks the event (e.g., emitting a generic *"Room updated by System"* or *"Connection closed by Admin"*) instead of exposing the Admin's display name.

### **Administrative Actions**
- **Dashboard UI**: Dedicated `index.html#admin-dashboard` interface tracking all active AND closed rooms.
- **Remote State Editing**: Ability to remotely delete rooms, force-evict participants, and instantly review deep room logs.
- **Global Eviction**: A single Super Admin login automatically evicts any previous, stale Admin sessions to prevent credential sharing.

---

## 6. Auditing & Logs

A highly robust, dual-tier logging architecture:

### **Ephemeral User Logs**
- Bound by session memory. 
- Regular participants only receive a maximum of 50 cached historical events (like previous videos played) held directly within the `room.history` Array.
- Destroyed when the room becomes completely empty and expires.

### **Persistent Admin Logs**
- Bound to durable storage via `data/room_logs.json`.
- Logs every granular socket event inside a room: `chat`, `system` (joins/leaves/Ghost activities), and `video` changes.
- Can store up to 1000 events per room code.
- **Dashboard Accessibility**: The Super Admin can query the historical lifecycle of both Active and previously Closed rooms on-demand through the UI modal using the `admin-fetch-room-logs` endpoint.

---

## 7. Known Missing Features / TODOs

While highly capable, the application has the following architectural considerations for future development:
1. **Database Migration**: Currently, rooms and logs use a Node.js `Map` and flat JSON files. Scaling horizontally (clustering/multi-server) will require migrating this state to **Redis** (for active rooms/PubSub) and **PostgreSQL/SQLite** (for persistent room logs and admin credentials).
2. **Session Persistence**: Guest display names are tied to `localStorage`. Implementing an actual User Account system (JWTs, OAuth) would provide persistent avatars, friends lists, and better ban-tracking (via DB rather than temporary socket/IP blocklists).
3. **Automated Content Moderation**: Chat payloads are logged but not actively filtered. Implementing an automated bad-word filter or rate-limiter for sticker abuse could improve the hands-off moderation experience.
4. **Bandwidth Limitations for VoIP**: Current VoIP uses basic WebRTC mesh networking. For rooms with many participants (>10), a dedicated Selective Forwarding Unit (SFU) like Mediasoup would significantly reduce client bandwidth constraints.
