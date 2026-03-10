import { NextRequest, NextResponse } from 'next/server';
import { generateAgentResponseStream } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';

// @ts-ignore
declare const process: any;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { agentId, message, history, useSearch }: any = body;

        if (!agentId || !message) {
            return NextResponse.json({ error: 'Missing activeAgent or message' }, { status: 400 });
        }

        // --- Create a ReadableStream and return it immediately ---
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullResponseBuffer = ''; // Buffer to capture the main agent's output

                try {
                    // [Stage 1] Main Agent Generation
                    // Generate chunks using our Gemini wrapper
                    const generator = generateAgentResponseStream(agentId, message, history, useSearch);

                    for await (const chunk of generator) {
                        const encoded = encoder.encode(chunk);
                        controller.enqueue(encoded);
                        fullResponseBuffer += chunk; // Accumulate for review
                    }


                    // --- Cloud Sync: Save to Supabase (Unified Upsert/Insert) ---
                    if (fullResponseBuffer.trim().length > 50) {
                        try {
                            const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
                            const todayStr = kst.toISOString().split('T')[0];

                            const isMarketer = String(agentId) === 'Marketer';
                            const payload: any = {
                                agent_id: String(agentId),
                                content: fullResponseBuffer,
                                created_at: new Date().toISOString()
                            };

                            // [🚀 Vercel Optimization] Use fixed ID for Marketer to prevent duplicates with context API
                            if (isMarketer) {
                                payload.id = `marketer_${todayStr}`;
                            }

                            console.log('[Cloud Sync] Attempting Supabase sync...', { agent: payload.agent_id, isMarketer });

                            const { error: dbError } = await supabase
                                .from('documents')
                                .upsert(payload, { onConflict: 'id' });

                            if (dbError) {
                                console.error('[Cloud Sync] DB sync error:', dbError.message);
                            } else {
                                console.log(`[Cloud Sync] Successfully synced to Supabase (Mode: ${isMarketer ? 'Upsert' : 'Insert'})`);
                            }
                        } catch (cloudErr: any) {
                            console.error('[Cloud Sync] Error during sync:', cloudErr.message);
                        }
                    }

                    controller.close();
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
        console.error('Agent ID:', (req as any).body?.agentId);
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('------------------------------');

        return NextResponse.json({
            error: `Server Error: ${error.message || 'Unknown error'}`
        }, { status: 500 });
    }
}
