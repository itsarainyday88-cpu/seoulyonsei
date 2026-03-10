// [🚨 Web-Lite Optimization] No top-level 'fs' or 'path' to avoid Vercel crash
// This module provides thinking tools for AI agents.
// In 'lite' mode (web), it skips file persistence.

interface ThinkingStep {
    id: number;
    timestamp: string;
    type: 'plan' | 'execution' | 'observation' | 'criticism';
    content: string;
}

interface ThinkingSession {
    sessionId: string;
    goal: string;
    status: string;
    steps: ThinkingStep[];
}

// In-memory sessions for Lite mode to avoid crashes
const liteSessions = new Map<string, ThinkingSession>();
let lastLiteSessionId = '';

async function getFs() {
    if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') return null;
    try {
        const fs = await import('fs');
        const path = await import('path');
        return { fs: fs.default || fs, path: path.default || path };
    } catch {
        return null;
    }
}

async function ensureDir() {
    const modules = await getFs();
    if (!modules) return null;
    const { fs, path } = modules;
    const HISTORY_DIR = path.join(process.cwd(), '.thinking_history');
    if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    return HISTORY_DIR;
}

export const thinkingTools = {
    init_thinking: async (args: { goal: string }) => {
        const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionData: ThinkingSession = {
            sessionId,
            goal: args.goal,
            status: "in_progress",
            steps: []
        };

        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            liteSessions.set(sessionId, sessionData);
            lastLiteSessionId = sessionId;
            return { msg: "Thinking session initialized (Memory)", sessionId, goal: args.goal };
        }

        const modules = await getFs();
        if (modules) {
            const { fs, path } = modules;
            const dir = await ensureDir();
            if (dir) {
                const filename = `session_${sessionId}.json`;
                const filePath = path.join(dir, filename);
                const HEAD_FILE = path.join(dir, 'HEAD');
                fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf8');
                fs.writeFileSync(HEAD_FILE, filename, 'utf8');
            }
        }
        return { msg: "Thinking session initialized", sessionId, goal: args.goal };
    },

    add_thought_step: async (args: { content: string; type: 'plan' | 'execution' | 'observation' | 'criticism' }) => {
        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            const data = liteSessions.get(lastLiteSessionId);
            if (!data) return { error: "No active session" };
            const newStep: ThinkingStep = {
                id: data.steps.length + 1,
                timestamp: new Date().toISOString(),
                type: args.type,
                content: args.content
            };
            data.steps.push(newStep);
            return { msg: "Step recorded (Memory)", stepId: newStep.id };
        }

        const modules = await getFs();
        if (modules) {
            const { fs, path } = modules;
            const dir = path.join(process.cwd(), '.thinking_history');
            const HEAD_FILE = path.join(dir, 'HEAD');
            if (!fs.existsSync(HEAD_FILE)) return { error: "No active session" };

            const filename = fs.readFileSync(HEAD_FILE, 'utf8').trim();
            const filePath = path.join(dir, filename);
            const data: ThinkingSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            const newStep: ThinkingStep = {
                id: data.steps.length + 1,
                timestamp: new Date().toISOString(),
                type: args.type,
                content: args.content
            };

            data.steps.push(newStep);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return { msg: "Step recorded", stepId: newStep.id };
        }
        return { error: "Not available" };
    },

    reflect_thinking: async () => {
        let data: ThinkingSession | undefined;

        if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
            data = liteSessions.get(lastLiteSessionId);
        } else {
            const modules = await getFs();
            if (modules) {
                const { fs, path } = modules;
                const dir = path.join(process.cwd(), '.thinking_history');
                const HEAD_FILE = path.join(dir, 'HEAD');
                if (fs.existsSync(HEAD_FILE)) {
                    const filename = fs.readFileSync(HEAD_FILE, 'utf8').trim();
                    const filePath = path.join(dir, filename);
                    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                }
            }
        }

        if (!data) return { error: "No active session found" };
        const summary = data.steps.map(s => `[${s.type.toUpperCase()}] ${s.content}`).join('\n');

        return {
            msg: "Reflection on current session",
            goal: data.goal,
            history: summary,
            instruction: "Review the history for logical gaps."
        };
    }
};
