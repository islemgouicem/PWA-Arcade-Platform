# 🎮 ARCADE Event Platform (2026)

A mobile-first **Progressive Web App (PWA)** built for the ARCADE 2026 strategic event by the Skill & Tell Scientific Club.

👉 Live Demo: https://arcade-platform-pi.vercel.app/

---

## 🚀 Overview

The ARCADE Platform is a real-time event management system designed to transform a physical competition into a fully digital, interactive experience.

It connects **participants, admins, mini-game masters, and zone handlers** in one unified system where everything is tracked live: progression, points, health, cards, and rankings.

---

## ⚙️ Core Concept

Instead of managing the event manually, the platform enables:

- Real-time gameplay tracking
- Strategic team progression
- Dynamic missions and mini-games
- Card-based mechanics
- Health/infection system
- Live leaderboard updates

All running through a **PWA experience (installable on mobile & desktop)**.

---

## 👥 User Roles

### 🧑 Participants (Teams)
- Join missions and mini-games
- Explore missions with zones and challenges
- Manage health status
- Use and buy cards
- View rankings and progress in real time

### 🎮 Mini-Game Masters
- Submit team rankings after games
- Automatically trigger point distribution

### 🧭 Zone Handlers
- Monitor zone entries/exits
- Validate participant actions
- Control infection-based zones

### 🛠️ Admins
- Full event control panel
- Manage missions, cards, zones, and users
- Broadcast announcements
- Control rankings and system settings

---

## 🧭 Key Features

### 🧩 Missions System
- 6 structured missions with progression logic
- Some missions include infected zones
- Health decreases over time inside zones
- Password-based mission completion
- Sequential and conditional mission unlocking

---

### 🧟 Zone System
- Infection zones reduce team health in real time
- Zone entry/exit is tracked and validated
- Health system fully backend-driven (Supabase)
- Supports multiple zones per mission

---

### 🎮 Mini-Games
- Teams join active mini-games
- Masters submit rankings
- Automatic point allocation system
- Multiple teams can share ranks

---

### 🃏 Card System
- Attack / Defend / Heal / Hint cards
- Cards are purchasable via in-app shop
- Admin controls pricing & availability
- Cards influence gameplay (health, attacks, protection)

---

### 🏪 Shop System
- Built-in card marketplace
- Admin-controlled inventory & pricing
- Toggle card visibility for participants

---

### 📊 Live Leaderboard
- Real-time ranking based on points
- Updates instantly after missions & mini-games
- Fully synced across all users

---

### 🔔 Real-Time System
- Powered by Supabase Realtime
- Live updates for:
  - Health changes
  - Points updates
  - Mission progression
  - Card actions

---

### 🔐 Security
- Secure authentication system (Supabase Auth)
- Protection against brute-force password attempts
- Role-based access control (RBAC)
- Server-side validation for critical actions

---

### 📱 PWA Features
- Installable like a native app
- Mobile-first design
- Offline-friendly structure (partial caching support)
- Real-time sync when reconnected

---

## 🛠️ Tech Stack

- Frontend: React + modern UI framework
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- Hosting: Vercel
- Architecture: PWA + real-time event-driven system

---

## 🎯 Highlights

- Fully real-time multiplayer event system
- Strategy-based gameplay (health, zones, cards)
- Multi-role ecosystem
- Secure backend logic
- Scalable event architecture

---

## 🧠 Vision

The platform was designed to replace manual event management with a fully interactive digital ecosystem where competition becomes dynamic, strategic, and immersive.

---

## 📌 Status

Completed for ARCADE 2026 event execution.

---

## 💡 Credits

Built by the IT Department of Skill & Tell Scientific Club.
