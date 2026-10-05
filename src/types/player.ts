import type { Database } from '@/lib/supabase/types';

// Aliases over the generated DB types — use these throughout the app
// so we're not spelling out the nested Database path everywhere.
export type Player = Database['public']['Tables']['players']['Row'];
