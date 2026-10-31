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
      appointments: Table<{ id: string; booking_code: string; booking_request_id: string | null; customer_name: string; customer_phone: string; service_id: string; barber_id: string; starts_at: string; ends_at: string; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'; notes: string | null; service_name_snapshot: string; price_idr_snapshot: number; duration_minutes_snapshot: number; cancellation_reason: string | null; cancelled_at: string | null; created_at: string; updated_at: string }>;
      appointment_services: Table<{ appointment_id: string; service_id: string; service_name: string; price_idr: number; duration_minutes: number; position: number }>;
      appointment_manage_tokens: Table<{ appointment_id: string; token_hash: string; expires_at: string; revoked_at: string | null; created_at: string }>;
      booking_audit_logs: Table<{ id: number; appointment_id: string; actor: string; action: string; changed_fields: Json; created_at: string }>;
      profiles: Table<{ id: string; role: 'admin' | 'barber'; full_name: string | null; created_at: string }>;
      shop_settings: Table<{ id: number; shop_name: string; address: string | null; city: string | null; timezone: string; phone_whatsapp: string | null; instagram_url: string | null; opening_hours: Json; booking_notice_minutes: number; booking_horizon_days: number; customer_cancellation_deadline_minutes: number; customer_reschedule_deadline_minutes: number; updated_at: string }>;
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
      create_public_booking_managed: {
        Args: { p_service_id: string; p_barber_id: string | null; p_starts_at: string; p_customer_name: string; p_customer_phone: string; p_notes: string | null; p_client_hash: string; p_manage_token_hash: string };
        Returns: { appointment_id: string; booking_code: string; barber_name: string; service_name: string; starts_at: string }[];
      };
      manage_public_booking: {
        Args: { p_token_hash: string; p_action: string; p_new_starts_at: string | null; p_cancellation_reason: string | null };
        Returns: { booking_code: string; status: string; service_name: string; barber_name: string; starts_at: string; ends_at: string; service_id: string; barber_id: string; price_idr: number; duration_minutes: number; timezone: string; can_cancel: boolean; can_reschedule: boolean; cancellation_deadline_minutes: number; reschedule_deadline_minutes: number }[];
      };
      admin_revoke_booking_manage_token: { Args: { p_appointment_id: string }; Returns: undefined };
      admin_finance_summary: { Args: { p_from: string; p_to: string }; Returns: { booking_count: number; completed_revenue: number; scheduled_value: number; pending_count: number; confirmed_count: number; completed_count: number; cancelled_count: number; no_show_count: number; average_completed_ticket: number }[] };
      get_public_availability: {
        Args: { p_date: string; p_service_id: string; p_barber_id: string | null };
        Returns: { starts_at: string; barber_id: string; barber_name: string }[];
      };
      get_booking_slots: {
        Args: { p_date: string; p_service_ids: string[]; p_barber_id: string | null };
        Returns: { starts_at: string; barber_id: string; barber_name: string; is_available: boolean }[];
      };
      get_booking_calendar: {
        Args: { p_from: string; p_to: string; p_service_ids: string[]; p_barber_id: string | null };
        Returns: { booking_date: string; is_available: boolean }[];
      };
      get_managed_booking_slots: {
        Args: { p_token_hash: string; p_date: string };
        Returns: { starts_at: string; barber_id: string; barber_name: string; is_available: boolean }[];
      };
      create_booking_request: {
        Args: { p_service_ids: string[]; p_barber_id: string | null; p_starts_at: string; p_customer_name: string; p_customer_phone: string; p_notes: string | null; p_client_hash: string; p_manage_token_hash: string; p_request_id: string; p_expected_price: number | null; p_expected_duration: number | null };
        Returns: { appointment_id: string; booking_code: string; barber_name: string; service_name: string; starts_at: string; price_idr: number; duration_minutes: number; booking_status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' }[];
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      set_barber_services: { Args: { p_barber_id: string; p_service_ids: string[] }; Returns: undefined };
      admin_update_shop_setup: { Args: { p_shop_name: string; p_address: string; p_city: string; p_timezone: string; p_phone_whatsapp: string; p_instagram_url: string; p_booking_notice_minutes: number; p_booking_horizon_days: number; p_hours: Json }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
