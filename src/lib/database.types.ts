
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_id": string | null,"changes": NonNullable<Json>,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"brands": {
                  Row: {
                    "banner_url": string | null,"created_at": string,"description": string,"id": string,"is_featured": boolean,"is_published": boolean,"is_sample": boolean,"logo_url": string | null,"name": string,"seo_description": string,"seo_title": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"is_featured"?: boolean,"is_published"?: boolean,"is_sample"?: boolean,"logo_url"?: string | null,"name": string,"seo_description"?: string,"seo_title"?: string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"is_featured"?: boolean,"is_published"?: boolean,"is_sample"?: boolean,"logo_url"?: string | null,"name"?: string,"seo_description"?: string,"seo_title"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "cart_id": string,"created_at": string,"id": string,"quantity": number,"updated_at": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cart_id": string,"created_at"?: string,"id"?: string,"quantity": number,"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "cart_id"?: string,"created_at"?: string,"id"?: string,"quantity"?: number,"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "contact_email": string | null,"coupon_code": string | null,"created_at": string,"id": string,"reminder_sent_at": string | null,"token_hash": string | null,"updated_at": string,"user_id": string | null,"whatsapp_opt_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_email"?: string | null,"coupon_code"?: string | null,"created_at"?: string,"id"?: string,"reminder_sent_at"?: string | null,"token_hash"?: string | null,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "contact_email"?: string | null,"coupon_code"?: string | null,"created_at"?: string,"id"?: string,"reminder_sent_at"?: string | null,"token_hash"?: string | null,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "banner_url": string | null,"created_at": string,"description": string,"id": string,"image_url": string | null,"is_published": boolean,"is_sample": boolean,"name": string,"parent_id": string | null,"seo_description": string,"seo_title": string,"size_guide_id": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"image_url"?: string | null,"is_published"?: boolean,"is_sample"?: boolean,"name": string,"parent_id"?: string | null,"seo_description"?: string,"seo_title"?: string,"size_guide_id"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"image_url"?: string | null,"is_published"?: boolean,"is_sample"?: boolean,"name"?: string,"parent_id"?: string | null,"seo_description"?: string,"seo_title"?: string,"size_guide_id"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_size_guide_id_fkey"
      columns: ["size_guide_id"]
isOneToOne: false
      referencedRelation: "size_guides"
      referencedColumns: ["id"]
    }
                  ]
                },"cod_blocklist": {
                  Row: {
                    "created_at": string,"created_by": string | null,"kind": string,"order_id": string | null,"reason": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"kind": string,"order_id"?: string | null,"reason"?: string,"value": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"kind"?: string,"order_id"?: string | null,"reason"?: string,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cod_blocklist_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_products": {
                  Row: {
                    "collection_id": string,"position": number,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collection_id": string,"position"?: number,"product_id": string
                  }
                  Update: {
                    "collection_id"?: string,"position"?: number,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_products_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "banner_url": string | null,"created_at": string,"description": string,"ends_at": string | null,"id": string,"image_url": string | null,"is_featured": boolean,"is_published": boolean,"is_sample": boolean,"is_seasonal": boolean,"kind": Database["public"]['Enums']["collection_kind"],"product_sort": string,"rules": NonNullable<Json>,"season": string,"seo_description": string,"seo_title": string,"slug": string,"sort_order": number,"starts_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"ends_at"?: string | null,"id"?: string,"image_url"?: string | null,"is_featured"?: boolean,"is_published"?: boolean,"is_sample"?: boolean,"is_seasonal"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"product_sort"?: string,"rules"?: NonNullable<Json>,"season"?: string,"seo_description"?: string,"seo_title"?: string,"slug": string,"sort_order"?: number,"starts_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "banner_url"?: string | null,"created_at"?: string,"description"?: string,"ends_at"?: string | null,"id"?: string,"image_url"?: string | null,"is_featured"?: boolean,"is_published"?: boolean,"is_sample"?: boolean,"is_seasonal"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"product_sort"?: string,"rules"?: NonNullable<Json>,"season"?: string,"seo_description"?: string,"seo_title"?: string,"slug"?: string,"sort_order"?: number,"starts_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_messages": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"message": string,"name": string,"order_number": string,"status": string,"subject": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"message": string,"name": string,"order_number"?: string,"status"?: string,"subject"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"message"?: string,"name"?: string,"order_number"?: string,"status"?: string,"subject"?: string
                  }
                  Relationships: [
                    
                  ]
                },"coupon_redemptions": {
                  Row: {
                    "amount": number,"coupon_id": string,"created_at": string,"email": string,"id": string,"order_id": string,"user_id": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"coupon_id": string,"created_at"?: string,"email": string,"id"?: string,"order_id": string,"user_id"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "amount"?: number,"coupon_id"?: string,"created_at"?: string,"email"?: string,"id"?: string,"order_id"?: string,"user_id"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "coupon_redemptions_coupon_id_fkey"
      columns: ["coupon_id"]
isOneToOne: false
      referencedRelation: "coupons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coupon_redemptions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"coupons": {
                  Row: {
                    "applies_to": string,"category_ids": (string)[],"code": string,"collection_ids": (string)[],"created_at": string,"customer_emails": (string)[],"description": string,"ends_at": string | null,"first_order_only": boolean,"id": string,"is_active": boolean,"is_sample": boolean,"kind": Database["public"]['Enums']["discount_kind"],"max_discount": number | null,"min_subtotal": number,"product_ids": (string)[],"starts_at": string | null,"updated_at": string,"usage_limit": number | null,"usage_limit_per_customer": number | null,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to"?: string,"category_ids"?: (string)[],"code": string,"collection_ids"?: (string)[],"created_at"?: string,"customer_emails"?: (string)[],"description"?: string,"ends_at"?: string | null,"first_order_only"?: boolean,"id"?: string,"is_active"?: boolean,"is_sample"?: boolean,"kind": Database["public"]['Enums']["discount_kind"],"max_discount"?: number | null,"min_subtotal"?: number,"product_ids"?: (string)[],"starts_at"?: string | null,"updated_at"?: string,"usage_limit"?: number | null,"usage_limit_per_customer"?: number | null,"value"?: number
                  }
                  Update: {
                    "applies_to"?: string,"category_ids"?: (string)[],"code"?: string,"collection_ids"?: (string)[],"created_at"?: string,"customer_emails"?: (string)[],"description"?: string,"ends_at"?: string | null,"first_order_only"?: boolean,"id"?: string,"is_active"?: boolean,"is_sample"?: boolean,"kind"?: Database["public"]['Enums']["discount_kind"],"max_discount"?: number | null,"min_subtotal"?: number,"product_ids"?: (string)[],"starts_at"?: string | null,"updated_at"?: string,"usage_limit"?: number | null,"usage_limit_per_customer"?: number | null,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"courier_events": {
                  Row: {
                    "error": string | null,"event_key": string,"id": number,"order_id": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"provider": string,"received_at": string,"shipment_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"event_key": string,"id"?: never,"order_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider": string,"received_at"?: string,"shipment_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "error"?: string | null,"event_key"?: string,"id"?: never,"order_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"shipment_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courier_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "courier_events_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_addresses": {
                  Row: {
                    "city": string,"country": string,"created_at": string,"full_name": string,"id": string,"is_default": boolean,"label": string,"landmark": string,"line1": string,"line2": string,"phone": string,"postal_code": string,"state": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city": string,"country"?: string,"created_at"?: string,"full_name": string,"id"?: string,"is_default"?: boolean,"label"?: string,"landmark"?: string,"line1": string,"line2"?: string,"phone": string,"postal_code": string,"state": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "city"?: string,"country"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"is_default"?: boolean,"label"?: string,"landmark"?: string,"line1"?: string,"line2"?: string,"phone"?: string,"postal_code"?: string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"customer_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"customer_id": string,"id"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"customer_id"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"data": NonNullable<Json>,"id": string,"last_error": string | null,"order_id": string | null,"provider_message_id": string | null,"sent_at": string | null,"status": string,"template": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template": string,"to_email": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"email_suppressions": {
                  Row: {
                    "created_at": string,"email": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"reason"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"reason"?: string
                  }
                  Relationships: [
                    
                  ]
                },"inventory_movements": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"delta": number,"id": number,"note": string | null,"order_id": string | null,"product_id": string | null,"quantity_after": number,"reason": Database["public"]['Enums']["inventory_reason"],"sku": string,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"delta": number,"id"?: never,"note"?: string | null,"order_id"?: string | null,"product_id"?: string | null,"quantity_after": number,"reason": Database["public"]['Enums']["inventory_reason"],"sku": string,"variant_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"delta"?: number,"id"?: never,"note"?: string | null,"order_id"?: string | null,"product_id"?: string | null,"quantity_after"?: number,"reason"?: Database["public"]['Enums']["inventory_reason"],"sku"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_order_fk"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"newsletter_subscribers": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"source": string,"unsubscribed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"source"?: string,"unsubscribed_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"source"?: string,"unsubscribed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"order_events": {
                  Row: {
                    "actor_id": string | null,"actor_type": string,"created_at": string,"data": NonNullable<Json>,"id": number,"is_internal": boolean,"kind": string,"message": string,"order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_type"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"is_internal"?: boolean,"kind": string,"message"?: string,"order_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_type"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"is_internal"?: boolean,"kind"?: string,"message"?: string,"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "brand_name": string,"color": string,"compare_at_price": number | null,"created_at": string,"discount_amount": number,"id": string,"image_url": string | null,"is_returnable": boolean,"line_total": number,"order_id": string,"product_id": string | null,"product_slug": string,"product_title": string,"quantity": number,"quantity_returned": number,"return_window_days": number,"size": string,"sku": string,"tax_amount": number,"tax_rate_bps": number,"unit_price": number,"variant_id": string | null,"variant_title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_name"?: string,"color"?: string,"compare_at_price"?: number | null,"created_at"?: string,"discount_amount"?: number,"id"?: string,"image_url"?: string | null,"is_returnable"?: boolean,"line_total": number,"order_id": string,"product_id"?: string | null,"product_slug"?: string,"product_title": string,"quantity": number,"quantity_returned"?: number,"return_window_days"?: number,"size"?: string,"sku": string,"tax_amount"?: number,"tax_rate_bps"?: number,"unit_price": number,"variant_id"?: string | null,"variant_title"?: string
                  }
                  Update: {
                    "brand_name"?: string,"color"?: string,"compare_at_price"?: number | null,"created_at"?: string,"discount_amount"?: number,"id"?: string,"image_url"?: string | null,"is_returnable"?: boolean,"line_total"?: number,"order_id"?: string,"product_id"?: string | null,"product_slug"?: string,"product_title"?: string,"quantity"?: number,"quantity_returned"?: number,"return_window_days"?: number,"size"?: string,"sku"?: string,"tax_amount"?: number,"tax_rate_bps"?: number,"unit_price"?: number,"variant_id"?: string | null,"variant_title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_refunded": number,"attention_reason": string | null,"billing_address": Json | null,"cancel_reason": string | null,"cancelled_at": string | null,"cart_id": string | null,"cod_confirm_by": string | null,"cod_confirmation": string,"cod_confirmed_at": string | null,"cod_fee": number,"coupon_code": string | null,"created_at": string,"currency": string,"customer_name": string,"customer_note": string,"delivered_at": string | null,"discount_total": number,"email": string,"expires_at": string | null,"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],"grand_total": number,"id": string,"idempotency_key": string | null,"needs_attention": boolean,"order_number": string,"paid_at": string | null,"payment_method": string,"payment_status": Database["public"]['Enums']["order_payment_status"],"phone": string,"placed_at": string,"shipped_at": string | null,"shipping_address": NonNullable<Json>,"shipping_method": NonNullable<Json>,"shipping_rate_id": string | null,"shipping_total": number,"status": Database["public"]['Enums']["order_status"],"subtotal": number,"tax_label": string,"tax_mode": string,"tax_total": number,"updated_at": string,"user_id": string | null,"whatsapp_opt_in": boolean,"order_brief": Json | null
                  }
                  ComputedFields: "order_brief"
                  Insert: {
                    "amount_refunded"?: number,"attention_reason"?: string | null,"billing_address"?: Json | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cart_id"?: string | null,"cod_confirm_by"?: string | null,"cod_confirmation"?: string,"cod_confirmed_at"?: string | null,"cod_fee"?: number,"coupon_code"?: string | null,"created_at"?: string,"currency"?: string,"customer_name"?: string,"customer_note"?: string,"delivered_at"?: string | null,"discount_total"?: number,"email": string,"expires_at"?: string | null,"fulfillment_status"?: Database["public"]['Enums']["fulfillment_status"],"grand_total": number,"id"?: string,"idempotency_key"?: string | null,"needs_attention"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method": string,"payment_status"?: Database["public"]['Enums']["order_payment_status"],"phone"?: string,"placed_at"?: string,"shipped_at"?: string | null,"shipping_address": NonNullable<Json>,"shipping_method"?: NonNullable<Json>,"shipping_rate_id"?: string | null,"shipping_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal": number,"tax_label"?: string,"tax_mode": string,"tax_total"?: number,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "amount_refunded"?: number,"attention_reason"?: string | null,"billing_address"?: Json | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cart_id"?: string | null,"cod_confirm_by"?: string | null,"cod_confirmation"?: string,"cod_confirmed_at"?: string | null,"cod_fee"?: number,"coupon_code"?: string | null,"created_at"?: string,"currency"?: string,"customer_name"?: string,"customer_note"?: string,"delivered_at"?: string | null,"discount_total"?: number,"email"?: string,"expires_at"?: string | null,"fulfillment_status"?: Database["public"]['Enums']["fulfillment_status"],"grand_total"?: number,"id"?: string,"idempotency_key"?: string | null,"needs_attention"?: boolean,"order_number"?: string,"paid_at"?: string | null,"payment_method"?: string,"payment_status"?: Database["public"]['Enums']["order_payment_status"],"phone"?: string,"placed_at"?: string,"shipped_at"?: string | null,"shipping_address"?: NonNullable<Json>,"shipping_method"?: NonNullable<Json>,"shipping_rate_id"?: string | null,"shipping_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_label"?: string,"tax_mode"?: string,"tax_total"?: number,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_shipping_rate_id_fkey"
      columns: ["shipping_rate_id"]
isOneToOne: false
      referencedRelation: "shipping_rates"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "error": string | null,"event_id": string,"event_type": string,"id": number,"order_id": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"event_id": string,"event_type": string,"id"?: never,"order_id"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"received_at"?: string
                  }
                  Update: {
                    "error"?: string | null,"event_id"?: string,"event_type"?: string,"id"?: never,"order_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"received_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"amount_refunded": number,"captured_at": string | null,"created_at": string,"currency": string,"details": NonNullable<Json>,"error_code": string | null,"error_description": string | null,"id": string,"method": string | null,"order_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_order_id": string | null,"provider_payment_id": string | null,"status": Database["public"]['Enums']["payment_state"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_refunded"?: number,"captured_at"?: string | null,"created_at"?: string,"currency": string,"details"?: NonNullable<Json>,"error_code"?: string | null,"error_description"?: string | null,"id"?: string,"method"?: string | null,"order_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_order_id"?: string | null,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_state"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"amount_refunded"?: number,"captured_at"?: string | null,"created_at"?: string,"currency"?: string,"details"?: NonNullable<Json>,"error_code"?: string | null,"error_description"?: string | null,"id"?: string,"method"?: string | null,"order_id"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_order_id"?: string | null,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_state"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"postal_code_rules": {
                  Row: {
                    "blocks": string,"created_at": string,"note": string,"postal_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocks"?: string,"created_at"?: string,"note"?: string,"postal_code": string
                  }
                  Update: {
                    "blocks"?: string,"created_at"?: string,"note"?: string,"postal_code"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_images": {
                  Row: {
                    "alt": string,"color": string | null,"created_at": string,"height": number | null,"id": string,"position": number,"product_id": string,"storage_path": string | null,"url": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"color"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"position"?: number,"product_id": string,"storage_path"?: string | null,"url": string,"width"?: number | null
                  }
                  Update: {
                    "alt"?: string,"color"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"position"?: number,"product_id"?: string,"storage_path"?: string | null,"url"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_reviews": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"id": string,"is_verified_purchase": boolean,"order_id": string | null,"product_id": string,"rating": number,"status": Database["public"]['Enums']["review_state"],"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"id"?: string,"is_verified_purchase"?: boolean,"order_id"?: string | null,"product_id": string,"rating": number,"status"?: Database["public"]['Enums']["review_state"],"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"id"?: string,"is_verified_purchase"?: boolean,"order_id"?: string | null,"product_id"?: string,"rating"?: number,"status"?: Database["public"]['Enums']["review_state"],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_reviews_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "barcode": string | null,"color": string,"color_hex": string | null,"compare_at_price": number | null,"created_at": string,"id": string,"is_active": boolean,"low_stock_threshold": number | null,"position": number,"price": number | null,"product_id": string,"reserved_quantity": number,"size": string,"sku": string,"stock_quantity": number,"updated_at": string,"weight_grams": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"color"?: string,"color_hex"?: string | null,"compare_at_price"?: number | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"low_stock_threshold"?: number | null,"position"?: number,"price"?: number | null,"product_id": string,"reserved_quantity"?: number,"size"?: string,"sku": string,"stock_quantity"?: number,"updated_at"?: string,"weight_grams"?: number | null
                  }
                  Update: {
                    "barcode"?: string | null,"color"?: string,"color_hex"?: string | null,"compare_at_price"?: number | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"low_stock_threshold"?: number | null,"position"?: number,"price"?: number | null,"product_id"?: string,"reserved_quantity"?: number,"size"?: string,"sku"?: string,"stock_quantity"?: number,"updated_at"?: string,"weight_grams"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "available_stock": number,"brand_id": string | null,"care": string,"category_id": string | null,"colors": (string)[],"compare_at_price": number | null,"created_at": string,"created_by": string | null,"description": string,"fabric": string,"fit": string,"height_mm": number | null,"id": string,"is_featured": boolean,"is_returnable": boolean,"is_sample": boolean,"length_mm": number | null,"max_price": number | null,"min_price": number | null,"min_price_compare_at": number | null,"on_sale": boolean,"price": number,"published_at": string | null,"rating_avg": number | null,"rating_count": number,"return_window_days": number | null,"sales_count": number,"search_text": string,"seo_description": string,"seo_title": string,"size_guide_id": string | null,"sizes": (string)[],"slug": string,"status": Database["public"]['Enums']["product_status"],"swatches": NonNullable<Json>,"tags": (string)[],"tax_rate_bps": number | null,"title": string,"updated_at": string,"weight_grams": number | null,"width_mm": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "available_stock"?: number,"brand_id"?: string | null,"care"?: string,"category_id"?: string | null,"colors"?: (string)[],"compare_at_price"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"fabric"?: string,"fit"?: string,"height_mm"?: number | null,"id"?: string,"is_featured"?: boolean,"is_returnable"?: boolean,"is_sample"?: boolean,"length_mm"?: number | null,"max_price"?: number | null,"min_price"?: number | null,"min_price_compare_at"?: number | null,"on_sale"?: boolean,"price": number,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"return_window_days"?: number | null,"sales_count"?: number,"search_text"?: string,"seo_description"?: string,"seo_title"?: string,"size_guide_id"?: string | null,"sizes"?: (string)[],"slug": string,"status"?: Database["public"]['Enums']["product_status"],"swatches"?: NonNullable<Json>,"tags"?: (string)[],"tax_rate_bps"?: number | null,"title": string,"updated_at"?: string,"weight_grams"?: number | null,"width_mm"?: number | null
                  }
                  Update: {
                    "available_stock"?: number,"brand_id"?: string | null,"care"?: string,"category_id"?: string | null,"colors"?: (string)[],"compare_at_price"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"fabric"?: string,"fit"?: string,"height_mm"?: number | null,"id"?: string,"is_featured"?: boolean,"is_returnable"?: boolean,"is_sample"?: boolean,"length_mm"?: number | null,"max_price"?: number | null,"min_price"?: number | null,"min_price_compare_at"?: number | null,"on_sale"?: boolean,"price"?: number,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"return_window_days"?: number | null,"sales_count"?: number,"search_text"?: string,"seo_description"?: string,"seo_title"?: string,"size_guide_id"?: string | null,"sizes"?: (string)[],"slug"?: string,"status"?: Database["public"]['Enums']["product_status"],"swatches"?: NonNullable<Json>,"tags"?: (string)[],"tax_rate_bps"?: number | null,"title"?: string,"updated_at"?: string,"weight_grams"?: number | null,"width_mm"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_size_guide_id_fkey"
      columns: ["size_guide_id"]
isOneToOne: false
      referencedRelation: "size_guides"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"marketing_opt_in": boolean,"phone": string,"price_alert_sent_at": string | null,"price_alerts": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"marketing_opt_in"?: boolean,"phone"?: string,"price_alert_sent_at"?: string | null,"price_alerts"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string,"price_alert_sent_at"?: string | null,"price_alerts"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits": number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"refunds": {
                  Row: {
                    "amount": number,"created_at": string,"error": string | null,"id": string,"initiated_by": string | null,"order_id": string,"payment_id": string | null,"processed_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_refund_id": string | null,"reason": string,"reference": string,"return_request_id": string | null,"status": Database["public"]['Enums']["refund_state"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"error"?: string | null,"id"?: string,"initiated_by"?: string | null,"order_id": string,"payment_id"?: string | null,"processed_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_refund_id"?: string | null,"reason"?: string,"reference"?: string,"return_request_id"?: string | null,"status"?: Database["public"]['Enums']["refund_state"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"error"?: string | null,"id"?: string,"initiated_by"?: string | null,"order_id"?: string,"payment_id"?: string | null,"processed_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_refund_id"?: string | null,"reason"?: string,"reference"?: string,"return_request_id"?: string | null,"status"?: Database["public"]['Enums']["refund_state"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_return_request_id_fkey"
      columns: ["return_request_id"]
isOneToOne: false
      referencedRelation: "return_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"return_request_items": {
                  Row: {
                    "order_item_id": string,"quantity": number,"return_request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "order_item_id": string,"quantity": number,"return_request_id": string
                  }
                  Update: {
                    "order_item_id"?: string,"quantity"?: number,"return_request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_request_items_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_request_items_return_request_id_fkey"
      columns: ["return_request_id"]
isOneToOne: false
      referencedRelation: "return_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"return_requests": {
                  Row: {
                    "admin_note": string,"created_at": string,"details": string,"id": string,"kind": Database["public"]['Enums']["return_kind"],"order_id": string,"reason": string,"refund_amount": number | null,"resolved_at": string | null,"status": Database["public"]['Enums']["return_state"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string,"created_at"?: string,"details"?: string,"id"?: string,"kind": Database["public"]['Enums']["return_kind"],"order_id": string,"reason": string,"refund_amount"?: number | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["return_state"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "admin_note"?: string,"created_at"?: string,"details"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["return_kind"],"order_id"?: string,"reason"?: string,"refund_amount"?: number | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["return_state"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"shipments": {
                  Row: {
                    "carrier": string,"courier_events": NonNullable<Json>,"courier_status": string,"courier_status_at": string | null,"created_at": string,"created_by": string | null,"delivered_at": string | null,"estimated_delivery": string | null,"id": string,"order_id": string,"package": NonNullable<Json>,"pickup_scheduled_for": string | null,"provider": string,"provider_order_id": string | null,"provider_shipment_id": string | null,"shipped_at": string | null,"status": string,"tracking_number": string,"tracking_url": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string,"courier_events"?: NonNullable<Json>,"courier_status"?: string,"courier_status_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"estimated_delivery"?: string | null,"id"?: string,"order_id": string,"package"?: NonNullable<Json>,"pickup_scheduled_for"?: string | null,"provider"?: string,"provider_order_id"?: string | null,"provider_shipment_id"?: string | null,"shipped_at"?: string | null,"status"?: string,"tracking_number"?: string,"tracking_url"?: string,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string,"courier_events"?: NonNullable<Json>,"courier_status"?: string,"courier_status_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"estimated_delivery"?: string | null,"id"?: string,"order_id"?: string,"package"?: NonNullable<Json>,"pickup_scheduled_for"?: string | null,"provider"?: string,"provider_order_id"?: string | null,"provider_shipment_id"?: string | null,"shipped_at"?: string | null,"status"?: string,"tracking_number"?: string,"tracking_url"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"shipping_providers": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"tracking_url_template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"tracking_url_template"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"tracking_url_template"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shipping_rates": {
                  Row: {
                    "cod_available": boolean,"created_at": string,"description": string,"free_over": number | null,"id": string,"is_active": boolean,"max_days": number,"min_days": number,"name": string,"price": number,"sort_order": number,"updated_at": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cod_available"?: boolean,"created_at"?: string,"description"?: string,"free_over"?: number | null,"id"?: string,"is_active"?: boolean,"max_days"?: number,"min_days"?: number,"name": string,"price"?: number,"sort_order"?: number,"updated_at"?: string,"zone_id": string
                  }
                  Update: {
                    "cod_available"?: boolean,"created_at"?: string,"description"?: string,"free_over"?: number | null,"id"?: string,"is_active"?: boolean,"max_days"?: number,"min_days"?: number,"name"?: string,"price"?: number,"sort_order"?: number,"updated_at"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipping_rates_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "shipping_zones"
      referencedColumns: ["id"]
    }
                  ]
                },"shipping_zones": {
                  Row: {
                    "cod_available": boolean,"countries": (string)[],"created_at": string,"id": string,"is_active": boolean,"is_sample": boolean,"name": string,"postal_prefixes": (string)[],"priority": number,"states": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cod_available"?: boolean,"countries"?: (string)[],"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_sample"?: boolean,"name": string,"postal_prefixes"?: (string)[],"priority"?: number,"states"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "cod_available"?: boolean,"countries"?: (string)[],"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_sample"?: boolean,"name"?: string,"postal_prefixes"?: (string)[],"priority"?: number,"states"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"size_guides": {
                  Row: {
                    "columns": (string)[],"created_at": string,"description": string,"how_to_measure": string,"id": string,"is_sample": boolean,"name": string,"rows": NonNullable<Json>,"unit": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "columns"?: (string)[],"created_at"?: string,"description"?: string,"how_to_measure"?: string,"id"?: string,"is_sample"?: boolean,"name": string,"rows"?: NonNullable<Json>,"unit"?: string,"updated_at"?: string
                  }
                  Update: {
                    "columns"?: (string)[],"created_at"?: string,"description"?: string,"how_to_measure"?: string,"id"?: string,"is_sample"?: boolean,"name"?: string,"rows"?: NonNullable<Json>,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stock_alerts": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"notified_at": string | null,"product_id": string,"user_id": string | null,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"notified_at"?: string | null,"product_id": string,"user_id"?: string | null,"variant_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"notified_at"?: string | null,"product_id"?: string,"user_id"?: string | null,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_alerts_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_alerts_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"store_settings": {
                  Row: {
                    "accent_color": string,"background_color": string,"body_font": string,"cart_reminder_hours": number,"cart_reminders_enabled": boolean,"cod_confirm_hours": number,"cod_confirmation": boolean,"cod_enabled": boolean,"cod_fee": number,"cod_max_open_orders": number | null,"cod_max_order": number,"cod_max_returned": number | null,"cod_min_order": number,"contact": NonNullable<Json>,"currency": string,"email_templates": NonNullable<Json>,"faq": NonNullable<Json>,"free_shipping_threshold": number | null,"gstin": string,"heading_font": string,"homepage": NonNullable<Json>,"id": number,"logo_url": string | null,"low_stock_threshold": number,"maintenance_message": string,"maintenance_mode": boolean,"og_image_url": string | null,"package_defaults": NonNullable<Json>,"policies": NonNullable<Json>,"price_alerts_enabled": boolean,"primary_color": string,"razorpay_enabled": boolean,"reservation_minutes": number,"return_shipping": string,"return_shipping_fee": number,"return_window_days": number,"reviews_auto_publish": boolean,"reviews_enabled": boolean,"reviews_require_purchase": boolean,"seo_description": string,"seo_title": string,"shiprocket_courier_choice": string,"shiprocket_enabled": boolean,"shiprocket_pickup_location": string,"shiprocket_pickup_postcode": string,"social": NonNullable<Json>,"stock_alerts_enabled": boolean,"store_name": string,"stripe_enabled": boolean,"tagline": string,"tax_label": string,"tax_mode": string,"tax_slabs": NonNullable<Json>,"timezone": string,"updated_at": string,"updated_by": string | null,"whatsapp_enabled": boolean,"whatsapp_templates": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string,"background_color"?: string,"body_font"?: string,"cart_reminder_hours"?: number,"cart_reminders_enabled"?: boolean,"cod_confirm_hours"?: number,"cod_confirmation"?: boolean,"cod_enabled"?: boolean,"cod_fee"?: number,"cod_max_open_orders"?: number | null,"cod_max_order"?: number,"cod_max_returned"?: number | null,"cod_min_order"?: number,"contact"?: NonNullable<Json>,"currency"?: string,"email_templates"?: NonNullable<Json>,"faq"?: NonNullable<Json>,"free_shipping_threshold"?: number | null,"gstin"?: string,"heading_font"?: string,"homepage"?: NonNullable<Json>,"id"?: number,"logo_url"?: string | null,"low_stock_threshold"?: number,"maintenance_message"?: string,"maintenance_mode"?: boolean,"og_image_url"?: string | null,"package_defaults"?: NonNullable<Json>,"policies"?: NonNullable<Json>,"price_alerts_enabled"?: boolean,"primary_color"?: string,"razorpay_enabled"?: boolean,"reservation_minutes"?: number,"return_shipping"?: string,"return_shipping_fee"?: number,"return_window_days"?: number,"reviews_auto_publish"?: boolean,"reviews_enabled"?: boolean,"reviews_require_purchase"?: boolean,"seo_description"?: string,"seo_title"?: string,"shiprocket_courier_choice"?: string,"shiprocket_enabled"?: boolean,"shiprocket_pickup_location"?: string,"shiprocket_pickup_postcode"?: string,"social"?: NonNullable<Json>,"stock_alerts_enabled"?: boolean,"store_name"?: string,"stripe_enabled"?: boolean,"tagline"?: string,"tax_label"?: string,"tax_mode"?: string,"tax_slabs"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_enabled"?: boolean,"whatsapp_templates"?: NonNullable<Json>
                  }
                  Update: {
                    "accent_color"?: string,"background_color"?: string,"body_font"?: string,"cart_reminder_hours"?: number,"cart_reminders_enabled"?: boolean,"cod_confirm_hours"?: number,"cod_confirmation"?: boolean,"cod_enabled"?: boolean,"cod_fee"?: number,"cod_max_open_orders"?: number | null,"cod_max_order"?: number,"cod_max_returned"?: number | null,"cod_min_order"?: number,"contact"?: NonNullable<Json>,"currency"?: string,"email_templates"?: NonNullable<Json>,"faq"?: NonNullable<Json>,"free_shipping_threshold"?: number | null,"gstin"?: string,"heading_font"?: string,"homepage"?: NonNullable<Json>,"id"?: number,"logo_url"?: string | null,"low_stock_threshold"?: number,"maintenance_message"?: string,"maintenance_mode"?: boolean,"og_image_url"?: string | null,"package_defaults"?: NonNullable<Json>,"policies"?: NonNullable<Json>,"price_alerts_enabled"?: boolean,"primary_color"?: string,"razorpay_enabled"?: boolean,"reservation_minutes"?: number,"return_shipping"?: string,"return_shipping_fee"?: number,"return_window_days"?: number,"reviews_auto_publish"?: boolean,"reviews_enabled"?: boolean,"reviews_require_purchase"?: boolean,"seo_description"?: string,"seo_title"?: string,"shiprocket_courier_choice"?: string,"shiprocket_enabled"?: boolean,"shiprocket_pickup_location"?: string,"shiprocket_pickup_postcode"?: string,"social"?: NonNullable<Json>,"stock_alerts_enabled"?: boolean,"store_name"?: string,"stripe_enabled"?: boolean,"tagline"?: string,"tax_label"?: string,"tax_mode"?: string,"tax_slabs"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_enabled"?: boolean,"whatsapp_templates"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"whatsapp_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"data": NonNullable<Json>,"id": string,"last_error": string | null,"order_id": string | null,"provider_message_id": string | null,"sent_at": string | null,"status": string,"template": string,"to_phone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template": string,"to_phone": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"order_id"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template"?: string,"to_phone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_outbox_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"wishlist_items": {
                  Row: {
                    "alerted_price": number | null,"created_at": string,"price_at_add": number | null,"product_id": string,"variant_id": string | null,"wishlist_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alerted_price"?: number | null,"created_at"?: string,"price_at_add"?: number | null,"product_id": string,"variant_id"?: string | null,"wishlist_id": string
                  }
                  Update: {
                    "alerted_price"?: number | null,"created_at"?: string,"price_at_add"?: number | null,"product_id"?: string,"variant_id"?: string | null,"wishlist_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlist_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlist_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlist_items_wishlist_id_fkey"
      columns: ["wishlist_id"]
isOneToOne: false
      referencedRelation: "wishlists"
      referencedColumns: ["id"]
    }
                  ]
                },"wishlists": {
                  Row: {
                    "created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_order_event":
{ Args: { "p_actor_id"?: string,"p_actor_type"?: string,"p_data"?: Json,"p_internal"?: boolean,"p_kind": string,"p_message": string,"p_order_id": string }; Returns: undefined
                           },
"admin_add_order_note":
{ Args: { "p_note": string,"p_order_id": string }; Returns: undefined
                           },
"admin_begin_refund":
{ Args: { "p_amount": number,"p_order_id": string,"p_reason": string,"p_reference"?: string,"p_return_request_id"?: string }; Returns: Json
                           },
"admin_bulk_update_products":
{ Args: { "p_action": string,"p_ids": (string)[],"p_value": Json }; Returns: number
                           },
"admin_cancel_courier_booking":
{ Args: { "p_order_id": string,"p_shipment_id": string }; Returns: Json
                           },
"admin_cancel_order":
{ Args: { "p_order_id": string,"p_reason": string,"p_restock"?: boolean }; Returns: Json
                           },
"admin_collection_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_collection_preview":
{ Args: { "p_rules": Json }; Returns: Json
                           },
"admin_confirm_cod":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_customers":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_q"?: string }; Returns: {
              "created_at": string,"email": string,"full_name": string,"id": string,"last_order_at": string,"lifetime_spend": number,"orders_count": number,"phone": string,"total_count": number
            }[]
                           },
"admin_dashboard":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"admin_delete_products":
{ Args: { "p_ids": (string)[] }; Returns: Json
                           },
"admin_delete_sample_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_duplicate_product":
{ Args: { "p_id": string }; Returns: string
                           },
"admin_import_apply_status":
{ Args: { "p_items": Json }; Returns: number
                           },
"admin_import_products":
{ Args: { "p_options": Json,"p_products": Json }; Returns: Json
                           },
"admin_inventory_list":
{ Args: { "p": Json }; Returns: Json
                           },
"admin_mark_cod_paid":
{ Args: { "p_order_id": string,"p_reference": string }; Returns: Json
                           },
"admin_mark_rto":
{ Args: { "p_note"?: string,"p_order_id": string }; Returns: Json
                           },
"admin_media_list":
{ Args: { "p_filter": string,"p_limit": number,"p_offset": number,"p_q": string }; Returns: Json
                           },
"admin_media_lookup":
{ Args: { "p_names": (string)[] }; Returns: {
              "name": string,"path": string
            }[]
                           },
"admin_order_cod_status":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_product_list":
{ Args: { "p": Json }; Returns: Json
                           },
"admin_record_courier_booking":
{ Args: { "p_booking": Json,"p_order_id": string }; Returns: Json
                           },
"admin_save_product":
{ Args: { "p": Json }; Returns: string
                           },
"admin_set_cod_block":
{ Args: { "p_blocked": boolean,"p_order_id": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_set_fulfillment":
{ Args: { "p_carrier"?: string,"p_note"?: string,"p_notify"?: boolean,"p_order_id": string,"p_status": Database["public"]['Enums']["fulfillment_status"],"p_tracking_number"?: string,"p_tracking_url"?: string }; Returns: Json
                           },
"admin_set_stock":
{ Args: { "p_items": Json,"p_note": string,"p_reason": Database["public"]['Enums']["inventory_reason"] }; Returns: number
                           },
"admin_sku_conflicts":
{ Args: { "p_product_id": string,"p_skus": (string)[] }; Returns: {
              "product_id": string,"sku": string,"title": string
            }[]
                           },
"admin_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"email": string,"full_name": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
            }[]
                           },
"admin_update_return":
{ Args: { "p_action": string,"p_note"?: string,"p_request_id": string,"p_restock"?: boolean }; Returns: Json
                           },
"begin_refund_internal":
{ Args: { "p_actor": string,"p_amount": number,"p_order_id": string,"p_payment_id": string,"p_reason": string,"p_reference": string,"p_return_request_id": string }; Returns: Json
                           },
"best_seller_ids":
{ Args: { "p_limit"?: number }; Returns: string[]
                           },
"bootstrap_owner":
{ Args: { "p_email": string }; Returns: string
                           },
"cancel_order_internal":
{ Args: { "p_actor_id"?: string,"p_actor_type"?: string,"p_message": string,"p_order_id": string,"p_reason": string,"p_restock"?: boolean }; Returns: {
              "amount_refunded": number,
"attention_reason": string | null,
"billing_address": Json | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"cart_id": string | null,
"cod_confirm_by": string | null,
"cod_confirmation": string,
"cod_confirmed_at": string | null,
"cod_fee": number,
"coupon_code": string | null,
"created_at": string,
"currency": string,
"customer_name": string,
"customer_note": string,
"delivered_at": string | null,
"discount_total": number,
"email": string,
"expires_at": string | null,
"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],
"grand_total": number,
"id": string,
"idempotency_key": string | null,
"needs_attention": boolean,
"order_number": string,
"paid_at": string | null,
"payment_method": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"phone": string,
"placed_at": string,
"shipped_at": string | null,
"shipping_address": NonNullable<Json>,
"shipping_method": NonNullable<Json>,
"shipping_rate_id": string | null,
"shipping_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"tax_label": string,
"tax_mode": string,
"tax_total": number,
"updated_at": string,
"user_id": string | null,
"whatsapp_opt_in": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_unconfirmed_cod_orders":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"cart_find":
{ Args: { "p_create"?: boolean,"p_token": string,"p_user_id": string }; Returns: string
                           },
"cart_get":
{ Args: { "p_address"?: Json,"p_email"?: string,"p_payment_method"?: string,"p_rate_id"?: string,"p_token": string,"p_user_id": string }; Returns: Json
                           },
"cart_merge":
{ Args: { "p_token": string,"p_user_id": string }; Returns: Json
                           },
"cart_restore":
{ Args: { "p_from_cart": string,"p_token": string,"p_user_id": string }; Returns: number
                           },
"cart_set_contact":
{ Args: { "p_contact": Json,"p_token": string,"p_user_id": string }; Returns: undefined
                           },
"cart_set_coupon":
{ Args: { "p_code": string,"p_email"?: string,"p_token": string,"p_user_id": string }; Returns: Json
                           },
"cart_set_item":
{ Args: { "p_mode"?: string,"p_quantity": number,"p_token": string,"p_user_id": string,"p_variant_id": string }; Returns: Json
                           },
"catalog_facets":
{ Args: { "p_category"?: string,"p_collection"?: string,"p_q"?: string }; Returns: Json
                           },
"catalog_scope":
{ Args: { "p_brands"?: (string)[],"p_category"?: string,"p_collection"?: string,"p_colors"?: (string)[],"p_ids"?: (string)[],"p_in_stock"?: boolean,"p_max_price"?: number,"p_min_price"?: number,"p_on_sale"?: boolean,"p_q"?: string,"p_sizes"?: (string)[] }; Returns: {
              "available_stock": number,
"brand_id": string | null,
"care": string,
"category_id": string | null,
"colors": (string)[],
"compare_at_price": number | null,
"created_at": string,
"created_by": string | null,
"description": string,
"fabric": string,
"fit": string,
"height_mm": number | null,
"id": string,
"is_featured": boolean,
"is_returnable": boolean,
"is_sample": boolean,
"length_mm": number | null,
"max_price": number | null,
"min_price": number | null,
"min_price_compare_at": number | null,
"on_sale": boolean,
"price": number,
"published_at": string | null,
"rating_avg": number | null,
"rating_count": number,
"return_window_days": number | null,
"sales_count": number,
"search_text": string,
"seo_description": string,
"seo_title": string,
"size_guide_id": string | null,
"sizes": (string)[],
"slug": string,
"status": Database["public"]['Enums']["product_status"],
"swatches": NonNullable<Json>,
"tags": (string)[],
"tax_rate_bps": number | null,
"title": string,
"updated_at": string,
"weight_grams": number | null,
"width_mm": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "products"
        isOneToOne: false
        isSetofReturn: true
      } },
"category_subtree":
{ Args: { "p_category_id": string }; Returns: string[]
                           },
"check_postcode":
{ Args: { "p_postal_code": string,"p_state"?: string,"p_subtotal"?: number }; Returns: Json
                           },
"claim_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"data": NonNullable<Json>,
"id": string,
"last_error": string | null,
"order_id": string | null,
"provider_message_id": string | null,
"sent_at": string | null,
"status": string,
"template": string,
"to_email": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "email_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_whatsapp_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"data": NonNullable<Json>,
"id": string,
"last_error": string | null,
"order_id": string | null,
"provider_message_id": string | null,
"sent_at": string | null,
"status": string,
"template": string,
"to_phone": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "whatsapp_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"clear_stock_context":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"cod_block_reason":
{ Args: { "p_email": string,"p_phone": string,"p_user_id": string }; Returns: string
                           },
"complete_refund":
{ Args: { "p_error": string,"p_provider_refund_id": string,"p_refund_id": string,"p_status": Database["public"]['Enums']["refund_state"] }; Returns: Json
                           },
"confirm_cod_order":
{ Args: { "p_actor_id"?: string,"p_actor_type"?: string,"p_order_id": string }; Returns: Json
                           },
"confirm_order_payment":
{ Args: { "p_amount": number,"p_currency": string,"p_details"?: Json,"p_method": string,"p_order_id": string,"p_provider": Database["public"]['Enums']["payment_provider"],"p_provider_order_id": string,"p_provider_payment_id": string }; Returns: Json
                           },
"courier_update":
{ Args: { "p_awb": string,"p_etd"?: string,"p_event_at"?: string,"p_event_key": string,"p_label": string,"p_location"?: string,"p_payload"?: Json,"p_provider": string,"p_status": string }; Returns: Json
                           },
"customer_cancel_order":
{ Args: { "p_order_id": string,"p_reason": string,"p_user_id": string }; Returns: Json
                           },
"customer_cod_orders":
{ Args: { "p_email": string,"p_phone": string,"p_user_id": string }; Returns: {
              "amount_refunded": number,
"attention_reason": string | null,
"billing_address": Json | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"cart_id": string | null,
"cod_confirm_by": string | null,
"cod_confirmation": string,
"cod_confirmed_at": string | null,
"cod_fee": number,
"coupon_code": string | null,
"created_at": string,
"currency": string,
"customer_name": string,
"customer_note": string,
"delivered_at": string | null,
"discount_total": number,
"email": string,
"expires_at": string | null,
"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],
"grand_total": number,
"id": string,
"idempotency_key": string | null,
"needs_attention": boolean,
"order_number": string,
"paid_at": string | null,
"payment_method": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"phone": string,
"placed_at": string,
"shipped_at": string | null,
"shipping_address": NonNullable<Json>,
"shipping_method": NonNullable<Json>,
"shipping_rate_id": string | null,
"shipping_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"tax_label": string,
"tax_mode": string,
"tax_total": number,
"updated_at": string,
"user_id": string | null,
"whatsapp_opt_in": boolean
            }[]
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: false
        isSetofReturn: true
      } },
"customer_request_return":
{ Args: { "p_details": string,"p_items": Json,"p_order_id": string,"p_reason": string,"p_user_id": string }; Returns: string
                           },
"email_suppressed":
{ Args: { "p_email": string }; Returns: boolean
                           },
"email_unsubscribe":
{ Args: { "p_email": string }; Returns: undefined
                           },
"format_money":
{ Args: { "p_amount": number,"p_currency": string }; Returns: string
                           },
"fulfillment_rank":
{ Args: { "p": Database["public"]['Enums']["fulfillment_status"] }; Returns: number
                           },
"get_product_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"grant_role":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: string
                           },
"has_role":
{ Args: { "p_roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"housekeeping":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"import_brand_id":
{ Args: { "p_create": boolean,"p_name": string }; Returns: string
                           },
"import_category_id":
{ Args: { "p_create": boolean,"p_value": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_email":
{ Args: { "s": string }; Returns: boolean
                           },
"is_hex_color":
{ Args: { "s": string }; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_phone":
{ Args: { "s": string }; Returns: boolean
                           },
"is_slug":
{ Args: { "s": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_admin_action":
{ Args: { "p_action": string,"p_details"?: Json,"p_entity_id"?: string,"p_entity_type": string }; Returns: undefined
                           },
"mark_rto_internal":
{ Args: { "p_actor_id": string,"p_actor_type": string,"p_note": string,"p_order_id": string }; Returns: {
              "amount_refunded": number,
"attention_reason": string | null,
"billing_address": Json | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"cart_id": string | null,
"cod_confirm_by": string | null,
"cod_confirmation": string,
"cod_confirmed_at": string | null,
"cod_fee": number,
"coupon_code": string | null,
"created_at": string,
"currency": string,
"customer_name": string,
"customer_note": string,
"delivered_at": string | null,
"discount_total": number,
"email": string,
"expires_at": string | null,
"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],
"grand_total": number,
"id": string,
"idempotency_key": string | null,
"needs_attention": boolean,
"order_number": string,
"paid_at": string | null,
"payment_method": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"phone": string,
"placed_at": string,
"shipped_at": string | null,
"shipping_address": NonNullable<Json>,
"shipping_method": NonNullable<Json>,
"shipping_rate_id": string | null,
"shipping_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"tax_label": string,
"tax_mode": string,
"tax_total": number,
"updated_at": string,
"user_id": string | null,
"whatsapp_opt_in": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"match_shipping_zone":
{ Args: { "p_country": string,"p_postal_code": string,"p_state": string }; Returns: string
                           },
"media_in_use":
{ Args: { "p_path": string }; Returns: boolean
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"normalize_address":
{ Args: { "a": Json }; Returns: Json
                           },
"open_payment_session":
{ Args: { "p_order_id": string,"p_provider": Database["public"]['Enums']["payment_provider"] }; Returns: {
              "amount": number,
"amount_refunded": number,
"captured_at": string | null,
"created_at": string,
"currency": string,
"details": NonNullable<Json>,
"error_code": string | null,
"error_description": string | null,
"id": string,
"method": string | null,
"order_id": string,
"provider": Database["public"]['Enums']["payment_provider"],
"provider_order_id": string | null,
"provider_payment_id": string | null,
"status": Database["public"]['Enums']["payment_state"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"order_brief":
{ Args: { "p_order": Omit<Database["public"]['Tables']["orders"]['Row'], Database["public"]['Tables']["orders"]['ComputedFields']> }; Returns: Json
                           },
"order_detail":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"phone_key":
{ Args: { "p": string }; Returns: string
                           },
"place_order":
{ Args: { "p_billing_address": Json,"p_cart_token": string,"p_customer_note"?: string,"p_email": string,"p_idempotency_key": string,"p_payment_method": string,"p_phone": string,"p_rate_id": string,"p_save_address"?: boolean,"p_shipping_address": Json,"p_user_id": string }; Returns: Json
                           },
"prepare_order_payment":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"product_in_collection":
{ Args: { "p": Omit<Database["public"]['Tables']["products"]['Row'], Database["public"]['Tables']["products"]['ComputedFields']>,"p_collection": Omit<Database["public"]['Tables']["collections"]['Row'], Database["public"]['Tables']["collections"]['ComputedFields']> }; Returns: boolean
                           },
"product_matches_condition":
{ Args: { "c": Json,"p": Omit<Database["public"]['Tables']["products"]['Row'], Database["public"]['Tables']["products"]['ComputedFields']> }; Returns: boolean
                           },
"product_matches_rules":
{ Args: { "p": Omit<Database["public"]['Tables']["products"]['Row'], Database["public"]['Tables']["products"]['ComputedFields']>,"rules": Json }; Returns: boolean
                           },
"product_visible":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"queue_cart_reminders":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"queue_email":
{ Args: { "p_data"?: Json,"p_order_id": string,"p_template": string,"p_to": string }; Returns: undefined
                           },
"queue_price_alerts":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"queue_whatsapp":
{ Args: { "p_data"?: Json,"p_order_id": string,"p_template": string }; Returns: undefined
                           },
"quote_cart":
{ Args: { "p_address"?: Json,"p_cart_id": string,"p_coupon_code"?: string,"p_email"?: string,"p_payment_method"?: string,"p_rate_id"?: string,"p_user_id"?: string }; Returns: Json
                           },
"quote_cart_base":
{ Args: { "p_address"?: Json,"p_cart_id": string,"p_coupon_code"?: string,"p_email"?: string,"p_payment_method"?: string,"p_rate_id"?: string,"p_user_id"?: string }; Returns: Json
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_payment_failure":
{ Args: { "p_error_code": string,"p_error_description": string,"p_method": string,"p_order_id": string,"p_provider": Database["public"]['Enums']["payment_provider"],"p_provider_order_id": string,"p_provider_payment_id": string }; Returns: Json
                           },
"record_payment_session":
{ Args: { "p_amount": number,"p_currency": string,"p_order_id": string,"p_provider": Database["public"]['Enums']["payment_provider"],"p_provider_order_id": string }; Returns: {
              "amount": number,
"amount_refunded": number,
"captured_at": string | null,
"created_at": string,
"currency": string,
"details": NonNullable<Json>,
"error_code": string | null,
"error_description": string | null,
"id": string,
"method": string | null,
"order_id": string,
"provider": Database["public"]['Enums']["payment_provider"],
"provider_order_id": string | null,
"provider_payment_id": string | null,
"status": Database["public"]['Enums']["payment_state"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"refresh_product_rollup":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"refund_by_provider_id":
{ Args: { "p_provider": Database["public"]['Enums']["payment_provider"],"p_provider_refund_id": string }; Returns: string
                           },
"related_products":
{ Args: { "p_limit"?: number,"p_product_id": string }; Returns: string[]
                           },
"release_expired_orders":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"require_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"require_staff":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"revoke_role":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"search_products":
{ Args: { "p_brands"?: (string)[],"p_category"?: string,"p_collection"?: string,"p_colors"?: (string)[],"p_ids"?: (string)[],"p_in_stock"?: boolean,"p_limit"?: number,"p_max_price"?: number,"p_min_price"?: number,"p_offset"?: number,"p_on_sale"?: boolean,"p_q"?: string,"p_sizes"?: (string)[],"p_sort"?: string }; Returns: {
              "available_stock": number,"brand_name": string,"brand_slug": string,"compare_at_price": number,"hover_image_url": string,"id": string,"image_alt": string,"image_url": string,"max_price": number,"on_sale": boolean,"price": number,"published_at": string,"rating_avg": number,"rating_count": number,"slug": string,"swatches": Json,"title": string,"total_count": number
            }[]
                           },
"set_fulfillment_internal":
{ Args: { "p_actor_id": string,"p_actor_type": string,"p_carrier": string,"p_note": string,"p_notify": boolean,"p_order_id": string,"p_status": Database["public"]['Enums']["fulfillment_status"],"p_tracking_number": string,"p_tracking_url": string }; Returns: {
              "amount_refunded": number,
"attention_reason": string | null,
"billing_address": Json | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"cart_id": string | null,
"cod_confirm_by": string | null,
"cod_confirmation": string,
"cod_confirmed_at": string | null,
"cod_fee": number,
"coupon_code": string | null,
"created_at": string,
"currency": string,
"customer_name": string,
"customer_note": string,
"delivered_at": string | null,
"discount_total": number,
"email": string,
"expires_at": string | null,
"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],
"grand_total": number,
"id": string,
"idempotency_key": string | null,
"needs_attention": boolean,
"order_number": string,
"paid_at": string | null,
"payment_method": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"phone": string,
"placed_at": string,
"shipped_at": string | null,
"shipping_address": NonNullable<Json>,
"shipping_method": NonNullable<Json>,
"shipping_rate_id": string | null,
"shipping_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"tax_label": string,
"tax_mode": string,
"tax_total": number,
"updated_at": string,
"user_id": string | null,
"whatsapp_opt_in": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_order_whatsapp":
{ Args: { "p_on": boolean,"p_order_id": string }; Returns: undefined
                           },
"set_stock_context":
{ Args: { "p_note"?: string,"p_order_id"?: string,"p_reason": Database["public"]['Enums']["inventory_reason"] }; Returns: undefined
                           },
"size_rank":
{ Args: { "p_size": string }; Returns: number
                           },
"slugify":
{ Args: { "p_text": string }; Returns: string
                           },
"stock_alert_subscribe":
{ Args: { "p_email": string,"p_user_id"?: string,"p_variant_id": string }; Returns: Json
                           },
"submit_review":
{ Args: { "p_body": string,"p_product_id": string,"p_rating": number,"p_title": string }; Returns: Json
                           },
"system_begin_refund":
{ Args: { "p_amount": number,"p_order_id": string,"p_payment_id": string,"p_reason": string }; Returns: Json
                           },
"tax_amount":
{ Args: { "p_amount": number,"p_mode": string,"p_rate_bps": number }; Returns: number
                           },
"tax_rate_for":
{ Args: { "p_product_rate": number,"p_slabs": Json,"p_unit_price": number }; Returns: number
                           },
"toggle_wishlist":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"unreferenced_media":
{ Args: { "p_paths": (string)[] }; Returns: string[]
                           },
"url_has_path":
{ Args: { "p_path": string,"p_url": string }; Returns: boolean
                           },
"write_audit":
{ Args: { "p_action": string,"p_changes": Json,"p_entity_id": string,"p_entity_type": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "owner"|"admin"|"staff","collection_kind": "manual"|"automated","discount_kind": "percentage"|"fixed"|"free_shipping","fulfillment_status": "unfulfilled"|"processing"|"packed"|"shipped"|"delivered"|"returned","inventory_reason": "initial"|"restock"|"adjustment"|"correction"|"damaged"|"sale"|"cancellation"|"return"|"import","order_payment_status": "pending"|"unpaid"|"paid"|"partially_refunded"|"refunded"|"failed"|"voided","order_status": "pending_payment"|"confirmed"|"completed"|"cancelled","payment_provider": "razorpay"|"stripe"|"cod"|"manual","payment_state": "created"|"authorized"|"captured"|"failed"|"refunded"|"partially_refunded","product_status": "draft"|"active"|"archived","refund_state": "pending"|"processed"|"failed","return_kind": "return"|"cancellation","return_state": "requested"|"approved"|"rejected"|"received"|"refunded"|"closed","review_state": "pending"|"published"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["owner", "admin", "staff"],"collection_kind": ["manual", "automated"],"discount_kind": ["percentage", "fixed", "free_shipping"],"fulfillment_status": ["unfulfilled", "processing", "packed", "shipped", "delivered", "returned"],"inventory_reason": ["initial", "restock", "adjustment", "correction", "damaged", "sale", "cancellation", "return", "import"],"order_payment_status": ["pending", "unpaid", "paid", "partially_refunded", "refunded", "failed", "voided"],"order_status": ["pending_payment", "confirmed", "completed", "cancelled"],"payment_provider": ["razorpay", "stripe", "cod", "manual"],"payment_state": ["created", "authorized", "captured", "failed", "refunded", "partially_refunded"],"product_status": ["draft", "active", "archived"],"refund_state": ["pending", "processed", "failed"],"return_kind": ["return", "cancellation"],"return_state": ["requested", "approved", "rejected", "received", "refunded", "closed"],"review_state": ["pending", "published", "rejected"]
          }
        }
} as const
