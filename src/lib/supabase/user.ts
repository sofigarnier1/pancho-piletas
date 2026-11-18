import type { User as SupabaseUser } from '@supabase/supabase-js';

export type UserRole = 'super_admin' | 'owner' | 'marketing' | 'employee' | 'client';

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
}

type GenericMetadata = Record<string, unknown>;

const asMetadata = (value: unknown): GenericMetadata =>
  value && typeof value === 'object' ? (value as GenericMetadata) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const normalizeRole = (value: unknown): UserRole => {
  if (value === 'super_admin') return 'super_admin';
  if (value === 'owner') return 'owner';
  if (value === 'marketing') return 'marketing';
  if (value === 'employee') return 'employee';
  return 'client';
};

export const mapSupabaseUserToAppUser = (supabaseUser: SupabaseUser): AppUser => {
  const userMetadata = asMetadata(supabaseUser.user_metadata);
  const appMetadata = asMetadata(supabaseUser.app_metadata);
  const email = supabaseUser.email ?? '';

  return {
    id: supabaseUser.id,
    email,
    fullName:
      asString(userMetadata.full_name) ||
      asString(userMetadata.nombre) ||
      email.split('@')[0] ||
      'Usuario',
    role: normalizeRole(appMetadata.role),
    avatarUrl: asString(userMetadata.avatar_url) || undefined,
  };
};
