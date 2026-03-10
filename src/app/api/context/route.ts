import { NextRequest, NextResponse } from 'next/server';

// [🚨 Web-Lite Optimization] Totally avoid importing 'fs', 'path', 'os' at the top level
// to prevent Vercel/Edge runtime from crashing due to restricted module access.

const today = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

export async function POST(req: NextRequest) {
    try {
        const { agentId, content } = await req.json();
        if (!agentId || !content) {
            return NextResponse.json({ error: 'agentId and content required' }, { status: 400 });
        }

        // Check mode first
        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            console.log('[Context] Lite mode: skipping local save (no FS hit)');
            return NextResponse.json({ ok: true });
        }

        // If NOT lite (local dev), we dynamically import to prevent top-level crash
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const base = process.env.APPDATA || os.homedir();
        const dir = path.join(base, 'SeoulYonseiAdminOS', 'context');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filePath = path.join(dir, `${agentId}_${today()}.json`);

        fs.writeFileSync(filePath, JSON.stringify({
            agentId,
            date: today(),
            savedAt: new Date().toISOString(),
            content,
        }, null, 2), 'utf-8');

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('[Context API Error]', e.message);
        // Fail silently for context saving to not interrupt chat
        return NextResponse.json({ ok: false, error: e.message });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const agentId = searchParams.get('agentId');
        if (!agentId || process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            return NextResponse.json({ context: null });
        }

        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const base = process.env.APPDATA || os.homedir();
        const dir = path.join(base, 'SeoulYonseiAdminOS', 'context');
        const filePath = path.join(dir, `${agentId}_${today()}.json`);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ context: null });
        }

        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return NextResponse.json({ context: data.content });
    } catch (e: any) {
        return NextResponse.json({ context: null });
    }
}
