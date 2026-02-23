function getEnv(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

export const supabaseUrl = getEnv("SUPABASE_URL");
export const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
