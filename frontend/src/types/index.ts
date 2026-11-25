export type Role = 'owner' | 'admin' | 'manager' | 'agent' | 'analyst'
export interface Conv {
  id: string; status: 'open' | 'waiting' | 'escalated' | 'resolved'; handler: 'ai' | 'human'; channel: 'chat' | 'voice'
  language: string; sentiment: string; verified: boolean; subject: string | null; preview: string | null
  customer: { id: string; name: string; initials: string } | null; assigned_to: string | null; last_intent: string | null
  last_message_at: string; created_at: string; ownership: 'ai' | 'human'; pending_action?: any; is_test: boolean
}
export interface Msg {
  id: string; role: 'customer' | 'ai' | 'agent' | 'note' | 'system'; content: string; created_at: string; channel: string
  meta?: { intent?: string; tools?: any[]; citations?: { title: string; score: number }[]; latency_ms?: number }
}
export interface ConvDetail extends Conv { messages: Msg[]; tickets: Ticket[]; escalations: any[] }
export interface Ticket {
  id: string; code: string; subject: string; description: string | null; priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'; assignee_id: string | null; team: string | null
  sla_due_at: string | null; sla_seconds_left?: number; sla_breached?: boolean; conversation_id: string | null
  customer_id: string | null; escalation_reason: string | null; resolution_note: string | null; created_at: string; created_by: string
}
export interface Customer {
  id: string; name: string; email: string; phone: string | null; language: string; tags: string[]; sentiment: string
  last_interaction_at: string | null; created_at: string; stats?: { orders: number; open_tickets: number }
}
export interface Order {
  order_id: string; code: string; status: string; total: number; currency: string; placed_at: string
  items: { name: string; qty: number }[]
  shipment: null | { carrier: string; tracking_no: string; status: string; expected_delivery: string | null; last_location: string | null; delay_reason: string | null; delivered_at: string | null }
  payment: null | { method: string; brand: string; last4: string; status: string }
}
export interface Doc { id: string; title: string; category: string; collection: string; status: 'processing' | 'ready' | 'failed'; version: number; chunk_count: number; filename: string | null; error: string | null; created_at: string }
export interface Member { user_id: string; email: string; full_name: string; role: Role; available: boolean }
export interface WSEvent { type: string; conversation_id: string | null; payload: any; at: string }
