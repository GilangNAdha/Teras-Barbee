export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      services: Table<{ id: string; name: string; slug: string; description: string; category: 'HAIRCUT' | 'COMBO' | 'BEARD'; duration_minutes: number; price_idr: number; image_url: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string }>;
      barbers: Table<{ id: string; name: string; slug: string; bio: string; specialties: string[]; portrait_url: string | null; preview_cut_url: string | null; years_experience: number | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string }>;
      barber_services: Table<{ barber_id: string; service_id: string }>;
      barber_contact_channels: Table<{ barber_id: string; phone_whatsapp: string; updated_at: string }>;
      gallery_images: Table<{ id: string; storage_path: string; alt_text: string; category: string | null; sort_order: number; is_visible: boolean; created_at: string }>;
      appointments: Table<{ id: string; booking_code: string; customer_name: string; customer_phone: string; service_id: string; barber_id: string; starts_at: string; ends_at: string; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'; notes: string | null; created_at: string; updated_at: string }>;
      profiles: Table<{ id: string; role: 'admin' | 'barber'; full_name: string | null; created_at: string }>;
      shop_settings: Table<{ id: number; shop_name: string; address: string | null; city: string | null; timezone: string; phone_whatsapp: string | null; instagram_url: string | null; opening_hours: Json; booking_notice_minutes: number; booking_horizon_days: number; updated_at: string }>;
      shop_hours: Table<{ day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>;
      barber_hours: Table<{ barber_id: string; day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>;
      booking_rate_limits: Table<{ id: string; client_hash: string; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_public_booking: {
        Args: { p_service_id: string; p_barber_id: string | null; p_starts_at: string; p_customer_name: string; p_customer_phone: string; p_notes: string | null; p_client_hash: string };
        Returns: { appointment_id: string; booking_code: string; barber_name: string; service_name: string; starts_at: string }[];
      };
      get_public_availability: {
        Args: { p_date: string; p_service_id: string; p_barber_id: string | null };
        Returns: { starts_at: string; barber_id: string; barber_name: string }[];
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      set_barber_services: { Args: { p_barber_id: string; p_service_ids: string[] }; Returns: undefined };
      admin_update_shop_setup: { Args: { p_shop_name: string; p_address: string; p_city: string; p_timezone: string; p_phone_whatsapp: string; p_instagram_url: string; p_booking_notice_minutes: number; p_booking_horizon_days: number; p_hours: Json }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
