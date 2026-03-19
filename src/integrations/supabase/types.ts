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
          active_campaigns: number | null
          ad_account_id: string
          balance: number | null
          billing_threshold: number | null
          cards: Json | null
          daily_spend_limit: number | null
          id: string
          today_messages: number | null
          today_orders: number | null
          today_spend: number | null
          updated_at: string | null
          yesterday_messages: number | null
          yesterday_orders: number | null
          yesterday_spend: number | null
        }
        Insert: {
          active_campaigns?: number | null
          ad_account_id: string
          balance?: number | null
          billing_threshold?: number | null
          cards?: Json | null
          daily_spend_limit?: number | null
          id?: string
          today_messages?: number | null
          today_orders?: number | null
          today_spend?: number | null
          updated_at?: string | null
          yesterday_messages?: number | null
          yesterday_orders?: number | null
          yesterday_spend?: number | null
        }
        Update: {
          active_campaigns?: number | null
          ad_account_id?: string
          balance?: number | null
          billing_threshold?: number | null
          cards?: Json | null
          daily_spend_limit?: number | null
          id?: string
          today_messages?: number | null
          today_orders?: number | null
          today_spend?: number | null
          updated_at?: string | null
          yesterday_messages?: number | null
          yesterday_orders?: number | null
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
      ad_account_requests: {
        Row: {
          account_name: string
          admin_note: string | null
          assigned_ad_account_id: string | null
          business_manager_id: string
          created_at: string
          email: string
          id: string
          monthly_spend: string | null
          reviewed_by: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          admin_note?: string | null
          assigned_ad_account_id?: string | null
          business_manager_id: string
          created_at?: string
          email: string
          id?: string
          monthly_spend?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          admin_note?: string | null
          assigned_ad_account_id?: string | null
          business_manager_id?: string
          created_at?: string
          email?: string
          id?: string
          monthly_spend?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_requests_assigned_ad_account_id_fkey"
            columns: ["assigned_ad_account_id"]
            isOneToOne: false
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
          balance_after_topup: number | null
          business_manager_id: string | null
          business_name: string | null
          created_at: string
          id: string
          platform: string
          spend_cap: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          account_name: string
          amount_spent?: number
          balance_after_topup?: number | null
          business_manager_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          platform?: string
          spend_cap?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string
          amount_spent?: number
          balance_after_topup?: number | null
          business_manager_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          platform?: string
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
      api_call_logs: {
        Row: {
          business_manager_id: string
          call_count: number
          created_at: string
          function_name: string
          id: string
        }
        Insert: {
          business_manager_id: string
          call_count?: number
          created_at?: string
          function_name: string
          id?: string
        }
        Update: {
          business_manager_id?: string
          call_count?: number
          created_at?: string
          function_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_call_logs_business_manager_id_fkey"
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
          seller_id: string | null
          status: string
          telegram_group_id: string | null
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
          seller_id?: string | null
          status?: string
          telegram_group_id?: string | null
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
          seller_id?: string | null
          status?: string
          telegram_group_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bm_access_requests: {
        Row: {
          ad_account_id: string
          admin_note: string | null
          bm_id: string
          bm_name: string
          created_at: string
          id: string
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          admin_note?: string | null
          bm_id: string
          bm_name: string
          created_at?: string
          id?: string
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          admin_note?: string | null
          bm_id?: string
          bm_name?: string
          created_at?: string
          id?: string
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bm_access_requests_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      business_managers: {
        Row: {
          access_token: string
          bm_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          name: string
          platform: string
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
          platform?: string
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
          platform?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          is_resolved: boolean | null
          last_message_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          last_message_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          last_message_at?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          sender_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          sender_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      failed_topups: {
        Row: {
          ad_account_id: string
          amount: number
          created_at: string
          error_message: string | null
          id: string
          old_spend_cap: number | null
          status: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          amount: number
          created_at?: string
          error_message?: string | null
          id?: string
          old_spend_cap?: number | null
          status?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          amount?: number
          created_at?: string
          error_message?: string | null
          id?: string
          old_spend_cap?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failed_topups_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          bdt_amount: number | null
          created_at: string
          id: string
          invoice_number: string
          top_up_request_id: string
          usd_rate: number | null
          user_id: string
        }
        Insert: {
          amount: number
          bdt_amount?: number | null
          created_at?: string
          id?: string
          invoice_number: string
          top_up_request_id: string
          usd_rate?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          bdt_amount?: number | null
          created_at?: string
          id?: string
          invoice_number?: string
          top_up_request_id?: string
          usd_rate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_top_up_request_id_fkey"
            columns: ["top_up_request_id"]
            isOneToOne: false
            referencedRelation: "top_up_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_permissions: {
        Row: {
          created_at: string | null
          id: string
          menu_key: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_key: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_key?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          reference_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_address: string | null
          company: string | null
          created_at: string
          due_limit: number | null
          email: string | null
          full_name: string | null
          id: string
          monthly_spend: string | null
          phone: string | null
          status: string
          updated_at: string
          usd_rate: number | null
          user_id: string
        }
        Insert: {
          business_address?: string | null
          company?: string | null
          created_at?: string
          due_limit?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          monthly_spend?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id: string
        }
        Update: {
          business_address?: string | null
          company?: string | null
          created_at?: string
          due_limit?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          monthly_spend?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_transactions: {
        Row: {
          bank_account_id: string | null
          bdt_amount: number
          created_at: string
          description: string | null
          id: string
          proof_url: string | null
          rate: number
          seller_id: string
          top_up_request_id: string | null
          type: string
          usdt_amount: number
        }
        Insert: {
          bank_account_id?: string | null
          bdt_amount?: number
          created_at?: string
          description?: string | null
          id?: string
          proof_url?: string | null
          rate?: number
          seller_id: string
          top_up_request_id?: string | null
          type: string
          usdt_amount?: number
        }
        Update: {
          bank_account_id?: string | null
          bdt_amount?: number
          created_at?: string
          description?: string | null
          id?: string
          proof_url?: string | null
          rate?: number
          seller_id?: string
          top_up_request_id?: string | null
          type?: string
          usdt_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_transactions_top_up_request_id_fkey"
            columns: ["top_up_request_id"]
            isOneToOne: false
            referencedRelation: "top_up_requests"
            referencedColumns: ["id"]
          },
        ]
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
      system_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          matched_request_id: string | null
          raw_update: Json
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id: number
          created_at?: string
          matched_request_id?: string | null
          raw_update: Json
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number
          created_at?: string
          matched_request_id?: string | null
          raw_update?: Json
          text?: string | null
          update_id?: number
        }
        Relationships: []
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
          bank_account_id: string | null
          created_at: string
          description: string | null
          id: string
          processed_by: string | null
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          processed_by?: string | null
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          processed_by?: string | null
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
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
            isOneToOne: true
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
      generate_invoice_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client" | "superadmin" | "seller"
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
      app_role: ["admin", "client", "superadmin", "seller"],
    },
  },
} as const
