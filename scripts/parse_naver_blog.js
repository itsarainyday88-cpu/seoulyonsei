
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const cheerio = require('cheerio');
const axios = require('axios');
const path = require('path');

// 1. 설정 로드
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
    console.error('필요한 환경 변수가 누락되었습니다. (.env 확인)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

/**
 * 네이버 블로그 URL을 실제 콘텐츠가 있는 URL로 변환합니다.
 */
function getRealPostUrl(url) {
    const naverBlogRegex = /blog\.naver\.com\/([^/]+)\/(\d+)/;
    const match = url.match(naverBlogRegex);
    if (match) {
        const blogId = match[1];
        const logNo = match[2];
        return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
    }
    return url;
}

/**
 * 텍스트를 청크로 나눕니다.
 */
function chunkText(text, chunkSize = 1000) {
    const lines = text.split('\n');
    const chunks = [];
    let currentChunk = '';

    for (const line of lines) {
        if ((currentChunk + line).length <= chunkSize) {
            currentChunk += (currentChunk ? '\n' : '') + line;
        } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = line;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

/**
 * 임베딩을 생성합니다.
 */
async function generateEmbeddings(texts) {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embeddings = [];
    for (const text of texts) {
        try {
            const result = await model.embedContent(text);
            embeddings.push(result.embedding.values);
        } catch (error) {
            console.error('Embedding error:', error);
            embeddings.push(null);
        }
    }
    return embeddings;
}

/**
 * 메인 파싱 및 저장 함수
 */
async function parseAndStore(blogUrl, agentId = 'System') {
    const realUrl = getRealPostUrl(blogUrl);
    console.log(`[시작] URL 추출 시도: ${realUrl}`);

    try {
        const response = await axios.get(realUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        
        // 제목 추출
        const title = $('.se-title-text').text().trim() || $('title').text().trim();
        
        // 본문 및 이미지 순차적 추출 (SmartEditor One 기준)
        let fullContent = `[Title]: ${title}\n\n`;
        const images = [];

        // .se-main-container 내부의 모든 세션(텍스트, 이미지 등)을 순회
        $('.se-main-container .se-component, .se-main-container .se-section').each((_, el) => {
            const $el = $(el);
            
            // 텍스트 컴포넌트 처리
            if ($el.hasClass('se-component-text') || $el.find('.se-text').length > 0) {
                const text = $el.text().replace(/\s+/g, ' ').trim();
                if (text) fullContent += text + '\n\n';
            }
            
            // 이미지 컴포넌트 처리
            const $img = $el.find('img.se-image-resource');
            if ($img.length > 0) {
                const imgSrc = $img.attr('data-lazy-src') || $img.attr('src');
                const imgId = $img.attr('id') || `img_${Date.now()}`;
                
                if (imgSrc) {
                    fullContent += `[이미지 삽입부: ${imgSrc}]\n\n`;
                    images.push({ id: imgId, src: imgSrc });
                }
            }
        });

        // 결과물이 너무 작으면 다른 셀렉터로 재시도 (구버전 스마트에디터 등)
        if (fullContent.length < 200) {
            console.log('재검색 시도 중...');
            fullContent = `[Title]: ${title}\n\n` + $('#post-view').text().trim();
        }

        console.log(`[완료] 총 ${fullContent.length}자 텍스트 추출, 이미지 ${images.length}개 발견.`);

        // DB 저장 프로세스
        const chunks = chunkText(fullContent);
        console.log(`[진행] ${chunks.length}개 청크로 분리 완료. 임베딩 생성 중...`);
        
        const embeddings = await generateEmbeddings(chunks);

        let successCount = 0;
        for (let i = 0; i < chunks.length; i++) {
            if (!embeddings[i]) continue;

            const { error } = await supabase.from('archive_posts').insert({
                content: chunks[i],
                embedding: embeddings[i],
                agent_id: agentId,
                metadata: {
                    source_url: blogUrl,
                    title: title,
                    chunk_index: i,
                    total_chunks: chunks.length,
                    images: images
                }
            });

            if (error) {
                console.error(`[에러] 청크 ${i} 저장 실패:`, error.message);
            } else {
                successCount++;
            }
        }

        console.log(`[종료] 총 ${successCount}/${chunks.length}개 청크가 [archive_posts]에 저장되었습니다.`);

    } catch (err) {
        console.error('프로세스 실패:', err);
    }
}

// 스크립트 실행인자 확인
const targetUrl = process.argv[2];
const agentId = process.argv[3] || 'ADMIN_LEARNING';

if (!targetUrl) {
    console.log('사용법: node scripts/parse_naver_blog.js <네이버블로그URL> [agentId]');
    process.exit(1);
}

parseAndStore(targetUrl, agentId);
