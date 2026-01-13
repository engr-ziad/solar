import React, { useState, useEffect, useCallback } from 'react';
import ChatInterface from './components/ChatInterface';
import CadViewer from './components/CadViewer';
import { geminiService } from './services/geminiService';
import { liveService } from './services/liveService';
import { Message, SolarSystemData, INITIAL_SYSTEM } from './types';

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'أهلاً بك يا زميلي. يمكننا التناقش صوتياً الآن لتصميم النظام. اضغط على زر الهاتف لنتحدث.',
      timestamp: new Date()
    }
  ]);
  
  // History State
  const [history, setHistory] = useState<SolarSystemData[]>([INITIAL_SYSTEM]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);

  // Derived current system
  const currentSystem = history[historyIndex];

  const updateSystem = (newData: SolarSystemData) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newData);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = useCallback(() => {
    setHistoryIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryIndex(prev => (prev < history.length - 1 ? prev + 1 : prev));
  }, [history.length]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { system, comment } = await geminiService.generateSolarDesign(text, currentSystem);
      updateSystem(system);
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: comment,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLive = () => {
    if (isLiveActive) {
      liveService.disconnect();
      setIsLiveActive(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'تم إنهاء المكالمة.',
        timestamp: new Date()
      }]);
    } else {
      setIsLiveActive(true);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'جاري الاتصال بمهندس الطاقة... (تحدث الآن)',
        timestamp: new Date()
      }]);

      liveService.connect(
        currentSystem,
        (updatedSystem, comment) => {
           updateSystem(updatedSystem);
           setMessages(prev => [...prev, {
             id: Date.now().toString(),
             role: 'assistant',
             content: `[تحديث المخطط]: ${comment}`,
             timestamp: new Date()
           }]);
        },
        (status) => {
            if (status === 'disconnected' || status === 'error') {
                setIsLiveActive(false);
            }
        }
      );
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0f0f0f] overflow-hidden">
      {/* Left Panel: Chat & Controls (Mobile: Bottom, Desktop: Left) */}
      <div className="w-full md:w-1/3 h-2/3 md:h-full flex flex-col z-20 shadow-2xl">
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage}
          onToggleLive={handleToggleLive}
          isLiveActive={isLiveActive}
          isLoading={isLoading}
        />
      </div>

      {/* Right Panel: CAD Viewer (Mobile: Top, Desktop: Right) */}
      <div className="w-full md:w-2/3 h-1/3 md:h-full relative border-r border-[#333]">
        <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur text-white px-3 py-1 rounded text-xs border border-gray-700 pointer-events-none">
           معاينة المخطط الأحادي (SLD) - عرض حي
        </div>
        <CadViewer 
          data={currentSystem} 
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onSystemUpdate={updateSystem}
        />
      </div>
    </div>
  );
}

export default App;