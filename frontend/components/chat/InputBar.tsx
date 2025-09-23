'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Paperclip,
  X,
  Loader2,
  FileText,
  Terminal
} from 'lucide-react';

interface InputBarProps {
  onSendMessage: (message: string, vcfPath?: string) => void;
  disabled?: boolean;
  vcfPath?: string;
  onVCFSelect?: () => void;
}

export function InputBar({
  onSendMessage,
  disabled = false,
  vcfPath,
  onVCFSelect
}: InputBarProps) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !vcfPath) return;

    onSendMessage(trimmedMessage || 'Analyze this VCF file', vcfPath);
    setMessage('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Enter to send
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }

    // Handle ESC to clear
    if (e.key === 'Escape') {
      e.preventDefault();
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="border-t border-gray-900 bg-black">
      <div className="container px-4 py-3">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* VCF File Badge */}
          {vcfPath && (
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="border-green-900 text-green-500 font-mono text-xs gap-1"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-xs truncate">{vcfPath.split('/').pop()}</span>
                <button
                  onClick={() => onVCFSelect?.()}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}

          {/* Input Area */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-3 text-gray-600">
                <Terminal className="h-3 w-3" />
              </div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={vcfPath 
                  ? "Additional analysis parameters..." 
                  : "Enter command or query..."
                }
                disabled={disabled}
                className="w-full min-h-[40px] max-h-[120px] resize-none bg-black border border-gray-800 
                         text-green-400 font-mono text-sm pl-10 pr-4 py-2.5 rounded
                         focus:border-green-900 focus:outline-none placeholder-gray-700"
                rows={1}
              />
              
              {message.length > 0 && (
                <div className="absolute bottom-2 right-2 font-mono text-xs text-gray-700">
                  {message.length}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!vcfPath && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onVCFSelect}
                  disabled={disabled}
                  className="border-gray-800 hover:border-green-900 h-[40px] w-[40px]"
                  title="Attach VCF"
                >
                  <Paperclip className="h-4 w-4 text-gray-600" />
                </Button>
              )}
              
              <Button
                onClick={handleSend}
                disabled={disabled || (!message.trim() && !vcfPath)}
                className="bg-green-950 hover:bg-green-900 text-green-400 h-[40px] px-4 font-mono text-xs"
              >
                {disabled ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    PROCESSING
                  </>
                ) : (
                  <>
                    <Send className="mr-1 h-3 w-3" />
                    SEND
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Terminal hint */}
          <p className="font-mono text-xs text-gray-700 text-center">
            [ENTER] send | [SHIFT+ENTER] newline | [ESC] clear
          </p>
        </div>
      </div>
    </div>
  );
}