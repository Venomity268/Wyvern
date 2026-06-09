"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface TerminalSearchProps {
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  matchCount: number;
  currentMatchIndex: number;
}

export function TerminalSearch({
  onSearch,
  onNext,
  onPrev,
  onClose,
  matchCount,
  currentMatchIndex,
}: TerminalSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(query);
    }, 150);
    return () => clearTimeout(handler);
  }, [query, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="absolute right-4 top-4 z-50 flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 p-1.5 shadow-lg">
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3.5 w-3.5 text-zinc-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search terminal..."
          className="h-7 w-48 border-0 bg-transparent pl-7 pr-12 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {matchCount > 0 && (
          <span className="absolute right-2 text-xs text-zinc-500">
            {currentMatchIndex + 1}/{matchCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 border-l border-zinc-700 pl-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onPrev}
          disabled={matchCount === 0}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNext}
          disabled={matchCount === 0}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="ml-0.5 h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
