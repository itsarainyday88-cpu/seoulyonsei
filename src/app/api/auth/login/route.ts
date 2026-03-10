import { NextResponse } from 'next/server';
import { verifyCredentials } from '@/lib/auth';
import { login } from '@/lib/session';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('Login Request Body:', { ...body, password: '***' }); // Log input
        const { username, password, remember } = body;

        if (!username || !password) {
            return NextResponse.json({ error: 'ID and password required' }, { status: 400 });
        }

        const isValid = await verifyCredentials(username, password);

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid ID or Password' }, { status: 401 });
        }

        // Pass remember flag
        await login(username, remember);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
