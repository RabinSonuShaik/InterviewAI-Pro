import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lbozehzgogidzwrngj.supabase.co";

const supabaseAnonKey = "sb_publishable_qSo_qFm51azy5xtZNkZ2wQ_OfY06Nkv";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);