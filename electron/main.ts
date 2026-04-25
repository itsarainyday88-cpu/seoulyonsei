import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import { exec } from 'child_process';

// --- Load config.txt (customer-editable settings) ---
const configPath = path.join(path.dirname(app.getPath('exe')), 'config.txt');
const fallbackConfigPath = path.join(__dirname, '..', 'config.txt');
const cfgFile = fs.existsSync(configPath) ? configPath : (fs.existsSync(fallbackConfigPath) ? fallbackConfigPath : null);
if (cfgFile) {
    const lines = fs.readFileSync(cfgFile, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        process.env[key.trim()] = rest.join('=').trim();
    }
}

// --- Configuration ---
const isDev = process.env.NODE_ENV === 'development';
const NEXT_PORT = 3000;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: '서울연세학원 마케팅 OS',
        backgroundColor: '#f5f0e8',
        icon: path.join(__dirname, '..', 'public', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });

    if (isDev) {
        mainWindow.loadURL(NEXT_URL);
    } else {
        mainWindow.loadURL(NEXT_URL);
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links - Chrome 강제 실행 (Hwack 확장프로그램이 Chrome에만 있음)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        ];
        const chromePath = chromePaths.find(p => fs.existsSync(p));
        if (chromePath) {
            exec(`"${chromePath}" "${url}"`);
        } else {
            shell.openExternal(url); // Chrome 없으면 기본 브라우저 fallback
        }
        return { action: 'deny' };
    });
}

function waitForNextServer(url: string, timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            http.get(url, (res) => {
                if (res.statusCode === 200 || res.statusCode === 307) {
                    resolve();
                } else {
                    retry();
                }
            }).on('error', retry);
        };
        const retry = () => {
            if (Date.now() - start > timeout) {
                reject(new Error(`Next.js server did not start within ${timeout}ms`));
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

app.whenReady().then(async () => {
    if (!isDev) {
        const { spawn } = await import('child_process');
        const serverPath = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
        const server = spawn('node', [serverPath], {
            env: { ...process.env, PORT: String(NEXT_PORT) },
            stdio: 'ignore',
        });
        server.unref();
    }

    await waitForNextServer(NEXT_URL);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
