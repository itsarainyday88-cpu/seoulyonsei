import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Context storage directory: AppData/SeoulYonseiAdminOS/context/
const getContextDir = () => {
    // [🚨 Web-Lite Optimization] Skip FS check on Web
    if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') return null;

    const base = process.env.APPDATA || (os && typeof os.homedir === 'function' ? os.homedir() : '/tmp');
    const dir = path.join(base, 'SeoulYonseiAdminOS', 'context');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const today = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

export async function POST(req: NextRequest) {
    try {
        const { agentId, content } = await req.json();
        if (!agentId || !content) {
            return NextResponse.json({ error: 'agentId and content required' }, { status: 400 });
        }

        const dir = getContextDir();
        if (!dir) {
            console.log('[Context] Lite mode: skipping local save');
            return NextResponse.json({ ok: true });
        }

        const filePath = path.join(dir, `${agentId}_${today()}.json`);

        fs.writeFileSync(filePath, JSON.stringify({
            agentId,
            date: today(),
            savedAt: new Date().toISOString(),
            content,
        }, null, 2), 'utf-8');

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const agentId = searchParams.get('agentId');
        if (!agentId) return NextResponse.json({ context: null });

        const dir = getContextDir();
        if (!dir) return NextResponse.json({ context: null });

        const filePath = path.join(dir, `${agentId}_${today()}.json`);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ context: null }); // 오늘 날짜 결과 없으면 null
        }

        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return NextResponse.json({ context: data.content });
    } catch (e: any) {
        return NextResponse.json({ context: null });
    }
}
