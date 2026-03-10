import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        const publicDir = path.join(process.cwd(), 'public', 'generated-images');
        const filePath = path.join(publicDir, filename);

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const buffer = fs.readFileSync(filePath);
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Error serving generated image:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
