'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type AgentId = 'Marketer' | 'Blog' | 'Insta' | 'Shortform' | 'Threads' | 'Reputation' | 'Analyst' | 'Web_D';
type ViewMode = 'chat' | 'calendar' | 'archive';

interface AgentContextType {
    activeAgent: AgentId;
    setActiveAgent: (id: AgentId) => void;
    currentView: ViewMode;
    setCurrentView: (view: ViewMode) => void;
    selectedTopic: string;
    setSelectedTopic: (topic: string) => void;
    agentMessagesRef: React.MutableRefObject<Map<string, any[]>>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

import { useRef } from 'react';

export function AgentProvider({ children }: { children: ReactNode }) {
    const [activeAgent, setActiveAgent] = useState<AgentId>('Blog');
    const [currentView, setCurrentView] = useState<ViewMode>('chat');
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const agentMessagesRef = useRef<Map<string, any[]>>(new Map());

    return (
        <AgentContext.Provider value={{ activeAgent, setActiveAgent, currentView, setCurrentView, selectedTopic, setSelectedTopic, agentMessagesRef }}>
            {children}
        </AgentContext.Provider>
    );
}

export function useAgent() {
    const context = useContext(AgentContext);
    if (context === undefined) {
        throw new Error('useAgent must be used within an AgentProvider');
    }
    return context;
}
