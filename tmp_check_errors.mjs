import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
);

async function checkErrors() {
    const { data, error } = await supabase
        .from('import_jobs')
        .select('id, file_name, file_type, status, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching jobs:', error);
        return;
    }

    console.log('Recent 5 jobs:');
    data.forEach(j => {
        console.log(`- ${j.file_name} (${j.file_type}) - Status: ${j.status}: ${j.error_message || 'No explicit error logged.'}`);
    });
}

checkErrors();
