import { NextResponse } from 'next/server';
import { generateAgentResponseStream } from '@/lib/gemini';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs'; // Use nodejs runtime for fs and background tasks

export async function POST(req: Request) {
    let agentId = 'Blog';
    try {
        const body = await req.json();
        const { agentId: bodyAgentId, message, history, useSearch }: any = body;
        agentId = bodyAgentId || 'Blog';

        if (!agentId || !message) {
            return NextResponse.json({ error: 'Missing activeAgent or message' }, { status: 400 });
        }

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullResponseBuffer = '';

                try {
                    const generator = generateAgentResponseStream(agentId, message, history, useSearch);

                    for await (const chunk of generator) {
                        const encoded = encoder.encode(chunk);
                        controller.enqueue(encoded);
                        fullResponseBuffer += chunk;
                    }

                    // --- Cloud Sync: Save to Supabase BEFORE closing ---
                    // This ensures the serverless function stays alive until the save is awaited.
                    if (fullResponseBuffer.trim().length > 50) {
                        try {
                            const { error: dbError } = await supabase
                                .from('documents')
                                .insert([{
                                    agent_id: String(agentId),
                                    content: fullResponseBuffer,
                                    created_at: new Date().toISOString()
                                }]);

                            if (dbError) {
                                console.error('[Cloud Sync] Database Insert Error:', dbError.message);
                            } else {
                                console.log('[Cloud Sync] Successfully saved to documents');
                            }
                        } catch (dbErr) {
                            console.error('[Cloud Sync] Exception during Supabase save:', dbErr);
                        }
                    }

                    controller.close();

                    // --- Optional: Local File Save (Likely to fail on Vercel) ---
                    if (fullResponseBuffer.trim().length > 50) {
                        try {
                            const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            const baseDir = process.env.APPDATA || process.env.USERPROFILE || process.cwd();
                            const outDir = path.join(baseDir, 'SeoulYonsei_Data', 'outputs');
                            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                            const fileName = `${agentId}_${dateStr}.md`;
                            fs.writeFileSync(path.join(outDir, fileName), fullResponseBuffer, 'utf8');
                        } catch (_) { }
                    }
                } catch (error: any) {
                    console.error('Streaming Error:', error);
                    controller.error(error);
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error: any) {
        console.error('------- CHAT API ERROR -------');
        console.error('Agent ID:', agentId);
        console.error('Error Message:', error.message);
        return NextResponse.json({
            error: `Server Error: ${error.message || 'Unknown error'}`
        }, { status: 500 });
    }
}
