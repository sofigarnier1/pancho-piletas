import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

type UserRole = 'super_admin' | 'owner' | 'marketing' | 'employee' | 'client';

const ADMIN_ROLES: UserRole[] = ['super_admin', 'owner', 'marketing'];

const resolveSignedInPath = (role: string | undefined): string => {
  if (role === 'super_admin' || role === 'owner' || role === 'marketing') return '/admin/dashboard';
  if (role === 'employee') return '/employee/itinerario';
  return '/client/dashboard';
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow reset-password (comes back with ?code= from email)
  if (pathname.startsWith('/reset-password')) return NextResponse.next();

  const isAuthRoute = ['/login', '/register', '/recover'].some((r) => pathname.startsWith(r));
  const isAdminRoute = pathname.startsWith('/admin');
  const isEmployeeRoute = pathname.startsWith('/employee');
  const isClientRoute = pathname.startsWith('/client');
  const isProtected = isAdminRoute || isEmployeeRoute || isClientRoute;

  if (!isAuthRoute && !isProtected) return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role as string | undefined;

  // Cuenta bloqueada: se cierra la sesión y se manda al login con aviso.
  // (getUser() consulta al servidor de auth, así que el rol y la sesión están siempre al día.)
  if (user) {
    const { data: accountStatus } = await supabase.rpc('my_account_status');
    if (accountStatus === 'blocked') {
      await supabase.auth.signOut();
      if (isAuthRoute) return supabaseResponse;
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?blocked=1';
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = resolveSignedInPath(role);
    return NextResponse.redirect(url);
  }

  if (user && isAdminRoute && (!role || !ADMIN_ROLES.includes(role as UserRole))) {
    const url = request.nextUrl.clone();
    url.pathname = resolveSignedInPath(role);
    return NextResponse.redirect(url);
  }

  // Modo campo: el dueño y el súper admin también usan la pantalla del empleado cuando salen a hacer piletas
  if (user && isEmployeeRoute && role !== 'employee' && role !== 'owner' && role !== 'super_admin') {
    const url = request.nextUrl.clone();
    url.pathname = resolveSignedInPath(role);
    return NextResponse.redirect(url);
  }

  if (user && isClientRoute && role !== 'client') {
    const url = request.nextUrl.clone();
    url.pathname = resolveSignedInPath(role);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/login', '/register', '/recover', '/reset-password',
    '/admin/:path*', '/employee/:path*', '/client/:path*',
  ],
};
