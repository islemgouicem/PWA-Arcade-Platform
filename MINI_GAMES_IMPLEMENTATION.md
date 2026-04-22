# Mini-Games System - Implementation Guide

## Overview

A comprehensive individual user-based mini-games system integrated into the Arcade Survival Gear platform. Players can participate in mini-games, earn points based on ranking positions, and compete on leaderboards.

## System Architecture

### Database Schema

#### Tables

- **mini_games**: Core mini-game definitions
  - `id` (UUID, PK)
  - `name` (TEXT, UNIQUE)
  - `holder_password_hash` (TEXT) - Encrypted holder authentication password
  - `is_open` (BOOLEAN) - Whether the game is accepting participants
  - `created_at`, `updated_at` (TIMESTAMPTZ)

- **mini_game_participants**: Tracks individual participation
  - `id` (UUID, PK)
  - `mini_game_id` (UUID, FK)
  - `user_id` (UUID, FK)
  - `current_rank` (INTEGER) - Player's rank in game (1-12)
  - `points_earned` (INTEGER) - Points awarded by holder
  - `created_at`, `updated_at` (TIMESTAMPTZ)
  - Unique constraint: (mini_game_id, user_id)

- **mini_game_rank_points**: Ranking point configurations
  - `id` (UUID, PK)
  - `mini_game_id` (UUID, FK)
  - `rank_position` (INTEGER) - Rank number (1-12)
  - `points_awarded` (INTEGER) - Points for this rank
  - Unique constraint: (mini_game_id, rank_position)

### Core RPC Functions

#### `check_mini_game_password(p_game_id UUID, p_password TEXT) → BOOLEAN`

- Verifies holder password for a game
- Uses pgcrypto's `crypt()` for secure comparison
- Returns true if password matches, false otherwise

#### `crypt_generate(p_password TEXT) → TABLE(hashed_password TEXT)`

- Generates password hash for storage
- Uses bcrypt hashing via `gen_salt('bf')`
- Called when creating new games

## Components

### 1. AdminMiniGamesTab.tsx

**Location**: `src/pages/AdminMiniGamesTab.tsx`

**Purpose**: Admin panel for managing mini-games

**Features**:

- Create new mini-games with password
- Toggle games open/closed
- Configure rank-to-points mappings (ranks 1-12)
- Copy passwords to clipboard
- Inline form management with animation

**Key Functions**:

- `createGame()`: Creates mini-game with password hash
- `toggleGameActive()`: Opens/closes a game
- `loadGameForEditing()`: Loads ranking mappings for editing
- `saveRankMapping()`: Updates rank point configurations

**UI Components**:

- Game creation card with form
- Game listing with status badges
- RankMappingEditor modal with grid layout

### 2. ParticipantMiniGamesPage.tsx

**Location**: `src/pages/ParticipantMiniGamesPage.tsx`

**Purpose**: Player interface for joining and tracking mini-games

**Features**:

- Browse open mini-games
- Join games with holder password
- Track personal participation status
- View current rank and points earned
- Show last update timestamp

**Key Functions**:

- `joinGame()`: Validates password and adds participant
- Query for open games (is_open = true)
- Query for user's participations
- Real-time status display

**UI Components**:

- Available games list with join buttons
- Participant progress cards
- Password entry form
- Status badges (Active/Inactive)

### 3. HolderMiniGamesPage.tsx

**Location**: `src/pages/HolderMiniGamesPage.tsx`

**Purpose**: Game holder interface for managing participant ranks/points

**Features**:

- Authenticate as game holder (password required)
- View all participants in game
- Update individual ranks (1-12) with ±1 buttons
- Update points earned with ±1 buttons
- Bulk save with pending indicators
- Exit authentication

**Key Functions**:

- `authenticateAsHolder()`: Password verification
- `updateParticipant()`: Local state updates
- `saveParticipantUpdates()`: Bulk database updates
- `resetForm()`: Clear authentication and updates

**UI Components**:

- Authentication card
- Participant edit cards with increment/decrement buttons
- Pending update indicators
- Save button with update counter

## Integration

### Routes

- Existing route `/mini-games` → ParticipantMiniGamesPage (for participants)
- Existing route `/mini-game-holder` → HolderMiniGamesPage (for game holders)
- Admin dashboard tab → `?tab=mini-games` → AdminMiniGamesTab

### Navigation

- Added "Mini-Games" link to admin navigation (AppLayout)
- Existing participant navigation includes mini-games link
- Existing holder navigation includes mini-game-holder link

### Supabase Integration

- Uses `@tanstack/react-query` for data fetching and caching
- Implements Row Level Security (RLS) policies
- Password validation via RPC functions
- Automatic timestamp updates via trigger

## Data Flow

### Creating a Game (Admin)

```
Admin creates game → Password hashed via crypt_generate() →
Stored in mini_games → Admin can configure rank mappings →
Game set to is_open = true → Players can join
```

### Joining a Game (Participant)

```
Player enters holder password → check_mini_game_password() validates →
mini_game_participants record created (rank=12, points=0) →
Player joins successfully
```

### Updating Rankings (Holder)

```
Holder authenticates → Password verified → Loads participants →
Holder updates ranks/points locally → Saves bulk updates →
mini_game_participants records updated
```

## Security Considerations

1. **Password Protection**
   - Holder password hashed using bcrypt (cfb)
   - Secure comparison via pgcrypto
   - Passwords never stored in plaintext

2. **Row Level Security (RLS)**
   - Users can only view/edit their own participation
   - Holders/admins can view all participants
   - Admin-only operations restricted

3. **Authentication**
   - Game-specific password validation
   - Per-user participation tracking
   - Audit trail via created_at/updated_at

## UI/UX Features

- **Animations**: Framer Motion transitions for card appearance
- **Loading States**: React Query loading indicators
- **Toast Notifications**: Sonner for user feedback
- **Responsive Design**: Tailwind CSS grid layouts
- **Dark Mode**: Follows existing theme system
- **Accessibility**: Proper labels, ARIA attributes

## Usage Examples

### For Admins

1. Go to Admin Dashboard → Mini-Games tab
2. Click "Create Mini-Game"
3. Enter game name and holder password
4. Save the password (show to game holder)
5. Click "Configure Ranking Points"
6. Set points for each rank position
7. Toggle "Open" to enable participant signups

### For Participants

1. Go to Mini-Games page
2. See list of open games
3. Click "Join Game"
4. Enter holder password
5. View progress in "My Games" section
6. Monitor rank and points

### For Game Holders

1. Go to Mini-Game Holder page
2. Select game and enter holder password
3. Authenticate
4. View all participants
5. Update ranks/points for each player
6. Save changes
7. Exit to deauthenticate

## Testing Checklist

- [ ] Create mini-game with password
- [ ] Generate and store password hash
- [ ] Toggle game open/closed
- [ ] Participant joins game successfully
- [ ] Invalid password rejected
- [ ] Holder views participants
- [ ] Holder updates rank and points
- [ ] Bulk updates saved correctly
- [ ] RLS policies enforced
- [ ] Animations smooth
- [ ] Toast notifications display
- [ ] Query caching works

## Future Enhancements

1. **Automatic Points Calculation**: Use mini_game_rank_points to auto-calculate
2. **Leaderboard**: Real-time rankings across all games
3. **Achievements**: Badges for participation milestones
4. **Notifications**: Alert players of rank changes
5. **Game Templates**: Preset point configurations
6. **Bulk Import**: CSV upload for participant data
7. **Game History**: Archive completed games
8. **Analytics Dashboard**: Points earned by time period

## Migration Notes

Requires migration: `20260418000000_mini_games_participant_system.sql`

- Creates mini_game_participants table
- Creates RPC functions
- Sets up RLS policies
- Enables audit triggers
