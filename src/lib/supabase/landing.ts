import { createSupabaseServerClient } from './server';
import { cmsValue } from '../landing-format';

export async function getLandingContent(): Promise<Record<string, string>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('landing_content').select('section, key, value');
    const result: Record<string, string> = {};
    for (const row of data ?? []) {
      result[`${row.section}.${row.key}`] = String(row.value);
    }
    return result;
  } catch {
    return {};
  }
}

export function cms(
  content: Record<string, string>,
  section: string,
  key: string,
  fallback: string,
): string {
  return cmsValue(content, section, key, fallback);
}
