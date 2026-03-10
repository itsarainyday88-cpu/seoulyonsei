import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// [🚀 Vercel Optimization] Get KST date for consistent daily context
const today = () => {
    const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
};

export async function POST(req: NextRequest) {
    try {
        const { agentId, content } = await req.json();
        if (!agentId || !content) {
            return NextResponse.json({ error: 'agentId and content required' }, { status: 400 });
        }

        // [🚀 Vercel Optimization] Cloud Sync Only
        // For Marketer, keep a unique "Latest Strategy" using fixed daily ID
        const todayStr = today();
        const docId = agentId === 'Marketer' ? `marketer_${todayStr}` : `${agentId}_${Date.now()}`;

        await supabase.from('documents').upsert({
            id: docId,
            agent_id: agentId,
            content: content,
            created_at: new Date().toISOString()
        }, { onConflict: 'id' });

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

        // [🚀 Vercel Optimization] Fetch the absolute latest document for this agent
        const { data, error } = await supabase
            .from('documents')
            .select('content')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (data) return NextResponse.json({ context: data.content });
        return NextResponse.json({ context: null });
    } catch (e: any) {
        return NextResponse.json({ context: null });
    }
}
