import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { codeStore } from '@/lib/memory-store';

export async function POST(request: Request) {
    try {
        const { email, username, password, code } = await request.json();

        // Verify code again to ensure security
        const record = codeStore.get(email);
        // In strict env, we should check record exists. For now assuming client verified.
        // BUT security defines we MUST check code here too to prevent direct API calls skipping verification.
        if (!record || record.code !== code) {
            return NextResponse.json({ error: 'Invalid verification session' }, { status: 400 });
        }

        const dataPath = path.join(process.cwd(), 'data', 'users.json');
        let users = [];
        if (fs.existsSync(dataPath)) {
            users = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        }

        // Check existing
        if (users.find((u: any) => u.username === username)) {
            return NextResponse.json({ error: 'ID already exists' }, { status: 400 });
        }
        if (users.find((u: any) => u.email === email)) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            name: username
        };

        users.push(newUser);
        fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));

        // Consume code
        codeStore.delete(email);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }
}
