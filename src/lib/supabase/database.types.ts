export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      events: {
        Row: {
          created_at: string
          id: string
          name: string
          starts_at: string | null
          status: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      game_auction_bids: {
        Row: {
          amount: number
          command_id: string
          created_at: string
          created_by_staff_user_id: string
          game_auction_id: string
          game_table_id: string
          id: string
        }
        Insert: {
          amount: number
          command_id: string
          created_at?: string
          created_by_staff_user_id: string
          game_auction_id: string
          game_table_id: string
          id?: string
        }
        Update: {
          amount?: number
          command_id?: string
          created_at?: string
          created_by_staff_user_id?: string
          game_auction_id?: string
          game_table_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_auction_bids_game_auction_id_fkey"
            columns: ["game_auction_id"]
            isOneToOne: false
            referencedRelation: "game_auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_auction_bids_game_table_id_fkey"
            columns: ["game_table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      game_auction_commands: {
        Row: {
          command_id: string
          command_kind: string
          created_at: string
          game_auction_id: string
          game_id: string
          status: string
          winning_bid: number | null
          winning_table_id: string | null
        }
        Insert: {
          command_id: string
          command_kind: string
          created_at?: string
          game_auction_id: string
          game_id: string
          status: string
          winning_bid?: number | null
          winning_table_id?: string | null
        }
        Update: {
          command_id?: string
          command_kind?: string
          created_at?: string
          game_auction_id?: string
          game_id?: string
          status?: string
          winning_bid?: number | null
          winning_table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_auction_commands_game_auction_id_fkey"
            columns: ["game_auction_id"]
            isOneToOne: false
            referencedRelation: "game_auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_auction_commands_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_auctions: {
        Row: {
          closed_at: string | null
          game_id: string
          id: string
          opened_at: string
          scenario_auction_item_id: string
          status: string
          winning_bid: number | null
          winning_table_id: string | null
        }
        Insert: {
          closed_at?: string | null
          game_id: string
          id?: string
          opened_at?: string
          scenario_auction_item_id: string
          status: string
          winning_bid?: number | null
          winning_table_id?: string | null
        }
        Update: {
          closed_at?: string | null
          game_id?: string
          id?: string
          opened_at?: string
          scenario_auction_item_id?: string
          status?: string
          winning_bid?: number | null
          winning_table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_auctions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_auctions_game_id_winning_table_id_fkey"
            columns: ["game_id", "winning_table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["game_id", "id"]
          },
          {
            foreignKeyName: "game_auctions_scenario_auction_item_id_fkey"
            columns: ["scenario_auction_item_id"]
            isOneToOne: false
            referencedRelation: "scenario_auction_items"
            referencedColumns: ["id"]
          },
        ]
      }
      game_lifecycle_commands: {
        Row: {
          command_id: string
          created_at: string
          from_lifecycle: string
          game_id: string
          id: string
          staff_member_id: string
          to_lifecycle: string
        }
        Insert: {
          command_id: string
          created_at?: string
          from_lifecycle: string
          game_id: string
          id?: string
          staff_member_id: string
          to_lifecycle: string
        }
        Update: {
          command_id?: string
          created_at?: string
          from_lifecycle?: string
          game_id?: string
          id?: string
          staff_member_id?: string
          to_lifecycle?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_lifecycle_commands_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_lifecycle_commands_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      game_narrative_phase_commands: {
        Row: {
          command_id: string
          created_at: string
          from_phase: string
          game_id: string
          staff_member_id: string
          to_phase: string
        }
        Insert: {
          command_id: string
          created_at?: string
          from_phase: string
          game_id: string
          staff_member_id: string
          to_phase: string
        }
        Update: {
          command_id?: string
          created_at?: string
          from_phase?: string
          game_id?: string
          staff_member_id?: string
          to_phase?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_narrative_phase_commands_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_narrative_phase_commands_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      game_role_acknowledgements: {
        Row: {
          acknowledged_at: string
          game_id: string
          player_id: string
        }
        Insert: {
          acknowledged_at?: string
          game_id: string
          player_id: string
        }
        Update: {
          acknowledged_at?: string
          game_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_role_acknowledgements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_role_acknowledgements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_role_assignment_commands: {
        Row: {
          command_id: string
          created_at: string
          game_id: string
          player_count: number
          staff_member_id: string
        }
        Insert: {
          command_id: string
          created_at?: string
          game_id: string
          player_count: number
          staff_member_id: string
        }
        Update: {
          command_id?: string
          created_at?: string
          game_id?: string
          player_count?: number
          staff_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_role_assignment_commands_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_role_assignment_commands_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      game_role_assignments: {
        Row: {
          assigned_at: string
          game_id: string
          player_id: string
          role: string
        }
        Insert: {
          assigned_at?: string
          game_id: string
          player_id: string
          role: string
        }
        Update: {
          assigned_at?: string
          game_id?: string
          player_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_role_assignments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_role_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tables: {
        Row: {
          created_at: string
          game_id: string
          id: string
          label: string | null
          table_number: number
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          label?: string | null
          table_number: number
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          label?: string | null
          table_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_tables_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          code: string
          created_at: string
          event_id: string
          id: string
          lifecycle: string
          narrative_phase: string
          scenario_version_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          event_id: string
          id?: string
          lifecycle?: string
          narrative_phase?: string
          scenario_version_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          id?: string
          lifecycle?: string
          narrative_phase?: string
          scenario_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_scenario_version_id_fkey"
            columns: ["scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_user_id: string
          created_at: string
          game_id: string
          id: string
          nickname: string
          seat_number: number | null
          table_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          game_id: string
          id?: string
          nickname: string
          seat_number?: number | null
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          game_id?: string
          id?: string
          nickname?: string
          seat_number?: number | null
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_table_id_fkey"
            columns: ["game_id", "table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["game_id", "id"]
          },
        ]
      }
      scenario_auction_items: {
        Row: {
          created_at: string
          id: string
          reward_body: string
          reward_title: string
          scenario_version_id: string
          sequence_number: number
          teaser: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          reward_body: string
          reward_title: string
          scenario_version_id: string
          sequence_number: number
          teaser: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          reward_body?: string
          reward_title?: string
          scenario_version_id?: string
          sequence_number?: number
          teaser?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_auction_items_scenario_version_id_fkey"
            columns: ["scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_table_clues: {
        Row: {
          body: string
          created_at: string
          id: string
          scenario_version_id: string
          table_number: number
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          scenario_version_id: string
          table_number: number
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          scenario_version_id?: string
          table_number?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_table_clues_scenario_version_id_fkey"
            columns: ["scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_table_comparisons: {
        Row: {
          created_at: string
          id: string
          instruction: string
          scenario_version_id: string
          source_table_number: number
          target_table_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          instruction: string
          scenario_version_id: string
          source_table_number: number
          target_table_number: number
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string
          scenario_version_id?: string
          source_table_number?: number
          target_table_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_table_comparisons_scenario_version_id_fkey"
            columns: ["scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_table_pressure_routes: {
        Row: {
          created_at: string
          id: string
          instruction: string
          scenario_version_id: string
          source_table_number: number
          target_table_number: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruction: string
          scenario_version_id: string
          source_table_number: number
          target_table_number: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string
          scenario_version_id?: string
          source_table_number?: number
          target_table_number?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_table_pressure_routes_scenario_version_id_fkey"
            columns: ["scenario_version_id"]
            isOneToOne: false
            referencedRelation: "scenario_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_versions: {
        Row: {
          briefing_body: string
          briefing_title: string
          comparison_body: string
          comparison_title: string
          created_at: string
          discovery_body: string
          discovery_title: string
          id: string
          pressure_body: string
          pressure_title: string
          published_at: string | null
          scenario_id: string
          status: string
          version_number: number
        }
        Insert: {
          briefing_body: string
          briefing_title: string
          comparison_body: string
          comparison_title: string
          created_at?: string
          discovery_body: string
          discovery_title: string
          id?: string
          pressure_body: string
          pressure_title: string
          published_at?: string | null
          scenario_id: string
          status: string
          version_number: number
        }
        Update: {
          briefing_body?: string
          briefing_title?: string
          comparison_body?: string
          comparison_title?: string
          created_at?: string
          discovery_body?: string
          discovery_title?: string
          id?: string
          pressure_body?: string
          pressure_title?: string
          published_at?: string | null
          scenario_id?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_versions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          title?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_coin_ledger: {
        Row: {
          correlation_id: string
          created_at: string
          created_by_staff_user_id: string | null
          delta: number
          game_id: string
          game_table_id: string
          id: string
          reason: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          created_by_staff_user_id?: string | null
          delta: number
          game_id: string
          game_table_id: string
          id?: string
          reason: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          created_by_staff_user_id?: string | null
          delta?: number
          game_id?: string
          game_table_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_coin_ledger_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_coin_ledger_game_id_game_table_id_fkey"
            columns: ["game_id", "game_table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["game_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_my_role: {
        Args: { game_code: string }
        Returns: {
          acknowledged_at: string
          game_id: string
        }[]
      }
      adjust_table_coins: {
        Args: {
          command_id: string
          delta: number
          game_code: string
          reason: string
          table_number: number
        }
        Returns: {
          balance: number
          correlation_id: string
          created_at: string
          delta: number
          game_code: string
          game_id: string
          reason: string
          table_number: number
        }[]
      }
      assign_game_roles: {
        Args: { command_id: string; game_code: string }
        Returns: {
          assigned_at: string
          command_id: string
          game_code: string
          game_id: string
          player_count: number
        }[]
      }
      close_game_auction: {
        Args: { command_id: string; game_code: string }
        Returns: {
          auction_id: string
          closed_at: string
          game_id: string
          status: string
          winning_bid: number
          winning_table_number: number
        }[]
      }
      close_game_auction_no_sale: {
        Args: { command_id: string; game_code: string }
        Returns: {
          auction_id: string
          closed_at: string
          game_id: string
          status: string
          winning_bid: number
          winning_table_number: number
        }[]
      }
      get_my_join_state: {
        Args: { p_game_code: string }
        Returns: {
          game_code: string
          game_id: string
          join_status: string
          nickname: string
          player_id: string
          seat_number: number
          table_number: number
        }[]
      }
      get_my_player_state: {
        Args: { game_code: string }
        Returns: {
          briefing_body: string
          briefing_title: string
          clue_body: string
          clue_title: string
          comparison_body: string
          comparison_instruction: string
          comparison_target_table_number: number
          comparison_title: string
          discovery_body: string
          discovery_title: string
          game_id: string
          lifecycle: string
          narrative_phase: string
          nickname: string
          pressure_body: string
          pressure_instruction: string
          pressure_route_title: string
          pressure_target_table_number: number
          pressure_title: string
          role: string
          role_acknowledged: boolean
          scenario_title: string
          seat_number: number
          table_coin_balance: number
          table_number: number
        }[]
      }
      get_my_staff_access: {
        Args: never
        Returns: {
          active: boolean
          display_name: string
          staff_member_id: string
        }[]
      }
      get_staff_game_auction: {
        Args: { game_code: string }
        Returns: {
          auction_id: string
          bids: Json
          current_highest_bid: number
          current_highest_table_number: number
          item_teaser: string
          item_title: string
          status: string
          table_balances: Json
          winning_bid: number
          winning_table_number: number
        }[]
      }
      get_staff_game_clues: {
        Args: { game_code: string }
        Returns: {
          body: string
          table_number: number
          title: string
        }[]
      }
      get_staff_game_coins: {
        Args: { game_code: string }
        Returns: {
          balance: number
          table_number: number
        }[]
      }
      get_staff_game_comparisons: {
        Args: { game_code: string }
        Returns: {
          instruction: string
          source_table_number: number
          target_table_number: number
        }[]
      }
      get_staff_game_overview: {
        Args: { p_game_code: string }
        Returns: {
          briefing_body: string
          briefing_title: string
          code: string
          comparison_body: string
          comparison_title: string
          created_at: string
          discovery_body: string
          discovery_title: string
          event_name: string
          id: string
          lifecycle: string
          narrative_phase: string
          player_count: number
          pressure_body: string
          pressure_title: string
          scenario_title: string
          scenario_version_number: number
          starts_at: string
          table_count: number
          venue_name: string
        }[]
      }
      get_staff_game_pressure_routes: {
        Args: { game_code: string }
        Returns: {
          instruction: string
          source_table_number: number
          target_table_number: number
          title: string
        }[]
      }
      get_staff_game_roles: {
        Args: { game_code: string }
        Returns: {
          nickname: string
          player_id: string
          role: string
          role_acknowledged: boolean
          seat_number: number
          table_number: number
        }[]
      }
      get_staff_game_roster: {
        Args: { game_code: string }
        Returns: {
          joined_at: string
          nickname: string
          player_id: string
          seat_number: number
          table_number: number
        }[]
      }
      join_game: {
        Args: {
          p_game_code: string
          p_nickname: string
          p_seat_number: number
          p_table_number: number
        }
        Returns: {
          game_code: string
          game_id: string
          join_status: string
          nickname: string
          player_id: string
          seat_number: number
          table_number: number
        }[]
      }
      list_staff_games: {
        Args: never
        Returns: {
          event_name: string
          game_code: string
          game_id: string
          lifecycle: string
          narrative_phase: string
          player_count: number
          starts_at: string
          table_count: number
          venue_name: string
        }[]
      }
      open_game_auction: {
        Args: { command_id: string; game_code: string }
        Returns: {
          auction_id: string
          game_id: string
          item_id: string
          opened_at: string
          status: string
        }[]
      }
      record_game_auction_bid: {
        Args: {
          amount: number
          command_id: string
          game_code: string
          table_number: number
        }
        Returns: {
          amount: number
          auction_id: string
          command_id: string
          created_at: string
          game_id: string
          table_number: number
        }[]
      }
      transition_game_lifecycle: {
        Args: {
          command_id: string
          expected_lifecycle: string
          game_code: string
          target_lifecycle: string
        }
        Returns: {
          changed_at: string
          command_id: string
          game_code: string
          game_id: string
          lifecycle: string
          previous_lifecycle: string
        }[]
      }
      transition_game_narrative_phase: {
        Args: {
          command_id: string
          expected_phase: string
          game_code: string
          target_phase: string
        }
        Returns: {
          changed_at: string
          command_id: string
          game_code: string
          game_id: string
          phase: string
          previous_phase: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
