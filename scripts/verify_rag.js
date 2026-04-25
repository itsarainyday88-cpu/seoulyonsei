
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function verify() {
    const { data, error } = await supabase.from('archive_posts').select('*').limit(3).order('created_at', { ascending: false });
    if (error) {
        console.error('검증 실패:', error.message);
    } else {
        console.log(`[검증 결과] 총 ${data.length}개의 최근 데이터 조회 성공.`);
        data.forEach((row, i) => {
            console.log(`--- [데이터 ${i+1}] ---`);
            console.log(`Content: ${row.content.substring(0, 300)}...`);
            console.log(`Metadata: ${JSON.stringify(row.metadata)}`);
            console.log(`Embedding exists: ${!!row.embedding}`);
        });
    }
}

verify();
