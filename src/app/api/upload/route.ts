
import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
const officeParser = require('office-text-extractor');
import { GoogleGenerativeAI } from '@google/generative-ai';
// @ts-ignore
const PDFParser = require('pdf2json');

import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let text = '';

        let imageUrl = '';

        if (file.type === 'application/pdf') {
            const pdfParser = new PDFParser(null, 1); // 1 = text content only

            text = await new Promise((resolve, reject) => {
                pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
                pdfParser.on("pdfParser_dataReady", () => {
                    resolve(pdfParser.getRawTextContent());
                });
                pdfParser.parseBuffer(buffer);
            });
        } else if (
            file.type.includes('presentation') ||
            file.type.includes('spreadsheet') ||
            file.type.includes('document') ||
            file.name.endsWith('.pptx') ||
            file.name.endsWith('.docx') ||
            file.name.endsWith('.xlsx')) {
            // Use office-text-extractor for PPTX/DOCX/XLSX
            text = await officeParser.getText(buffer);
        } else if (file.type.startsWith('image/')) {
            // 1. Save the file to public/uploads
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, buffer);
            imageUrl = `/uploads/${fileName}`;

            // 2. Use Gemini Vision to describe the image (Fix model name too)
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = "Describe this image in detail. Focusing on visual elements, text, and design.";
            const imagePart = {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: file.type,
                },
            };
            const result = await model.generateContent([prompt, imagePart]);
            text = `[Image Description by Gemini]:\n${result.response.text()}`;
        } else {
            // Assume text/plain or markdown
            text = buffer.toString('utf-8');
        }

        return NextResponse.json({ text, url: imageUrl });
    } catch (error: any) {
        console.error('File upload error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
