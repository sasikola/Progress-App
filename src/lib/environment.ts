export type Environment =
  | { status: 'ready'; url: string; anonKey: string }
  | { status: 'missing' | 'invalid' };

export function readEnvironment(values: {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}): Environment {
  const url = values.SUPABASE_URL?.trim();
  const anonKey = values.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return { status: 'missing' };
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return { status: 'invalid' };
    }
    return {
      status: 'ready',
      url: parsed.toString().replace(/\/$/, ''),
      anonKey,
    };
  } catch {
    return { status: 'invalid' };
  }
}
