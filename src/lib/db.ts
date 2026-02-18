import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Re-export typed helpers
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
export type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

export { supabase };
