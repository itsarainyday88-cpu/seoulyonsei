'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Mic, Cpu, Bot, User, Save, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAgent } from '@/context/AgentContext';
import ReactMarkdown from 'react-markdown';

interface Message {
    role: 'user' | 'model';
    content: string;
    audit?: {
        status: 'pending' | 'safe' | 'warning';
        reason?: string;
    };
}

export default function ChatInterface() {
    const { activeAgent, setActiveAgent, agentMessagesRef, selectedTopic, setSelectedTopic } = useAgent();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Watch for topic injection from CalendarView
    useEffect(() => {
        if (selectedTopic) {
            setInput(`[캘린더 작업 예약건]\n주제: ${selectedTopic}\n\n위 내용에 맞춰 콘텐츠를 작성해 줘.`);
            setSelectedTopic(''); // 소비 후 초기화
        }
    }, [selectedTopic, setSelectedTopic]);

    // Save current agent's history and restore new agent's history
    const prevAgentRef = useRef<string>(activeAgent);

    // Save current messages when agent changes, restore new agent's history
    useEffect(() => {
        const prev = prevAgentRef.current;
        const current = activeAgent;

        if (prev !== current) {
            // Save previous agent's messages (only if more than welcome msg)
            if (messages.length > 1) {
                agentMessagesRef.current.set(prev, messages);
            }
            prevAgentRef.current = current;
        }

        // Restore or create welcome message for new agent
        const saved = agentMessagesRef.current.get(current);
        if (saved && saved.length > 0) {
            setMessages(saved);
        } else {
            setMessages([
                {
                    role: 'model',
                    content: `**[${activeAgent}]** 에이전트 준비 완료.\n\n${activeAgent === 'Marketer' ? '전략 기획' : '업무 수행'}을 시작할 준비가 되었습니다.`
                }
            ]);
        }
    }, [activeAgent, agentMessagesRef]);

    // Continuously sync messages to the global ref so we never lose them on unmount (HMR/Focus loss)
    useEffect(() => {
        if (messages.length > 0) {
            agentMessagesRef.current.set(activeAgent, messages);
        }
    }, [messages, activeAgent, agentMessagesRef]);

    // Define compressImage utility on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && !(window as any).compressImage) {
            (window as any).compressImage = async (dataUrl: string, maxWidth = 1024, quality = 0.8): Promise<string> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            height = (maxWidth / width) * height;
                            width = maxWidth;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                        }
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.src = dataUrl;
                });
            };
        }
    }, []);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);

        setLoading(true);

        try {
            setMessages(prev => [...prev, { role: 'model', content: '' }]);

            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);

            // Simple intent classification for tool switching
            const searchKeywords = ['검색', '찾아', '조사', 'search', '구글', 'google', '최신', '정보', '가격', '근황'];
            const shouldSearch = searchKeywords.some(keyword => userMessage.toLowerCase().includes(keyword));

            // --- 크로스 에이전트 컨텍스트: Blog/Insta/Dang이면 오늘 Marketer 결과 불러오기 ---
            let contextInjection = '';
            if (['Blog', 'Insta', 'Dang'].includes(activeAgent)) {
                try {
                    const ctxRes = await fetch('/api/context?agentId=Marketer');
                    const ctxData = await ctxRes.json();
                    if (ctxData.context) {
                        contextInjection = `\n\n[📋 오늘 마케터 분석 결과 참조]\n${ctxData.context}\n\n위 마케터의 시장 분석/전략 내용을 참고하여 콘텐츠를 작성하세요.`;
                    }
                } catch (_) { /* 컨텍스트 없으면 조용히 무시 */ }
            }

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: activeAgent,
                    message: contextInjection ? userMessage + contextInjection : userMessage,
                    history: messages,
                    useSearch: shouldSearch
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to connect');
            }

            if (!res.body) throw new Error('No response body');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedResponse += chunk;

                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg.role === 'model') {
                        lastMsg.content = accumulatedResponse;
                    }
                    return newMessages;
                });
            }

            // --- Marketer 결과 오늘 날짜로 로컬 저장 ---
            if (activeAgent === 'Marketer' && accumulatedResponse.length > 100) {
                fetch('/api/context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentId: 'Marketer', content: accumulatedResponse }),
                }).catch(() => { });
            }

        } catch (error: any) {
            console.error(error);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg?.role === 'model') {
                    lastMsg.content += '\n\n⚠️ 오류: 응답 중단됨.';
                    return newMessages;
                }
                return [...prev, { role: 'model', content: `⚠️ 오류: ${error.message || '통신 실패'}\n\n(잠시 후 다시 시도해주세요)` }];
            });
        } finally {
            setLoading(false);
        }
    };


    const handleSave = async () => {
        if (messages.length === 0) return;

        setLoading(true); // Indicate processing
        const date = new Date().toISOString().split('T')[0];
        const fileName = `Sample_Chat_${date}.md`;

        let content = `# Sample Marketing OS Chat Log\nDate: ${date}\nAgent: ${activeAgent}\n\n---\n\n`;

        // Process messages to embed images
        for (const msg of messages) {
            const role = msg.role === 'user' ? 'User' : activeAgent;
            let processedContent = msg.content;

            // Find all image links relative to /generated-images/
            // Regex to find ![...](/generated-images/...)
            const imageRegex = /!\[(.*?)\]\((\/generated-images\/.*?)\)/g;
            let match;
            const replacements = [];

            while ((match = imageRegex.exec(msg.content)) !== null) {
                const fullMatch = match[0]; // ![alt](/url)
                const altText = match[1];
                const relativeUrl = match[2];

                try {
                    // Fetch the image
                    const response = await fetch(relativeUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        const base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                        replacements.push({ fullMatch, newStr: `![${altText}](${base64})` });
                    }
                } catch (err) {
                    console.error('Failed to embed image:', relativeUrl, err);
                    // Keep original link if fail
                }
            }

            // Apply replacements
            for (const rep of replacements) {
                processedContent = processedContent.replace(rep.fullMatch, rep.newStr);
            }

            // Render Image Logic
            if (msg.content.includes('![AI 생성 이미지]')) {
                // Check if image failed (simple heuristic for now, or backend sends specific string)
                // Currently backend yields empty string on fail, so this might not be needed unless we send error marker.
                // let's add specific marker detection if we decide to implement it in gemini.ts later.
            }
            content += `## [${role}]\n${processedContent}\n\n---\n\n`;
        }

        // Use File System Access API if available
        try {
            // @ts-ignore
            if (window.showSaveFilePicker) {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'Markdown File',
                        accept: { 'text/markdown': ['.md'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
            } else {
                // Fallback
                const blob = new Blob([content], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Failed to save file:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('File upload failed');

            const data = await res.json();
            const text = data.text;
            const imageUrl = data.url;

            if (imageUrl) {
                setInput(prev => prev + `\n\n[참고 이미지: ${imageUrl}]\n${text}\n\n`);
            } else {
                setInput(prev => prev + `\n\n[참고 파일: ${file.name}]\n${text}\n\n`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('파일 분석에 실패했습니다.');
        } finally {
            setLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };


    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Messages Area */}
            <div
                className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                ref={(ref) => {
                    // Ref logic if needed
                }}
            >
                {/* Image Compression Utility */}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-4 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 
                    ${msg.role === 'model' ? 'bg-secondary text-primary' : 'bg-sand text-foreground'}`}>
                            {msg.role === 'model' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className={`space-y-2 max-w-[80%]`}>
                            <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed prose prose-sm max-w-none
                        ${msg.role === 'model'
                                    ? 'bg-white rounded-tl-none border border-sand/30 text-foreground'
                                    : 'bg-secondary rounded-tr-none text-primary'}`}>
                                <ReactMarkdown>{activeAgent !== 'Marketer' && msg.role === 'model'
                                    ? msg.content.split(/🚦|🚥|Compliance Check/i)[0].trim()
                                    : msg.content
                                }</ReactMarkdown>


                                {/* HWACK: Smart Action Buttons */}
                                {msg.role === 'model' && (
                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">

                                        {/* Cross-Agent Transfer Buttons (Marketer only) */}
                                        {activeAgent === 'Marketer' && idx > 0 && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const cleanContent = msg.content.split('🚦')[0].trim();
                                                        agentMessagesRef.current.set('Marketer', messages);
                                                        setActiveAgent('Blog');
                                                        setInput(`아래 마케터 기획안을 바탕으로 네이버 블로그 글을 작성해주세요:\n\n${cleanContent}`);
                                                    }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                                >
                                                    📝 블로그로 전달
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const cleanContent = msg.content.split('🚦')[0].trim();
                                                        agentMessagesRef.current.set('Marketer', messages);
                                                        setActiveAgent('Insta');
                                                        setInput(`아래 마케터 기획안을 바탕으로 인스타그램 게시물을 작성해주세요:\n\n${cleanContent}`);
                                                    }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-pink-50 text-pink-700 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors"
                                                >
                                                    📸 인스타로 전달
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const cleanContent = msg.content.split('🚦')[0].trim();
                                                        agentMessagesRef.current.set('Marketer', messages);
                                                        setActiveAgent('Dang');
                                                        setInput(`아래 마케터 기획안을 바탕으로 당근마켓 게시물을 작성해주세요:\n\n${cleanContent}`);
                                                    }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                                                >
                                                    🥕 당근으로 전달
                                                </button>
                                            </>
                                        )}

                                        {/* Naver Blog Button */}
                                        {(
                                            (activeAgent === 'Blog') ||
                                            (msg.content.includes('## 1. 📝 Blog Post'))
                                        ) && idx === messages.length - 1 && (
                                                <button
                                                    onClick={async () => {
                                                        let fullBody = msg.content.split(/🚦|🚥|Compliance Check/i)[0].trim();
                                                        let title = "블로그 포스팅";

                                                        // Logic for specialized section extraction (if mixed content)
                                                        if (msg.content.includes('## 1. 📝 Blog Post')) {
                                                            const start = msg.content.indexOf('## 1. 📝 Blog Post');
                                                            const end = msg.content.indexOf('## 2.');
                                                            fullBody = msg.content.substring(start, end === -1 ? undefined : end);

                                                            // Extract Title from section
                                                            const lines = fullBody.split('\n');
                                                            for (const line of lines) {
                                                                if (line.includes('## 1. 📝')) continue;
                                                                if (line.toLowerCase().startsWith('title:')) {
                                                                    title = line.replace(/title:/i, '').trim();
                                                                    break;
                                                                } else if (line.startsWith('#') || line.startsWith('**')) {
                                                                    title = line.replace(/[#*]/g, '').trim();
                                                                    break;
                                                                }
                                                            }
                                                        } else {
                                                            // Logic for Blog Agent (Full Content)
                                                            const lines = msg.content.split('\n');
                                                            for (const line of lines) {
                                                                if (line.toLowerCase().startsWith('title:') || line.toLowerCase().startsWith('제목:')) {
                                                                    title = line.replace(/title:|제목:/i, '').trim();
                                                                    break;
                                                                } else if (line.startsWith('# ')) {
                                                                    title = line.replace(/^#\s/, '').trim();
                                                                    break;
                                                                }
                                                            }
                                                        }

                                                        // Sequential Block Parsing (Data Extraction)
                                                        const blocks = [];
                                                        const imageRegex = /!\[.*?\]\((.*?)\)/g;
                                                        let lastIndex = 0;
                                                        let match;

                                                        const stripMarkdown = (text: string) => {
                                                            return text
                                                                .replace(/^#+\s+/gm, '') // Headers
                                                                .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
                                                                .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
                                                                .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
                                                                .replace(/^>\s+/gm, '') // Blockquotes
                                                                .replace(/^\s*[-*+]\s+/gm, '') // Unordered lists
                                                                .replace(/^\s*\d+\.\s+/gm, '') // Ordered lists
                                                                .trim();
                                                        };

                                                        while ((match = imageRegex.exec(fullBody)) !== null) {
                                                            const textBefore = fullBody.substring(lastIndex, match.index).trim();
                                                            if (textBefore) {
                                                                blocks.push({ type: 'text', content: stripMarkdown(textBefore) });
                                                            }

                                                            const url = match[1];
                                                            try {
                                                                const fullUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
                                                                const response = await fetch(fullUrl);
                                                                const blob = await response.blob();
                                                                const base64 = await new Promise<string>((resolve) => {
                                                                    const reader = new FileReader();
                                                                    reader.onloadend = () => resolve(reader.result as string);
                                                                    reader.readAsDataURL(blob);
                                                                });

                                                                const compressed = await (window as any).compressImage(base64);
                                                                blocks.push({ type: 'image', data: compressed });
                                                            } catch (err) { }
                                                            lastIndex = imageRegex.lastIndex;
                                                        }

                                                        const remainingText = fullBody.substring(lastIndex).trim();
                                                        if (remainingText) {
                                                            blocks.push({ type: 'text', content: stripMarkdown(remainingText) });
                                                        }

                                                        const postData = {
                                                            title: title,
                                                            content: fullBody,
                                                            blocks: blocks
                                                        };

                                                        const dataSize = JSON.stringify(postData).length / (1024 * 1024);

                                                        // Use Handoff API to bridge Electron -> Chrome Extension
                                                        try {
                                                            const res = await fetch('/api/handoff', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ type: 'HWACK_UPLOAD_NAVER', data: postData })
                                                            });
                                                            const { id } = await res.json();
                                                            // Electron URL Click 방식을 우회하여 메인 앱 상태를 유지하며 외부 브라우저로 띄움
                                                            if ((window as any).electronAPI) {
                                                                (window as any).electronAPI.send('open-external', `${window.location.origin}/handoff?id=${id}`);
                                                            } else {
                                                                window.open(`/handoff?id=${id}`, '_blank', 'noreferrer,noopener');
                                                            }
                                                        } catch (e) {
                                                            console.error('Handoff error:', e);
                                                            alert('전송 중 오류가 발생했습니다.');
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-[#03C75A] text-white rounded-lg text-xs font-bold hover:bg-[#02b351] transition-colors flex items-center gap-1"
                                                >
                                                    <span>🚀 네이버 업로드</span>
                                                </button>
                                            )}

                                        {/* Instagram Button */}
                                        {(
                                            (activeAgent === 'Insta') ||
                                            (msg.content.includes('## 2. 🎨 Instagram Content'))
                                        ) && (
                                                <button
                                                    onClick={async () => {
                                                        let fullContent = msg.content;
                                                        if (msg.content.includes('## 2. 🎨 Instagram Content')) {
                                                            const start = msg.content.indexOf('## 2. 🎨 Instagram Content');
                                                            const end = msg.content.indexOf('## 3.');
                                                            const section = msg.content.substring(start, end === -1 ? undefined : end);
                                                            fullContent = section.replace(/## 2\.\s*🎨\s*Instagram\s*Content/i, '').trim();
                                                        }

                                                        const imageRegex = /!\[.*?\]\((.*?)\)/g;
                                                        const stripMarkdown = (text: string) => text.replace(/^#+\s+/gm, '').replace(/(\*\*|__)(.*?)\1/g, '$2').trim();

                                                        // 1. Text Copy (Caption without image markers and without compliance check)
                                                        let rawCaption = fullContent.replace(/!\[.*?\]\(.*?\)/g, '').replace(/Nano Banana Prompt:.*?\n/gi, '');
                                                        // 신호등 컴플라이언스 체크 영역 잘라내기
                                                        const complianceMatch = rawCaption.match(/\[🚦 Compliance Check\][\s\S]*/);
                                                        if (complianceMatch) {
                                                            rawCaption = rawCaption.substring(0, complianceMatch.index);
                                                        }

                                                        const cleanCaption = stripMarkdown(rawCaption);
                                                        try {
                                                            await navigator.clipboard.writeText(cleanCaption);
                                                        } catch (err) {
                                                            console.error('Failed to copy text:', err);
                                                        }

                                                        // 2. Image Download & Preview Logic (Slide Blocks)
                                                        let downloadCount = 0;
                                                        const blocks: any[] = [];
                                                        let lastIndex = 0;
                                                        let match;

                                                        // Loop through all images to create slides
                                                        while ((match = imageRegex.exec(fullContent)) !== null) {
                                                            const url = match[1];
                                                            const fullUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;

                                                            // Find text between this image and the next image
                                                            let nextMatchStart = fullContent.length;
                                                            const lookaheadRegex = /!\[.*?\]\((.*?)\)/g;
                                                            lookaheadRegex.lastIndex = imageRegex.lastIndex;
                                                            const nextMatch = lookaheadRegex.exec(fullContent);
                                                            if (nextMatch) nextMatchStart = nextMatch.index;

                                                            let slideText = fullContent.substring(imageRegex.lastIndex, nextMatchStart).trim();
                                                            slideText = stripMarkdown(slideText.replace(/Nano Banana Prompt:.*?\n/gi, ''));

                                                            blocks.push({
                                                                type: 'slide',
                                                                title: `Image ${downloadCount + 1}`,
                                                                image: fullUrl,
                                                                content: slideText || '(캡션 없음)'
                                                            });

                                                            try {
                                                                const response = await fetch(fullUrl);
                                                                const blob = await response.blob();
                                                                const downloadUrl = window.URL.createObjectURL(blob);
                                                                const a = document.createElement('a');
                                                                a.href = downloadUrl;
                                                                a.download = `insta_card_${downloadCount + 1}.jpg`;
                                                                document.body.appendChild(a);
                                                                a.click();
                                                                document.body.removeChild(a);
                                                                window.URL.revokeObjectURL(downloadUrl);
                                                                downloadCount++;
                                                            } catch (err) {
                                                                console.error('Failed to download image:', url, err);
                                                            }
                                                            lastIndex = imageRegex.lastIndex;
                                                        }

                                                        // Handle any remaining text before the first image
                                                        if (blocks.length > 0 && fullContent.indexOf('![') > 0) {
                                                            const initialText = stripMarkdown(fullContent.substring(0, fullContent.indexOf('![')).trim());
                                                            if (initialText) {
                                                                blocks.unshift({ type: 'text', content: initialText });
                                                            }
                                                        }

                                                        // Use Handoff API to bridge Electron -> Chrome Extension
                                                        try {
                                                            const res = await fetch('/api/handoff', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ type: 'HWACK_UPLOAD_INSTA', data: { caption: cleanCaption, blocks: blocks } })
                                                            });
                                                            const { id } = await res.json();
                                                            // Electron URL Click 방식을 우회하여 메인 앱 상태를 유지하며 외부 브라우저로 띄움
                                                            if ((window as any).electronAPI) {
                                                                (window as any).electronAPI.send('open-external', `${window.location.origin}/handoff?id=${id}`);
                                                            } else {
                                                                window.open(`/handoff?id=${id}`, '_blank', 'noreferrer,noopener');
                                                            }
                                                        } catch (e) {
                                                            console.error('Handoff error:', e);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-gradient-to-tr from-[#FFDC80] via-[#F56040] to-[#833AB4] text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
                                                >
                                                    <span>🚀 인스타 업로드</span>
                                                </button>
                                            )}

                                        {/* Danggeun Button */}
                                        {(
                                            (activeAgent === 'Dang') ||
                                            (msg.content.includes('## 3. 🥕 Danggeun'))
                                        ) && (
                                                <button
                                                    onClick={async () => {
                                                        let section = msg.content;

                                                        if (msg.content.includes('## 3. 🥕 Danggeun')) {
                                                            const start = msg.content.indexOf('## 3. 🥕 Danggeun');
                                                            section = msg.content.substring(start);
                                                        }

                                                        const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                                                        let title = "당근마켓 소식";
                                                        let bodyStartIndex = 0;

                                                        for (let i = 0; i < lines.length; i++) {
                                                            const line = lines[i];
                                                            if (line.includes('## 3. 🥕')) continue;
                                                            if (line.toLowerCase().startsWith('title:')) {
                                                                title = line.replace(/title:/i, '').trim();
                                                                bodyStartIndex = i + 1;
                                                                break;
                                                            } else if (line.startsWith('#') || line.startsWith('**')) {
                                                                title = line.replace(/[#*]/g, '').trim();
                                                                bodyStartIndex = i + 1;
                                                                break;
                                                            }
                                                        }

                                                        // Use Handoff API to bridge Electron -> Chrome Extension
                                                        try {
                                                            const res = await fetch('/api/handoff', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ type: 'HWACK_UPLOAD_DANG', data: { title: title, content: lines.slice(bodyStartIndex).join('\n') } })
                                                            });
                                                            const { id } = await res.json();
                                                            // Electron URL Click 방식을 우회하여 메인 앱 상태를 유지하며 외부 브라우저로 띄움
                                                            if ((window as any).electronAPI) {
                                                                (window as any).electronAPI.send('open-external', `${window.location.origin}/handoff?id=${id}`);
                                                            } else {
                                                                window.open(`/handoff?id=${id}`, '_blank', 'noreferrer,noopener');
                                                            }
                                                        } catch (e) {
                                                            console.error('Handoff error:', e);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-[#FF6F0F] text-white rounded-lg text-xs font-bold hover:bg-[#e65f0a] transition-colors flex items-center gap-1"
                                                >
                                                    <span>🚀 당근 업로드</span>
                                                </button>
                                            )}

                                        {/* Supporter Buttons */}
                                        {(
                                            activeAgent === 'Supporter' ||
                                            (msg.content.includes('## 🔮 Customer Support Reply'))
                                        ) && (
                                                <>
                                                    <button
                                                        onClick={() => window.open('https://center-pf.kakao.com/', '_blank')}
                                                        className="px-3 py-1.5 bg-[#FEE500] text-[#3c1e1e] rounded-lg text-xs font-bold hover:bg-[#fdd835] transition-colors flex items-center gap-1"
                                                    >
                                                        <span>💬 카카오톡 채널 관리자</span>
                                                    </button>
                                                    <button
                                                        onClick={() => window.open('https://partner.talk.naver.com/', '_blank')}
                                                        className="px-3 py-1.5 bg-[#03C75A] text-white rounded-lg text-xs font-bold hover:bg-[#02b351] transition-colors flex items-center gap-1"
                                                    >
                                                        <span>💬 네이버 톡톡 파트너센터</span>
                                                    </button>
                                                </>
                                            )}

                                        {/* Reputation Agent Buttons */}
                                        {(
                                            activeAgent === 'Reputation' ||
                                            (msg.content.includes('## 🛡️ Reputation Review Reply'))
                                        ) && (
                                                <>
                                                    <button
                                                        onClick={() => window.open('https://map.naver.com/', '_blank')}
                                                        className="px-3 py-1.5 bg-[#03C75A] text-white rounded-lg text-xs font-bold hover:bg-[#02b351] transition-colors flex items-center gap-1"
                                                    >
                                                        <span>⭐ 네이버 리뷰 바로가기</span>
                                                    </button>
                                                    <button
                                                        onClick={() => window.open('https://business.google.com/', '_blank')}
                                                        className="px-3 py-1.5 bg-[#4285F4] text-white rounded-lg text-xs font-bold hover:bg-[#3367d6] transition-colors flex items-center gap-1"
                                                    >
                                                        <span>⭐ 구글 리뷰 관리</span>
                                                    </button>
                                                    <button
                                                        onClick={() => window.open('https://business.daangn.com/', '_blank')}
                                                        className="px-3 py-1.5 bg-[#FF6F0F] text-white rounded-lg text-xs font-bold hover:bg-[#e65f0a] transition-colors flex items-center gap-1"
                                                    >
                                                        <span>⭐ 당근 비즈프로필</span>
                                                    </button>
                                                </>
                                            )}

                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex gap-4 max-w-3xl animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                            <Cpu className="w-4 h-4 text-white animate-spin" />
                        </div>
                        <div className="bg-white/50 p-4 rounded-2xl rounded-tl-none border border-sand/20 text-secondary text-sm">
                            생각 중...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white/50 backdrop-blur border-t border-sand/30">
                <div className="relative flex items-end gap-2 bg-white border border-sand/40 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf,.txt,.md,.pptx,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.csv"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-400 hover:text-primary transition-all rounded-xl hover:bg-secondary/20 flex flex-col items-center gap-1 min-w-[60px]"
                        title="파일 업로드 (PDF/Text)"
                    >
                        <Paperclip className="w-5 h-5" />
                        <span className="text-[10px] font-bold">파일 첨부</span>
                    </button>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`${activeAgent}에게 명령 입력...`}
                        className="flex-1 max-h-32 min-h-[60px] py-4 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-gray-400 resize-none ml-2"
                    />
                    <div className="flex flex-col gap-2 pb-1 pr-1">
                        <button
                            onClick={handleSave}
                            disabled={loading || messages.length === 0}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-gray-500 hover:text-primary hover:bg-secondary/30 rounded-xl transition-all font-bold text-[10px] border border-transparent hover:border-secondary/20"
                            title="대화 내용 저장 (.md)"
                        >
                            <Save className="w-3.5 h-3.5" />
                            <span>대화 저장</span>
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-secondary rounded-xl hover:bg-primary/95 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            <span className="text-xs font-black tracking-tight">전송하기</span>
                            <Send className="w-4 h-4 translate-x-0.5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* REMOVED BOTTOM BUTTONS - Now in Sidebar Header */}
                <div className="mt-2 text-center text-[10px] text-gray-400 flex justify-center items-center gap-4">
                    <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 학원법/표시광고법 검토 시스템 활성화됨</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> {activeAgent.toUpperCase()} 연결됨</span>
                </div>
            </div>
        </div>
    );
}
