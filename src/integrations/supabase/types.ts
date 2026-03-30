export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
        }
        Relationships: []
      }
      card_activations: {
        Row: {
          cancelled_at: string | null
          card_id: string
          card_name: string
          card_rarity: Database["public"]["Enums"]["card_rarity"]
          created_at: string
          id: string
          is_cancelled: boolean
          target_team_id: string | null
          team_id: string
        }
        Insert: {
          cancelled_at?: string | null
          card_id: string
          card_name: string
          card_rarity?: Database["public"]["Enums"]["card_rarity"]
          created_at?: string
          id?: string
          is_cancelled?: boolean
          target_team_id?: string | null
          team_id: string
        }
        Update: {
          cancelled_at?: string | null
          card_id?: string
          card_name?: string
          card_rarity?: Database["public"]["Enums"]["card_rarity"]
          created_at?: string
          id?: string
          is_cancelled?: boolean
          target_team_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_activations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_activations_target_team_id_fkey"
            columns: ["target_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_activations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          card_type: Database["public"]["Enums"]["card_type"]
          combine_group_id: string | null
          combine_result_content: string | null
          created_at: string
          description: string
          hint_content: string | null
          id: string
          image_url: string | null
          is_exclusive: boolean
          is_mandatory: boolean
          name: string
          point_value: number
          rarity: Database["public"]["Enums"]["card_rarity"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          card_type: Database["public"]["Enums"]["card_type"]
          combine_group_id?: string | null
          combine_result_content?: string | null
          created_at?: string
          description?: string
          hint_content?: string | null
          id?: string
          image_url?: string | null
          is_exclusive?: boolean
          is_mandatory?: boolean
          name: string
          point_value?: number
          rarity?: Database["public"]["Enums"]["card_rarity"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          card_type?: Database["public"]["Enums"]["card_type"]
          combine_group_id?: string | null
          combine_result_content?: string | null
          created_at?: string
          description?: string
          hint_content?: string | null
          id?: string
          image_url?: string | null
          is_exclusive?: boolean
          is_mandatory?: boolean
          name?: string
          point_value?: number
          rarity?: Database["public"]["Enums"]["card_rarity"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coffre_cards: {
        Row: {
          card_id: string
          coffre_id: string
          created_at: string
          id: string
        }
        Insert: {
          card_id: string
          coffre_id: string
          created_at?: string
          id?: string
        }
        Update: {
          card_id?: string
          coffre_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coffre_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coffre_cards_coffre_id_fkey"
            columns: ["coffre_id"]
            isOneToOne: false
            referencedRelation: "coffres"
            referencedColumns: ["id"]
          },
        ]
      }
      coffre_tiers: {
        Row: {
          card_count: number
          created_at: string
          epic_weight: number
          id: string
          legendary_weight: number
          name: string
          ordinary_weight: number
          rank_label: string
          rare_weight: number
          updated_at: string
        }
        Insert: {
          card_count?: number
          created_at?: string
          epic_weight?: number
          id?: string
          legendary_weight?: number
          name: string
          ordinary_weight?: number
          rank_label?: string
          rare_weight?: number
          updated_at?: string
        }
        Update: {
          card_count?: number
          created_at?: string
          epic_weight?: number
          id?: string
          legendary_weight?: number
          name?: string
          ordinary_weight?: number
          rank_label?: string
          rare_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      coffres: {
        Row: {
          coffre_type: Database["public"]["Enums"]["coffre_type"]
          created_at: string
          id: string
          is_opened: boolean
          opened_at: string | null
          source_label: string | null
          team_id: string
          tier_id: string | null
        }
        Insert: {
          coffre_type?: Database["public"]["Enums"]["coffre_type"]
          created_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          source_label?: string | null
          team_id: string
          tier_id?: string | null
        }
        Update: {
          coffre_type?: Database["public"]["Enums"]["coffre_type"]
          created_at?: string
          id?: string
          is_opened?: boolean
          opened_at?: string | null
          source_label?: string | null
          team_id?: string
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coffres_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coffres_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "coffre_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      combine_groups: {
        Row: {
          combined_content: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          combined_content?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          combined_content?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          team_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          team_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          team_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      point_logs: {
        Row: {
          admin_user_id: string | null
          amount: number
          created_at: string
          id: string
          reason: string
          team_id: string
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          created_at?: string
          id?: string
          reason?: string
          team_id: string
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_teams: {
        Row: {
          created_at: string
          id: string
          quest_id: string
          status: Database["public"]["Enums"]["quest_team_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          quest_id: string
          status?: Database["public"]["Enums"]["quest_team_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          quest_id?: string
          status?: Database["public"]["Enums"]["quest_team_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_teams_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "side_quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      side_quests: {
        Row: {
          created_at: string
          description: string
          hints: Json
          id: string
          is_published: boolean
          max_slots: number
          reward_card_id: string | null
          slots_filled: number
          theme: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          hints?: Json
          id?: string
          is_published?: boolean
          max_slots?: number
          reward_card_id?: string | null
          slots_filled?: number
          theme?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          hints?: Json
          id?: string
          is_published?: boolean
          max_slots?: number
          reward_card_id?: string | null
          slots_filled?: number
          theme?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "side_quests_reward_card_id_fkey"
            columns: ["reward_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory: {
        Row: {
          card_id: string
          created_at: string
          id: string
          listed_by: string | null
          price: number
          quantity: number
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          listed_by?: string | null
          price: number
          quantity?: number
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          listed_by?: string | null
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      team_cards: {
        Row: {
          acquired_at: string
          card_id: string
          id: string
          quantity: number
          team_id: string
        }
        Insert: {
          acquired_at?: string
          card_id: string
          id?: string
          quantity?: number
          team_id: string
        }
        Update: {
          acquired_at?: string
          card_id?: string
          id?: string
          quantity?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_cards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          is_winner: boolean
          points: number
          team_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          is_winner?: boolean
          points?: number
          team_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          is_winner?: boolean
          points?: number
          team_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_requests: {
        Row: {
          created_at: string
          id: string
          offered_card_id: string | null
          price: number | null
          processed_by: string | null
          reject_reason: string | null
          request_type: Database["public"]["Enums"]["trade_request_type"]
          status: Database["public"]["Enums"]["trade_request_status"]
          target_team_id: string | null
          team_id: string
          updated_at: string
          wanted_card_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          offered_card_id?: string | null
          price?: number | null
          processed_by?: string | null
          reject_reason?: string | null
          request_type: Database["public"]["Enums"]["trade_request_type"]
          status?: Database["public"]["Enums"]["trade_request_status"]
          target_team_id?: string | null
          team_id: string
          updated_at?: string
          wanted_card_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          offered_card_id?: string | null
          price?: number | null
          processed_by?: string | null
          reject_reason?: string | null
          request_type?: Database["public"]["Enums"]["trade_request_type"]
          status?: Database["public"]["Enums"]["trade_request_status"]
          target_team_id?: string | null
          team_id?: string
          updated_at?: string
          wanted_card_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_requests_offered_card_id_fkey"
            columns: ["offered_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_target_team_id_fkey"
            columns: ["target_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_wanted_card_id_fkey"
            columns: ["wanted_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "shopper" | "participant"
      card_rarity: "ordinary" | "rare" | "epic" | "legendary"
      card_type:
        | "enhancement"
        | "manipulation"
        | "penalizing"
        | "protection"
        | "recovery"
        | "economic"
        | "hint_single"
        | "hint_combined"
        | "mandatory"
      coffre_type:
        | "game_reward"
        | "quest_reward"
        | "admin_gift"
        | "store_purchase"
      notification_type:
        | "coffre_awarded"
        | "card_activated"
        | "trade_completed"
        | "trade_rejected"
        | "shop_window"
        | "ranking_visibility"
        | "announcement"
        | "quest_completed"
        | "winner_declared"
      quest_team_status: "in_progress" | "completed" | "reward_claimed"
      trade_request_status: "pending" | "approved" | "rejected" | "completed"
      trade_request_type: "trade" | "sell" | "buy"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "shopper", "participant"],
      card_rarity: ["ordinary", "rare", "epic", "legendary"],
      card_type: [
        "enhancement",
        "manipulation",
        "penalizing",
        "protection",
        "recovery",
        "economic",
        "hint_single",
        "hint_combined",
        "mandatory",
      ],
      coffre_type: [
        "game_reward",
        "quest_reward",
        "admin_gift",
        "store_purchase",
      ],
      notification_type: [
        "coffre_awarded",
        "card_activated",
        "trade_completed",
        "trade_rejected",
        "shop_window",
        "ranking_visibility",
        "announcement",
        "quest_completed",
        "winner_declared",
      ],
      quest_team_status: ["in_progress", "completed", "reward_claimed"],
      trade_request_status: ["pending", "approved", "rejected", "completed"],
      trade_request_type: ["trade", "sell", "buy"],
    },
  },
} as const
