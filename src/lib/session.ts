import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SECRET_KEY = process.env.JWT_SECRET_KEY || 'default-secret-key-change-me';
const key = new TextEncoder().encode(SECRET_KEY);

export async function encrypt(payload: any, expirationTime: string | number = '7d') {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expirationTime)
        .sign(key);
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    });
    return payload;
}

export async function login(username: string, remember: boolean = false) {
    // If remember is true, 30 days. If false, session only (expire=0 or effectively short/session cookie).
    // Actually, for session cookie we just don't set 'expires' attribute, but libraries act differently.
    // JWT itself needs an expiry.

    const duration = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days vs 1 day (for token validity)
    const expires = new Date(Date.now() + duration);

    const session = await encrypt({ username, expires }, remember ? '30d' : '1d');

    const cookieOptions: any = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    };

    if (remember) {
        cookieOptions.expires = expires;
    }
    // If not remember, we don't set 'expires', making it a session cookie (cleared on browser close)

    (await cookies()).set('session', session, cookieOptions);
}

export async function logout() {
    (await cookies()).set('session', '', { expires: new Date(0) });
}

export async function getSession() {
    const session = (await cookies()).get('session')?.value;
    if (!session) return null;
    try {
        return await decrypt(session);
    } catch (e) {
        return null;
    }
}

export async function updateSession(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    if (!session) return;

    try {
        const parsed = await decrypt(session);
        // Don't extend if it was a short session? Or always extend?
        // Let's extend for now to keep active users logged in.
        parsed.expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const res = NextResponse.next();
        res.cookies.set({
            name: 'session',
            value: await encrypt(parsed, '1d'),
            httpOnly: true,
            expires: parsed.expires,
        });
        return res;
    } catch (e) {
        return NextResponse.next();
    }
}
