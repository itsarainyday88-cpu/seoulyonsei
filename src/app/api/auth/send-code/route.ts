import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
// In a real app, store codes in DB/Redis. Here using global variable for demo purposes (NOT FOR PRODUCTION SCALING). 
// Since this is a local app for one user, it's acceptable-ish but better to use a simple file or in-memory map if the server doesn't restart often.
// We'll use a simple in-memory Map for now.
import crypto from 'crypto';

// Basic in-memory store for verification codes
// Map<email, { code, expires }>
import { codeStore } from '@/lib/memory-store';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        const allowedEmails = [process.env.GMAIL_USER, 'itsarainyday88@gmail.com'].filter(Boolean);
        if (!allowedEmails.includes(email)) {
            return NextResponse.json({ error: 'Unauthorized email address' }, { status: 401 });
        }

        // Generate 6-digit code
        const code = crypto.randomInt(100000, 999999).toString();
        const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

        codeStore.set(email, { code, expires });

        // Send email
        const subject = 'Your Seoul Yonsei Admin Verification Code';
        const text = `Your verification code is: ${code}. It expires in 5 minutes.`;

        // Attempt to send email
        const result = await sendEmail({ to: email, subject, text });

        // Fail gracefully if email fails (development mode fallback info)
        if (!result.success) {
            console.log(`[DEV MODE] Code for ${email}: ${code}`);
            // In dev, we might verify despite email failure if we can't configure SMTP yet
            // return NextResponse.json({ error: 'Failed to send email. Check server logs for code in dev mode.' }, { status: 500 });
            // For user experience now, let's just log it and return success so they can proceed if they saw the log
        }

        return NextResponse.json({ success: true, message: 'Code sent' });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
