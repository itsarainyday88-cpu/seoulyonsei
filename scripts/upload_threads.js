
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const threadsPosts = [
    {
        title: "수능 문학, 중등 때 개념부터 잡아야 하는 이유",
        content: `수능 문학, 중등 때 개념부터 잡아야 하는 이유가 있다.
고등 가면 내신 준비로 기초 다질 시간이 없다. 상위권 학생들이 중등 때 이미 문학 개념을 끝내두는 이유.
감으로 푸는 게 아니라 개념(수능 공식)으로 작품을 분석하는 훈련, 그게 수능 국어의 본질이다.`
    },
    {
        title: "변호사의 악몽",
        content: `꿈에서 내용증명 의뢰를 받았는데 정말 꿈인데도 뼈 속까지 쓰기 싫어서 너무 싫어서 이걸 어쩌지, 어쩌니 이랬는데 깨어보니 꿈이어서 행복하다. 아깐, 오늘은 내가 안 피곤한 줄 알고 의기양양했었는데 지금 보니까 너무너무 피곤하다.`
    },
    {
        title: "연구 논문 목록",
        content: `내가 쓴 논문(중 일부):
• An Analysis of Parody in [Manhattan Murder Mystery] Based on Copyright Law
• 영화음악 공연사용료 소송을 통해서 본 영화의 저작권법적 쟁점－영상저작물에 관한 특례를 중심으로
• 소비자보호를 위한 변액보험 불완전판매 법적 규제 개선 방안`
    },
    {
        title: "중간고사 사치템",
        content: `도라에몽 자석 필통. 학생만 힘드냐 나도 힘들다. 중간고사의 사치템.`
    }
];

async function generateEmbeddings(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    try {
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('Embedding error:', error);
        return null;
    }
}

async function upload() {
    console.log('--- STARTING THREADS UPLOAD ---');
    let successCount = 0;

    for (const post of threadsPosts) {
        const fullText = `[Threads Post]\nTitle: ${post.title}\n\n${post.content}`;
        console.log(`Processing: ${post.title}...`);
        
        const embedding = await generateEmbeddings(fullText);
        if (!embedding) continue;

        const { error } = await supabase.from('archive_posts').insert({
            content: fullText,
            embedding: embedding,
            agent_id: 'Threads_Upload',
            metadata: {
                source: 'threads',
                title: post.title,
                original_type: 'threads_post'
            }
        });

        if (error) {
            console.error(`Error uploading ${post.title}:`, error.message);
        } else {
            successCount++;
            console.log(`Successfully uploaded: ${post.title}`);
        }
    }

    console.log(`--- UPLOAD COMPLETE: ${successCount}/${threadsPosts.length} posts saved ---`);
}

upload();
