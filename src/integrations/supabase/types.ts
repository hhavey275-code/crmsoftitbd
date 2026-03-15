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
      ad_account_insights: {
        Row: {
          ad_account_id: string
          balance: number | null
          cards: Json | null
          id: string
          today_spend: number | null
          updated_at: string | null
          yesterday_spend: number | null
        }
        Insert: {
          ad_account_id: string
          balance?: number | null
          cards?: Json | null
          id?: string
          today_spend?: number | null
          updated_at?: string | null
          yesterday_spend?: number | null
        }
        Update: {
          ad_account_id?: string
          balance?: number | null
          cards?: Json | null
          id?: string
          today_spend?: number | null
          updated_at?: string | null
          yesterday_spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_insights_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: true
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          amount_spent: number
          business_manager_id: string | null
          business_name: string | null
          created_at: string
          id: string
          spend_cap: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          account_name: string
          amount_spent?: number
          business_manager_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          spend_cap?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string
          amount_spent?: number
          business_manager_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          spend_cap?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_business_manager_id_fkey"
            columns: ["business_manager_id"]
            isOneToOne: false
            referencedRelation: "business_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          branch: string | null
          created_at: string | null
          id: string
          routing_number: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          branch?: string | null
          created_at?: string | null
          id?: string
          routing_number?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          branch?: string | null
          created_at?: string | null
          id?: string
          routing_number?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      business_managers: {
        Row: {
          access_token: string
          bm_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          access_token: string
          bm_id: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          bm_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_banks: {
        Row: {
          assigned_at: string | null
          bank_account_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          bank_account_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          bank_account_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_banks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          due_limit: number | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          status: string
          updated_at: string
          usd_rate: number | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          due_limit?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          due_limit?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          business_manager_id: string
          created_at: string
          error_message: string | null
          id: string
          status: string
          synced_count: number
          total_count: number
        }
        Insert: {
          business_manager_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          synced_count?: number
          total_count?: number
        }
        Update: {
          business_manager_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          synced_count?: number
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_business_manager_id_fkey"
            columns: ["business_manager_id"]
            isOneToOne: false
            referencedRelation: "business_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      top_up_requests: {
        Row: {
          ad_account_id: string | null
          admin_note: string | null
          amount: number
          bank_account_id: string | null
          bdt_amount: number | null
          created_at: string
          id: string
          payment_method: string
          payment_reference: string | null
          proof_url: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          usd_rate: number | null
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          admin_note?: string | null
          amount: number
          bank_account_id?: string | null
          bdt_amount?: number | null
          created_at?: string
          id?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          admin_note?: string | null
          amount?: number
          bank_account_id?: string | null
          bdt_amount?: number | null
          created_at?: string
          id?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "top_up_requests_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "top_up_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ad_accounts: {
        Row: {
          ad_account_id: string
          assigned_at: string
          id: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          assigned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          assigned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ad_accounts_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
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
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
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
      app_role: "admin" | "client"
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
      app_role: ["admin", "client"],
    },
  },
} as const
