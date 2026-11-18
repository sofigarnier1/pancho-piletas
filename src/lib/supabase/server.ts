import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './config';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

const ensureHttpOnly = (options?: CookieOptions): CookieOptions => {
  const { maxAge, expires, ...rest } = options ?? {};
  const result: CookieOptions = {
    ...baseCookieOptions,
    ...rest,
    httpOnly: true,
  };
  if (maxAge !== undefined && maxAge <= 0) result.maxAge = maxAge;
  if (expires !== undefined && expires <= new Date()) result.expires = expires;
  return result;
};

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookieOptions: baseCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, ensureHttpOnly(options));
          });
        } catch {
          // Server Components no pueden setear cookies — el middleware lo maneja en el próximo request.
        }
      },
    },
  });
};
