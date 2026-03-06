
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let imageUrl = '';

        // 원장님 말씀대로 "첨부" 단계에서는 분석하지 않고 
        // 이미지가 올라가면 저장만 확실하게 해줍니다.
        if (file.type.startsWith('image/')) {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, buffer);
            imageUrl = `/uploads/${fileName}`;
        }

        // 분석은 나중으로 미루고, 일단 첨부 정보를 즉시 반환합니다. (0.1초 컷)
        return NextResponse.json({
            text: `[Pending Analysis: ${file.name}]`,
            url: imageUrl,
            name: file.name
        });
    } catch (error: any) {
        console.error('File storage error:', error);
        return NextResponse.json({ error: '파일 저장 실패' }, { status: 500 });
    }
}
