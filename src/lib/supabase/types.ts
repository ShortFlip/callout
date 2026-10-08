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
    PostgrestVersion: "14.5"
  }
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
      card_templates: {
        Row: {
          board_size: number
          created_at: string
          creator_id: string
          free_space: boolean
          id: string
          is_public: boolean
          items: Json
          mix: Json | null
          name: string
          saved: boolean
          shuffle_mode: string
          styles: Json
        }
        Insert: {
          board_size: number
          created_at?: string
          creator_id: string
          free_space?: boolean
          id?: string
          is_public?: boolean
          items?: Json
          mix?: Json | null
          name: string
          saved?: boolean
          shuffle_mode?: string
          styles?: Json
        }
        Update: {
          board_size?: number
          created_at?: string
          creator_id?: string
          free_space?: boolean
          id?: string
          is_public?: boolean
          items?: Json
          mix?: Json | null
          name?: string
          saved?: boolean
          shuffle_mode?: string
          styles?: Json
        }
        Relationships: [
          {
            foreignKeyName: "card_templates_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_nights: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string | null
          room_ids: string[]
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name?: string | null
          room_ids?: string[]
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string | null
          room_ids?: string[]
        }
        Relationships: []
      }
      game_players: {
        Row: {
          bingo_time_ms: number | null
          card_data: Json
          finish_position: number | null
          game_id: string
          id: string
          marks: Json
          player_id: string
          won: boolean
        }
        Insert: {
          bingo_time_ms?: number | null
          card_data?: Json
          finish_position?: number | null
          game_id: string
          id?: string
          marks?: Json
          player_id: string
          won?: boolean
        }
        Update: {
          bingo_time_ms?: number | null
          card_data?: Json
          finish_position?: number | null
          game_id?: string
          id?: string
          marks?: Json
          player_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          call_list: Json
          calls_made: number
          ended_at: string | null
          id: string
          room_id: string
          round_number: number
          seed: string
          started_at: string
          status: string
          win_pattern: string | null
        }
        Insert: {
          call_list?: Json
          calls_made?: number
          ended_at?: string | null
          id?: string
          room_id: string
          round_number: number
          seed: string
          started_at?: string
          status?: string
          win_pattern?: string | null
        }
        Update: {
          call_list?: Json
          calls_made?: number
          ended_at?: string | null
          id?: string
          room_id?: string
          round_number?: number
          seed?: string
          started_at?: string
          status?: string
          win_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      library_item_tags: {
        Row: {
          item_id: string
          tag_id: string
        }
        Insert: {
          item_id: string
          tag_id: string
        }
        Update: {
          item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          created_at: string
          game_tag_id: string | null
          id: string
          owner_id: string
          text: string
        }
        Insert: {
          created_at?: string
          game_tag_id?: string | null
          id?: string
          owner_id: string
          text: string
        }
        Update: {
          created_at?: string
          game_tag_id?: string | null
          id?: string
          owner_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_items_game_tag_id_fkey"
            columns: ["game_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          browser_id: string
          claim_code: string
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          browser_id: string
          claim_code?: string
          created_at?: string
          display_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          browser_id?: string
          claim_code?: string
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string
          host_id: string
          id: string
          join_code: string
          name: string | null
          settings: Json
          status: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          join_code: string
          name?: string | null
          settings?: Json
          status?: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          join_code?: string
          name?: string | null
          settings?: Json
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          kind: string
          logo_url: string | null
          name: string
          owner_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          logo_url?: string | null
          name: string
          owner_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          logo_url?: string | null
          kind?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_player: {
        Args: { p_claim_code: string }
        Returns: {
          browser_id: string
          display_name: string
          id: string
        }[]
      }
      generate_claim_code: { Args: never; Returns: string }
      get_login_player: {
        Args: never
        Returns: {
          auth_id: string | null
          avatar_url: string | null
          browser_id: string
          claim_code: string
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      link_player: { Args: { p_player_id: string }; Returns: boolean }
      get_my_player: {
        Args: { p_browser_id: string }
        Returns: {
          auth_id: string | null
          avatar_url: string | null
          browser_id: string
          claim_code: string
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: false
          isSetofReturn: true
        }
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
