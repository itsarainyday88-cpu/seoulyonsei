
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
        return NextResponse.json({ error: 'File upload is disabled in Lite mode' }, { status: 501 });
    }
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const agentId = formData.get('agentId') as string || 'Unknown';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const fileName = `${Date.now()}-${file.name.replace(/[\s()]+/g, '_')}`;

        // 1. Supabase Storage 업로드
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('assets')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            console.error('[Supabase Storage Error]:', uploadError);
            throw new Error('Storage upload failed');
        }

        // 2. Public URL 생성
        const { data: { publicUrl } } = supabase.storage
            .from('assets')
            .getPublicUrl(fileName);

        // 3. assets 테이블에 메타데이터 기록
        const { data: assetData, error: dbError } = await supabase
            .from('assets')
            .insert([{
                file_name: file.name,
                file_type: file.type,
                storage_path: uploadData.path,
                public_url: publicUrl,
                agent_id: agentId,
                metadata: {
                    size: file.size,
                    lastModified: file.lastModified
                }
            }])
            .select()
            .single();

        if (dbError) {
            console.error('[Supabase DB Error]:', dbError);
            // Storage에는 올라갔는데 DB 기록에 실패한 경우
        }

        // 4. 즉시 반환 (Gemini Vision 분석을 위해 URL 포함)
        return NextResponse.json({
            text: `[File Analysis Prepared: ${file.name}]`,
            url: publicUrl,
            name: file.name,
            assetId: assetData?.id
        });

    } catch (error: any) {
        console.error('File processing error:', error);
        return NextResponse.json({ error: `파일 처리 실패: ${error.message}` }, { status: 500 });
    }
}
