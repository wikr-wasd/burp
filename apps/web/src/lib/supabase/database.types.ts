export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          created_at: string
          door_code: string | null
          id: string
          instructions: string | null
          is_default: boolean
          label: string | null
          location: unknown
          postal_code: string
          street_address: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          door_code?: string | null
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          location?: unknown
          postal_code: string
          street_address: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          door_code?: string | null
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          location?: unknown
          postal_code?: string
          street_address?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_ore: number
          guest_id: string | null
          id: string
          order_id: string
          redeemed_at: string
          released_at: string | null
          restaurant_id: string
        }
        Insert: {
          coupon_id: string
          discount_ore: number
          guest_id?: string | null
          id?: string
          order_id: string
          redeemed_at?: string
          released_at?: string | null
          restaurant_id: string
        }
        Update: {
          coupon_id?: string
          discount_ore?: number
          guest_id?: string | null
          id?: string
          order_id?: string
          redeemed_at?: string
          released_at?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          discount_bps: number | null
          discount_ore: number | null
          funded_by: Database["public"]["Enums"]["coupon_funder"]
          id: string
          is_active: boolean
          max_discount_ore: number | null
          max_per_guest: number
          max_redemptions: number | null
          min_order_ore: number
          restaurant_id: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          discount_bps?: number | null
          discount_ore?: number | null
          funded_by?: Database["public"]["Enums"]["coupon_funder"]
          id?: string
          is_active?: boolean
          max_discount_ore?: number | null
          max_per_guest?: number
          max_redemptions?: number | null
          min_order_ore?: number
          restaurant_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          discount_bps?: number | null
          discount_ore?: number | null
          funded_by?: Database["public"]["Enums"]["coupon_funder"]
          id?: string
          is_active?: boolean
          max_discount_ore?: number | null
          max_per_guest?: number
          max_redemptions?: number | null
          min_order_ore?: number
          restaurant_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          base: Database["public"]["Enums"]["fee_base"]
          base_amount_ore: number
          bps: number
          created_at: string
          fee_ore: number
          id: string
          order_id: string
          provider_fee_ore: number | null
          restaurant_id: string
        }
        Insert: {
          base: Database["public"]["Enums"]["fee_base"]
          base_amount_ore: number
          bps: number
          created_at?: string
          fee_ore: number
          id?: string
          order_id: string
          provider_fee_ore?: number | null
          restaurant_id: string
        }
        Update: {
          base?: Database["public"]["Enums"]["fee_base"]
          base_amount_ore?: number
          bps?: number
          created_at?: string
          fee_ore?: number
          id?: string
          order_id?: string
          provider_fee_ore?: number | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fees_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          created_at: string
          height: number
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
          width: number
        }
        Insert: {
          created_at?: string
          height?: number
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
          width?: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          amount_ore: number
          created_at: string
          created_by: string | null
          gift_card_id: string
          id: number
          kind: Database["public"]["Enums"]["gift_card_kind"]
          order_id: string | null
          payment_id: string | null
        }
        Insert: {
          amount_ore: number
          created_at?: string
          created_by?: string | null
          gift_card_id: string
          id?: never
          kind: Database["public"]["Enums"]["gift_card_kind"]
          order_id?: string | null
          payment_id?: string | null
        }
        Update: {
          amount_ore?: number
          created_at?: string
          created_by?: string | null
          gift_card_id?: string
          id?: never
          kind?: Database["public"]["Enums"]["gift_card_kind"]
          order_id?: string | null
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          expires_at: string | null
          id: string
          is_active: boolean
          issued_to_email: string | null
          note: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_to_email?: string | null
          note?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_to_email?: string | null
          note?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_availability: {
        Row: {
          available_from: string | null
          available_to: string | null
          created_at: string
          id: string
          menu_item_id: string
          reason: string | null
          restaurant_id: string
          weekday: number | null
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          reason?: string | null
          restaurant_id: string
          weekday?: number | null
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          reason?: string | null
          restaurant_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_availability_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_availability_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          location: unknown
          longitude: number | null
          name: string
          opening_hours: Json
          postal_code: string
          restaurant_id: string
          street_address: string
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name: string
          opening_hours?: Json
          postal_code: string
          restaurant_id: string
          street_address: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name?: string
          opening_hours?: Json
          postal_code?: string
          restaurant_id?: string
          street_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          id: string
          referred_by: string | null
          restaurant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referred_by?: string | null
          restaurant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referred_by?: string | null
          restaurant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: number
          kind: Database["public"]["Enums"]["loyalty_kind"]
          order_id: string | null
          points: number
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: never
          kind: Database["public"]["Enums"]["loyalty_kind"]
          order_id?: string | null
          points: number
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["loyalty_kind"]
          order_id?: string | null
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          alt_text: string | null
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          menu_item_id: string | null
          playback_url: string | null
          poster_url: string | null
          provider: string | null
          provider_asset_id: string | null
          rejection_reason: string | null
          restaurant_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["media_status"]
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          menu_item_id?: string | null
          playback_url?: string | null
          poster_url?: string | null
          provider?: string | null
          provider_asset_id?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["media_status"]
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["media_kind"]
          menu_item_id?: string | null
          playback_url?: string | null
          poster_url?: string | null
          provider?: string | null
          provider_asset_id?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["media_status"]
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          menu_id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          menu_id: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          menu_id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price_ore: number
          restaurant_id: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          vat_rate_bps: number
        }
        Insert: {
          allergens?: string[]
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price_ore: number
          restaurant_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          vat_rate_bps?: number
        }
        Update: {
          allergens?: string[]
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price_ore?: number
          restaurant_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          vat_rate_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          active_days: number[]
          active_from: string | null
          active_until: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          active_days?: number[]
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          active_days?: number[]
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error: string | null
          order_id: string
          recipient_id: string
          restaurant_id: string
          sent_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          order_id: string
          recipient_id: string
          restaurant_id: string
          sent_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          order_id?: string
          recipient_id?: string
          restaurant_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id: string
          min_select?: number
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          name: string
          option_group_id: string
          price_ore: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          name: string
          option_group_id: string
          price_ore?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          name?: string
          option_group_id?: string
          price_ore?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "options_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          payload: Json
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          payload?: Json
          restaurant_id: string
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          payload?: Json
          restaurant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          created_at: string
          id: string
          name_snapshot: string
          option_id: string | null
          order_item_id: string
          price_ore: number
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_snapshot: string
          option_id?: string | null
          order_item_id: string
          price_ore: number
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name_snapshot?: string
          option_id?: string | null
          order_item_id?: string
          price_ore?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_gross_ore: number
          menu_item_id: string | null
          name_snapshot: string
          note: string | null
          order_id: string
          quantity: number
          restaurant_id: string
          unit_price_ore: number
          vat_rate_bps: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_gross_ore: number
          menu_item_id?: string | null
          name_snapshot: string
          note?: string | null
          order_id: string
          quantity: number
          restaurant_id: string
          unit_price_ore: number
          vat_rate_bps: number
        }
        Update: {
          created_at?: string
          id?: string
          line_gross_ore?: number
          menu_item_id?: string | null
          name_snapshot?: string
          note?: string | null
          order_id?: string
          quantity?: number
          restaurant_id?: string
          unit_price_ore?: number
          vat_rate_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          delivery_fee_ore: number
          discount_ore: number
          guest_id: string | null
          guest_locale: string | null
          id: string
          idempotency_key: string
          items_gross_ore: number
          items_vat_ore: number
          location_id: string | null
          note: string | null
          placed_at: string | null
          prep_minutes: number | null
          ready_at: string | null
          released_at: string | null
          restaurant_id: string
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          table_session_id: string | null
          tip_ore: number
          total_ore: number
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          vat_by_rate: Json
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          delivery_fee_ore?: number
          discount_ore?: number
          guest_id?: string | null
          guest_locale?: string | null
          id?: string
          idempotency_key: string
          items_gross_ore?: number
          items_vat_ore?: number
          location_id?: string | null
          note?: string | null
          placed_at?: string | null
          prep_minutes?: number | null
          ready_at?: string | null
          released_at?: string | null
          restaurant_id: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_session_id?: string | null
          tip_ore?: number
          total_ore?: number
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          vat_by_rate?: Json
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          delivery_fee_ore?: number
          discount_ore?: number
          guest_id?: string | null
          guest_locale?: string | null
          id?: string
          idempotency_key?: string
          items_gross_ore?: number
          items_vat_ore?: number
          location_id?: string | null
          note?: string | null
          placed_at?: string | null
          prep_minutes?: number | null
          ready_at?: string | null
          released_at?: string | null
          restaurant_id?: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_session_id?: string | null
          tip_ore?: number
          total_ore?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          vat_by_rate?: Json
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          id: number
          kind: string
          payload: Json
          payment_id: string | null
          provider: string
          received_at: string
        }
        Insert: {
          event_id: string
          id?: never
          kind: string
          payload?: Json
          payment_id?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          event_id?: string
          id?: never
          kind?: string
          payload?: Json
          payment_id?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_ore: number
          authorized_at: string | null
          captured_at: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string
          method: string | null
          order_id: string
          provider: string
          provider_payload: Json
          provider_reference: string | null
          restaurant_id: string
          settled_together_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_ore: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          method?: string | null
          order_id: string
          provider: string
          provider_payload?: Json
          provider_reference?: string | null
          restaurant_id: string
          settled_together_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_ore?: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          method?: string | null
          order_id?: string
          provider?: string
          provider_payload?: Json
          provider_reference?: string | null
          restaurant_id?: string
          settled_together_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      punch_card_redemptions: {
        Row: {
          funded_by: Database["public"]["Enums"]["reward_funder"]
          guest_id: string | null
          id: number
          order_id: string
          redeemed_at: string
          released_at: string | null
          restaurant_id: string
          reward_ore: number
          size: number
        }
        Insert: {
          funded_by?: Database["public"]["Enums"]["reward_funder"]
          guest_id?: string | null
          id?: never
          order_id: string
          redeemed_at?: string
          released_at?: string | null
          restaurant_id: string
          reward_ore: number
          size: number
        }
        Update: {
          funded_by?: Database["public"]["Enums"]["reward_funder"]
          guest_id?: string | null
          id?: never
          order_id?: string
          redeemed_at?: string
          released_at?: string | null
          restaurant_id?: string
          reward_ore?: number
          size?: number
        }
        Relationships: [
          {
            foreignKeyName: "punch_card_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_card_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_used_at: string | null
          p256dh: string
          restaurant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh: string
          restaurant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string
          restaurant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_ore: number
          created_at: string
          created_by: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_id: string
          provider: string
          provider_payload: Json
          provider_reference: string | null
          reason: string
          restaurant_id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          amount_ore: number
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          order_id: string
          payment_id: string
          provider: string
          provider_payload?: Json
          provider_reference?: string | null
          reason: string
          restaurant_id: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          amount_ore?: number
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          order_id?: string
          payment_id?: string
          provider?: string
          provider_payload?: Json
          provider_reference?: string | null
          reason?: string
          restaurant_id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      register_receipts: {
        Row: {
          control_code: string | null
          created_at: string
          id: string
          order_id: string
          payload: Json
          provider: string
          receipt_number: string | null
          restaurant_id: string
        }
        Insert: {
          control_code?: string | null
          created_at?: string
          id?: string
          order_id: string
          payload?: Json
          provider: string
          receipt_number?: string | null
          restaurant_id: string
        }
        Update: {
          control_code?: string | null
          created_at?: string
          id?: string
          order_id?: string
          payload?: Json
          provider?: string
          receipt_number?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_receipts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payment_accounts: {
        Row: {
          capabilities: Json
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          external_account_id: string
          id: string
          provider: string
          restaurant_id: string
          status: Database["public"]["Enums"]["payment_account_status"]
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          external_account_id: string
          id?: string
          provider: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["payment_account_status"]
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          external_account_id?: string
          id?: string
          provider?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["payment_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payment_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          city: string
          city_slug: string | null
          country: Database["public"]["Enums"]["country_code"]
          created_at: string
          cuisines: string[]
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          email: string | null
          fee_base: Database["public"]["Enums"]["fee_base"]
          fee_override_bps: number | null
          hero_image_url: string | null
          id: string
          latitude: number | null
          location: unknown
          longitude: number | null
          loyalty_points_per_krona: number
          name: string
          opening_hours: Json
          order_policy: Json
          org_number: string
          phone: string | null
          postal_code: string
          price_tier: number | null
          punch_card_max_reward_ore: number | null
          punch_card_size: number | null
          rating_average: number | null
          rating_count: number
          slug: string
          status: Database["public"]["Enums"]["restaurant_status"]
          street_address: string
          updated_at: string
        }
        Insert: {
          city: string
          city_slug?: string | null
          country?: Database["public"]["Enums"]["country_code"]
          created_at?: string
          cuisines?: string[]
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          email?: string | null
          fee_base?: Database["public"]["Enums"]["fee_base"]
          fee_override_bps?: number | null
          hero_image_url?: string | null
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          loyalty_points_per_krona?: number
          name: string
          opening_hours?: Json
          order_policy?: Json
          org_number: string
          phone?: string | null
          postal_code: string
          price_tier?: number | null
          punch_card_max_reward_ore?: number | null
          punch_card_size?: number | null
          rating_average?: number | null
          rating_count?: number
          slug: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          street_address: string
          updated_at?: string
        }
        Update: {
          city?: string
          city_slug?: string | null
          country?: Database["public"]["Enums"]["country_code"]
          created_at?: string
          cuisines?: string[]
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          email?: string | null
          fee_base?: Database["public"]["Enums"]["fee_base"]
          fee_override_bps?: number | null
          hero_image_url?: string | null
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          loyalty_points_per_krona?: number
          name?: string
          opening_hours?: Json
          order_policy?: Json
          org_number?: string
          phone?: string | null
          postal_code?: string
          price_tier?: number | null
          punch_card_max_reward_ore?: number | null
          punch_card_size?: number | null
          rating_average?: number | null
          rating_count?: number
          slug?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          street_address?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          anonymised_at: string | null
          comment: string | null
          created_at: string
          id: string
          image_url: string | null
          is_published: boolean
          order_id: string
          rating_delivery: number | null
          rating_food: number
          rating_service: number | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          restaurant_id: string
          table_session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          anonymised_at?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          order_id: string
          rating_delivery?: number | null
          rating_food: number
          rating_service?: number | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          restaurant_id: string
          table_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          anonymised_at?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          order_id?: string
          rating_delivery?: number | null
          rating_food?: number
          rating_service?: number | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          restaurant_id?: string
          table_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_due_ore: number | null
          cash_ore: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          fee_credit_ore: number
          fees_ore: number
          gross_ore: number
          id: string
          invoice_number: string | null
          invoiced_at: string | null
          note: string | null
          orders_count: number
          paid_at: string | null
          period_end: string
          period_start: string
          refunds_ore: number
          restaurant_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          tips_ore: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_due_ore?: number | null
          cash_ore?: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          fee_credit_ore?: number
          fees_ore?: number
          gross_ore?: number
          id?: string
          invoice_number?: string | null
          invoiced_at?: string | null
          note?: string | null
          orders_count?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          refunds_ore?: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
          tips_ore?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_due_ore?: number | null
          cash_ore?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_credit_ore?: number
          fees_ore?: number
          gross_ore?: number
          id?: string
          invoice_number?: string | null
          invoiced_at?: string | null
          note?: string | null
          orders_count?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          refunds_ore?: number
          restaurant_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          tips_ore?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          locale: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          locale?: string | null
          restaurant_id: string
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          locale?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          guest_count: number | null
          id: string
          opened_at: string
          restaurant_id: string
          status: Database["public"]["Enums"]["table_session_status"]
          table_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          guest_count?: number | null
          id?: string
          opened_at?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          guest_count?: number | null
          id?: string
          opened_at?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number | null
          created_at: string
          floor_plan_id: string | null
          height: number
          id: string
          location_id: string | null
          pos_x: number | null
          pos_y: number | null
          qr_public_id: string
          restaurant_id: string
          rotation: number
          shape: Database["public"]["Enums"]["table_shape"]
          status: Database["public"]["Enums"]["table_status"]
          table_number: string
          updated_at: string
          width: number
          zone: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          floor_plan_id?: string | null
          height?: number
          id?: string
          location_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          qr_public_id: string
          restaurant_id: string
          rotation?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          status?: Database["public"]["Enums"]["table_status"]
          table_number: string
          updated_at?: string
          width?: number
          zone?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          floor_plan_id?: string | null
          height?: number
          id?: string
          location_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          qr_public_id?: string
          restaurant_id?: string
          rotation?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          status?: Database["public"]["Enums"]["table_status"]
          table_number?: string
          updated_at?: string
          width?: number
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          amount_ore: number
          chosen_as: string
          chosen_bps: number | null
          created_at: string
          given_after_meal: boolean
          id: string
          order_id: string
          payment_id: string | null
          released_at: string | null
          restaurant_id: string
        }
        Insert: {
          amount_ore: number
          chosen_as?: string
          chosen_bps?: number | null
          created_at?: string
          given_after_meal?: boolean
          id?: string
          order_id: string
          payment_id?: string | null
          released_at?: string | null
          restaurant_id: string
        }
        Update: {
          amount_ore?: number
          chosen_as?: string
          chosen_bps?: number | null
          created_at?: string
          given_after_meal?: boolean
          id?: string
          order_id?: string
          payment_id?: string | null
          released_at?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_staff_invitation: { Args: { p_token: string }; Returns: string }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_create_restaurant: { Args: { p_input: Json }; Returns: string }
      allowed_vat_rates: {
        Args: { p_country: Database["public"]["Enums"]["country_code"] }
        Returns: number[]
      }
      apply_for_restaurant: { Args: { p_input: Json }; Returns: string }
      assert_not_last_owner: {
        Args: { p_restaurant_id: string; p_user_id: string }
        Returns: undefined
      }
      can_grant_role: {
        Args: {
          p_granter: Database["public"]["Enums"]["staff_role"]
          p_target: Database["public"]["Enums"]["staff_role"]
        }
        Returns: boolean
      }
      close_settlement_period: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: string
      }
      close_table_session: {
        Args: { p_actor_id?: string; p_session_id: string }
        Returns: undefined
      }
      confirm_order_payment: {
        Args: { p_method?: string; p_payment_id: string }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      country_time_zone: {
        Args: { p_country: Database["public"]["Enums"]["country_code"] }
        Returns: string
      }
      currency_for_country: {
        Args: { p_country: Database["public"]["Enums"]["country_code"] }
        Returns: Database["public"]["Enums"]["currency_code"]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      erase_guest: { Args: { p_user_id: string }; Returns: Json }
      expire_loyalty_points: {
        Args: { p_at?: string }
        Returns: {
          accounts_touched: number
          points_expired: number
        }[]
      }
      export_guest_data: { Args: { p_user_id: string }; Returns: Json }
      fail_order_payment: {
        Args: { p_payment_id: string; p_reason?: string }
        Returns: undefined
      }
      fail_refund: {
        Args: { p_reason?: string; p_refund_id: string }
        Returns: undefined
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      gift_card_balance: { Args: { p_gift_card_id: string }; Returns: number }
      has_platform_role: {
        Args: { p_roles: Database["public"]["Enums"]["platform_role"][] }
        Returns: boolean
      }
      has_role_at: {
        Args: {
          p_restaurant_id: string
          p_roles: Database["public"]["Enums"]["staff_role"][]
        }
        Returns: boolean
      }
      invite_staff: {
        Args: {
          p_email: string
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_token: string
        }
        Returns: string
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_restaurant_open: {
        Args: { p_at?: string; p_restaurant_id: string }
        Returns: boolean
      }
      is_staff_of: { Args: { p_restaurant_id: string }; Returns: boolean }
      issue_gift_card: {
        Args: {
          p_actor_id?: string
          p_amount_ore: number
          p_code: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_email?: string
          p_expires_at?: string
          p_note?: string
          p_restaurant_id: string
        }
        Returns: string
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      loyalty_balance: {
        Args: { p_account_id: string; p_at?: string }
        Returns: number
      }
      loyalty_expiry_months: { Args: never; Returns: number }
      mark_notice_sent: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      my_role_at: {
        Args: { p_restaurant_id: string }
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      open_restaurant_ids: {
        Args: { p_at?: string }
        Returns: {
          restaurant_id: string
        }[]
      }
      open_table_session: {
        Args: {
          p_idle_minutes?: number
          p_restaurant_id: string
          p_table_id: string
        }
        Returns: string
      }
      place_order: { Args: { p_payload: Json }; Returns: string }
      platform_revenue_by_currency: {
        Args: { p_from: string; p_to: string }
        Returns: {
          burp_revenue_ore: number
          currency: Database["public"]["Enums"]["currency_code"]
          gmv_ore: number
          orders_count: number
          tips_ore: number
        }[]
      }
      platform_settlement_preview: {
        Args: { p_period_end: string; p_period_start: string }
        Returns: {
          amount_due_ore: number
          cash_ore: number
          currency: Database["public"]["Enums"]["currency_code"]
          fee_credit_ore: number
          fees_ore: number
          gross_ore: number
          orders_count: number
          refunds_ore: number
          restaurant_id: string
          restaurant_name: string
          settlement_id: string
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          tips_ore: number
        }[]
      }
      platform_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          orders_count: number
          restaurants_active: number
          restaurants_pending: number
          restaurants_total: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      punch_card_status: {
        Args: { p_guest_id: string; p_restaurant_id: string }
        Returns: {
          completed_orders: number
          rewards_redeemed: number
          size: number
        }[]
      }
      rate_limit_hit: {
        Args: {
          p_at?: string
          p_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      recalculate_order_totals: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      redeem_coupon: {
        Args: {
          p_coupon_id: string
          p_discount_ore: number
          p_guest_id: string
          p_order_id: string
        }
        Returns: undefined
      }
      redeem_gift_card: {
        Args: { p_amount_ore: number; p_code: string; p_order_id: string }
        Returns: string
      }
      redeem_punch_card: {
        Args: {
          p_guest_id: string
          p_order_id: string
          p_restaurant_id: string
          p_reward_ore: number
        }
        Returns: number
      }
      remove_order_item: {
        Args: { p_actor?: string; p_item_id: string; p_order_id: string }
        Returns: undefined
      }
      request_refund: {
        Args: {
          p_actor_id?: string
          p_amount_ore: number
          p_payment_id: string
          p_reason: string
        }
        Returns: string
      }
      restaurant_money_events: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          actor_kind: string
          actor_name: string
          amount_ore: number
          at: string
          currency: Database["public"]["Enums"]["currency_code"]
          kind: string
          order_id: string
          reason: string
        }[]
      }
      restaurant_period_range: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: unknown
      }
      restaurant_prep_times: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          measured_orders: number
          median_seconds: number
          p90_seconds: number
        }[]
      }
      restaurant_refund_summary: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          currency: Database["public"]["Enums"]["currency_code"]
          refunds_count: number
          refunds_ore: number
        }[]
      }
      restaurant_revenue_summary: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          avg_order_ore: number
          fees_ore: number
          items_gross_ore: number
          items_net_ore: number
          items_vat_ore: number
          orders_count: number
          tips_ore: number
        }[]
      }
      restaurant_staff: {
        Args: { p_restaurant_id: string }
        Returns: {
          email: string
          full_name: string
          is_active: boolean
          is_me: boolean
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }[]
      }
      restaurant_table_revenue: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          gross_ore: number
          orders_count: number
          table_number: string
          zone: string
        }[]
      }
      restaurant_tips_summary: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          card_ore: number
          cash_ore: number
          pending_ore: number
          tips_ore: number
        }[]
      }
      restaurant_top_items: {
        Args: {
          p_from: string
          p_limit?: number
          p_restaurant_id: string
          p_to: string
        }
        Returns: {
          gross_ore: number
          name: string
          quantity: number
        }[]
      }
      restaurant_vat_breakdown: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          vat_ore: number
          vat_rate_bps: number
        }[]
      }
      revoke_staff_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      save_floor_plan_positions: {
        Args: { p_floor_plan_id: string; p_positions: Json }
        Returns: number
      }
      set_staff_active: {
        Args: { p_active: boolean; p_restaurant_id: string; p_user_id: string }
        Returns: undefined
      }
      set_staff_locale: { Args: { p_locale: string }; Returns: undefined }
      set_staff_role: {
        Args: {
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      settle_refund: {
        Args: { p_provider_reference?: string; p_refund_id: string }
        Returns: Database["public"]["Enums"]["payment_status"]
      }
      settle_table_session: {
        Args: {
          p_actor_id?: string
          p_provider?: string
          p_received_ore: number
          p_session_id: string
        }
        Returns: string
      }
      settlement_preview: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: {
          amount_due_ore: number
          cash_ore: number
          currency: Database["public"]["Enums"]["currency_code"]
          fee_credit_ore: number
          fees_ore: number
          gross_ore: number
          orders_count: number
          refunds_ore: number
          tips_ore: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { input: string }; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      table_session_bill: {
        Args: { p_session_id: string }
        Returns: {
          due_ore: number
          order_id: string
          paid_ore: number
          total_ore: number
        }[]
      }
      unique_restaurant_slug: {
        Args: { p_city: string; p_name: string }
        Returns: string
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      content_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      country_code: "BA" | "HR" | "RS" | "SE"
      coupon_funder: "BURP" | "RESTAURANT"
      currency_code: "BAM" | "EUR" | "RSD" | "SEK"
      fee_base: "GROSS_ITEMS" | "NET_ITEMS" | "GROSS_TOTAL"
      gift_card_kind: "ISSUE" | "REDEEM" | "REFUND"
      invitation_status: "PENDING" | "ACCEPTED" | "REVOKED"
      loyalty_kind:
        | "EARN"
        | "REDEEM"
        | "EXPIRE"
        | "REFERRAL"
        | "BIRTHDAY"
        | "ADJUSTMENT"
      media_kind: "IMAGE" | "VIDEO"
      media_status: "PENDING" | "APPROVED" | "REJECTED"
      notification_kind: "ORDER_ACCEPTED" | "ORDER_READY"
      order_status:
        | "DRAFT"
        | "PLACED"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "COMPLETED"
        | "CANCELLED"
        | "REFUNDED"
      order_type: "DELIVERY" | "PICKUP" | "TABLE"
      payment_account_status: "PENDING" | "ACTIVE" | "DISABLED"
      payment_status:
        | "PENDING"
        | "AUTHORIZED"
        | "CAPTURED"
        | "FAILED"
        | "REFUNDED"
        | "PARTIALLY_REFUNDED"
      platform_role: "support" | "admin" | "owner"
      refund_status: "PENDING" | "SUCCEEDED" | "FAILED"
      restaurant_status: "PENDING" | "ACTIVE" | "PAUSED" | "SUSPENDED"
      reward_funder: "BURP" | "RESTAURANT"
      settlement_status: "DRAFT" | "INVOICED" | "PAID" | "VOID"
      staff_role: "owner" | "manager" | "staff" | "kitchen"
      table_session_status: "OPEN" | "CLOSED"
      table_shape: "ROUND" | "SQUARE" | "RECT"
      table_status: "ACTIVE" | "LOCKED" | "ARCHIVED"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      content_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      country_code: ["BA", "HR", "RS", "SE"],
      coupon_funder: ["BURP", "RESTAURANT"],
      currency_code: ["BAM", "EUR", "RSD", "SEK"],
      fee_base: ["GROSS_ITEMS", "NET_ITEMS", "GROSS_TOTAL"],
      gift_card_kind: ["ISSUE", "REDEEM", "REFUND"],
      invitation_status: ["PENDING", "ACCEPTED", "REVOKED"],
      loyalty_kind: [
        "EARN",
        "REDEEM",
        "EXPIRE",
        "REFERRAL",
        "BIRTHDAY",
        "ADJUSTMENT",
      ],
      media_kind: ["IMAGE", "VIDEO"],
      media_status: ["PENDING", "APPROVED", "REJECTED"],
      notification_kind: ["ORDER_ACCEPTED", "ORDER_READY"],
      order_status: [
        "DRAFT",
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "COMPLETED",
        "CANCELLED",
        "REFUNDED",
      ],
      order_type: ["DELIVERY", "PICKUP", "TABLE"],
      payment_account_status: ["PENDING", "ACTIVE", "DISABLED"],
      payment_status: [
        "PENDING",
        "AUTHORIZED",
        "CAPTURED",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      platform_role: ["support", "admin", "owner"],
      refund_status: ["PENDING", "SUCCEEDED", "FAILED"],
      restaurant_status: ["PENDING", "ACTIVE", "PAUSED", "SUSPENDED"],
      reward_funder: ["BURP", "RESTAURANT"],
      settlement_status: ["DRAFT", "INVOICED", "PAID", "VOID"],
      staff_role: ["owner", "manager", "staff", "kitchen"],
      table_session_status: ["OPEN", "CLOSED"],
      table_shape: ["ROUND", "SQUARE", "RECT"],
      table_status: ["ACTIVE", "LOCKED", "ARCHIVED"],
    },
  },
} as const

