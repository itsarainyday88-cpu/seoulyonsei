
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function verify() {
    console.log('[Verification] Searching for recently uploaded Threads posts...');
    
    const { data, error } = await supabase
        .from('archive_posts')
        .select('id, content, created_at, agent_id')
        .eq('agent_id', 'Threads_Upload')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error.message);
    } else {
        console.log(`Found ${data.length} records with agent_id 'Threads_Upload':`);
        data.forEach((row, i) => {
            console.log(`\n[Record ${i+1}]`);
            console.log(`ID: ${row.id}`);
            console.log(`Created At: ${row.created_at}`);
            console.log(`Content Snapshot: ${row.content.substring(0, 150)}...`);
        });
    }
}

verify();
