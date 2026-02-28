'use client';

import ChatInterface from '@/components/agents/ChatInterface';
import CalendarView from '@/components/calendar/CalendarView';
import ArchiveView from '@/components/archive/ArchiveView';
import { useAgent } from '@/context/AgentContext';

export default function MainPage() {
    const { currentView } = useAgent();

    return (
        <div className="h-full">
            {currentView === 'chat' && <ChatInterface />}
            {currentView === 'calendar' && <CalendarView />}
            {currentView === 'archive' && <ArchiveView />}
        </div>
    );
}
