import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseEnv, hasSupabaseEnv } from './config';

type SupabaseCookie = { name: string; value: string; options?: CookieOptions };

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

const ensureHttpOnly = (options?: CookieOptions): CookieOptions => {
  const { maxAge, expires, ...rest } = options ?? {};
  const result: CookieOptions = { ...baseCookieOptions, ...rest, httpOnly: true };
  if (maxAge !== undefined && maxAge <= 0) result.maxAge = maxAge;
  if (expires !== undefined && expires <= new Date()) result.expires = expires;
  return result;
};

export const getMiddlewareSession = async (request: NextRequest) => {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const pendingCookies: SupabaseCookie[] = [];

  const withSupabaseCookies = (nextResponse: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => {
      nextResponse.cookies.set(name, value, ensureHttpOnly(options));
    });
    return nextResponse;
  };

  if (!hasSupabaseEnv()) {
    return { response, withSupabaseCookies, user: null };
  }

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: baseCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookie[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pendingCookies.push({ name, value, options: ensureHttpOnly(options) });
          request.cookies.set(name, value);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  return { response, withSupabaseCookies, user };
};
