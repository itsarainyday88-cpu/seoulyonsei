import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const today = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

export async function POST(req: NextRequest) {
    try {
        const { agentId, content } = await req.json();
        if (!agentId || !content) {
            return NextResponse.json({ error: 'agentId and content required' }, { status: 400 });
        }

        // --- Cloud Sync (Upsert to prevent duplication) ---
        if (agentId === 'Marketer') {
            const todayStr = today();
            await supabase.from('documents').upsert({
                id: `marketer_${todayStr}`, // Fixed ID per day to prevent dups
                agent_id: 'Marketer',
                content: content,
                created_at: new Date().toISOString()
            }, { onConflict: 'id' });
        }

        // Check mode for local persistence
        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            console.log('[Context] Lite mode: using Cloud Sync only');
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
        return NextResponse.json({ ok: false, error: e.message });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const agentId = searchParams.get('agentId');
        if (!agentId) return NextResponse.json({ context: null });

        // In Lite mode, fetch from Supabase
        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            const { data, error } = await supabase
                .from('documents')
                .select('content')
                .eq('agent_id', agentId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) return NextResponse.json({ context: data.content });
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
