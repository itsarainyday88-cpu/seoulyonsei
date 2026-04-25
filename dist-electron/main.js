"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
// --- Load config.txt (customer-editable settings) ---
const configPath = path.join(path.dirname(electron_1.app.getPath('exe')), 'config.txt');
const fallbackConfigPath = path.join(__dirname, '..', 'config.txt');
const cfgFile = fs.existsSync(configPath) ? configPath : (fs.existsSync(fallbackConfigPath) ? fallbackConfigPath : null);
if (cfgFile) {
    const lines = fs.readFileSync(cfgFile, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('='))
            continue;
        const [key, ...rest] = trimmed.split('=');
        process.env[key.trim()] = rest.join('=').trim();
    }
}
// --- Configuration ---
const isDev = process.env.NODE_ENV === 'development';
const NEXT_PORT = 3000;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    }
    else {
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
            (0, child_process_1.exec)(`"${chromePath}" "${url}"`);
        }
        else {
            electron_1.shell.openExternal(url); // Chrome 없으면 기본 브라우저 fallback
        }
        return { action: 'deny' };
    });
}
function waitForNextServer(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            http.get(url, (res) => {
                if (res.statusCode === 200 || res.statusCode === 307) {
                    resolve();
                }
                else {
                    retry();
                }
            }).on('error', retry);
        };
        const retry = () => {
            if (Date.now() - start > timeout) {
                reject(new Error(`Next.js server did not start within ${timeout}ms`));
            }
            else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}
electron_1.app.whenReady().then(async () => {
    if (!isDev) {
        const { spawn } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const serverPath = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
        const server = spawn('node', [serverPath], {
            env: { ...process.env, PORT: String(NEXT_PORT) },
            stdio: 'ignore',
        });
        server.unref();
    }
    await waitForNextServer(NEXT_URL);
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
