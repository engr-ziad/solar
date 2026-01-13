import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onToggleLive: () => void;
  isLiveActive: boolean;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onToggleLive, isLiveActive, isLoading }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#333]">
      {/* Header */}
      <div className="p-4 bg-[#252525] border-b border-[#333] flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <span className="text-yellow-500">⚡</span> 
           مهندس الطاقة الشمسية
        </h2>
        <div className="flex items-center gap-2">
            {isLiveActive ? (
                <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded border border-red-800 animate-pulse flex items-center gap-1">
                   <span className="w-2 h-2 rounded-full bg-red-500"></span>
                   مكالمة جارية
                </span>
            ) : (
                <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded border border-green-800">
                    متصل (IEC)
                </span>
            )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg shadow-md leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-[#333] text-gray-200 rounded-bl-none border border-gray-600'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm md:text-base">{msg.content}</p>
              <span className="text-[10px] opacity-50 block mt-2 text-left">
                  {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-end">
             <div className="bg-[#333] p-3 rounded-lg rounded-bl-none border border-gray-600">
                <div className="flex space-x-2 space-x-reverse">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce delay-200"></div>
                </div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#252525] border-t border-[#333]">
        <div className="flex gap-2 items-end">
            <button
                onClick={onToggleLive}
                className={`p-3 rounded-full transition-all flex items-center justify-center w-12 h-12 ${
                    isLiveActive 
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                title={isLiveActive ? "إنهاء المكالمة" : "ابدأ نقاش صوتي"}
            >
                {isLiveActive ? (
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                )}
            </button>
            <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
                disabled={isLiveActive}
                placeholder={isLiveActive ? "المكالمة الصوتية جارية..." : "اكتب طلبك هنا أو اضغط على الهاتف للنقاش..."}
                className="flex-1 bg-[#181818] border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-500 resize-none h-[50px] max-h-[120px] disabled:opacity-50"
            />
            <button
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading || isLiveActive}
                className="p-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-180"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;