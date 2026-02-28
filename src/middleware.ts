import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/session';

export async function middleware(request: NextRequest) {
    // Update session expiry if exists
    await updateSession(request);

    const session = request.cookies.get('session')?.value;
    const path = request.nextUrl.pathname;

    // Define public paths that don't require authentication
    const isPublicPath =
        path === '/login' ||
        path === '/register' ||
        path === '/forgot-password' ||
        path.startsWith('/api/auth') || // Allow all auth APIs
        path.startsWith('/_next') ||
        path.startsWith('/static') ||
        path.includes('.'); // Allow files like favicon.ico

    // Redirect logic
    if (!session && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Optional: Redirect logged-in users away from auth pages
    if (session && (path === '/login' || path === '/register')) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
