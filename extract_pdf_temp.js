const fs = require('fs');
const PDFParser = require('pdf2json');

function extractPdfText(pdfPath, outputPath) {
    const pdfParser = new PDFParser(this, 1);
    
    pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
    pdfParser.on("pdfParser_dataReady", pdfData => {
        fs.writeFileSync(outputPath, pdfParser.getRawTextContent());
        console.log(`Extracted text properly to ${outputPath}`);
    });

    pdfParser.loadPDF(pdfPath);
}

const file1 = "C:\\Users\\Bijou\\.gemini\\antigravity\\brain\\30a80b1b-8ed5-45b3-b7e6-2e892cda284e\\AI 마케팅 OS 구축 제안서.pdf";
const out1 = "C:\\Users\\Bijou\\.gemini\\antigravity\\brain\\30a80b1b-8ed5-45b3-b7e6-2e892cda284e\\ai_marketing_os.txt";

const file2 = "C:\\Users\\Bijou\\.gemini\\antigravity\\brain\\30a80b1b-8ed5-45b3-b7e6-2e892cda284e\\서울연세학원 AI 마케팅 자동화 제안서.pdf";
const out2 = "C:\\Users\\Bijou\\.gemini\\antigravity\\brain\\30a80b1b-8ed5-45b3-b7e6-2e892cda284e\\seoul_yonsei.txt";

extractPdfText(file1, out1);
extractPdfText(file2, out2);
