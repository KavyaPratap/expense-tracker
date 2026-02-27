import { createClient } from '@supabase/supabase-js';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
);

async function testUpload() {
    console.log("Creating test user...");
    const email = `test12345this@gmail.com`;
    const password = 'Password123!';

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
    });

    if (signUpError && signUpError.message !== 'User already registered') {
        console.error("Sign up failed:", signUpError.message);
        return;
    }

    // Login to get token
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (loginError) {
        console.error("Login failed:", loginError.message);
        return;
    }

    const token = loginData.session.access_token;
    console.log("Logged in, token acquired.");

    // Create image buffer
    const pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082';
    const buffer = Buffer.from(pngHex, 'hex');
    fs.writeFileSync('test_upload.png', buffer);

    const formData = new FormData();
    formData.append('file', fs.createReadStream('test_upload.png'));

    console.log("Uploading file to local Next.js...");
    const uploadRes = await fetch('http://localhost:3000/api/import/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    const uploadData = await uploadRes.json();
    console.log("Upload route responded:", uploadData);

    if (uploadData.jobId) {
        console.log("Calling process route...");
        const processRes = await fetch('http://localhost:3000/api/import/process', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ jobId: uploadData.jobId, userId: loginData.user.id })
        });

        const processData = await processRes.json();
        console.log("Process route responded:", processData);
    }
}

testUpload();
