
-- ============================================
-- ARCADE Event Platform — Complete Schema
-- ============================================

-- ==================
-- ENUMS
-- ==================
CREATE TYPE public.app_role AS ENUM ('admin', 'shopper', 'participant');
CREATE TYPE public.card_rarity AS ENUM ('ordinary', 'rare', 'epic', 'legendary');
CREATE TYPE public.card_type AS ENUM ('enhancement', 'manipulation', 'penalizing', 'protection', 'recovery', 'economic', 'hint_single', 'hint_combined', 'mandatory');
CREATE TYPE public.coffre_type AS ENUM ('game_reward', 'quest_reward', 'admin_gift', 'store_purchase');
CREATE TYPE public.trade_request_type AS ENUM ('trade', 'sell', 'buy');
CREATE TYPE public.trade_request_status AS ENUM ('pending', 'approved', 'rejected', 'completed');
CREATE TYPE public.quest_team_status AS ENUM ('in_progress', 'completed', 'reward_claimed');
CREATE TYPE public.notification_type AS ENUM ('coffre_awarded', 'card_activated', 'trade_completed', 'trade_rejected', 'shop_window', 'ranking_visibility', 'announcement', 'quest_completed', 'winner_declared');

-- ==================
-- TIMESTAMP TRIGGER
-- ==================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==================
-- USER ROLES TABLE
-- ==================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- ==================
-- TEAMS TABLE (participant profiles)
-- ==================
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  team_name TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL DEFAULT 0,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Anyone authenticated can view teams" ON public.teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own team" ON public.teams
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own team" ON public.teams
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update any team" ON public.teams
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete teams" ON public.teams
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- CARDS CATALOGUE
-- ==================
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  card_type card_type NOT NULL,
  rarity card_rarity NOT NULL DEFAULT 'ordinary',
  point_value INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  is_exclusive BOOLEAN NOT NULL DEFAULT false,
  hint_content TEXT,
  combine_group_id UUID,
  combine_result_content TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Anyone authenticated can view cards" ON public.cards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage cards" ON public.cards
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- CARD COMBINE GROUPS
-- ==================
CREATE TABLE public.combine_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  combined_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.combine_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view combine groups" ON public.combine_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage combine groups" ON public.combine_groups
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- TEAM CARD INVENTORY
-- ==================
CREATE TABLE public.team_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, card_id)
);
ALTER TABLE public.team_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams can view own cards" ON public.team_cards
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
  );
CREATE POLICY "Admins can manage team cards" ON public.team_cards
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert team cards" ON public.team_cards
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
    OR team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
  );
CREATE POLICY "System can update team cards" ON public.team_cards
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
  );

-- ==================
-- COFFRE TIERS
-- ==================
CREATE TABLE public.coffre_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rank_label TEXT NOT NULL DEFAULT '',
  card_count INTEGER NOT NULL DEFAULT 3,
  ordinary_weight NUMERIC NOT NULL DEFAULT 60,
  rare_weight NUMERIC NOT NULL DEFAULT 25,
  epic_weight NUMERIC NOT NULL DEFAULT 12,
  legendary_weight NUMERIC NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coffre_tiers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_coffre_tiers_updated_at BEFORE UPDATE ON public.coffre_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Anyone authenticated can view tiers" ON public.coffre_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage tiers" ON public.coffre_tiers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- COFFRES (gifts)
-- ==================
CREATE TABLE public.coffres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  tier_id UUID REFERENCES public.coffre_tiers(id),
  coffre_type coffre_type NOT NULL DEFAULT 'game_reward',
  source_label TEXT,
  is_opened BOOLEAN NOT NULL DEFAULT false,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coffres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams can view own coffres" ON public.coffres
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Teams can update own coffres" ON public.coffres
  FOR UPDATE TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can manage coffres" ON public.coffres
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- COFFRE CARDS (contents revealed after opening)
-- ==================
CREATE TABLE public.coffre_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coffre_id UUID REFERENCES public.coffres(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coffre_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams can view own coffre cards" ON public.coffre_cards
  FOR SELECT TO authenticated USING (
    coffre_id IN (
      SELECT c.id FROM public.coffres c
      JOIN public.teams t ON c.team_id = t.id
      WHERE t.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admins can manage coffre cards" ON public.coffre_cards
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- SIDE QUESTS
-- ==================
CREATE TABLE public.side_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme TEXT,
  reward_card_id UUID REFERENCES public.cards(id),
  max_slots INTEGER NOT NULL DEFAULT 5,
  slots_filled INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.side_quests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_side_quests_updated_at BEFORE UPDATE ON public.side_quests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Anyone authenticated can view published quests" ON public.side_quests
  FOR SELECT TO authenticated USING (is_published = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage quests" ON public.side_quests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- QUEST TEAM STATUS
-- ==================
CREATE TABLE public.quest_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES public.side_quests(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  status quest_team_status NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id, team_id)
);
ALTER TABLE public.quest_teams ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_quest_teams_updated_at BEFORE UPDATE ON public.quest_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Teams can view own quest status" ON public.quest_teams
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Teams can insert own quest registration" ON public.quest_teams
  FOR INSERT TO authenticated WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can manage quest teams" ON public.quest_teams
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- CARD ACTIVATIONS
-- ==================
CREATE TABLE public.card_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  target_team_id UUID REFERENCES public.teams(id),
  card_name TEXT NOT NULL,
  card_rarity card_rarity NOT NULL DEFAULT 'ordinary',
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.card_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams can view own activations" ON public.card_activations
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR target_team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Teams can insert own activations" ON public.card_activations
  FOR INSERT TO authenticated WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can manage activations" ON public.card_activations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- TRADE REQUESTS
-- ==================
CREATE TABLE public.trade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  request_type trade_request_type NOT NULL,
  offered_card_id UUID REFERENCES public.cards(id),
  wanted_card_id UUID REFERENCES public.cards(id),
  target_team_id UUID REFERENCES public.teams(id),
  price INTEGER,
  status trade_request_status NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  processed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trade_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_trade_requests_updated_at BEFORE UPDATE ON public.trade_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Teams can view own trade requests" ON public.trade_requests
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR target_team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
  );
CREATE POLICY "Teams can insert own trade requests" ON public.trade_requests
  FOR INSERT TO authenticated WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
  );
CREATE POLICY "Shoppers can update trade requests" ON public.trade_requests
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'shopper')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ==================
-- STORE INVENTORY (cards available for purchase)
-- ==================
CREATE TABLE public.store_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  listed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view store" ON public.store_inventory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and shoppers can manage store" ON public.store_inventory
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
  );

-- ==================
-- POINT LOGS
-- ==================
CREATE TABLE public.point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  admin_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams can view own point logs" ON public.point_logs
  FOR SELECT TO authenticated USING (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admins can manage point logs" ON public.point_logs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- NOTIFICATIONS
-- ==================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- ==================
-- ANNOUNCEMENTS
-- ==================
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active announcements" ON public.announcements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==================
-- PLATFORM SETTINGS
-- ==================
CREATE TABLE public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage settings" ON public.platform_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('registration_open', 'true'::jsonb),
  ('ranking_visible', 'true'::jsonb),
  ('trading_window_open', 'false'::jsonb),
  ('winner_declared', 'false'::jsonb),
  ('winner_team_id', 'null'::jsonb),
  ('fairness_boost_threshold', '5'::jsonb),
  ('fairness_boost_multiplier', '2'::jsonb),
  ('activation_window_open', 'true'::jsonb);

-- ==================
-- ENABLE REALTIME
-- ==================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coffres;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_activations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_inventory;

-- ==================
-- AUTO-CREATE TEAM PROFILE ON SIGNUP (trigger)
-- ==================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.teams (user_id, team_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'team_name', 'Team_' || LEFT(NEW.id::text, 8)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'participant');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================
-- INSERT DEFAULT COFFRE TIERS
-- ==================
INSERT INTO public.coffre_tiers (name, rank_label, card_count, ordinary_weight, rare_weight, epic_weight, legendary_weight) VALUES
  ('Rank 1 - Champion', '1st Place', 5, 20, 30, 30, 20),
  ('Rank 2 - Runner Up', '2nd Place', 4, 30, 30, 25, 15),
  ('Rank 3 - Third', '3rd Place', 4, 40, 30, 20, 10),
  ('Rank 4 - Participant', '4th+', 3, 55, 25, 15, 5),
  ('Quest Reward', 'Quest', 2, 0, 0, 0, 0);
