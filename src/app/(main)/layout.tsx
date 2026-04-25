'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Users,
    MessageSquare,
    Settings,
    LogOut,
    LayoutDashboard,
    Sparkles,
    Calendar,
    Library,
    FileText,
    Share2,
    Instagram,
    ShieldAlert,
    Search,
    Code,
    TrendingUp,
    Menu
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AgentProvider, useAgent } from '@/context/AgentContext';

// Sidebar separate component to consume context
function Sidebar() {
    const { activeAgent, setActiveAgent, currentView, setCurrentView } = useAgent();
    const [sidebarWidth, setSidebarWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) setSidebarWidth(parseInt(savedWidth));
    }, []);

    const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth > 250 && newWidth < 800) {
                setSidebarWidth(newWidth);
                localStorage.setItem('sidebarWidth', newWidth.toString());
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const agents = [
        { id: 'Blog', name: 'Blog', role: '원장 직강 전문 라이터', icon: FileText, desc: '국어/수학 전문 칼럼니스트 및 블로그 컨텐츠 제작' },
        { id: 'Insta', name: 'Insta', role: '학원 비주얼 디렉터', icon: Instagram, desc: '수강생 모집/학원 전경 중심의 카드뉴스 기획 및 프롬프트 생성' },
        { id: 'Dang', name: 'Dang', role: '맘카페/당근 홍보 매니저', icon: Share2, desc: '지역 학부모 커뮤니티(당근마켓) 홍보 및 소통' },
        { id: 'Supporter', name: 'Supporter', role: '학부모 상담 실장', icon: MessageSquare, desc: '카카오톡 등 학부모 입학/진도 문의 응대 스크립트 작성' },
        { id: 'Reputation', name: 'Reputation', role: '수강 후기 관리자', icon: ShieldAlert, desc: '학원/강의 리뷰에 대한 맞춤형 답변 생성' },
        { id: 'Marketer', name: 'Marketer', role: '전략가 + 감시관', icon: TrendingUp, desc: '경쟁 학원 동향 분석 및 학원법/광고법 리스크 감시' },
    ];

    return (
        <aside
            className="flex flex-col border-r border-sand/30 bg-white/50 backdrop-blur-sm relative shrink-0"
            style={{ width: `${sidebarWidth}px` }}
        >
            {/* Drag Handle */}
            <div
                onMouseDown={startResizing}
                className={`absolute right-0 top-0 w-1.5 h-full cursor-col-resize transition-all z-20 flex items-center justify-center
                    ${isResizing ? 'bg-primary/20' : 'hover:bg-primary/10'}`}
            >
                <div className={`w-[2px] h-12 rounded-full transition-colors ${isResizing ? 'bg-primary' : 'bg-gray-200 group-hover:bg-gray-300'}`} />
            </div>
            <div className="p-6 border-b border-sand/30 flex justify-between items-center">
                <button
                    onClick={() => window.location.href = '/'}
                    className="text-left group hover:opacity-70 transition-opacity"
                    title="새로고침 (초기화)"
                >
                    <h1 className="text-2xl font-serif font-bold text-secondary">서울연세학원 마케팅 OS</h1>
                    <p className="text-xs text-secondary/60 tracking-wider">Academy Growth Solution</p>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {/* View Mode Toggle (Chat vs Calendar) */}
                <div className="flex bg-sand/20 rounded-lg p-1 gap-1 mb-6">
                    <button
                        onClick={() => setCurrentView('chat')}
                        className={`flex-1 py-2 text-[11px] font-bold transition-all rounded-md flex items-center justify-center gap-1.5
                            ${currentView === 'chat' ? 'bg-white shadow text-foreground' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> 채팅
                    </button>
                    <button
                        onClick={() => setCurrentView('calendar')}
                        className={`flex-1 py-2 text-[11px] font-bold transition-all rounded-md flex items-center justify-center gap-1.5
                            ${currentView === 'calendar' ? 'bg-white shadow text-foreground' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <Calendar className="w-3.5 h-3.5" /> 캘린더
                    </button>
                    <button
                        onClick={() => setCurrentView('archive')}
                        className={`flex-1 py-2 text-[11px] font-bold transition-all rounded-md flex items-center justify-center gap-1.5
                            ${currentView === 'archive' ? 'bg-white shadow text-foreground' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <Library className="w-3.5 h-3.5" /> 보관함
                    </button>
                </div>

                <div className={`grid grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${currentView === 'calendar' ? 'opacity-40 pointer-events-none' : ''}`}>
                    {agents.map((agent) => (
                        <button
                            key={agent.id}
                            onClick={() => setActiveAgent(agent.id as any)}
                            className={`p-4 rounded-xl border transition-all text-left group relative flex flex-col gap-3 hover:z-20
                                ${activeAgent === agent.id
                                    ? 'bg-secondary text-primary border-secondary shadow-lg scale-[1.02]'
                                    : 'bg-white border-sand/40 hover:border-secondary/50 hover:shadow-md text-foreground'
                                }
                            `}
                        >
                            <div className={`p-2 rounded-lg w-fit ${activeAgent === agent.id ? 'bg-white/10' : 'bg-sand/20'}`}>
                                <agent.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight">{agent.name}</h3>
                                <p className={`text-xs mt-1 ${activeAgent === agent.id ? 'text-primary/70' : 'text-foreground/60'}`}>
                                    {agent.role}
                                </p>
                            </div>

                            {/* Hover Tooltip */}
                            <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-lg w-full text-center leading-tight">
                                {agent.desc}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-6 border-t border-sand/30 bg-white/30">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors font-medium text-sm"
                >
                    <LogOut className="w-4 h-4" /> 로그아웃
                </button>
            </div>
        </aside>
    );
}

function Header() {
    const { activeAgent } = useAgent();
    return (
        <div className="absolute top-0 inset-x-0 z-10 p-4 bg-white/80 backdrop-blur border-b border-sand/30 flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="font-mono text-sm font-semibold text-foreground uppercase">
                    활성: {activeAgent} 에이전트
                </span>
            </div>
            <div className="flex gap-2">


            </div>
        </div>
    );
}


export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AgentProvider>
            <div className="flex h-screen bg-primary overflow-hidden">
                <Sidebar />

                {/* Main Content (Right Panel - 60%) */}
                <main className="flex-1 flex flex-col relative bg-primary overflow-hidden">
                    <Header />
                    {/* Chat Area - Added min-h-0 to allow scrolling within children */}
                    <div className="flex-1 flex flex-col pt-16 min-h-0 overflow-hidden">
                        {children}
                    </div>
                </main>
            </div>
        </AgentProvider>
    );
}
